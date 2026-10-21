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

/**
 * Publish, unpublish, and check whether a network is published. Each updates the publish store, which is what the
 * Publish button and sidebar badge show.
 */

import {findPublishedNetwork, publishNetwork, unpublishNetwork} from "../../../controller/publish/PublishServer"
import {Published, PublishStatus, usePublishStore} from "../../../state/Publishing"
import {NotificationType, sendNotification} from "../../Common/notification"

export const PUBLISH_SETTINGS_REQUIRED_MESSAGE = "Add a publish server and org name in Settings > Publishing to publish"
export const PUBLISHED_MESSAGE = "Published — opened in a new tab"
export const PUBLISHED_TAB_BLOCKED_MESSAGE = "Published — click View live to open it"

/** Where networks are published, from Settings */
export interface PublishTarget {
    readonly serverUrl: string
    readonly orgName: string
}

/** The network being published */
export interface PublishNetwork {
    /** The network's id in the app, which the publish store is keyed by */
    readonly id: string
    /** The agent network name, which it's published under */
    readonly name: string
}

/**
 * Opens a URL in a new tab, cut off from this page.
 * @returns Whether the tab opened. False when the browser blocked it as a popup.
 * @note Sets `opener` by hand because the "noopener" feature makes window.open always return null, which would hide
 * whether the tab opened.
 */
export const openInNewTab = (url: string): boolean => {
    const tab = window.open(url, "_blank")
    if (!tab) return false

    tab.opener = null
    return true
}

/**
 * Asks the server whether the network is already live, for example after a reload, and remembers it if so. Does
 * nothing if we already know the network's publish state.
 */
export const checkIfPublished = async (network: PublishNetwork, {serverUrl, orgName}: PublishTarget): Promise<void> => {
    if (usePublishStore.getState().networks[network.id]) return

    try {
        const ready = await findPublishedNetwork(serverUrl, orgName, network.name)

        // Don't overwrite a publish the user started while we were asking
        if (!ready || usePublishStore.getState().networks[network.id]) return

        usePublishStore.getState().setPublishState(network.id, {
            status: PublishStatus.Live,
            serverUrl,
            publishId: ready.id,
            url: ready.url,
        })
    } catch (e) {
        console.warn(`Unable to check whether "${network.name}" is published:`, e)
    }
}

/**
 * Publishes the network's HOCON, the same file Download gives, waits for it to go live, then opens it in a new tab.
 * Tells the user how it went either way.
 */
export const publish = async (
    network: PublishNetwork,
    hocon: string,
    {serverUrl, orgName}: PublishTarget
): Promise<void> => {
    const {clearPublishState, setPublishState} = usePublishStore.getState()
    setPublishState(network.id, {status: PublishStatus.Publishing})

    try {
        const ready = await publishNetwork({serverUrl, orgName, networkName: network.name, hocon})
        setPublishState(network.id, {status: PublishStatus.Live, serverUrl, publishId: ready.id, url: ready.url})

        const message = openInNewTab(ready.url) ? PUBLISHED_MESSAGE : PUBLISHED_TAB_BLOCKED_MESSAGE
        sendNotification(NotificationType.success, message, "", {vertical: "bottom", horizontal: "center"})
    } catch (e) {
        clearPublishState(network.id)
        sendNotification(NotificationType.error, `Failed to publish "${network.name}".`, String(e))
    }
}

/**
 * Takes a live network offline, on the server it was published to.
 */
export const unpublish = async (network: PublishNetwork, published: Published): Promise<void> => {
    try {
        await unpublishNetwork(published.serverUrl, published.publishId)
        usePublishStore.getState().clearPublishState(network.id)
    } catch (e) {
        sendNotification(NotificationType.error, `Failed to unpublish "${network.name}".`, String(e))
    }
}
