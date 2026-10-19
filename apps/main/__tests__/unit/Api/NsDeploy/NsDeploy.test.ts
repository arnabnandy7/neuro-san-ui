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

import {createMocks, RequestMethod} from "node-mocks-http"

import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import handler from "../../../../pages/api/nsdeploy/[...path]"

const SERVER_URL = "https://nsdeploy.test"

// Each test uses one of the NS Deploy endpoints the client calls (see controller/nsDeploy/NsDeploy.ts). The
// comment on each test names it.
describe("NS Deploy proxy", () => {
    withStrictMocks()

    let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

    const callProxy = async (method: RequestMethod, query: Record<string, string | string[]>, body?: string) => {
        const {req, res} = createMocks({method, query, headers: body ? {"content-type": "text/plain"} : {}})
        const handled = handler(req, res)
        if (method !== "GET") {
            req.send(body ?? "")
        }
        await handled
        return res
    }

    beforeEach(() => {
        fetchMock = vi.fn<typeof fetch>()
        vi.stubGlobal("fetch", fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    // GET /deployments/{id}/wait
    it("should forward to the server path with the query and the bearer token from the environment", async () => {
        vi.stubEnv("NSDEPLOY_BEARER_TOKEN", "test-token")
        fetchMock.mockResolvedValue(Response.json({id: "dep-1", status: "ready"}))

        const res = await callProxy("GET", {path: ["deployments", "dep-1", "wait"], server: SERVER_URL, timeout: "60"})

        const [target, init] = fetchMock.mock.calls[0]
        expect(String(target)).toBe(`${SERVER_URL}/deployments/dep-1/wait?timeout=60`)
        expect(init?.headers).toMatchObject({Authorization: "Bearer test-token"})
        expect(res._getStatusCode()).toBe(200)
        expect(JSON.parse(res._getData().toString())).toEqual({id: "dep-1", status: "ready"})
    })

    // GET /health
    it("should forward without a bearer token when none is configured", async () => {
        vi.stubEnv("NSDEPLOY_BEARER_TOKEN", "")
        fetchMock.mockResolvedValue(Response.json({status: "ok"}))

        await callProxy("GET", {path: ["health"], server: SERVER_URL})

        expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization")
    })

    // POST /deployments
    it("should pass the upload body and its content type through unchanged", async () => {
        fetchMock.mockResolvedValue(Response.json({id: "dep-1"}, {status: 202}))

        const res = await callProxy("POST", {path: ["deployments"], server: SERVER_URL}, "hocon contents")

        const init = fetchMock.mock.calls[0][1]
        expect(init?.method).toBe("POST")
        expect(init?.headers).toMatchObject({"Content-Type": "text/plain"})
        expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe("hocon contents")
        expect(res._getStatusCode()).toBe(202)
    })

    // DELETE /deployments/{id}
    it("should forward to a server URL that ends in a slash and relay an empty response", async () => {
        fetchMock.mockResolvedValue(new Response(null, {status: 204}))

        const res = await callProxy("DELETE", {path: ["deployments", "dep-1"], server: `${SERVER_URL}/`})

        expect(String(fetchMock.mock.calls[0][0])).toBe(`${SERVER_URL}/deployments/dep-1`)
        expect(res._getStatusCode()).toBe(204)
    })

    // GET /health, refused before it's sent
    it.each([
        {desc: "missing", server: undefined},
        {desc: "not a URL", server: "not a url"},
        {desc: "not http(s)", server: "file:///etc/passwd"},
    ])("should refuse a server URL that's $desc", async ({server}) => {
        const res = await callProxy("GET", {path: ["health"], ...(server ? {server} : {})})

        expect(res._getStatusCode()).toBe(400)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    // GET /health
    it("should explain when the server can't be reached", async () => {
        fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"))

        const res = await callProxy("GET", {path: ["health"], server: SERVER_URL})

        expect(res._getStatusCode()).toBe(502)
        expect(res._getJSONData().detail).toContain("getaddrinfo ENOTFOUND")
    })
})
