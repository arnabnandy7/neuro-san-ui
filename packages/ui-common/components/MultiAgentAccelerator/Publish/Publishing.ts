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

import {createDeployment, deleteDeployment, findReadyDeployment} from "../../../controller/nsDeploy/NsDeploy"
import {LiveNetwork, PublishStatus, usePublishStore} from "../../../state/Publishing"
import {NotificationType, sendNotification} from "../../Common/notification"

/** Where networks are published, from Settings */
export interface PublishTarget {
    readonly serverUrl: string
    readonly orgName: string
}

/**
 * Asks the server whether the network is already live, for example after a reload, and remembers it if so. Does
 * nothing if we already know the network's publish state.
 */
export const checkIfPublished = async (networkName: string, {serverUrl, orgName}: PublishTarget): Promise<void> => {
    if (usePublishStore.getState().networks[networkName]) return

    try {
        const ready = await findReadyDeployment(serverUrl, orgName, networkName)

        // Don't overwrite a publish the user started while we were asking
        if (!ready || usePublishStore.getState().networks[networkName]) return

        usePublishStore.getState().setPublishState(networkName, {
            status: PublishStatus.Live,
            serverUrl,
            deploymentId: ready.id,
            url: ready.url,
            publishedAt: ready.readyAt,
        })
    } catch (e) {
        console.warn(`Unable to check whether "${networkName}" is published:`, e)
    }
}

/**
 * Publishes the network's HOCON, the same file Download gives, and waits for it to go live.
 * @returns The live URL, or null if publishing failed, in which case the user has been told why
 */
export const publish = async (
    networkName: string,
    hocon: string,
    {serverUrl, orgName}: PublishTarget
): Promise<string | null> => {
    const {clearPublishState, setPublishState} = usePublishStore.getState()
    setPublishState(networkName, {status: PublishStatus.Publishing})

    try {
        const ready = await createDeployment({serverUrl, orgName, deploymentName: networkName, hocon})
        setPublishState(networkName, {
            status: PublishStatus.Live,
            serverUrl,
            deploymentId: ready.id,
            url: ready.url,
            publishedAt: ready.readyAt,
        })
        return ready.url
    } catch (e) {
        clearPublishState(networkName)
        sendNotification(NotificationType.error, `Failed to publish "${networkName}".`, String(e))
        return null
    }
}

/**
 * Takes a live network offline, on the server it was published to.
 */
export const unpublish = async (networkName: string, liveNetwork: LiveNetwork): Promise<void> => {
    try {
        await deleteDeployment(liveNetwork.serverUrl, liveNetwork.deploymentId)
        usePublishStore.getState().clearPublishState(networkName)
    } catch (e) {
        sendNotification(NotificationType.error, `Failed to unpublish "${networkName}".`, String(e))
    }
}
