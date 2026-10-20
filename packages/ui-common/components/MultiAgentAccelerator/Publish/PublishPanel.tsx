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

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import LinearProgress from "@mui/material/LinearProgress"
import Typography from "@mui/material/Typography"
import {FC} from "react"

import {LiveUrlField} from "./LiveUrlField"
import {StatusDot} from "./PublishStatusBadge"
import {LiveNetwork, PublishState, PublishStatus} from "../../../state/Publishing"

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat(undefined, {numeric: "auto"})

/**
 * Formats how long ago a network was published, e.g. "just now" or "5 minutes ago".
 * @param publishedAt Milliseconds since epoch
 */
const formatPublishedAgo = (publishedAt: number): string => {
    const minutes = Math.floor((Date.now() - publishedAt) / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return RELATIVE_TIME_FORMAT.format(-minutes, "minute")

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return RELATIVE_TIME_FORMAT.format(-hours, "hour")

    return RELATIVE_TIME_FORMAT.format(-Math.floor(hours / 24), "day")
}

interface PublishPanelProps {
    readonly publishState: PublishState
    readonly id: string
    readonly isUnpublishing: boolean
    readonly onUnpublish: (liveNetwork: LiveNetwork) => void
}

/**
 * Details of publishing a network: progress while publishing, or the live URL once published.
 */
export const PublishPanel: FC<PublishPanelProps> = ({id, isUnpublishing, onUnpublish, publishState}) => (
    <Box
        id={id}
        sx={{display: "flex", flexDirection: "column", gap: 1.5, p: 2, width: "22rem"}}
    >
        {publishState.status === PublishStatus.Live ? (
            <>
                <Box sx={{alignItems: "center", display: "flex", gap: 1}}>
                    <StatusDot publishStatus={publishState.status} />
                    <Typography sx={{fontWeight: 600}}>Live</Typography>
                </Box>
                <LiveUrlField url={publishState.url} />
                <Typography
                    color="text.secondary"
                    variant="body2"
                >
                    Published {formatPublishedAgo(publishState.publishedAt)}
                </Typography>
                <Divider />
                <Button
                    disabled={isUnpublishing}
                    onClick={() => onUnpublish(publishState)}
                    size="small"
                    sx={{alignSelf: "flex-start", color: "error.light", minWidth: 0, p: 0, textTransform: "none"}}
                >
                    {isUnpublishing ? "Unpublishing..." : "Unpublish"}
                </Button>
            </>
        ) : (
            <>
                <Typography sx={{fontWeight: 600}}>Putting it online...</Typography>
                <LinearProgress
                    aria-label="Publishing progress"
                    sx={{"& .MuiLinearProgress-bar": {backgroundColor: "var(--bs-secondary)"}}}
                />
                <Typography
                    color="text.secondary"
                    variant="body2"
                >
                    Usually takes a few seconds.
                </Typography>
            </>
        )}
    </Box>
)
