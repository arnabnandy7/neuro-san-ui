import {withStrictMocks} from "../../../../../../__tests__/common/strictMocks"
import {publishNetwork, testDeployServer, unpublishNetwork} from "../../../../controller/deploy/Deploy"

const SERVER_URL = "https://nsdeploy.test"
const NETWORK_NAME = "cailville_bakery"
const ORG_NAME = "cailville"
const HOCON = "{ tools: [] }"
const DEPLOYMENT_ID = "dep-123"
const LIVE_URL = "https://nsdeploy.test/sites/cailville_bakery"

// Covers each NS Deploy endpoint the client calls. The comment on each test names the endpoints it exercises.
describe("Deploy", () => {
    withStrictMocks()

    let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

    const publish = () =>
        publishNetwork({
            serverUrl: SERVER_URL,
            orgName: ORG_NAME,
            networkName: NETWORK_NAME,
            hocon: HOCON,
            onLog: vi.fn(),
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

        const result = await testDeployServer(SERVER_URL)

        expect(result.success).toBe(true)
        expect(fetchMock.mock.calls[0][0]).toBe(`/api/nsdeploy/health?server=${encodeURIComponent(SERVER_URL)}`)
    })

    // POST /deployments
    it("should upload the HOCON with the org name", async () => {
        fetchMock.mockResolvedValue(Response.json({id: DEPLOYMENT_ID, status: "ready", url: LIVE_URL}, {status: 202}))

        await publish()

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`/api/nsdeploy/deployments?server=${encodeURIComponent(SERVER_URL)}`)
        expect(init?.method).toBe("POST")
        const form = init?.body as FormData
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
            .mockResolvedValueOnce(Response.json({id: DEPLOYMENT_ID, status: "ready", url: LIVE_URL}))

        const published = await publish()

        expect(published).toEqual({deploymentId: DEPLOYMENT_ID, url: LIVE_URL})
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(fetchMock.mock.calls[1][0]).toContain(`/api/nsdeploy/deployments/${DEPLOYMENT_ID}/wait?`)
    })

    // POST /deployments, then GET /deployments/{id}/wait ends as failed
    it("should fail with the server's error when the build fails", async () => {
        fetchMock
            .mockResolvedValueOnce(Response.json({id: DEPLOYMENT_ID, status: "building"}, {status: 202}))
            .mockResolvedValueOnce(Response.json({id: DEPLOYMENT_ID, status: "failed", error: "pip install failed"}))

        await expect(publish()).rejects.toThrow("pip install failed")
    })

    // POST /deployments rejected
    it("should fail with the server's explanation when it rejects the upload", async () => {
        fetchMock.mockResolvedValue(Response.json({detail: "Invalid token"}, {status: 401}))

        await expect(publish()).rejects.toThrow("Deploy failed (401): Invalid token")
    })

    // POST /deployments rejected
    it("should fail with the server's validation errors when they aren't a plain message", async () => {
        fetchMock.mockResolvedValue(
            Response.json({detail: [{loc: ["body", "file"], msg: "Field required"}]}, {status: 422})
        )

        await expect(publish()).rejects.toThrow("Field required")
    })

    // POST /deployments ends as stopped
    it("should say how the deploy ended when the server gives no error", async () => {
        fetchMock.mockResolvedValue(Response.json({id: DEPLOYMENT_ID, status: "stopped"}, {status: 202}))

        await expect(publish()).rejects.toThrow("The deploy ended as stopped")
    })

    // POST /deployments rejected
    it("should fail with the status text when the error isn't JSON", async () => {
        fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", {status: 502, statusText: "Bad Gateway"}))

        await expect(publish()).rejects.toThrow("Deploy failed (502): Bad Gateway")
    })

    // DELETE /deployments/{id}
    it("should delete the deployment to unpublish it", async () => {
        fetchMock.mockResolvedValue(Response.json({id: DEPLOYMENT_ID, status: "stopped"}))

        await unpublishNetwork(SERVER_URL, DEPLOYMENT_ID)

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`/api/nsdeploy/deployments/${DEPLOYMENT_ID}?server=${encodeURIComponent(SERVER_URL)}`)
        expect(init?.method).toBe("DELETE")
    })
})
