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
 * Client for a publish server, which runs a network's HOCON as a live website. We use it to publish networks.
 * Requests go through our `/api/publish` route because the server doesn't allow requests from browsers.
 *
 * Endpoints we call:
 * - `GET /health`: whether the server is up. No token needed. Used by checkHealth.
 * - `GET /deployments`: lists published networks. Used by findPublishedNetwork.
 * - `POST /deployments`: uploads the HOCON as `file` along with `name` and `org_name`. Used by publishNetwork.
 * - `GET /deployments/{id}/wait?timeout=60`: waits for the build. 504 means it's still building, so ask again. Used by
 *   publishNetwork.
 * - `DELETE /deployments/{id}`: takes a network offline. Used by unpublishNetwork.
 *
 * The server identifies a network by its name within an org, so publishing the same name again replaces it.
 *
 * The server also has `GET /deployments/{id}/logs?tail=150` (build log), which we don't use yet.
 */

import httpStatus from "http-status"

import {testConnection, TestConnectionResult} from "../agent/Agent"

//#region Types

export interface PublishedNetwork {
    readonly id: string
    readonly url: string
}

interface PublishNetworkRequest {
    readonly serverUrl: string
    readonly orgName: string
    readonly networkName: string
    readonly hocon: string
}

/** The subset of the server's view of a published network (its DeploymentView) that we use */
interface ServerNetwork {
    readonly id: string
    readonly name: string
    readonly org_name: string
    readonly status: "queued" | "building" | "ready" | "failed" | "stopped"
    /** Set once status is ready */
    readonly url?: string | null
    readonly error?: string | null
}

//#endregion Types

//#region Constants

// How long each /wait request holds open waiting for the build to finish
const WAIT_TIMEOUT_SECONDS = 60

//#endregion Constants

const publishRouteUrl = (serverUrl: string, path: string, query: Record<string, string> = {}): string =>
    `/api/publish/${path}?${new URLSearchParams({server: serverUrl, ...query})}`

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
 * Checks that a publish server is up.
 */
export const checkHealth = (serverUrl: string): Promise<TestConnectionResult> =>
    testConnection(publishRouteUrl(serverUrl, "health"))

/**
 * Finds the live network with this name in the org, if there is one.
 */
export const findPublishedNetwork = async (
    serverUrl: string,
    orgName: string,
    networkName: string
): Promise<PublishedNetwork | null> => {
    const response = await fetch(publishRouteUrl(serverUrl, "deployments"))
    await throwIfNotOk(response, "Listing published networks")
    const {deployments: networks}: {deployments: ServerNetwork[]} = await response.json()

    const live = networks.find(
        (network) => network.name === networkName && network.org_name === orgName && network.status === "ready"
    )
    return live?.url ? {id: live.id, url: live.url} : null
}

/**
 * Uploads the HOCON and waits until the network is live.
 */
export const publishNetwork = async ({
    serverUrl,
    orgName,
    networkName,
    hocon,
}: PublishNetworkRequest): Promise<PublishedNetwork> => {
    const form = new FormData()
    form.append("file", new Blob([hocon], {type: "text/plain"}), `${networkName}.hocon`)
    form.append("name", networkName)
    form.append("org_name", orgName)

    const createResponse = await fetch(publishRouteUrl(serverUrl, "deployments"), {method: "POST", body: form})
    await throwIfNotOk(createResponse, "Publishing")
    let network: ServerNetwork = await createResponse.json()

    while (network.status === "queued" || network.status === "building") {
        const waitResponse = await fetch(
            publishRouteUrl(serverUrl, `deployments/${network.id}/wait`, {timeout: String(WAIT_TIMEOUT_SECONDS)})
        )
        // A timeout means it's still building, so ask again
        if (waitResponse.status !== httpStatus.GATEWAY_TIMEOUT) {
            await throwIfNotOk(waitResponse, "Waiting for it to go live")
            network = await waitResponse.json()
        }
    }

    if (network.status !== "ready" || !network.url) {
        throw new Error(network.error || `Publishing ended as ${network.status}`)
    }

    return {id: network.id, url: network.url}
}

/**
 * Takes a published network offline.
 */
export const unpublishNetwork = async (serverUrl: string, publishId: string): Promise<void> => {
    const response = await fetch(publishRouteUrl(serverUrl, `deployments/${publishId}`), {method: "DELETE"})
    await throwIfNotOk(response, "Unpublishing")
}
