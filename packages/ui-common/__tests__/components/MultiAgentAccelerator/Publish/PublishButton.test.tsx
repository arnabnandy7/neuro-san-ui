import {act, render, screen, waitFor, within} from "@testing-library/react"
import {userEvent, UserEvent} from "@testing-library/user-event"
import {MockInstance} from "vitest"

import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {NotificationType, sendNotification} from "../../../../components/Common/notification"
import {
    PUBLIC_ACCESS_WARNING,
    PUBLISH_SETTINGS_REQUIRED_MESSAGE,
    PublishButton,
    PUBLISHED_MESSAGE,
    PUBLISHED_TAB_BLOCKED_MESSAGE,
    SHOW_DETAILS_LABEL,
} from "../../../../components/MultiAgentAccelerator/Publish/PublishButton"
import {
    createDeployment,
    deleteDeployment,
    findReadyDeployment,
    ReadyDeployment,
} from "../../../../controller/nsDeploy/NsDeploy"
import {usePublishStore} from "../../../../state/Publishing"
import {useSettingsStore} from "../../../../state/Settings"

//#region Constants

const DEPLOYMENT_ID = "dep-123"
const DISPLAY_NAME = "Cailville Bakery"
const HOCON = "{ tools: [] }"
const LIVE_URL = "http://live.test/cailville_bakery"
const NETWORK_NAME = "cailville_bakery"
const ORG_NAME = "cailville"
const SERVER_ERROR = "NS Deploy server unavailable"
const SERVER_URL = "https://nsdeploy.test"

//#endregion Constants

//#region Mocks

vi.mock("../../../../controller/nsDeploy/NsDeploy")
vi.mock("../../../../components/Common/notification")

const mockCreateDeployment = vi.mocked(createDeployment)

//#endregion Mocks

describe("PublishButton", () => {
    withStrictMocks()

    let user: UserEvent
    let openSpy: MockInstance<typeof window.open>

    const makeReadyDeployment = (readyAt = Date.now()): ReadyDeployment => ({id: DEPLOYMENT_ID, url: LIVE_URL, readyAt})

    /**
     * Keeps the publish in flight until the returned `release()` is called, which then succeeds.
     */
    const mockInFlightPublish = () => {
        let release!: () => void
        mockCreateDeployment.mockImplementation(
            () =>
                new Promise<ReadyDeployment>((resolve) => {
                    release = () => resolve(makeReadyDeployment())
                })
        )

        return () => release()
    }

    const renderPublishButton = () =>
        render(
            <PublishButton
                displayName={DISPLAY_NAME}
                hocon={HOCON}
                id="publish-button"
                networkName={NETWORK_NAME}
            />
        )

    const clickPublish = async () => {
        const publishButton = screen.getByRole("button", {name: "Publish"})
        await user.click(publishButton)
    }

    const clickPublishAndConfirm = async () => {
        await clickPublish()
        const confirmation = await screen.findByRole("dialog")
        const confirmButton = within(confirmation).getByRole("button", {name: "Publish"})
        await user.click(confirmButton)
    }

    const publishAndWaitUntilLive = async () => {
        await clickPublishAndConfirm()
        await screen.findByRole("button", {name: "View live"})
    }

    const openDetails = async () => {
        const detailsButton = screen.getByRole("button", {name: SHOW_DETAILS_LABEL})
        await user.click(detailsButton)
        await screen.findByText("Live")
    }

    const clickUnpublish = async () => {
        await openDetails()
        const unpublishButton = screen.getByRole("button", {name: "Unpublish"})
        await user.click(unpublishButton)
    }

    const clickUnpublishAndConfirm = async () => {
        await clickUnpublish()
        const confirmation = await screen.findByRole("dialog")
        const confirmButton = within(confirmation).getByRole("button", {name: "Unpublish"})
        await user.click(confirmButton)
    }

    beforeEach(() => {
        user = userEvent.setup()
        openSpy = vi.spyOn(window, "open").mockReturnValue({opener: window} as Window)
        usePublishStore.setState({networks: {}})
        useSettingsStore.getState().resetSettings()
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: SERVER_URL, orgName: ORG_NAME}})

        mockCreateDeployment.mockResolvedValue(makeReadyDeployment())
        vi.mocked(deleteDeployment).mockResolvedValue()
        vi.mocked(findReadyDeployment).mockResolvedValue(null)
    })

    it("should offer to publish a network that isn't published", async () => {
        renderPublishButton()

        await waitFor(() => expect(findReadyDeployment).toHaveBeenCalledWith(SERVER_URL, ORG_NAME, NETWORK_NAME))
        screen.getByRole("button", {name: "Publish"})
        expect(screen.queryByRole("button", {name: SHOW_DETAILS_LABEL})).not.toBeInTheDocument()
    })

    it("should show View live for a network the server already has live, without publishing again", async () => {
        vi.mocked(findReadyDeployment).mockResolvedValue(makeReadyDeployment(Date.now() - 3 * 60 * 60_000))
        renderPublishButton()

        await screen.findByRole("button", {name: "View live"})
        await openDetails()

        screen.getByText(LIVE_URL)
        screen.getByText("Published 3 hours ago")
        expect(mockCreateDeployment).not.toHaveBeenCalled()
    })

    it("should stay on Publish when the server can't be asked whether the network is live", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(vi.fn())
        vi.mocked(findReadyDeployment).mockRejectedValue(new Error(SERVER_ERROR))
        renderPublishButton()

        await waitFor(() => expect(warnSpy).toHaveBeenCalled())
        screen.getByRole("button", {name: "Publish"})
    })

    it("should ask before publishing, naming the network, server and org, and warning it'll be public", async () => {
        renderPublishButton()

        await clickPublish()

        const confirmation = await screen.findByRole("dialog")
        expect(confirmation).toHaveTextContent(`"${DISPLAY_NAME}" will be published to ${SERVER_URL}`)
        expect(confirmation).toHaveTextContent(`under the org "${ORG_NAME}"`)
        expect(confirmation).toHaveTextContent(PUBLIC_ACCESS_WARNING)
        expect(mockCreateDeployment).not.toHaveBeenCalled()
    })

    it("should not publish when the confirmation is cancelled", async () => {
        renderPublishButton()
        await clickPublish()
        const confirmation = await screen.findByRole("dialog")
        const cancelButton = within(confirmation).getByRole("button", {name: "Cancel"})

        await user.click(cancelButton)

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(mockCreateDeployment).not.toHaveBeenCalled()
        screen.getByRole("button", {name: "Publish"})
    })

    it("should publish the network's HOCON to the server and org from Settings", async () => {
        renderPublishButton()

        await publishAndWaitUntilLive()

        expect(mockCreateDeployment).toHaveBeenCalledWith(
            expect.objectContaining({
                serverUrl: SERVER_URL,
                orgName: ORG_NAME,
                deploymentName: NETWORK_NAME,
                hocon: HOCON,
            })
        )
    })

    it.each([
        {missing: "an NS Deploy server", nsDeploy: {serverUrl: null}},
        {missing: "an org name", nsDeploy: {orgName: null}},
    ])("should not allow publishing without $missing in Settings", async ({nsDeploy}) => {
        useSettingsStore.getState().updateSettings({nsDeploy})
        renderPublishButton()
        const publishButton = screen.getByRole("button", {name: "Publish"})

        // A disabled button gets no pointer events, so the pointer lands on its wrapper like a real one would
        await user.hover(publishButton.parentElement)

        expect(publishButton).toBeDisabled()
        await screen.findByRole("tooltip", {name: PUBLISH_SETTINGS_REQUIRED_MESSAGE})
    })

    it("should show the progress panel while publishing and close it once published", async () => {
        const releasePublish = mockInFlightPublish()
        renderPublishButton()

        await clickPublishAndConfirm()

        // The open panel is modal, which hides the button beneath it from the accessibility tree
        await screen.findByText("Putting it online...")
        screen.getByText("Publishing...")
        screen.getByRole("progressbar", {name: "Publishing progress"})

        releasePublish()
        await screen.findByRole("button", {name: "View live"})
        expect(screen.queryByText("Putting it online...")).not.toBeInTheDocument()
    })

    it("should open the live network in a new tab and say so once published", async () => {
        renderPublishButton()

        await publishAndWaitUntilLive()

        expect(openSpy).toHaveBeenCalledWith(LIVE_URL, "_blank")
        expect(sendNotification).toHaveBeenCalledWith(
            NotificationType.success,
            PUBLISHED_MESSAGE,
            "",
            expect.anything()
        )
    })

    it("should point to View live when the browser blocks the new tab", async () => {
        openSpy.mockReturnValue(null)
        renderPublishButton()

        await publishAndWaitUntilLive()

        expect(sendNotification).toHaveBeenCalledWith(
            NotificationType.success,
            PUBLISHED_TAB_BLOCKED_MESSAGE,
            "",
            expect.anything()
        )
    })

    it("should open the live network again when View live is clicked", async () => {
        renderPublishButton()
        await publishAndWaitUntilLive()
        openSpy.mockClear()
        const viewLiveButton = screen.getByRole("button", {name: "View live"})

        await user.click(viewLiveButton)

        expect(openSpy).toHaveBeenCalledWith(LIVE_URL, "_blank")
    })

    it("should show the live URL and when it was published in the details", async () => {
        renderPublishButton()
        await publishAndWaitUntilLive()

        await openDetails()

        screen.getByText(LIVE_URL)
        screen.getByText("Published just now")
    })

    it("should reopen the progress panel when Publishing... is clicked", async () => {
        const releasePublish = mockInFlightPublish()
        renderPublishButton()
        await clickPublishAndConfirm()
        await screen.findByText("Putting it online...")
        await user.keyboard("{Escape}")
        await waitFor(() => expect(screen.queryByText("Putting it online...")).not.toBeInTheDocument())
        const publishingButton = screen.getByRole("button", {name: "Publishing..."})

        await user.click(publishingButton)

        await screen.findByText("Putting it online...")

        releasePublish()
        await screen.findByRole("button", {name: "View live"})
    })

    it("should ask before unpublishing, naming the live URL", async () => {
        renderPublishButton()
        await publishAndWaitUntilLive()

        await clickUnpublish()

        const confirmation = await screen.findByRole("dialog")
        expect(confirmation).toHaveTextContent(`"${DISPLAY_NAME}" will be taken offline at ${LIVE_URL}`)
        expect(deleteDeployment).not.toHaveBeenCalled()
    })

    it("should stay live when unpublishing is cancelled", async () => {
        renderPublishButton()
        await publishAndWaitUntilLive()
        await clickUnpublish()
        const confirmation = await screen.findByRole("dialog")
        const cancelButton = within(confirmation).getByRole("button", {name: "Cancel"})

        await user.click(cancelButton)

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(deleteDeployment).not.toHaveBeenCalled()
        screen.getByText("View live")
    })

    it("should not allow a second unpublish while the first is still running", async () => {
        let finishUnpublish!: () => void
        vi.mocked(deleteDeployment).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishUnpublish = resolve
                })
        )
        renderPublishButton()
        await publishAndWaitUntilLive()

        await clickUnpublishAndConfirm()

        expect(screen.getByRole("button", {name: "Unpublishing..."})).toBeDisabled()

        finishUnpublish()
        await screen.findByRole("button", {name: "Publish"})
    })

    it("should report the error and stay live when unpublishing fails", async () => {
        vi.mocked(deleteDeployment).mockRejectedValue(new Error(SERVER_ERROR))
        renderPublishButton()
        await publishAndWaitUntilLive()

        await clickUnpublishAndConfirm()

        await waitFor(() =>
            expect(sendNotification).toHaveBeenCalledWith(
                NotificationType.error,
                `Failed to unpublish "${NETWORK_NAME}".`,
                expect.stringContaining(SERVER_ERROR)
            )
        )
        // The panel stays open, and it's modal, which hides the button beneath it from the accessibility tree
        screen.getByText("View live")
    })

    it("should unpublish from the server it was published to, even if Settings changed since", async () => {
        renderPublishButton()
        await publishAndWaitUntilLive()
        act(() => {
            useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: "https://other-nsdeploy.test"}})
        })

        await clickUnpublishAndConfirm()

        expect(deleteDeployment).toHaveBeenCalledWith(SERVER_URL, DEPLOYMENT_ID)
    })

    it("should offer to publish again after unpublishing", async () => {
        renderPublishButton()
        await publishAndWaitUntilLive()

        await clickUnpublishAndConfirm()

        await screen.findByRole("button", {name: "Publish"})
    })

    it("should report the error and offer to publish again when publishing fails", async () => {
        mockCreateDeployment.mockRejectedValue(new Error(SERVER_ERROR))
        renderPublishButton()

        await clickPublishAndConfirm()

        await waitFor(() =>
            expect(sendNotification).toHaveBeenCalledWith(
                NotificationType.error,
                `Failed to publish "${NETWORK_NAME}".`,
                expect.stringContaining(SERVER_ERROR)
            )
        )
        await screen.findByRole("button", {name: "Publish"})
        expect(openSpy).not.toHaveBeenCalled()
    })
})
