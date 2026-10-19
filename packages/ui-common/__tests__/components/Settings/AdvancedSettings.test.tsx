import {render, screen} from "@testing-library/react"
import {userEvent, UserEvent} from "@testing-library/user-event"

import {withStrictMocks} from "../../../../../__tests__/common/strictMocks"
import {
    AdvancedSettings,
    NS_DEPLOY_HOST_LABEL,
    ORG_NAME_LABEL,
    SAVE_NS_DEPLOY_SERVER_LABEL,
    SAVE_ORG_NAME_LABEL,
    TEST_NS_DEPLOY_SERVER_LABEL,
} from "../../../components/Settings/AdvancedSettings"
import {testDeployServer} from "../../../controller/deploy/Deploy"
import {useSettingsStore} from "../../../state/Settings"

vi.mock("../../../controller/deploy/Deploy")

// Fading checkmark behavior is covered by FadingCheckmark.test.tsx.
vi.mock("../../../components/Settings/FadingCheckmark", () => ({
    FadingCheckmark: (): null => null,
    useCheckmarkFade: () => ({show: false, trigger: vi.fn()}),
}))

const EXPAND_LABEL = "Expand advanced settings"
const SERVER_HOST = "nsdeploy.test"

describe("AdvancedSettings", () => {
    withStrictMocks()

    let user: UserEvent

    const getNsDeploySettings = () => useSettingsStore.getState().settings.nsDeploy

    const renderExpanded = async () => {
        render(<AdvancedSettings id="advanced" />)
        const expandButton = screen.getByRole("button", {name: EXPAND_LABEL})
        await user.click(expandButton)
    }

    const typeInto = async (label: string, text: string) => {
        const field = screen.getByRole("textbox", {name: label})
        await user.clear(field)
        await user.click(field)
        await user.paste(text)
    }

    beforeEach(() => {
        user = userEvent.setup()
        useSettingsStore.getState().resetSettings()
    })

    it("should start collapsed", () => {
        render(<AdvancedSettings id="advanced" />)

        expect(screen.getByRole("button", {name: EXPAND_LABEL})).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByRole("textbox", {name: NS_DEPLOY_HOST_LABEL})).not.toBeInTheDocument()
    })

    it("should save the NS Deploy server as an https URL", async () => {
        await renderExpanded()
        await typeInto(NS_DEPLOY_HOST_LABEL, SERVER_HOST)
        const saveButton = screen.getByRole("button", {name: SAVE_NS_DEPLOY_SERVER_LABEL})

        await user.click(saveButton)

        expect(getNsDeploySettings().serverUrl).toBe(`https://${SERVER_HOST}`)
    })

    it("should save an http server when http is chosen", async () => {
        await renderExpanded()
        const protocolSelect = screen.getByRole("combobox", {name: "NS Deploy protocol"})
        await user.click(protocolSelect)
        await user.click(screen.getByRole("option", {name: "http://"}))
        await typeInto(NS_DEPLOY_HOST_LABEL, SERVER_HOST)
        const saveButton = screen.getByRole("button", {name: SAVE_NS_DEPLOY_SERVER_LABEL})

        await user.click(saveButton)

        expect(getNsDeploySettings().serverUrl).toBe(`http://${SERVER_HOST}`)
    })

    it("should show a saved http server with http chosen and the host on its own", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: `http://${SERVER_HOST}`}})

        await renderExpanded()

        expect(screen.getByRole("combobox", {name: "NS Deploy protocol"})).toHaveTextContent("http://")
        expect(screen.getByRole("textbox", {name: NS_DEPLOY_HOST_LABEL})).toHaveValue(SERVER_HOST)
    })

    it("should turn publishing off when the server is cleared and saved", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: `https://${SERVER_HOST}`}})
        await renderExpanded()
        const clearButton = screen.getByRole("button", {name: "Clear NS Deploy server"})
        await user.click(clearButton)
        const saveButton = screen.getByRole("button", {name: SAVE_NS_DEPLOY_SERVER_LABEL})

        await user.click(saveButton)

        expect(getNsDeploySettings().serverUrl).toBeNull()
    })

    it.each([
        {desc: "green when the server is up", success: true, expected: "green"},
        {desc: "red when it isn't", success: false, expected: "red"},
    ])("should show the test result as $desc", async ({success, expected}) => {
        vi.mocked(testDeployServer).mockResolvedValue({success})
        await renderExpanded()
        await typeInto(NS_DEPLOY_HOST_LABEL, SERVER_HOST)
        const testButton = screen.getByRole("button", {name: TEST_NS_DEPLOY_SERVER_LABEL})

        await user.click(testButton)

        expect(testDeployServer).toHaveBeenCalledWith(`https://${SERVER_HOST}`)
        expect(screen.getByTestId("advanced-ns-deploy-status-light")).toHaveAttribute("data-status", expected)
    })

    it("should save the org name without surrounding spaces", async () => {
        await renderExpanded()
        await typeInto(ORG_NAME_LABEL, "  cailville  ")
        const saveButton = screen.getByRole("button", {name: SAVE_ORG_NAME_LABEL})

        await user.click(saveButton)

        expect(getNsDeploySettings().orgName).toBe("cailville")
    })

    it("should not offer to save an org name that hasn't changed", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {orgName: "cailville"}})
        await renderExpanded()

        const saveButton = screen.getByRole("button", {name: SAVE_ORG_NAME_LABEL})

        expect(saveButton).toBeDisabled()
    })
})
