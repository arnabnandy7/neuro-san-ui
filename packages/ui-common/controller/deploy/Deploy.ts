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
 * Client for an NS Deploy server, which deploys a network's HOCON as a live website.
 * Requests go through our `/api/nsdeploy` route because the server doesn't allow requests from browsers.
 *
 * NS Deploy endpoints we call:
 * - `GET /health`: whether the server is up. No token needed. Used by testDeployServer.
 * - `POST /deployments`: uploads the HOCON as `file` along with `org_name`. Used by publishNetwork.
 * - `GET /deployments/{id}/wait?timeout=60`: waits for the build. 504 means it's still building, so ask again. Used by
 *   publishNetwork.
 * - `DELETE /deployments/{id}`: takes the network offline. Used by unpublishNetwork.
 *
 * The server also has `GET /deployments` (list) and `GET /deployments/{id}/logs?tail=150` (build log), which we don't
 * use yet.
 */

import {testConnection, TestConnectionResult} from "../agent/Agent"

//#region Types

export interface DeployLogEntry {
    /** Milliseconds since epoch */
    readonly timestamp: number
    readonly message: string
    readonly detail?: string
}

export interface PublishedNetwork {
    readonly deploymentId: string
    readonly url: string
}

interface PublishRequest {
    readonly serverUrl: string
    readonly orgName: string
    readonly networkName: string
    readonly hocon: string
    /** Called with each step of the deploy as it happens */
    readonly onLog: (entry: DeployLogEntry) => void
}

/** The subset of the server's DeploymentView that we use */
interface Deployment {
    readonly id: string
    readonly status: "queued" | "building" | "ready" | "failed" | "stopped"
    /** Set once status is ready */
    readonly url?: string | null
    readonly error?: string | null
}

//#endregion Types

//#region Constants

// How long each /wait request holds open waiting for the build to finish
const WAIT_TIMEOUT_SECONDS = 60

// /wait answers 504 when the build is still going, which means ask again
const STILL_BUILDING_STATUS = 504

//#endregion Constants

const proxyUrl = (serverUrl: string, path: string, query: Record<string, string> = {}): string =>
    `/api/nsdeploy/${path}?${new URLSearchParams({server: serverUrl, ...query})}`

/**
 * Throws with the server's explanation if the response isn't OK.
 * @param action What we were doing, for the error message
 */
const throwIfNotOk = async (response: Response, action: string): Promise<void> => {
    if (response.ok) return

    let reason = response.statusText
    try {
        // The server is FastAPI, which explains errors in `detail`
        const {detail} = await response.json()
        reason = typeof detail === "string" ? detail : JSON.stringify(detail)
    } catch {
        // Not JSON, so keep the status text
    }
    throw new Error(`${action} failed (${response.status}): ${reason}`)
}

/**
 * Checks that an NS Deploy server is up.
 * @param serverUrl The NS Deploy server URL
 */
export const testDeployServer = (serverUrl: string): Promise<TestConnectionResult> =>
    testConnection(proxyUrl(serverUrl, "health"))

/**
 * Deploys a network and waits for it to go live.
 * @returns The deployment's id, needed to unpublish it, and the URL where it's live
 */
export const publishNetwork = async ({
    serverUrl,
    orgName,
    networkName,
    hocon,
    onLog,
}: PublishRequest): Promise<PublishedNetwork> => {
    const log = (message: string, detail?: string) => onLog({timestamp: Date.now(), message, detail})

    const form = new FormData()
    form.append("file", new Blob([hocon], {type: "text/plain"}), `${networkName}.hocon`)
    form.append("org_name", orgName)

    log(`POST ${serverUrl}/deployments`, `${networkName}.hocon`)
    const deployResponse = await fetch(proxyUrl(serverUrl, "deployments"), {method: "POST", body: form})
    await throwIfNotOk(deployResponse, "Deploy")
    let deployment: Deployment = await deployResponse.json()
    log(`${deployResponse.status} ${deployment.status}`, `deployment_id=${deployment.id}`)

    while (deployment.status === "queued" || deployment.status === "building") {
        const waitResponse = await fetch(
            proxyUrl(serverUrl, `deployments/${deployment.id}/wait`, {timeout: String(WAIT_TIMEOUT_SECONDS)})
        )
        if (waitResponse.status === STILL_BUILDING_STATUS) {
            log("Still building")
        } else {
            await throwIfNotOk(waitResponse, "Waiting for the deploy")
            deployment = await waitResponse.json()
        }
    }

    if (deployment.status !== "ready" || !deployment.url) {
        throw new Error(deployment.error || `The deploy ended as ${deployment.status}`)
    }

    log(deployment.status, deployment.url)
    return {deploymentId: deployment.id, url: deployment.url}
}

/**
 * Takes a published network offline.
 * @param serverUrl The NS Deploy server URL
 * @param deploymentId The id returned when the network was published
 */
export const unpublishNetwork = async (serverUrl: string, deploymentId: string): Promise<void> => {
    const response = await fetch(proxyUrl(serverUrl, `deployments/${deploymentId}`), {method: "DELETE"})
    await throwIfNotOk(response, "Unpublish")
}
