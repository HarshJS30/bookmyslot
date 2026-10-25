# bookmyslot

A BookMyShow-style seat booking system built to answer one question: **what happens when 1,000 people try to grab the same seat at the same time?**

Live demo: https://bookmyslot.helloharsh.me

[![CI](https://github.com/HarshJS30/bookmyslot/actions/workflows/ci.yml/badge.svg)](https://github.com/HarshJS30/bookmyslot/actions/workflows/ci.yml)

Demo video: https://youtu.be/SpmFF-cpmIQ

[![Watch the demo](https://img.youtube.com/vi/SpmFF-cpmIQ/maxresdefault.jpg)](https://youtu.be/SpmFF-cpmIQ)

Benchmarks, methods and the experiments that failed: [BENCHMARKS.md](BENCHMARKS.md)

**Result: 1,000 users fight for one seat, 20 rounds, exactly one winner every round, 0 double bookings. On one laptop with k6 sharing the CPU: 112 to 182 req/s.**

## Result in one paragraph

Across 20 rounds of a 1,000-user, single-seat contention test, exactly one user won each round: 19,980 requests received HTTP 409, with no double bookings and no unexpected responses in the reported runs. On my laptop, with k6 competing for the same CPU as the four app containers and supporting services, throughput ranged from 112 to 182 req/s in this worst-case test. The measurements point to CPU saturation in the Node.js request path, not obvious saturation of PostgreSQL, Redis or nginx. These are single-machine stress-test results, not dedicated-server capacity estimates. The evidence, including three optimizations that did not help, is in [BENCHMARKS.md](BENCHMARKS.md).

## What it does

- Browse events and seats without logging in. Login (GitHub OAuth) is only needed when you hold seats.
- Hold up to 10 seats in one all-or-nothing request, with a countdown on the payment page.
- Confirm a booking (simulated payment) with an idempotency key, so a retried request returns the same booking instead of creating a second one.
- Cancel a booking and release its seats.
- Live seat updates for everyone watching the same event (Socket.io).
- Organizer routes to create events, ticket categories and seats, with ownership checks.

## Architecture

![architecture](docs/architecture.png)

| Part | Tech | Job |
| --- | --- | --- |
| App | Next.js, Auth.js v5, Prisma 6 | Routes, auth, booking logic |
| Database | PostgreSQL (Neon in production) | Source of truth for holds and bookings |
| Lock layer | Redis (Upstash in production) | Fast first-line lock per seat (`SET NX EX`) |
| Realtime server | Socket.io on Node, separate service on Render | Per-event rooms, listens on a Redis Pub/Sub channel |
| Local stack | Docker Compose: Postgres, Redis, realtime, 4 app copies behind nginx | Load testing against my own code instead of free-tier limits |

## How double booking is prevented

Two layers, and the database is the one that decides.

1. **Redis lock (fast rejection).** `SET seat-lock NX EX` lets only one request in. Everyone else gets 409 immediately without touching Postgres.
2. **Conditional database update (the real guarantee).** Holds and confirms are `updateMany` calls with the status and holder in the `WHERE` clause, and the code checks the affected row count. If the count is wrong, the whole transaction throws and rolls back. Even if a Redis lock were wrong (my tests forge one), two users still cannot both own a seat. What happens when Redis is fully down is not tested yet, see the known limitations.

Other decisions worth knowing:

- **Holds live in the database** (`heldByUserId`, `holdExpiresAt` on `Seat`), not only in Redis, so an expired hold can be re-reserved even with the cron turned off.
- **Expiry sweep is one atomic `UPDATE ... RETURNING`.** It can only touch `HELD` seats whose hold has expired, and it broadcasts only the ids it actually changed.
- **Batch holds are all-or-nothing.** If any seat is taken, every lock acquired in that request is released and nothing is held.
- **Confirm is idempotent.** `Booking` has a unique `(userId, key)`, and the client sends an `Idempotency-Key` header.
- **Realtime never blocks bookings.** Publishing to Redis happens after the database write succeeds, in its own try/catch.
- **Input is validated with zod** on holds and confirm, and the event-start check blocks holding, confirming or cancelling after the event has started.
- **Overload returns 503 with `Retry-After`** instead of a generic 500 when Prisma cannot start a transaction in time.

## Proof it works

The tests are written to try to break the system, not just to pass.

- I wrote the booking route wrong on purpose (check and update as two separate steps). 50 simultaneous requests then produced **50 winners and 0 conflicts**, a real double booking. After restoring the fix: **1 winner, 49 conflicts**.
- `scripts/test-p0.ts`: ownership (user B cannot confirm user A's held seat, even with a forged Redis lock), expiry without cron, all-or-nothing batch holds (both when Redis catches the conflict and when only the database refuses), release only your own seats, and an expired hold cannot be confirmed.
- `scripts/test-break.ts`: abuse and edge-case scenarios, including the event-start checks.
- `scripts/test-confirm.ts`: idempotency. Ten simultaneous confirms with the same key all return the same single booking (one booking row, one payment). Reusing a key with different seats is rejected with 422, including when both requests arrive at the same instant. Seat conflicts and bad requests are covered, and every scenario checks the database, not only the HTTP answers.
- k6 one-seat fight and paced mixed-traffic tests, described below.

## Load testing

> **Benchmark context, read before comparing these numbers.** Everything below ran on one Windows 11 laptop (Intel Core i5-8250U, 4 cores / 8 logical processors). The app (4 containers behind nginx), PostgreSQL, Redis, nginx and the k6 load generator all shared that machine, so k6 competed with the whole stack for CPU. These are constrained single-machine stress-test results, not estimates of production capacity. Running k6 on a separate machine is a planned next step.

**Machine:** Intel Core i5-8250U 1.60 GHz (4 cores, 8 logical), 8 GB RAM (7.9 GB usable), Windows 11 Home, Docker Desktop on WSL2 (8 CPUs, 3.77 GB for the VM).
**Setup:** 4 app containers behind nginx, one shared Postgres and one shared Redis, all on this one laptop. **k6 runs on the same machine**, so it competes with the app for the same cores. Numbers on a dedicated server with k6 on another machine would be better. These are laptop numbers and I report them as a range, not my best run.

### 1. One-seat fight (worst case)

1,000 users, 20 rounds, 20,000 requests, no think time, everyone hits the same seat at once.

| Metric | Result |
| --- | --- |
| Rounds with exactly one winner | 20 of 20, every run |
| Rejected with 409 | 19,980 |
| Unexpected responses | 0 |
| Throughput | 112 to 182 req/s across runs |
| Average latency | 4 to 8 s |
| p95 latency | about 10 to 18 s |

Latency here is mostly queueing: 1,000 virtual users with no pause hammering 4 Node processes. With no think time, average latency is roughly 1,000 divided by req/s (161 req/s works out to about 6 s, and the measured average in that run was 5.7 s), so it tells you nothing beyond throughput. It is a stress test, not a model of real users.

### 2. Paced mixed traffic (closer to real use)

1,000 users, 40 s of think time between actions, hold then confirm or release, 60 s plateau.

| Run | Requests | Unexpected | Overall median | Overall p95 | Hold-endpoint p95 | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 12,790 | 0 | 83.5 ms | 2.65 s | 3.08 s | all thresholds passed |
| 2 | 12,523 | 7 (0.05%) | 214 ms | 3.64 s | 8.35 s | hold p95 crossed my 5 s threshold |

"Overall" covers all requests (hold, confirm, release). The hold-endpoint column is that one route only. The 7 unexpected outcomes in run 2 were not classified because that script did not log status codes, so I cannot say whether they were timeouts or HTTP errors.

Run 2 is included on purpose. The run-to-run spread is most likely caused by the shared laptop, though I have not proven that.

### 3. Scaling curve (mixed traffic, 200 users)

| App copies | Throughput |
| --- | --- |
| 1 | about 130 req/s |
| 2 | about 200 to 220 req/s |
| 3 | about 236 to 256 req/s |
| 4 | about 250 req/s |

On this laptop, throughput stops improving after the third copy, most likely because the machine runs out of cores. This shows that more replicas stop helping here, not that the design cannot scale.

![results](docs/results.png)

## Where the bottleneck is (measured, not guessed)

1. `docker stats` during the fight: the four app containers each ran at about 100 to 175% CPU, while Postgres (about 17 to 24%), Redis and nginx sat nearly idle.
2. Baseline: `/api/whoami`, a temporary route that only authenticated and responded (removed after measuring, so this one cannot be reproduced from the repo), topped out at 208 req/s. The hold route reached 112 to 182 req/s, so the hold logic itself adds very little.

Conclusion: the evidence points to CPU saturation in the Node.js request path in this test environment. Database-backed authentication (a session lookup through Prisma on every request) and Prisma's JavaScript-side query work are plausible contributors, but I have not isolated their individual costs. The same data suggests the Redis lock, the hold transaction, Postgres, nginx and the pool size were not the limit.

### Things I tried that did not help (and reverted)

| Experiment | Result |
| --- | --- |
| Cache the event start time in the hold route | 182 req/s vs a 112 to 180 baseline, no measurable change |
| Prisma pool size 5 to 15 per container | 157 req/s, same as before |
| In-memory session cache (30 s) | Made it worse: cold bursts overwhelmed the 5-connection pool, causing 401s, 500s and a p95 of 38 s |

## Known limitations and next steps

- **JWT sessions** would remove the per-request database lookup, but the gain is unknown. `/api/whoami` (login check only) got 208 req/s while `/api/health` (no work) swung between 213 and 436 on identical settings, too noisy to tell. Not done, not tested. It changes sign-out and revocation behavior, so it needs care.
- A Redis session cache is a cheaper middle option than a database lookup, but it is still one Redis call per request.
- The load tests use a fresh idempotency key per confirm, so simultaneous retries are covered by `test-confirm.ts` and not by the load tests.
- An expired database hold can stay blocked by a live Redis lock until the lock's TTL runs out. This only delays a booking and never causes a double booking.
- Payment is simulated. A real provider would need a pending payment state, webhook confirmation, and seats kept held until the provider confirms, so a declined payment never turns into a confirmed booking.
- The tests run in CI now, but the k6 load tests don’t.
- No rate limiting and no cap on how many seats one user can hold in total.
- The organizer routes (events, ticket categories, seats) do not use zod validation the way holds and confirm do.
- If Redis is unreachable, I expect holds to fail with an error instead of double booking. I have not tested that, and there is no database-only fallback.
- Benchmarks should be rerun with k6 on a separate machine to remove the self-competition.

## Run it locally

The tests create and delete data, so run them only against the local stack. A `.env` file may point at a real database, so set the three variables in step 2 in the same terminal before running anything else.

```powershell
# 1. start the stack (postgres, redis, realtime, 4 app copies behind nginx)
docker compose up -d --build --scale app=4

# 2. point this terminal at the LOCAL stack
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/mydatabase"
$env:REDIS_URL="redis://localhost:6379"
$env:BASE_URL="http://localhost:8080"

# 3. apply migrations to the local Postgres
npx prisma migrate deploy

# 4. seed the homepage events, ticket tiers and available seats
npm run seed:homepage

# 5. run the tests through nginx
npx tsx scripts/test-p0.ts
npx tsx scripts/test-break.ts

# 6. test-confirm needs a fresh seed first
$env:USERS="200"; $env:SEATS="5000"
npx tsx scripts/load-seed.ts
npx tsx scripts/test-confirm.ts
```

`npm run seed:homepage` creates or refreshes the nine event listings shown on the homepage, including venues, ticket prices and available seats. Check that `DATABASE_URL` points to the intended database before running it.

Load tests live in `loadtest/` (`one-seat-fight.js`, `seat-traffic.js`). Seed with `scripts/load-seed.ts` first (for example `USERS=1000 SEATS=5000`). On Windows, run the k6 Docker command from PowerShell.

## Tech

Next.js, TypeScript, Prisma, PostgreSQL, Redis, Socket.io, Auth.js, Docker, nginx, k6, zod.