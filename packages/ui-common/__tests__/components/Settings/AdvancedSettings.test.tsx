import {render, screen} from "@testing-library/react"
import {userEvent, UserEvent} from "@testing-library/user-event"

import {withStrictMocks} from "../../../../../__tests__/common/strictMocks"
import {
    AdvancedSettings,
    NS_DEPLOY_HOST_LABEL,
    ORG_NAME_LABEL,
    SAVE_PUBLISHING_LABEL,
    TEST_NS_DEPLOY_SERVER_LABEL,
} from "../../../components/Settings/AdvancedSettings"
import {testDeployServer} from "../../../controller/deploy/Deploy"
import {useSettingsStore} from "../../../state/Settings"

vi.mock("../../../controller/deploy/Deploy")

const EXPAND_LABEL = "Expand advanced settings"
const ORG_NAME = "cailville"
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

    const save = async () => {
        const saveButton = screen.getByRole("button", {name: SAVE_PUBLISHING_LABEL})
        await user.click(saveButton)
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

    it("should save the server as an https URL along with the org name", async () => {
        await renderExpanded()
        await typeInto(NS_DEPLOY_HOST_LABEL, SERVER_HOST)
        await typeInto(ORG_NAME_LABEL, `  ${ORG_NAME}  `)

        await save()

        expect(getNsDeploySettings()).toEqual({serverUrl: `https://${SERVER_HOST}`, orgName: ORG_NAME})
    })

    it("should save an http server when http is chosen", async () => {
        await renderExpanded()
        const protocolSelect = screen.getByRole("combobox", {name: "NS Deploy protocol"})
        await user.click(protocolSelect)
        await user.click(screen.getByRole("option", {name: "http://"}))
        await typeInto(NS_DEPLOY_HOST_LABEL, SERVER_HOST)

        await save()

        expect(getNsDeploySettings().serverUrl).toBe(`http://${SERVER_HOST}`)
    })

    it("should show a saved http server with http chosen and the host on its own", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: `http://${SERVER_HOST}`}})

        await renderExpanded()

        expect(screen.getByRole("combobox", {name: "NS Deploy protocol"})).toHaveTextContent("http://")
        expect(screen.getByRole("textbox", {name: NS_DEPLOY_HOST_LABEL})).toHaveValue(SERVER_HOST)
    })

    it("should turn publishing off when the server is cleared and saved", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: `https://${SERVER_HOST}`, orgName: ORG_NAME}})
        await renderExpanded()
        screen.getByText("On")
        const clearButton = screen.getByRole("button", {name: "Clear NS Deploy server"})
        await user.click(clearButton)

        await save()

        expect(getNsDeploySettings().serverUrl).toBeNull()
        screen.getByText("Off")
    })

    it.each([
        {desc: "Connected when the server is up", success: true, expected: "Connected"},
        {desc: "Couldn't connect when it isn't", success: false, expected: "Couldn't connect"},
    ])("should say $desc", async ({success, expected}) => {
        vi.mocked(testDeployServer).mockResolvedValue({success})
        await renderExpanded()
        await typeInto(NS_DEPLOY_HOST_LABEL, SERVER_HOST)
        const testButton = screen.getByRole("button", {name: TEST_NS_DEPLOY_SERVER_LABEL})

        await user.click(testButton)

        expect(testDeployServer).toHaveBeenCalledWith(`https://${SERVER_HOST}`)
        screen.getByText(expected)
    })

    it("should not offer to save when nothing has changed", async () => {
        useSettingsStore.getState().updateSettings({nsDeploy: {serverUrl: `https://${SERVER_HOST}`, orgName: ORG_NAME}})

        await renderExpanded()

        expect(screen.getByRole("button", {name: SAVE_PUBLISHING_LABEL})).toBeDisabled()
    })
})
