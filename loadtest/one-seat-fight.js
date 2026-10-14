import http from "k6/http"
import { SharedArray } from "k6/data"
import { Counter } from "k6/metrics"

// Every user (VU) tries to hold the SAME seat, round after round.
// Round r = seat r. Correct behaviour: exactly ONE 200 per round, everyone else 409, zero 5xx.

const BASE = __ENV.BASE_URL || "http://host.docker.internal:8080"
const ROUNDS = Number(__ENV.ROUNDS || 20)

const data = new SharedArray("data", function () {
    return [JSON.parse(open("/loadtest/data.json"))]
})[0]

if (ROUNDS > data.seatIds.length) {
    throw new Error(`ROUNDS (${ROUNDS}) is more than the seeded seats (${data.seatIds.length})`)
}

const winners = new Counter("winners")
const rejected = new Counter("rejected")
const unexpected = new Counter("unexpected")

// 200 and 409 are the only correct answers; anything else counts as a failed request.
http.setResponseCallback(http.expectedStatuses(200, 409))

// One threshold per round: that seat must have exactly one winner. (A single total of 20 could
// hide a double-hold on one seat and a missed seat on another.)
const thresholds = {
    winners: [`count==${ROUNDS}`],
    unexpected: ["count==0"],
    http_req_failed: ["rate==0"],
}
for (let r = 0; r < ROUNDS; r++) thresholds[`winners{round:${r}}`] = ["count==1"]

export const options = {
    scenarios: {
        fight: {
            executor: "per-vu-iterations",
            vus: data.tokens.length,
            iterations: ROUNDS,
            maxDuration: "5m",
        },
    },
    thresholds,
}

export default function fight() {
    const token = data.tokens[__VU - 1]
    const seatId = data.seatIds[__ITER]

    const res = http.post(
        `${BASE}/api/events/${data.eventId}/holds`,
        JSON.stringify({ seatIds: [seatId] }),
        {
            headers: {
                "content-type": "application/json",
                cookie: `authjs.session-token=${token}`,
            },
            tags: { name: "hold" },
        }
    )

    if (res.status === 200) winners.add(1, { round: String(__ITER) })
    else if (res.status === 409) rejected.add(1)
    else {
        unexpected.add(1, { status: String(res.status) })
        console.log(`UNEXPECTED status=${res.status} error=${res.error_code} body=${String(res.body).slice(0, 200)}`)
    }
}