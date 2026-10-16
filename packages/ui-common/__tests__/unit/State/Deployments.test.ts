import {withStrictMocks} from "../../../../../__tests__/common/strictMocks"
import {DeploymentStatus, useDeploymentsStore} from "../../../state/Deployments"

const NETWORK_NAME = "cailville_bakery"
const LIVE_URL = "http://live.test/cailville_bakery"

describe("Deployments store", () => {
    withStrictMocks()

    beforeEach(() => {
        useDeploymentsStore.setState({deployments: {}})
    })

    it("should mark a publishing network live with its URL and keep its log", () => {
        const {appendLog, markLive, startPublishing} = useDeploymentsStore.getState()
        const entry = {timestamp: Date.now(), message: "POST /bundle"}

        startPublishing(NETWORK_NAME)
        appendLog(NETWORK_NAME, entry)
        markLive(NETWORK_NAME, LIVE_URL)

        expect(useDeploymentsStore.getState().deployments[NETWORK_NAME]).toEqual({
            log: [entry],
            publishedAt: expect.any(Number),
            status: DeploymentStatus.Live,
            url: LIVE_URL,
        })
    })

    it("should ignore log entries and go-live for a network that isn't being published", () => {
        const {appendLog, markLive} = useDeploymentsStore.getState()

        appendLog(NETWORK_NAME, {timestamp: Date.now(), message: "POST /bundle"})
        markLive(NETWORK_NAME, LIVE_URL)

        expect(useDeploymentsStore.getState().deployments).toEqual({})
    })
})
