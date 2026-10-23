import {act, render, screen, waitFor, within} from "@testing-library/react"
import {userEvent} from "@testing-library/user-event"

import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {sendNotification} from "../../../../components/Common/notification"
import {PublishButton} from "../../../../components/MultiAgentAccelerator/Publish/PublishButton"
import {PublishedNetworksButton} from "../../../../components/MultiAgentAccelerator/Publish/PublishedNetworksButton"
import {listPublishedNetworks, unpublishNetwork} from "../../../../controller/publish/Publish"
import {PublishStatus, usePublishStore} from "../../../../state/Publish"
import {useSettingsStore} from "../../../../state/Settings"

const SERVER_URL = "https://publish.test"
const ORG_NAME = "bakery"
const NETWORK = {id: "dep-123", name: "bakery", url: "https://live.test/bakery"}

vi.mock("../../../../controller/publish/Publish")
vi.mock("../../../../components/Common/notification")

describe("PublishedNetworksButton", () => {
    withStrictMocks()

    beforeEach(() => {
        usePublishStore.setState(usePublishStore.getInitialState())
        useSettingsStore.getState().resetSettings()
        useSettingsStore.getState().updateSettings({publish: {serverUrl: SERVER_URL, orgName: ORG_NAME}})
        vi.mocked(listPublishedNetworks).mockResolvedValue([NETWORK])
        vi.mocked(unpublishNetwork).mockResolvedValue()
    })

    const openList = async () => {
        const user = userEvent.setup()
        render(<PublishedNetworksButton />)
        await user.click(screen.getByRole("button", {name: "Published networks"}))
        await screen.findByRole("region", {name: NETWORK.name})
        return user
    }

    it("should manage a published site without any local source network and refresh on reopening", async () => {
        const user = await openList()
        expect(screen.getByRole("link", {name: "Open live URL"})).toHaveAttribute("href", NETWORK.url)
        await user.click(screen.getByRole("button", {name: "Copy live URL"}))
        expect(await navigator.clipboard.readText()).toBe(NETWORK.url)
        expect(listPublishedNetworks).toHaveBeenCalledWith(SERVER_URL, ORG_NAME)
        await user.click(screen.getByRole("button", {name: "close"}))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        vi.mocked(listPublishedNetworks).mockResolvedValue([])
        await user.click(screen.getByRole("button", {name: "Published networks"}))
        await screen.findByText("No published networks.")
    })

    it("should keep the site live when unpublishing is cancelled", async () => {
        const user = await openList()
        await user.click(screen.getByRole("button", {name: "Unpublish"}))
        expect(screen.getByText(new RegExp(`taken offline at ${NETWORK.url}`, "u"))).toBeInTheDocument()
        await user.click(screen.getByRole("button", {name: "Cancel"}))
        expect(unpublishNetwork).not.toHaveBeenCalled()
        expect(screen.getByRole("region", {name: NETWORK.name})).toBeInTheDocument()
    })

    it("should unpublish by deployment id and remove the site after confirmation", async () => {
        const user = await openList()
        await user.click(screen.getByRole("button", {name: "Unpublish"}))
        await user.click(within(screen.getAllByRole("dialog").at(-1)).getByRole("button", {name: "Unpublish"}))
        await screen.findByText("No published networks.")
        expect(unpublishNetwork).toHaveBeenCalledWith(SERVER_URL, NETWORK.id)
    })

    it("should retain the site for retry when unpublishing fails", async () => {
        vi.mocked(unpublishNetwork).mockRejectedValue(new Error("Unavailable"))
        const user = await openList()
        await user.click(screen.getByRole("button", {name: "Unpublish"}))
        await user.click(within(screen.getAllByRole("dialog").at(-1)).getByRole("button", {name: "Unpublish"}))
        await waitFor(() => expect(sendNotification).toHaveBeenCalled())
        expect(await screen.findByRole("region", {name: NETWORK.name})).toBeInTheDocument()
        expect(screen.getByRole("button", {name: "Unpublish"})).toBeEnabled()
    })

    it("should show loading and allow retry after a listing error", async () => {
        let rejectRequest!: (error: Error) => void
        vi.mocked(listPublishedNetworks).mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectRequest = reject
            })
        )
        const user = userEvent.setup()
        render(<PublishedNetworksButton />)
        await user.click(screen.getByRole("button", {name: "Published networks"}))
        expect(screen.getByRole("progressbar", {name: "Loading published networks"})).toBeInTheDocument()
        await act(async () => rejectRequest(new Error("Unavailable")))
        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load published networks")
        vi.mocked(listPublishedNetworks).mockResolvedValue([])
        await user.click(screen.getByRole("button", {name: "Refresh"}))
        await screen.findByText("No published networks.")
    })

    it("should show the new target and ignore results from the previous target", async () => {
        let resolveOld!: (networks: (typeof NETWORK)[]) => void
        vi.mocked(listPublishedNetworks).mockReturnValue(
            new Promise((resolve) => {
                resolveOld = resolve
            })
        )
        const user = userEvent.setup()
        render(<PublishedNetworksButton />)
        await user.click(screen.getByRole("button", {name: "Published networks"}))
        vi.mocked(listPublishedNetworks).mockResolvedValue([])
        act(() =>
            useSettingsStore.getState().updateSettings({publish: {serverUrl: "https://other.test", orgName: "other"}})
        )
        await screen.findByText("No published networks.")
        await act(async () => resolveOld([NETWORK]))
        expect(screen.queryByRole("region", {name: NETWORK.name})).not.toBeInTheDocument()
        expect(listPublishedNetworks).toHaveBeenLastCalledWith("https://other.test", "other")
    })

    it("should ignore a listing error from the previous target", async () => {
        let rejectOld!: (error: Error) => void
        vi.mocked(listPublishedNetworks).mockReturnValueOnce(
            new Promise((_resolve, reject) => {
                rejectOld = reject
            })
        )
        const user = userEvent.setup()
        render(<PublishedNetworksButton />)
        await user.click(screen.getByRole("button", {name: "Published networks"}))
        act(() =>
            useSettingsStore.getState().updateSettings({publish: {serverUrl: "https://other.test", orgName: "other"}})
        )
        await screen.findByRole("region", {name: NETWORK.name})
        await act(async () => rejectOld(new Error("Previous server unavailable")))
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        expect(screen.getByRole("region", {name: NETWORK.name})).toBeInTheDocument()
        expect(screen.getByRole("button", {name: "Refresh"})).toBeEnabled()
    })

    it("should prevent duplicate requests while unpublishing and keep other sites manageable", async () => {
        const otherNetwork = {id: "dep-other", name: "other", url: "https://live.test/other"}
        vi.mocked(listPublishedNetworks).mockResolvedValue([NETWORK, otherNetwork])
        let finishUnpublish!: () => void
        vi.mocked(unpublishNetwork).mockReturnValueOnce(
            new Promise((resolve) => {
                finishUnpublish = resolve
            })
        )
        const user = await openList()
        await user.click(
            within(screen.getByRole("region", {name: NETWORK.name})).getByRole("button", {name: "Unpublish"})
        )
        await user.click(within(screen.getAllByRole("dialog").at(-1)).getByRole("button", {name: "Unpublish"}))
        await waitFor(() => expect(screen.getByRole("button", {name: "Refresh"})).toBeDisabled())
        const otherUnpublish = within(screen.getByRole("region", {name: otherNetwork.name})).getByRole("button", {
            name: "Unpublish",
        })
        expect(otherUnpublish).toBeDisabled()
        expect(unpublishNetwork).toHaveBeenCalledTimes(1)
        await act(async () => finishUnpublish())
        await waitFor(() => expect(screen.queryByRole("region", {name: NETWORK.name})).not.toBeInTheDocument())
        expect(otherUnpublish).toBeEnabled()
        expect(screen.getByRole("button", {name: "Refresh"})).toBeEnabled()
    })

    it("should clear matching live indicators and preserve unrelated published networks", async () => {
        usePublishStore.getState().setPublishState("local-network", {
            status: PublishStatus.Published,
            serverUrl: SERVER_URL,
            publishId: NETWORK.id,
            url: NETWORK.url,
        })
        usePublishStore.getState().setPublishState("other-network", {
            status: PublishStatus.Published,
            serverUrl: SERVER_URL,
            publishId: "dep-other",
            url: "https://live.test/other",
        })
        const user = userEvent.setup()
        render(
            <>
                <PublishButton
                    displayName="Bakery"
                    hocon="{}"
                    id="publish"
                    networkId="local-network"
                    networkName={NETWORK.name}
                />
                <PublishButton
                    displayName="Other"
                    hocon="{}"
                    id="other-publish"
                    networkId="other-network"
                    networkName="other"
                />
                <PublishedNetworksButton />
            </>
        )
        expect(screen.getAllByRole("button", {name: "View live"})).toHaveLength(2)
        await user.click(screen.getByRole("button", {name: "Published networks"}))
        await user.click(await screen.findByRole("button", {name: "Unpublish"}))
        await user.click(within(screen.getAllByRole("dialog").at(-1)).getByRole("button", {name: "Unpublish"}))
        await screen.findByText("No published networks.")
        await user.click(screen.getByRole("button", {name: "close"}))
        expect(await screen.findByRole("button", {name: "Publish"})).toBeInTheDocument()
        expect(screen.getByRole("button", {name: "View live"})).toBeInTheDocument()
    })

    it("should disable management until the publish settings are configured", () => {
        useSettingsStore.getState().updateSettings({publish: {serverUrl: null, orgName: ""}})
        render(<PublishedNetworksButton />)
        expect(screen.getByRole("button", {name: "Published networks"})).toBeDisabled()
        expect(listPublishedNetworks).not.toHaveBeenCalled()
    })
})
