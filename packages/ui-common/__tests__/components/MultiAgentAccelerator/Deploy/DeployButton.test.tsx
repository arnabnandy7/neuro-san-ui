import {render, screen, waitFor} from "@testing-library/react"
import {userEvent, UserEvent} from "@testing-library/user-event"
import {MockInstance} from "vitest"

import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {NotificationType, sendNotification} from "../../../../components/Common/notification"
import {
    DeployButton,
    ORG_NAME_REQUIRED_MESSAGE,
    PUBLISHED_MESSAGE,
    PUBLISHED_TAB_BLOCKED_MESSAGE,
    SHOW_DETAILS_LABEL,
} from "../../../../components/MultiAgentAccelerator/Deploy/DeployButton"
import {PublishedNetwork, publishNetwork, unpublishNetwork} from "../../../../controller/deploy/Deploy"
import {useDeploymentsStore} from "../../../../state/Deployments"
import {useSettingsStore} from "../../../../state/Settings"

//#region Constants

const DEPLOY_ERROR = "deploy service unavailable"
const DEPLOYMENT_ID = "dep-123"
const HOCON = "{ tools: [] }"
const LIVE_URL = "http://live.test/cailville_bakery"
const NETWORK_NAME = "cailville_bakery"
const ORG_NAME = "cailville"
const SERVER_URL = "https://nsdeploy.test"
const UPLOAD_STEP = `POST ${SERVER_URL}/deployments`
const PUBLISHED: PublishedNetwork = {deploymentId: DEPLOYMENT_ID, url: LIVE_URL}

//#endregion Constants

//#region Mocks

vi.mock("../../../../controller/deploy/Deploy")
vi.mock("../../../../components/Common/notification")

const mockPublishNetwork = vi.mocked(publishNetwork)

//#endregion Mocks

describe("DeployButton", () => {
    withStrictMocks()

    let user: UserEvent
    let openSpy: MockInstance<typeof window.open>

    /**
     * Keeps the publish in flight until the returned `release()` is called, which then succeeds.
     */
    const mockInFlightPublish = () => {
        let release!: () => void
        mockPublishNetwork.mockImplementation(
            () =>
                new Promise<PublishedNetwork>((resolve) => {
                    release = () => resolve(PUBLISHED)
                })
        )

        return () => release()
    }

    const renderDeployButton = () =>
        render(
            <DeployButton
                hocon={HOCON}
                id="deploy-button"
                networkName={NETWORK_NAME}
            />
        )

    const publishAndWaitUntilLive = async () => {
        const publishButton = screen.getByRole("button", {name: "Publish"})
        await user.click(publishButton)
        await screen.findByRole("button", {name: "View live"})
    }

    const openDetails = async () => {
        const detailsButton = screen.getByRole("button", {name: SHOW_DETAILS_LABEL})
        await user.click(detailsButton)
        await screen.findByText("Live")
    }

    beforeEach(() => {
        user = userEvent.setup()
        openSpy = vi.spyOn(window, "open").mockReturnValue({opener: window} as Window)
        useDeploymentsStore.setState({deployments: {}})
        useSettingsStore.getState().resetSettings()
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: SERVER_URL, orgName: ORG_NAME}})

        mockPublishNetwork.mockImplementation(async ({onLog}) => {
            onLog({timestamp: Date.now(), message: UPLOAD_STEP, detail: `${NETWORK_NAME}.hocon`})
            return PUBLISHED
        })
        vi.mocked(unpublishNetwork).mockResolvedValue()
    })

    it("should offer to publish a network that isn't published", () => {
        renderDeployButton()

        screen.getByRole("button", {name: "Publish"})
        expect(screen.queryByRole("button", {name: SHOW_DETAILS_LABEL})).not.toBeInTheDocument()
    })

    it("should publish the network's HOCON to the server and org from Settings", async () => {
        renderDeployButton()

        await publishAndWaitUntilLive()

        expect(mockPublishNetwork).toHaveBeenCalledWith(
            expect.objectContaining({serverUrl: SERVER_URL, orgName: ORG_NAME, networkName: NETWORK_NAME, hocon: HOCON})
        )
    })

    it("should not allow publishing until an org name is set in Settings", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {orgName: null}})
        renderDeployButton()
        const publishButton = screen.getByRole("button", {name: "Publish"})

        // A disabled button gets no pointer events, so the pointer lands on its wrapper like a real one would
        await user.hover(publishButton.parentElement)

        expect(publishButton).toBeDisabled()
        await screen.findByRole("tooltip", {name: ORG_NAME_REQUIRED_MESSAGE})
    })

    it("should explain instead of publishing when no NS Deploy server is set", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: null}})
        renderDeployButton()
        const publishButton = screen.getByRole("button", {name: "Publish"})

        await user.click(publishButton)

        await waitFor(() =>
            expect(sendNotification).toHaveBeenCalledWith(
                NotificationType.error,
                `Failed to publish "${NETWORK_NAME}".`,
                expect.stringContaining("Set an NS Deploy server")
            )
        )
        expect(mockPublishNetwork).not.toHaveBeenCalled()
    })

    it("should show the progress panel while publishing and close it once published", async () => {
        const releasePublish = mockInFlightPublish()
        renderDeployButton()
        const publishButton = screen.getByRole("button", {name: "Publish"})

        await user.click(publishButton)

        // The open panel is modal, which hides the button beneath it from the accessibility tree
        screen.getByText("Publishing...")
        screen.getByText("Putting it online...")
        screen.getByRole("progressbar", {name: "Publishing progress"})

        releasePublish()
        await screen.findByRole("button", {name: "View live"})
        expect(screen.queryByText("Putting it online...")).not.toBeInTheDocument()
    })

    it("should open the live network in a new tab and say so once published", async () => {
        renderDeployButton()

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
        renderDeployButton()

        await publishAndWaitUntilLive()

        expect(sendNotification).toHaveBeenCalledWith(
            NotificationType.success,
            PUBLISHED_TAB_BLOCKED_MESSAGE,
            "",
            expect.anything()
        )
    })

    it("should open the live network again when View live is clicked", async () => {
        renderDeployButton()
        await publishAndWaitUntilLive()
        openSpy.mockClear()
        const viewLiveButton = screen.getByRole("button", {name: "View live"})

        await user.click(viewLiveButton)

        expect(openSpy).toHaveBeenCalledWith(LIVE_URL, "_blank")
    })

    it("should show the live URL and when it was published in the details", async () => {
        renderDeployButton()
        await publishAndWaitUntilLive()

        await openDetails()

        screen.getByText(LIVE_URL)
        screen.getByText("Published just now")
    })

    it("should list each deploy step under technical details", async () => {
        renderDeployButton()
        await publishAndWaitUntilLive()
        await openDetails()
        const technicalDetailsButton = screen.getByRole("button", {name: "Technical details"})

        await user.click(technicalDetailsButton)

        expect(screen.getByText(new RegExp(UPLOAD_STEP, "u"))).toHaveTextContent(`${NETWORK_NAME}.hocon`)
    })

    it("should reopen the progress panel when Publishing... is clicked", async () => {
        const releasePublish = mockInFlightPublish()
        renderDeployButton()
        const publishButton = screen.getByRole("button", {name: "Publish"})
        await user.click(publishButton)
        await user.keyboard("{Escape}")
        await waitFor(() => expect(screen.queryByText("Putting it online...")).not.toBeInTheDocument())
        const publishingButton = screen.getByRole("button", {name: "Publishing..."})

        await user.click(publishingButton)

        await screen.findByText("Putting it online...")

        releasePublish()
        await screen.findByRole("button", {name: "View live"})
    })

    it("should not allow a second unpublish while the first is still running", async () => {
        let finishUnpublish!: () => void
        vi.mocked(unpublishNetwork).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishUnpublish = resolve
                })
        )
        renderDeployButton()
        await publishAndWaitUntilLive()
        await openDetails()
        const unpublishButton = screen.getByRole("button", {name: "Unpublish"})

        await user.click(unpublishButton)

        expect(screen.getByRole("button", {name: "Unpublishing..."})).toBeDisabled()

        finishUnpublish()
        await screen.findByRole("button", {name: "Publish"})
    })

    it("should report the error and stay live when unpublishing fails", async () => {
        vi.mocked(unpublishNetwork).mockRejectedValue(new Error(DEPLOY_ERROR))
        renderDeployButton()
        await publishAndWaitUntilLive()
        await openDetails()
        const unpublishButton = screen.getByRole("button", {name: "Unpublish"})

        await user.click(unpublishButton)

        await waitFor(() =>
            expect(sendNotification).toHaveBeenCalledWith(
                NotificationType.error,
                `Failed to unpublish "${NETWORK_NAME}".`,
                expect.stringContaining(DEPLOY_ERROR)
            )
        )
        // The panel stays open, and it's modal, which hides the button beneath it from the accessibility tree
        screen.getByText("View live")
    })

    it("should unpublish from the server it was published to, even if Settings changed since", async () => {
        renderDeployButton()
        await publishAndWaitUntilLive()
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: "https://other-nsdeploy.test"}})
        await openDetails()
        const unpublishButton = screen.getByRole("button", {name: "Unpublish"})

        await user.click(unpublishButton)

        expect(unpublishNetwork).toHaveBeenCalledWith(SERVER_URL, DEPLOYMENT_ID)
    })

    it("should offer to publish again after unpublishing", async () => {
        renderDeployButton()
        await publishAndWaitUntilLive()
        await openDetails()
        const unpublishButton = screen.getByRole("button", {name: "Unpublish"})

        await user.click(unpublishButton)

        await screen.findByRole("button", {name: "Publish"})
    })

    it("should report the error and offer to publish again when publishing fails", async () => {
        mockPublishNetwork.mockRejectedValue(new Error(DEPLOY_ERROR))
        renderDeployButton()
        const publishButton = screen.getByRole("button", {name: "Publish"})

        await user.click(publishButton)

        await waitFor(() =>
            expect(sendNotification).toHaveBeenCalledWith(
                NotificationType.error,
                `Failed to publish "${NETWORK_NAME}".`,
                expect.stringContaining(DEPLOY_ERROR)
            )
        )
        screen.getByRole("button", {name: "Publish"})
        expect(openSpy).not.toHaveBeenCalled()
    })
})
