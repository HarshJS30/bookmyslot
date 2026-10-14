import http from "k6/http"
import { sleep } from "k6"
import { SharedArray } from "k6/data"
import { Counter } from "k6/metrics"

// Mixed traffic over thousands of seats. Each iteration: hold 1-4 random seats, then either
//   confirm (CONFIRM_RATE, default 5%) or release them. Confirmed seats stay BOOKED, so the
//   seed's seat count limits how long the run stays interesting: re-seed between runs.
//
// Env: BASE_URL, VUS (default 50), DURATION (default 60s), CONFIRM_RATE (default 0.05),
//      THINK (default 1; multiplies the pause between iterations, 0 = no pauses = saturation test)

const BASE = __ENV.BASE_URL || "http://host.docker.internal:8080"
const VUS = Number(__ENV.VUS || 50)
const DURATION = __ENV.DURATION || "60s"
const CONFIRM_RATE = Number(__ENV.CONFIRM_RATE || 0.05)
const THINK = Number(__ENV.THINK === undefined ? 1 : __ENV.THINK)

const data = new SharedArray("data", function () {
    return [JSON.parse(open("/loadtest/data.json"))]
})[0]

const holdOk = new Counter("hold_ok")
const holdConflict = new Counter("hold_conflict")
const confirmOk = new Counter("confirm_ok")
const confirmConflict = new Counter("confirm_conflict")
const released = new Counter("released")
const unexpected = new Counter("unexpected")

http.setResponseCallback(http.expectedStatuses(200, 409))

export const options = {
    scenarios: {
        traffic: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "15s", target: VUS },
                { duration: DURATION, target: VUS },
                { duration: "10s", target: 0 },
            ],
        },
    },
    // Loose limits: they exist so the per-endpoint latencies appear in the summary.
    thresholds: {
        http_req_failed: ["rate<0.01"],
        unexpected: ["count==0"],
        "http_req_duration{name:hold}": ["p(95)<5000"],
        "http_req_duration{name:confirm}": ["p(95)<5000"],
        "http_req_duration{name:release}": ["p(95)<5000"],
    },
}

function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
    })
}

function pickSeats(n) {
    const ids = new Set()
    while (ids.size < n) ids.add(data.seatIds[Math.floor(Math.random() * data.seatIds.length)])
    return Array.from(ids)
}

function send(method, path, token, body, name, extraHeaders) {
    return http.request(method, BASE + path, JSON.stringify(body), {
        headers: Object.assign(
            { "content-type": "application/json", cookie: `authjs.session-token=${token}` },
            extraHeaders || {}
        ),
        tags: { name },
    })
}

export default function traffic() {
    const token = data.tokens[(__VU - 1) % data.tokens.length]
    const seatIds = pickSeats(1 + Math.floor(Math.random() * 4))

    const hold = send("POST", `/api/events/${data.eventId}/holds`, token, { seatIds }, "hold")

    if (hold.status === 200) {
        holdOk.add(1)
        if (Math.random() < CONFIRM_RATE) {
            const c = send("POST", "/api/bookings/confirm", token, { seatIds }, "confirm", {
                "idempotency-key": uuid(),
            })
            if (c.status === 200) confirmOk.add(1)
            else if (c.status === 409) confirmConflict.add(1)
            else unexpected.add(1)
        } else {
            const r = send("DELETE", `/api/events/${data.eventId}/holds`, token, { seatIds }, "release")
            if (r.status === 200) released.add(1)
            else unexpected.add(1)
        }
    } else if (hold.status === 409) {
        holdConflict.add(1)
    } else {
        unexpected.add(1)
    }

    sleep((0.1 + Math.random() * 0.3) * THINK)
}