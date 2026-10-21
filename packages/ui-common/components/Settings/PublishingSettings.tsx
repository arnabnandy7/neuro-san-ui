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
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import FormLabel from "@mui/material/FormLabel"
import IconButton from "@mui/material/IconButton"
import InputAdornment from "@mui/material/InputAdornment"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import TextField from "@mui/material/TextField"
import {FC, ReactNode, useState} from "react"

import {Section, SettingsSectionTitle, SettingsSubsection} from "./SettingsLayout"
import {checkHealth} from "../../controller/publish/Publish"
import {useEnvironmentStore} from "../../state/Environment"
import {useSettingsStore} from "../../state/Settings"
import {normalizeUrlInput, Protocol, stripProtocol} from "../../utils/Url"

export const PUBLISH_SERVER_HOST_LABEL = "Publish server host"
export const ORG_NAME_LABEL = "Org name"
export const SAVE_PUBLISHING_LABEL = "Save publishing settings"
export const TEST_PUBLISH_SERVER_LABEL = "Test publish server"

interface StatusTextProps {
    readonly color: string
    readonly children: ReactNode
}

/**
 * A colored dot followed by a short status, like "● Connected".
 */
const StatusText: FC<StatusTextProps> = ({color, children}) => (
    <Box
        component="span"
        sx={{alignItems: "center", color, display: "inline-flex", fontSize: "0.7rem", fontWeight: 400, gap: 0.75}}
    >
        <Box
            aria-hidden={true}
            component="span"
            sx={{backgroundColor: color, borderRadius: "50%", height: "0.5rem", width: "0.5rem"}}
        />
        {children}
    </Box>
)

interface FieldRowProps {
    readonly label: string
    readonly required?: boolean
    readonly field: ReactNode
    /** Shown to the right of the field */
    readonly action?: ReactNode
    /** Shown under the field */
    readonly helper?: ReactNode
}

/**
 * One row of the form: label, field, then an optional action. Rows go inside a FieldGrid, which owns the columns, so
 * fields line up and have the same width whether or not their row has an action.
 */
const FieldRow: FC<FieldRowProps> = ({label, required = false, field, action, helper}) => (
    <Box sx={{display: "contents"}}>
        <FormLabel
            required={required}
            sx={{gridColumn: 1, "& .MuiFormLabel-asterisk": {color: "error.main"}}}
        >
            {label}
        </FormLabel>
        <Box sx={{gridColumn: 2}}>{field}</Box>
        {action && <Box sx={{gridColumn: 3}}>{action}</Box>}
        {helper && <Box sx={{gridColumn: 2, mb: 1}}>{helper}</Box>}
    </Box>
)

const FieldGrid: FC<{readonly children: ReactNode}> = ({children}) => (
    <Box
        sx={{
            alignItems: "center",
            columnGap: 2,
            display: "grid",
            gridTemplateColumns: "10rem minmax(0, 34rem) auto",
            rowGap: 0.75,
        }}
    >
        {children}
    </Box>
)

interface PublishingSettingsProps {
    readonly id: string
}

/**
 * "Publishing" section of the Settings dialog: the publish server that networks are published to, and the org name
 * sent with each publish.
 */
export const PublishingSettings: FC<PublishingSettingsProps> = ({id}) => {
    const updateSettings = useSettingsStore((state) => state.updateSettings)
    const savedServerUrl = useSettingsStore((state) => state.settings.publish.serverUrl) ?? ""
    const savedOrgName = useSettingsStore((state) => state.settings.publish.orgName) ?? ""
    const defaultServerUrl = useEnvironmentStore((state) => state.publishServerUrl)

    const [protocol, setProtocol] = useState<Protocol>(savedServerUrl.startsWith("http://") ? "http" : "https")
    const [hostInput, setHostInput] = useState(stripProtocol(savedServerUrl))
    const [isServerReachable, setIsServerReachable] = useState<boolean | null>(null)
    const [orgNameInput, setOrgNameInput] = useState(savedOrgName)

    const normalized = normalizeUrlInput(hostInput, protocol)
    const serverUrl = normalized.host ? `${normalized.protocol}://${normalized.host}` : ""
    const orgName = orgNameInput.trim()
    // An empty field means the default server
    const serverToTest = serverUrl || defaultServerUrl

    const isPublishingOn = Boolean((savedServerUrl || defaultServerUrl) && savedOrgName)
    const hasChanges = serverUrl !== savedServerUrl || orgName !== savedOrgName

    const handleHostChange = (host: string) => {
        setHostInput(host)
        setIsServerReachable(null)
    }

    const handleTest = async () => {
        const result = await checkHealth(serverToTest)
        setIsServerReachable(result.success)
    }

    const handleSave = () => {
        // Saving an empty server goes back to the default
        updateSettings({publish: {serverUrl: serverUrl || null, orgName: orgName || null}})
    }

    const getPublishingSubsection = () => (
        <SettingsSubsection
            status={
                isPublishingOn ? (
                    <StatusText color="success.main">On</StatusText>
                ) : (
                    <StatusText color="text.disabled">Off</StatusText>
                )
            }
            title="Publish server"
        >
            <FieldGrid>
                <FieldRow
                    action={
                        <Button
                            aria-label={TEST_PUBLISH_SERVER_LABEL}
                            disabled={!serverToTest}
                            onClick={handleTest}
                            size="small"
                            variant="contained"
                        >
                            Test
                        </Button>
                    }
                    field={
                        <TextField
                            onBlur={() => {
                                setHostInput(normalized.host)
                                setProtocol(normalized.protocol)
                            }}
                            onChange={(e) => handleHostChange(e.target.value)}
                            placeholder={defaultServerUrl ? stripProtocol(defaultServerUrl) : "publish.example.com"}
                            size="small"
                            slotProps={{
                                htmlInput: {"aria-label": PUBLISH_SERVER_HOST_LABEL},
                                input: {
                                    startAdornment: (
                                        <InputAdornment
                                            position="start"
                                            sx={{
                                                borderRight: 1,
                                                borderColor: "divider",
                                                height: "100%",
                                                mr: 1.5,
                                                pr: 1,
                                            }}
                                        >
                                            <Select<Protocol>
                                                aria-label="Publish server protocol"
                                                disableUnderline={true}
                                                onChange={(e) => {
                                                    setProtocol(e.target.value)
                                                    setIsServerReachable(null)
                                                }}
                                                value={protocol}
                                                variant="standard"
                                            >
                                                <MenuItem value="https">https://</MenuItem>
                                                <MenuItem value="http">http://</MenuItem>
                                            </Select>
                                        </InputAdornment>
                                    ),
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                aria-label="Clear publish server"
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
                            fullWidth={true}
                            value={hostInput}
                        />
                    }
                    helper={
                        isServerReachable === null ? null : isServerReachable ? (
                            <StatusText color="success.main">Connected</StatusText>
                        ) : (
                            <StatusText color="error.main">Couldn&apos;t connect</StatusText>
                        )
                    }
                    label="Server"
                />
                <FieldRow
                    field={
                        <TextField
                            fullWidth={true}
                            onChange={(e) => setOrgNameInput(e.target.value)}
                            size="small"
                            slotProps={{htmlInput: {"aria-label": ORG_NAME_LABEL}}}
                            value={orgNameInput}
                        />
                    }
                    label={ORG_NAME_LABEL}
                    required={true}
                />
            </FieldGrid>
            <Box>
                <Button
                    aria-label={SAVE_PUBLISHING_LABEL}
                    disabled={!hasChanges}
                    id={`${id}-publishing-save`}
                    onClick={handleSave}
                    size="small"
                    variant="contained"
                >
                    Save
                </Button>
            </Box>
        </SettingsSubsection>
    )

    return (
        <Section>
            <SettingsSectionTitle>Publishing</SettingsSectionTitle>
            {getPublishingSubsection()}
        </Section>
    )
}
