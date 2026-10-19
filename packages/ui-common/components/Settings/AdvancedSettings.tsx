/*
Copyright 2026 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import ClearIcon from "@mui/icons-material/Clear"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Collapse from "@mui/material/Collapse"
import IconButton from "@mui/material/IconButton"
import InputAdornment from "@mui/material/InputAdornment"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import {FC, useState} from "react"

import {useCheckmarkFade} from "./FadingCheckmark"
import {Section, SettingsSectionTitle, SettingsSubsection} from "./SettingsLayout"
import {SettingsRow} from "./SettingsRow"
import {testDeployServer} from "../../controller/deploy/Deploy"
import {useSettingsStore} from "../../state/Settings"
import {normalizeUrlInput, Protocol, stripProtocol} from "../../utils/Url"
import {StatusLight} from "../Common/StatusLight"

export const NS_DEPLOY_HOST_LABEL = "NS Deploy server host"
export const ORG_NAME_LABEL = "Org name"
export const SAVE_NS_DEPLOY_SERVER_LABEL = "Save NS Deploy server"
export const SAVE_ORG_NAME_LABEL = "Save org name"
export const TEST_NS_DEPLOY_SERVER_LABEL = "Test NS Deploy server"

interface AdvancedSettingsProps {
    readonly id: string
}

/**
 * Collapsible "Advanced" section of the Settings dialog: the NS Deploy server that networks are published to, and the
 * org name sent with each deploy.
 */
export const AdvancedSettings: FC<AdvancedSettingsProps> = ({id}) => {
    const updateSettings = useSettingsStore((state) => state.updateSettings)
    const savedServerUrl = useSettingsStore((state) => state.settings.nsDeploy.serverUrl) ?? ""
    const savedOrgName = useSettingsStore((state) => state.settings.nsDeploy.orgName) ?? ""

    const [isExpanded, setIsExpanded] = useState(false)

    const [protocol, setProtocol] = useState<Protocol>(savedServerUrl.startsWith("http://") ? "http" : "https")
    const [hostInput, setHostInput] = useState(stripProtocol(savedServerUrl))
    const [isServerReachable, setIsServerReachable] = useState<boolean | null>(null)
    const serverUrlCheckmark = useCheckmarkFade()

    const [orgNameInput, setOrgNameInput] = useState(savedOrgName)
    const orgNameCheckmark = useCheckmarkFade()

    const normalized = normalizeUrlInput(hostInput, protocol)
    const serverUrl = normalized.host ? `${normalized.protocol}://${normalized.host}` : ""

    const handleHostChange = (host: string) => {
        setHostInput(host)
        setIsServerReachable(null)
    }

    const handleTest = async () => {
        const result = await testDeployServer(serverUrl)
        setIsServerReachable(result.success)
    }

    const handleSaveServerUrl = () => {
        // Saving an empty URL turns publishing off
        updateSettings({nsDeploy: {serverUrl: serverUrl || null}})
        serverUrlCheckmark.trigger()
    }

    const handleSaveOrgName = () => {
        updateSettings({nsDeploy: {orgName: orgNameInput.trim() || null}})
        orgNameCheckmark.trigger()
    }

    const getNsDeploySubsection = () => (
        <SettingsSubsection title="NS Deploy">
            <SettingsRow
                checkmark={serverUrlCheckmark}
                id={`${id}-ns-deploy-row`}
                label=""
                tooltip="URL for the NS Deploy server that published networks are deployed to."
            >
                <Select<Protocol>
                    aria-label="NS Deploy protocol"
                    onChange={(e) => {
                        setProtocol(e.target.value)
                        setIsServerReachable(null)
                    }}
                    size="small"
                    sx={{minWidth: 100, flexShrink: 0}}
                    value={protocol}
                >
                    <MenuItem value="https">https://</MenuItem>
                    <MenuItem value="http">http://</MenuItem>
                </Select>
                <TextField
                    onBlur={() => {
                        setHostInput(normalized.host)
                        setProtocol(normalized.protocol)
                    }}
                    onChange={(e) => handleHostChange(e.target.value)}
                    placeholder="nsdeploy.example.com"
                    size="small"
                    slotProps={{
                        htmlInput: {"aria-label": NS_DEPLOY_HOST_LABEL},
                        input: {
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="Clear NS Deploy server"
                                        edge="end"
                                        onClick={() => handleHostChange("")}
                                        size="small"
                                    >
                                        <ClearIcon fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{flex: 1}}
                    value={hostInput}
                />
                <StatusLight
                    id={`${id}-ns-deploy-status-light`}
                    statusValue={isServerReachable === null ? "unknown" : isServerReachable ? "green" : "red"}
                />
                <Button
                    aria-label={TEST_NS_DEPLOY_SERVER_LABEL}
                    disabled={!serverUrl}
                    onClick={handleTest}
                    size="small"
                    variant="contained"
                >
                    Test
                </Button>
                <Button
                    aria-label={SAVE_NS_DEPLOY_SERVER_LABEL}
                    disabled={serverUrl === savedServerUrl}
                    onClick={handleSaveServerUrl}
                    size="small"
                    variant="contained"
                >
                    Save
                </Button>
            </SettingsRow>
            <Typography
                color="text.secondary"
                variant="body2"
            >
                Optional. When set, a <strong>Publish</strong> button appears on each agent network. MAUI posts the
                network&apos;s HOCON — the same file you get from Download — to this server.
            </Typography>
        </SettingsSubsection>
    )

    const getOrganizationSubsection = () => (
        <SettingsSubsection title="Organization">
            <SettingsRow
                checkmark={orgNameCheckmark}
                id={`${id}-org-name-row`}
                label={ORG_NAME_LABEL}
                required={true}
                tooltip="Published networks are grouped under this organization on the NS Deploy server."
            >
                <TextField
                    onChange={(e) => setOrgNameInput(e.target.value)}
                    size="small"
                    slotProps={{htmlInput: {"aria-label": ORG_NAME_LABEL}}}
                    sx={{flex: 1}}
                    value={orgNameInput}
                />
                <Button
                    aria-label={SAVE_ORG_NAME_LABEL}
                    disabled={orgNameInput.trim() === savedOrgName}
                    onClick={handleSaveOrgName}
                    size="small"
                    variant="contained"
                >
                    Save
                </Button>
            </SettingsRow>
            <Typography
                color="text.secondary"
                variant="body2"
            >
                Required to publish. Sent as <code>org_name</code> with every deploy. Published networks are grouped
                under it.
            </Typography>
        </SettingsSubsection>
    )

    return (
        <Section>
            <Box sx={{alignItems: "center", display: "flex", gap: 1}}>
                <SettingsSectionTitle>Advanced</SettingsSectionTitle>
                <IconButton
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Collapse advanced settings" : "Expand advanced settings"}
                    onClick={() => setIsExpanded((expanded) => !expanded)}
                    size="small"
                >
                    <ExpandMoreIcon
                        sx={{transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 150ms"}}
                    />
                </IconButton>
            </Box>
            <Collapse in={isExpanded}>
                {getNsDeploySubsection()}
                {getOrganizationSubsection()}
            </Collapse>
        </Section>
    )
}
