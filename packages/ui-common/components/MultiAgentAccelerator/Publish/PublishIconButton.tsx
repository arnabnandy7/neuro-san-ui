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

import PublicIcon from "@mui/icons-material/Public"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import {FC, useEffect, useState} from "react"

import {PublishConfirmation} from "./PublishConfirmation"
import {checkIfPublished, openInNewTab, publish, PUBLISH_SETTINGS_REQUIRED_MESSAGE, PublishTarget} from "./Publishing"
import {PublishStatus, usePublishStore} from "../../../state/Publishing"
import {useSettingsStore} from "../../../state/Settings"

interface PublishIconButtonProps {
    /** The network's name as people read it, for the confirmation */
    readonly displayName: string
    /** Disables the button, for example once the network has expired */
    readonly disabled: boolean
    /** The network's HOCON, the same file Download gives */
    readonly hocon: string
    readonly id: string
    /** The network's id in the app */
    readonly networkId: string
    /** The agent network name, which it's published under */
    readonly networkName: string
}

/**
 * Small globe button for publishing a network from the sidebar. Publishes after asking, or opens the live site once
 * the network is live.
 */
export const PublishIconButton: FC<PublishIconButtonProps> = ({
    displayName,
    disabled,
    hocon,
    id,
    networkId,
    networkName,
}) => {
    const publishStatus = usePublishStore((state) => state.networks[networkId]?.status)
    const liveUrl = usePublishStore((state) => {
        const publishState = state.networks[networkId]
        return publishState?.status === PublishStatus.Live ? publishState.url : null
    })
    const serverUrl = useSettingsStore((state) => state.settings.nsDeploy.serverUrl)
    const orgName = useSettingsStore((state) => state.settings.nsDeploy.orgName)
    const target: PublishTarget | null = serverUrl && orgName ? {serverUrl, orgName} : null

    const [isConfirmOpen, setIsConfirmOpen] = useState(false)

    // We only remember published networks in memory, so ask the server whether this one is live, for example after a
    // reload
    useEffect(() => {
        if (serverUrl && orgName) {
            void checkIfPublished({id: networkId, name: networkName}, {serverUrl, orgName})
        }
    }, [networkId, networkName, orgName, serverUrl])

    const getLabel = () => {
        if (liveUrl) return "View live"
        if (publishStatus === PublishStatus.Publishing) return "Publishing..."
        return target ? "Publish" : PUBLISH_SETTINGS_REQUIRED_MESSAGE
    }

    const label = getLabel()

    return (
        <>
            <Tooltip title={label}>
                {/* A disabled button doesn't fire the hover events the tooltip needs, so it gets a wrapper */}
                <span>
                    <IconButton
                        aria-label={label}
                        disabled={disabled || publishStatus === PublishStatus.Publishing || (!liveUrl && !target)}
                        id={id}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (liveUrl) {
                                openInNewTab(liveUrl)
                            } else {
                                setIsConfirmOpen(true)
                            }
                        }}
                        size="small"
                        sx={{
                            color: "var(--bs-secondary)",
                            p: 0,
                            "&:hover": {color: "var(--bs-secondary-dark)"},
                            "&.Mui-disabled": {opacity: 0.3},
                        }}
                    >
                        <PublicIcon sx={{fontSize: "0.75rem"}} />
                    </IconButton>
                </span>
            </Tooltip>
            {isConfirmOpen && target && (
                // The dialog is a portal, but its clicks still bubble up the React tree to the sidebar item, which
                // would select the network
                <Box
                    component="span"
                    onClick={(e) => e.stopPropagation()}
                >
                    <PublishConfirmation
                        displayName={displayName}
                        id={`${id}-confirm`}
                        onCancel={() => setIsConfirmOpen(false)}
                        onConfirm={() => {
                            setIsConfirmOpen(false)
                            void publish({id: networkId, name: networkName}, hocon, target)
                        }}
                        target={target}
                    />
                </Box>
            )}
        </>
    )
}
