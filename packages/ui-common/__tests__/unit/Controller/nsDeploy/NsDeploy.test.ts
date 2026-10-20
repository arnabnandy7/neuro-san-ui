import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {
    checkHealth,
    createDeployment,
    deleteDeployment,
    findReadyDeployment,
} from "../../../../controller/nsDeploy/NsDeploy"

const SERVER_URL = "https://nsdeploy.test"
const NETWORK_NAME = "cailville_bakery"
const ORG_NAME = "cailville"
const HOCON = "{ tools: [] }"
const DEPLOYMENT_ID = "dep-123"
const LIVE_URL = "https://nsdeploy.test/sites/cailville_bakery"
const READY_AT = "2026-10-19T12:00:00Z"

// Covers each NS Deploy endpoint the client calls. The comment on each test names the endpoints it exercises.
describe("NsDeploy", () => {
    withStrictMocks()

    let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

    const create = () =>
        createDeployment({
            serverUrl: SERVER_URL,
            orgName: ORG_NAME,
            deploymentName: NETWORK_NAME,
            hocon: HOCON,
        })

    beforeEach(() => {
        fetchMock = vi.fn<typeof fetch>()
        vi.stubGlobal("fetch", fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    // GET /health
    it("should check the server's health through our proxy", async () => {
        fetchMock.mockResolvedValue(Response.json({status: "ok"}))

        const result = await checkHealth(SERVER_URL)

        expect(result.success).toBe(true)
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/nsdeploy/health?server=${encodeURIComponent(SERVER_URL)}`)
    })

    // POST /deployments
    it("should upload the HOCON with its name and the org name", async () => {
        fetchMock.mockResolvedValue(
            Response.json({id: DEPLOYMENT_ID, status: "ready", url: LIVE_URL, created_at: READY_AT}, {status: 202})
        )

        await create()

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`/api/nsdeploy/deployments?server=${encodeURIComponent(SERVER_URL)}`)
        expect(init?.method).toBe("POST")
        const form = init?.body as FormData
        expect(form.get("name")).toBe(NETWORK_NAME)
        expect(form.get("org_name")).toBe(ORG_NAME)
        const file = form.get("file") as File
        expect(file.name).toBe(`${NETWORK_NAME}.hocon`)
        expect(await file.text()).toBe(HOCON)
    })

    // POST /deployments, then GET /deployments/{id}/wait until it's ready
    it("should keep waiting while the server says it's still building, then return the live URL", async () => {
        fetchMock
            .mockResolvedValueOnce(Response.json({id: DEPLOYMENT_ID, status: "queued"}, {status: 202}))
            .mockResolvedValueOnce(new Response(null, {status: 504}))
            .mockResolvedValueOnce(
                Response.json({id: DEPLOYMENT_ID, status: "ready", url: LIVE_URL, created_at: "x", ready_at: READY_AT})
            )

        const ready = await create()

        expect(ready).toEqual({id: DEPLOYMENT_ID, url: LIVE_URL, readyAt: Date.parse(READY_AT)})
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(fetchMock.mock.calls[1][0]).toContain(`/api/nsdeploy/deployments/${DEPLOYMENT_ID}/wait?`)
    })

    // POST /deployments
    it("should treat the deployment as ready just now when the server's date can't be read", async () => {
        vi.spyOn(Date, "now").mockReturnValue(1234)
        fetchMock.mockResolvedValue(
            Response.json({id: DEPLOYMENT_ID, status: "ready", url: LIVE_URL, created_at: "not a date"}, {status: 202})
        )

        const ready = await create()

        expect(ready.readyAt).toBe(1234)
    })

    // POST /deployments, then GET /deployments/{id}/wait ends as failed
    it("should fail with the server's error when the build fails", async () => {
        fetchMock
            .mockResolvedValueOnce(Response.json({id: DEPLOYMENT_ID, status: "building"}, {status: 202}))
            .mockResolvedValueOnce(Response.json({id: DEPLOYMENT_ID, status: "failed", error: "pip install failed"}))

        await expect(create()).rejects.toThrow("pip install failed")
    })

    // POST /deployments rejected
    it("should fail with the server's explanation when it rejects the upload", async () => {
        fetchMock.mockResolvedValue(Response.json({detail: "Invalid token"}, {status: 401}))

        await expect(create()).rejects.toThrow("Creating the deployment failed (401): Invalid token")
    })

    // POST /deployments rejected
    it("should fail with the server's validation errors when they aren't a plain message", async () => {
        fetchMock.mockResolvedValue(
            Response.json({detail: [{loc: ["body", "file"], msg: "Field required"}]}, {status: 422})
        )

        await expect(create()).rejects.toThrow("Field required")
    })

    // POST /deployments ends as stopped
    it("should say how the deployment ended when the server gives no error", async () => {
        fetchMock.mockResolvedValue(Response.json({id: DEPLOYMENT_ID, status: "stopped"}, {status: 202}))

        await expect(create()).rejects.toThrow("The deployment ended as stopped")
    })

    // POST /deployments rejected
    it("should fail with the status text when the error isn't JSON", async () => {
        fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", {status: 502, statusText: "Bad Gateway"}))

        await expect(create()).rejects.toThrow("Creating the deployment failed (502): Bad Gateway")
    })

    // GET /deployments
    it("should find the ready deployment with this name in our org", async () => {
        const readyAt = READY_AT
        fetchMock.mockResolvedValue(
            Response.json({
                capacity: {},
                deployments: [
                    {
                        id: "other-org",
                        name: NETWORK_NAME,
                        org_name: "someone-else",
                        status: "ready",
                        url: "x",
                        created_at: readyAt,
                    },
                    {id: "stopped", name: NETWORK_NAME, org_name: ORG_NAME, status: "stopped", created_at: readyAt},
                    {
                        id: DEPLOYMENT_ID,
                        name: NETWORK_NAME,
                        org_name: ORG_NAME,
                        status: "ready",
                        url: LIVE_URL,
                        created_at: readyAt,
                        ready_at: readyAt,
                    },
                ],
            })
        )

        const ready = await findReadyDeployment(SERVER_URL, ORG_NAME, NETWORK_NAME)

        expect(fetchMock.mock.calls[0][0]).toBe(`/api/nsdeploy/deployments?server=${encodeURIComponent(SERVER_URL)}`)
        expect(ready).toEqual({id: DEPLOYMENT_ID, url: LIVE_URL, readyAt: Date.parse(readyAt)})
    })

    // GET /deployments
    it("should find nothing when there's no ready deployment with this name in our org", async () => {
        fetchMock.mockResolvedValue(
            Response.json({
                capacity: {},
                deployments: [
                    {id: "stopped", name: NETWORK_NAME, org_name: ORG_NAME, status: "stopped", created_at: "x"},
                ],
            })
        )

        await expect(findReadyDeployment(SERVER_URL, ORG_NAME, NETWORK_NAME)).resolves.toBeNull()
    })

    // DELETE /deployments/{id}
    it("should delete the deployment", async () => {
        fetchMock.mockResolvedValue(Response.json({id: DEPLOYMENT_ID, status: "stopped"}))

        await deleteDeployment(SERVER_URL, DEPLOYMENT_ID)

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`/api/nsdeploy/deployments/${DEPLOYMENT_ID}?server=${encodeURIComponent(SERVER_URL)}`)
        expect(init?.method).toBe("DELETE")
    })
})
