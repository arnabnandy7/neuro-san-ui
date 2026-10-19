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

import {useCallback} from "react"

import {DeployLogEntry, publishNetwork, unpublishNetwork} from "../../../controller/deploy/Deploy"
import {Deployment, DeploymentStatus, LiveDeployment, useDeploymentsStore} from "../../../state/Deployments"
import {useSettingsStore} from "../../../state/Settings"
import {NotificationType, sendNotification} from "../../Common/notification"

interface NetworkDeployment {
    readonly deployment: Deployment | undefined
    /** Resolves to the live URL, or null if publishing failed */
    readonly publish: () => Promise<string | null>
    readonly unpublish: (liveDeployment: LiveDeployment) => Promise<void>
}

/**
 * Publish state and actions for a single network, using the NS Deploy server and org name from Settings.
 * @param networkName The agent network name
 * @param hocon The network's HOCON, the same file Download gives
 */
export const useNetworkDeployment = (networkName: string, hocon: string): NetworkDeployment => {
    const deployment = useDeploymentsStore((state) => state.deployments[networkName])

    const publish = useCallback(async (): Promise<string | null> => {
        const {removeDeployment, setDeployment} = useDeploymentsStore.getState()
        const {serverUrl, orgName} = useSettingsStore.getState().settings.nsDeploy
        let log: readonly DeployLogEntry[] = []
        setDeployment(networkName, {status: DeploymentStatus.Publishing, log})

        try {
            if (!serverUrl || !orgName) {
                throw new Error("Set an NS Deploy server and org name in Settings to publish.")
            }

            const {deploymentId, url} = await publishNetwork({
                serverUrl,
                orgName,
                networkName,
                hocon,
                onLog: (entry) => {
                    log = [...log, entry]
                    setDeployment(networkName, {status: DeploymentStatus.Publishing, log})
                },
            })
            setDeployment(networkName, {
                status: DeploymentStatus.Live,
                log,
                serverUrl,
                deploymentId,
                url,
                publishedAt: Date.now(),
            })
            return url
        } catch (e) {
            removeDeployment(networkName)
            sendNotification(NotificationType.error, `Failed to publish "${networkName}".`, String(e))
            return null
        }
    }, [hocon, networkName])

    const unpublish = useCallback(
        async (liveDeployment: LiveDeployment): Promise<void> => {
            try {
                await unpublishNetwork(liveDeployment.serverUrl, liveDeployment.deploymentId)
                useDeploymentsStore.getState().removeDeployment(networkName)
            } catch (e) {
                sendNotification(NotificationType.error, `Failed to unpublish "${networkName}".`, String(e))
            }
        },
        [networkName]
    )

    return {deployment, publish, unpublish}
}
