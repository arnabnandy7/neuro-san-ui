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

import {create} from "zustand"

export enum PublishStatus {
    Publishing = "Publishing",
    Live = "Live",
}

interface PublishingNetwork {
    readonly status: PublishStatus.Publishing
}

export interface LiveNetwork {
    readonly status: PublishStatus.Live
    /** The NS Deploy server it's published on, so it's unpublished from the same one */
    readonly serverUrl: string
    /** The server's id for it, needed to unpublish */
    readonly deploymentId: string
    readonly url: string
    /** Milliseconds since epoch */
    readonly publishedAt: number
}

export type PublishState = PublishingNetwork | LiveNetwork

/**
 * Zustand state store for networks that are publishing or live, keyed by agent network name. Kept in memory only.
 */
interface PublishStore {
    readonly networks: Readonly<Record<string, PublishState>>
    readonly setPublishState: (networkName: string, publishState: PublishState) => void
    readonly clearPublishState: (networkName: string) => void
}

export const usePublishStore = create<PublishStore>()((set) => ({
    networks: {},
    setPublishState: (networkName, publishState) =>
        set(({networks}) => ({networks: {...networks, [networkName]: publishState}})),
    clearPublishState: (networkName) =>
        set(({networks}) => {
            const {[networkName]: _removed, ...rest} = networks
            return {networks: rest}
        }),
}))
