import {render, screen} from "@testing-library/react"
import {userEvent} from "@testing-library/user-event"

import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {DeployPanel} from "../../../../components/MultiAgentAccelerator/Deploy/DeployPanel"
import {COPY_URL_LABEL, OPEN_URL_LABEL} from "../../../../components/MultiAgentAccelerator/Deploy/LiveUrlField"
import {Deployment, DeploymentStatus} from "../../../../state/Deployments"

const LIVE_URL = "http://live.test/cailville_bakery"
const FIVE_MINUTES_MS = 5 * 60_000

const renderPanel = (deployment: Deployment) =>
    render(
        <DeployPanel
            deployment={deployment}
            id="deploy-panel"
            onUnpublish={vi.fn()}
        />
    )

const makeLiveDeployment = (publishedAt = Date.now()): Deployment => ({
    log: [],
    publishedAt,
    status: DeploymentStatus.Live,
    url: LIVE_URL,
})

describe("DeployPanel", () => {
    withStrictMocks()

    it("should say how long ago the network was published", () => {
        renderPanel(makeLiveDeployment(Date.now() - FIVE_MINUTES_MS))

        screen.getByText("Published 5 minutes ago")
    })

    it("should copy the live URL to the clipboard", async () => {
        const user = userEvent.setup()
        renderPanel(makeLiveDeployment())
        const copyButton = screen.getByRole("button", {name: COPY_URL_LABEL})

        await user.click(copyButton)

        expect(await navigator.clipboard.readText()).toBe(LIVE_URL)
    })

    it("should link to the live URL in a new tab", () => {
        renderPanel(makeLiveDeployment())

        const openLink = screen.getByRole("link", {name: OPEN_URL_LABEL})

        expect(openLink).toHaveAttribute("href", LIVE_URL)
        expect(openLink).toHaveAttribute("target", "_blank")
    })

    it("should not offer to unpublish while still publishing", () => {
        renderPanel({log: [], status: DeploymentStatus.Publishing})

        expect(screen.queryByRole("button", {name: "Unpublish"})).not.toBeInTheDocument()
    })
})
