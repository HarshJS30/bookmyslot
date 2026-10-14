// Does nothing on purpose: no auth, no database, no Redis.
// Its throughput shows the ceiling of Next.js + Docker + this machine.
export const dynamic = "force-dynamic"

export function GET() {
    return Response.json({ ok: true })
}