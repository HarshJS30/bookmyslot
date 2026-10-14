import http from "k6/http"
import { SharedArray } from "k6/data"
const data = new SharedArray("d", () => [JSON.parse(open("/loadtest/data.json"))])[0]
export const options = { vus: 1000, duration: "30s" }
export default function baseline() {
    const t = data.tokens[__VU - 1]
    http.get(`${__ENV.BASE_URL}${__ENV.URLPATH}`, { headers: { cookie: `authjs.session-token=${t}` } })
}