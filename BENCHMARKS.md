# Benchmarks

This file records what I measured, how, and what I concluded. All numbers come from one laptop with the load generator on the same machine, so read them as laptop numbers, not production capacity.

## 1. Environment

| Item | Value |
| --- | --- |
| CPU | Intel Core i5-8250U 1.60 GHz (4 cores, 8 logical processors) |
| RAM | 8 GB (7.9 GB usable), power mode not recorded |
| OS | Windows 11 Home |
| Docker | Docker Desktop on WSL2, VM with 8 CPUs and 3.77 GB RAM |
| Stack | Postgres, Redis, realtime server, 4 Next.js app containers, nginx (all in Docker Compose) |
| Load tool | k6 in Docker, **on the same machine** |
| Idle memory | about 390 MiB across the 8 stack containers (postgres, redis, realtime, nginx, 4 app copies), excluding k6 |

Because k6 runs with up to 1,000 virtual users on the same cores as the app, it takes a large share of the CPU (60 to 120% CPU and about 1.4 GB RAM during the fight). That competes with the app and is the main reason the same test varies from run to run. The first run after a restart is a warm-up and is not counted.

## 2. Correctness results

In the reported runs, no double bookings and no unexpected responses were observed. Across 1,000 concurrent users and 20 rounds, in each run:

- exactly one user won each round
- 19,980 requests were rejected with 409
- 0 unexpected responses

The per-round winner count is the real evidence. The 409s alone prove nothing, since losing requests are expected to get 409. `test-p0`, `test-break` and `test-confirm` also passed against the Docker stack. This covers the runs reported here, not every possible interleaving.

## 3. Throughput results

### 3.1 One-seat fight (stress test)

1,000 users, 20 rounds, 20,000 requests, no think time, all users hit the same seat at once.

| Metric | Range across runs |
| --- | --- |
| Throughput | 112 to 182 req/s |
| Average latency | 4 to 8 s |
| p95 latency | about 10 to 18 s |

Three runs of this same test gave 112, 153 and 180 req/s. I report the range, not the best run. Latency is mostly queueing: 1,000 virtual users with no pause against four Node processes on a shared laptop.

### 3.2 Paced mixed traffic

1,000 users, 40 s think time, hold then confirm or release, 15 s ramp up, 60 s plateau, 10 s ramp down.

| Run | Requests | Unexpected | Overall median | Overall p95 | Overall p99 | Hold-endpoint p95 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 12,790 | 0 | 83.5 ms | 2.65 s | 5.13 s | 3.08 s | all thresholds passed |
| 2 | 12,523 | 7 (0.05%) | 214 ms | 3.64 s | 13.8 s | 8.35 s | hold p95 crossed the 5 s threshold |

"Overall" covers all requests (hold, confirm, release). The hold-endpoint column is that one route only. The 7 unexpected outcomes in run 2 were not classified because that script did not log status codes, so I cannot say whether they were timeouts or HTTP errors.

### 3.3 Scaling curve (mixed traffic, 200 users)

| App copies | Throughput |
| --- | --- |
| 1 | about 130 req/s |
| 2 | about 200 to 220 req/s |
| 3 | about 236 to 256 req/s |
| 4 | about 250 req/s |

Median latency dropped as copies were added, but p95 stayed around 2 to 3 s. On this laptop, throughput flattens after the third copy, most likely because the machine runs out of cores. This shows replicas stop helping here, not that the architecture cannot scale.

### 3.4 Baseline: a route that does almost nothing

| Route | Result |
| --- | --- |
| `/api/health` (no auth, no database), 4 copies, 200 users | 213 req/s in the first run, 436 req/s in the second |
| `/api/whoami` (auth only) | 208 req/s peak |

The two `/api/health` runs differ by 2x on identical settings, which shows how noisy a shared laptop is. Treat the 208 req/s figure as a rough observation, not a stable limit.

## 4. Where the bottleneck is

### Evidence 1: `docker stats` during the fight

| Container | CPU |
| --- | --- |
| 4 app containers | about 100 to 175% each |
| Postgres | about 17 to 24% |
| Redis | near idle |
| nginx | near idle |

The limit is Node CPU in the app containers. It is not the database, the lock or the proxy.

### Evidence 2: the baseline

A route that only authenticates and responds topped out at 208 req/s, close to the hold route (112 to 182 req/s). So the hold logic itself adds very little. Caveat: I have not isolated `auth()` perfectly, so the accurate claim is that a route that only authenticates and responds hits the same ceiling.

### Conclusion

The evidence points to CPU saturation in the Node.js application request path in this environment. Plausible contributors, which I have not isolated individually, are:

1. Next.js request handling.
2. `auth()`, which does a database session lookup through Prisma on every request (database sessions with the Prisma adapter).
3. Prisma's JavaScript query engine, which plans queries inside Node and burns Node CPU even when Postgres is idle.

The data suggests it is not the Redis lock, the hold transaction, Postgres, nginx, the event query or the connection pool size. On top of that, k6 at 1,000 virtual users on the same laptop caps what any code change can show.

## 5. Experiments that did not help

| Experiment | Result | Outcome |
| --- | --- | --- |
| Cache the event start time in the hold route | 182 req/s vs a 112 to 180 baseline, no measurable change | Reverted (also risked showing a stale start time) |
| In-memory session cache (token to user, 30 s) | First run failed. Cold bursts of 1,000 uncached requests overwhelmed the 5-connection pool, causing 401s and 500s. A later run had 2.1% failures and a p95 of 38 s | Reverted |
| Prisma pool size 5 to 15 per container | 157 req/s, same as before, 0 failures | Reverted |

Lesson: I changed the session cache and the pool size in the same run once, which tangled the results. After that I tested one change at a time.

## 6. Known cost and next steps

None of these are done or tested.

1. **JWT sessions.** Removes the per-request database lookup. A reasonable next experiment, but the gain is not measured and authentication may be only part of the cost. The test scripts and the k6 seed create database session rows, so they would need to mint tokens instead, and sign-out and revocation behavior changes.
2. **Redis session cache.** Cheaper than Prisma and shared across containers, with bounded staleness, but still one Redis call per request.
3. **Less Prisma on hot paths.** Raw SQL (as the DELETE route already does). Gain is uncertain.
4. **More CPU.** A server with dedicated cores and k6 on a separate machine would likely do much better. Adding more app copies on this laptop will not help.
5. **Better test setup.** Run k6 from another machine, add think time to model real users, and compare JWT versus database sessions one change at a time.

## 7. Reproduce

```bash
docker compose up --build
npx prisma migrate deploy
# seed (example)
USERS=1000 SEATS=5000 npx tsx scripts/load-seed.ts
# then run the k6 scripts in loadtest/ (one-seat-fight.js, seat-traffic.js) against http://nginx
```

On Windows, run the k6 Docker command from PowerShell. Reseed before each one-seat run.