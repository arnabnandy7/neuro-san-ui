import {render, screen, waitForElementToBeRemoved} from "@testing-library/react"
import {userEvent} from "@testing-library/user-event"

import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {COPY_URL_LABEL, OPEN_URL_LABEL} from "../../../../components/MultiAgentAccelerator/Publish/LiveUrlField"
import {PublishPanel} from "../../../../components/MultiAgentAccelerator/Publish/PublishPanel"
import {PublishState, PublishStatus} from "../../../../state/Publishing"

const LIVE_URL = "http://live.test/cailville_bakery"
const MINUTE_MS = 60_000

const renderPanel = (publishState: PublishState) =>
    render(
        <PublishPanel
            publishState={publishState}
            id="publish-panel"
            isUnpublishing={false}
            onUnpublish={vi.fn()}
        />
    )

const makeLiveNetwork = (publishedAt = Date.now()): PublishState => ({
    deploymentId: "dep-123",
    log: [],
    publishedAt,
    serverUrl: "https://nsdeploy.test",
    status: PublishStatus.Live,
    url: LIVE_URL,
})

describe("PublishPanel", () => {
    withStrictMocks()

    it.each([
        {ageMs: 5 * MINUTE_MS, expected: "Published 5 minutes ago"},
        {ageMs: 3 * 60 * MINUTE_MS, expected: "Published 3 hours ago"},
        {ageMs: 2 * 24 * 60 * MINUTE_MS, expected: "Published 2 days ago"},
    ])("should say $expected", ({ageMs, expected}) => {
        renderPanel(makeLiveNetwork(Date.now() - ageMs))

        screen.getByText(expected)
    })

    it("should copy the live URL, say Copied, then go back to offering to copy", async () => {
        const user = userEvent.setup()
        renderPanel(makeLiveNetwork())
        const copyButton = screen.getByRole("button", {name: COPY_URL_LABEL})

        await user.click(copyButton)

        expect(await navigator.clipboard.readText()).toBe(LIVE_URL)
        await screen.findByRole("tooltip", {name: "Copied"})

        await user.unhover(copyButton)
        await waitForElementToBeRemoved(() => screen.queryByRole("tooltip"))
        await user.hover(copyButton)

        await screen.findByRole("tooltip", {name: COPY_URL_LABEL})
    })

    it("should say it couldn't copy when the clipboard refuses", async () => {
        const user = userEvent.setup()
        vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard blocked"))
        renderPanel(makeLiveNetwork())
        const copyButton = screen.getByRole("button", {name: COPY_URL_LABEL})

        await user.click(copyButton)

        await screen.findByRole("tooltip", {name: "Couldn't copy"})
    })

    it("should link to the live URL in a new tab", () => {
        renderPanel(makeLiveNetwork())

        const openLink = screen.getByRole("link", {name: OPEN_URL_LABEL})

        expect(openLink).toHaveAttribute("href", LIVE_URL)
        expect(openLink).toHaveAttribute("target", "_blank")
    })

    it("should not offer to unpublish while still publishing", () => {
        renderPanel({log: [], status: PublishStatus.Publishing})

        expect(screen.queryByRole("button", {name: "Unpublish"})).not.toBeInTheDocument()
    })
})
