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
 * Client for an NS Deploy server, which runs a network's HOCON as a live website. We use it to publish networks.
 * Requests go through our `/api/nsdeploy` route because the server doesn't allow requests from browsers.
 *
 * Naming: this file uses the server's terms ("deployment"). The rest of the app calls the feature "publish".
 *
 * NS Deploy endpoints we call:
 * - `GET /health`: whether the server is up. No token needed. Used by checkHealth.
 * - `GET /deployments`: lists deployments. Used by findReadyDeployment.
 * - `POST /deployments`: uploads the HOCON as `file` along with `name` and `org_name`. Used by createDeployment.
 * - `GET /deployments/{id}/wait?timeout=60`: waits for the build. 504 means it's still building, so ask again. Used by
 *   createDeployment.
 * - `DELETE /deployments/{id}`: stops a deployment. Used by deleteDeployment.
 *
 * The server identifies a deployment by its name within an org, so uploading the same name again replaces it.
 *
 * The server also has `GET /deployments/{id}/logs?tail=150` (build log), which we don't use yet.
 */

import {testConnection, TestConnectionResult} from "../agent/Agent"

//#region Types

/** One request we made to the server, shown to the user as a technical detail */
export interface RequestLogEntry {
    /** Milliseconds since epoch */
    readonly timestamp: number
    readonly message: string
    readonly detail?: string
}

export interface ReadyDeployment {
    readonly id: string
    readonly url: string
    /** When it became ready, in milliseconds since epoch */
    readonly readyAt: number
}

interface CreateDeploymentRequest {
    readonly serverUrl: string
    readonly orgName: string
    readonly deploymentName: string
    readonly hocon: string
    readonly onRequest: (entry: RequestLogEntry) => void
}

/** The subset of the server's DeploymentView that we use */
interface Deployment {
    readonly id: string
    readonly name: string
    readonly org_name: string
    readonly status: "queued" | "building" | "ready" | "failed" | "stopped"
    /** Set once status is ready */
    readonly url?: string | null
    readonly error?: string | null
    /** ISO date */
    readonly created_at: string
    /** ISO date, set once status is ready */
    readonly ready_at?: string | null
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

const toReadyDeployment = (deployment: Deployment & {url: string}): ReadyDeployment => {
    const readyAt = Date.parse(deployment.ready_at ?? deployment.created_at)

    // An unreadable date would break "Published ... ago", so treat it as just now
    return {id: deployment.id, url: deployment.url, readyAt: Number.isNaN(readyAt) ? Date.now() : readyAt}
}

/**
 * Checks that an NS Deploy server is up.
 */
export const checkHealth = (serverUrl: string): Promise<TestConnectionResult> =>
    testConnection(proxyUrl(serverUrl, "health"))

/**
 * Finds the ready deployment with this name in the org, if there is one.
 */
export const findReadyDeployment = async (
    serverUrl: string,
    orgName: string,
    deploymentName: string
): Promise<ReadyDeployment | null> => {
    const response = await fetch(proxyUrl(serverUrl, "deployments"))
    await throwIfNotOk(response, "Listing deployments")
    const {deployments}: {deployments: Deployment[]} = await response.json()

    const ready = deployments.find(
        (deployment) =>
            deployment.name === deploymentName && deployment.org_name === orgName && deployment.status === "ready"
    )
    return ready?.url ? toReadyDeployment({...ready, url: ready.url}) : null
}

/**
 * Uploads the HOCON as a deployment and waits until it's ready.
 */
export const createDeployment = async ({
    serverUrl,
    orgName,
    deploymentName,
    hocon,
    onRequest,
}: CreateDeploymentRequest): Promise<ReadyDeployment> => {
    const log = (message: string, detail?: string) => onRequest({timestamp: Date.now(), message, detail})

    const form = new FormData()
    form.append("file", new Blob([hocon], {type: "text/plain"}), `${deploymentName}.hocon`)
    form.append("name", deploymentName)
    form.append("org_name", orgName)

    log(`POST ${serverUrl}/deployments`, `${deploymentName}.hocon`)
    const createResponse = await fetch(proxyUrl(serverUrl, "deployments"), {method: "POST", body: form})
    await throwIfNotOk(createResponse, "Creating the deployment")
    let deployment: Deployment = await createResponse.json()
    log(`${createResponse.status} ${deployment.status}`, `deployment_id=${deployment.id}`)

    while (deployment.status === "queued" || deployment.status === "building") {
        const waitResponse = await fetch(
            proxyUrl(serverUrl, `deployments/${deployment.id}/wait`, {timeout: String(WAIT_TIMEOUT_SECONDS)})
        )
        if (waitResponse.status === STILL_BUILDING_STATUS) {
            log("Still building")
        } else {
            await throwIfNotOk(waitResponse, "Waiting for the deployment")
            deployment = await waitResponse.json()
        }
    }

    if (deployment.status !== "ready" || !deployment.url) {
        throw new Error(deployment.error || `The deployment ended as ${deployment.status}`)
    }

    log(deployment.status, deployment.url)
    return toReadyDeployment({...deployment, url: deployment.url})
}

/**
 * Stops a deployment.
 */
export const deleteDeployment = async (serverUrl: string, deploymentId: string): Promise<void> => {
    const response = await fetch(proxyUrl(serverUrl, `deployments/${deploymentId}`), {method: "DELETE"})
    await throwIfNotOk(response, "Deleting the deployment")
}
