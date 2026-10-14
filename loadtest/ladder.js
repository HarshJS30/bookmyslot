import http from "k6/http"
import { SharedArray } from "k6/data"
import { Counter } from "k6/metrics"

// Hits ONE GET route with constant concurrency and no pauses, to measure its ceiling.
// Env: BASE_URL (default http://nginx, for running k6 on the compose network),
//      TARGET (default /api/health), VUS (default 200), DURATION (default 20s)

const BASE = __ENV.BASE_URL || "http://nginx"
const TARGET = __ENV.TARGET || "/api/health"
const VUS = Number(__ENV.VUS || 200)
const DURATION = __ENV.DURATION || "20s"

const data = new SharedArray("data", function () {
    return [JSON.parse(open("/loadtest/data.json"))]
})[0]

const bad = new Counter("bad_status")

export const options = {
    scenarios: {
        ladder: { executor: "constant-vus", vus: VUS, duration: DURATION },
    },
    thresholds: { bad_status: ["count==0"] },
}

export default function ladder() {
    const token = data.tokens[(__VU - 1) % data.tokens.length]
    const res = http.get(BASE + TARGET, {
        headers: { cookie: `authjs.session-token=${token}` },
        tags: { name: TARGET },
    })
    if (res.status !== 200) bad.add(1)
}