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

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import PublicIcon from "@mui/icons-material/Public"
import Button from "@mui/material/Button"
import ButtonGroup from "@mui/material/ButtonGroup"
import CircularProgress from "@mui/material/CircularProgress"
import Popover from "@mui/material/Popover"
import Tooltip from "@mui/material/Tooltip"
import {FC, ReactNode, useEffect, useState} from "react"

import {checkIfPublished, publish, PublishTarget, unpublish} from "./Publishing"
import {PublishPanel} from "./PublishPanel"
import {LiveNetwork, PublishStatus, usePublishStore} from "../../../state/Publishing"
import {useSettingsStore} from "../../../state/Settings"
import {ConfirmationModal} from "../../Common/ConfirmationModal"
import {NotificationType, sendNotification} from "../../Common/notification"

export const PUBLISHED_MESSAGE = "Published — opened in a new tab"
export const PUBLISHED_TAB_BLOCKED_MESSAGE = "Published — click View live to open it"
export const SHOW_DETAILS_LABEL = "Show publish details"
export const PUBLISH_SETTINGS_REQUIRED_MESSAGE =
    "Add an NS Deploy server and org name in Settings > Advanced to publish"

interface PublishButtonProps {
    /** The network's name as people read it, for the confirmation */
    readonly displayName: string
    /** The network's HOCON, the same file Download gives */
    readonly hocon: string
    readonly id: string
    readonly networkName: string
}

interface MainAction {
    readonly color: "primary" | "success"
    readonly icon: ReactNode
    readonly handleClick: () => void
    readonly label: string
}

/**
 * Opens a URL in a new tab, cut off from this page.
 * @returns Whether the tab opened. False when the browser blocked it as a popup.
 * @note Sets `opener` by hand because the "noopener" feature makes window.open always return null, which would hide
 * whether the tab opened.
 */
const openInNewTab = (url: string): boolean => {
    const tab = window.open(url, "_blank")
    if (!tab) return false

    tab.opener = null
    return true
}

/**
 * Split button for publishing a network: "Publish", then "Publishing..." while it goes live, then "View live". The
 * dropdown opens a panel with the progress, live URL and technical details.
 */
export const PublishButton: FC<PublishButtonProps> = ({displayName, hocon, id, networkName}) => {
    const publishState = usePublishStore((state) => state.networks[networkName])
    const serverUrl = useSettingsStore((state) => state.settings.nsDeploy.serverUrl)
    const orgName = useSettingsStore((state) => state.settings.nsDeploy.orgName)
    const target: PublishTarget | null = serverUrl && orgName ? {serverUrl, orgName} : null

    const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null)
    const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false)
    const [isPanelOpen, setIsPanelOpen] = useState(false)
    const [isUnpublishing, setIsUnpublishing] = useState(false)
    // The live network waiting on the user to confirm unpublishing it
    const [networkToUnpublish, setNetworkToUnpublish] = useState<LiveNetwork | null>(null)

    // We only remember published networks in memory, so ask the server whether this one is live, for example after a
    // reload
    useEffect(() => {
        if (serverUrl && orgName) {
            void checkIfPublished(networkName, {serverUrl, orgName})
        }
    }, [networkName, orgName, serverUrl])

    const handlePublish = async (publishTarget: PublishTarget) => {
        setIsPanelOpen(true)
        const url = await publish(networkName, hocon, publishTarget)
        setIsPanelOpen(false)

        if (url) {
            const message = openInNewTab(url) ? PUBLISHED_MESSAGE : PUBLISHED_TAB_BLOCKED_MESSAGE
            sendNotification(NotificationType.success, message, "", {
                vertical: "bottom",
                horizontal: "center",
            })
        }
    }

    const handleUnpublish = async (liveNetwork: LiveNetwork) => {
        setIsUnpublishing(true)
        await unpublish(networkName, liveNetwork)
        setIsUnpublishing(false)
        setIsPanelOpen(false)
    }

    const getMainAction = (): MainAction => {
        switch (publishState?.status) {
            case PublishStatus.Publishing:
                return {
                    color: "primary",
                    icon: (
                        <CircularProgress
                            color="inherit"
                            size="1rem"
                        />
                    ),
                    label: "Publishing...",
                    handleClick: () => setIsPanelOpen(true),
                }
            case PublishStatus.Live:
                return {
                    color: "success",
                    icon: <OpenInNewIcon />,
                    label: "View live",
                    handleClick: () => openInNewTab(publishState.url),
                }
            default:
                return {
                    color: "primary",
                    icon: <PublicIcon />,
                    label: "Publish",
                    handleClick: () => setIsPublishConfirmOpen(true),
                }
        }
    }

    const mainAction = getMainAction()
    const isPublishBlocked = !publishState && !target

    return (
        <>
            <ButtonGroup
                color={mainAction.color}
                id={id}
                ref={setAnchorEl}
                size="small"
                // The theme's contrast text on the green success color is dark, so enabled buttons get white text, and
                // icons follow the text color instead of the app's global icon color
                sx={{
                    "& .MuiButton-root:not(.Mui-disabled)": {color: "common.white"},
                    "& .MuiSvgIcon-root": {color: "inherit"},
                }}
                variant="contained"
            >
                <Tooltip title={isPublishBlocked ? PUBLISH_SETTINGS_REQUIRED_MESSAGE : ""}>
                    {/* A disabled button doesn't fire the hover events the tooltip needs, so it gets a wrapper */}
                    <span>
                        <Button
                            disabled={isPublishBlocked}
                            id={`${id}-main`}
                            onClick={mainAction.handleClick}
                            startIcon={mainAction.icon}
                            sx={{whiteSpace: "nowrap"}}
                        >
                            {mainAction.label}
                        </Button>
                    </span>
                </Tooltip>
                {publishState && (
                    <Button
                        aria-expanded={isPanelOpen}
                        aria-label={SHOW_DETAILS_LABEL}
                        id={`${id}-toggle`}
                        onClick={() => setIsPanelOpen((isOpen) => !isOpen)}
                    >
                        <KeyboardArrowDownIcon sx={{fontSize: 18}} />
                    </Button>
                )}
            </ButtonGroup>
            {publishState && (
                <Popover
                    anchorEl={anchorEl}
                    anchorOrigin={{vertical: "bottom", horizontal: "right"}}
                    onClose={() => setIsPanelOpen(false)}
                    open={isPanelOpen}
                    slotProps={{paper: {sx: {mt: 1}}}}
                    transformOrigin={{vertical: "top", horizontal: "right"}}
                >
                    <PublishPanel
                        publishState={publishState}
                        id={`${id}-panel`}
                        isUnpublishing={isUnpublishing}
                        onUnpublish={setNetworkToUnpublish}
                    />
                </Popover>
            )}
            {isPublishConfirmOpen && target && (
                <ConfirmationModal
                    content={
                        `"${displayName}" will be published to ${target.serverUrl} ` +
                        `under the org "${target.orgName}". Anyone with the link will be able to use it.`
                    }
                    handleCancel={() => setIsPublishConfirmOpen(false)}
                    handleOk={() => {
                        setIsPublishConfirmOpen(false)
                        void handlePublish(target)
                    }}
                    id={`${id}-confirm`}
                    okBtnLabel="Publish"
                    title="Publish this network?"
                />
            )}
            {networkToUnpublish && (
                <ConfirmationModal
                    content={
                        `"${displayName}" will be taken offline at ${networkToUnpublish.url}. ` +
                        "Anyone using the link will lose access."
                    }
                    handleCancel={() => setNetworkToUnpublish(null)}
                    handleOk={() => {
                        setNetworkToUnpublish(null)
                        void handleUnpublish(networkToUnpublish)
                    }}
                    id={`${id}-unpublish-confirm`}
                    okBtnLabel="Unpublish"
                    title="Unpublish this network?"
                />
            )}
        </>
    )
}
