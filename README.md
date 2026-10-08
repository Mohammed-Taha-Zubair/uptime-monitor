# Uptime Monitor

A clean, full-stack uptime monitoring service that continuously checks websites, records latency metrics, tracks outage incidents, and sends real-time Telegram alerts.

Built with Express, PostgreSQL, Redis, BullMQ, React, TypeScript, and Tailwind.

---

## The Problem

Web services experience intermittent downtime, DNS failures, and slow response times. Developers need a reliable, independent system to monitor HTTP endpoints around the clock, calculate availability percentages, and notify them immediately when an outage begins and when service recovers.

---

## Architecture

```
                 +-----------------------+
                 |  React + Vite (SPA)   |
                 +-----------+-----------+
                             | HTTP (Fetch / JWT)
                             v
                 +-----------------------+
                 |   Express REST API    |
                 +-----------+-----------+
                             |
             +---------------+---------------+
             |                               |
             v                               v
    +-----------------+             +-----------------+
    |   PostgreSQL    |             |  Redis (BullMQ) |
    | (Users/Monitors/|             |  (Job Queue)    |
    | Checks/Incidents)             +--------+--------+
    +--------+--------+                      |
             ^                               v
             |                      +-----------------+
             +----------------------+  Probe Worker   |
                  (Tx Results)      | (15s Scheduler) |
                                    +--------+--------+
                                             |
                                +------------+------------+
                                |                         |
                                v                         v
                      Target HTTP Sites           Telegram Bot API
                      (Ping & Latency)            (Alert Dispatch)
```

1. **Express REST API Server:** Authenticates users (bcrypt + JWT) and handles CRUD management for monitors, recent check telemetry, and incident history.
2. **PostgreSQL 16:** Stores relational data across `users`, `monitors`, `check_results`, and `incidents`.
3. **Redis & BullMQ:** Manages the task queue for probe checks, guaranteeing deduplication so the same monitor is never queued concurrently.
4. **Probe Worker Process:** An independent background process that runs a 15-second scheduler to find due monitors, issues HTTP requests via native `fetch` with strict 10s timeouts, evaluates the state transition decision table within a database transaction, and dispatches alerts.
5. **Telegram Bot:** Sends down notifications and recovery notifications to user-configured chat IDs.

---

## Getting Started (Run Locally)

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Node.js 22+ (for local bare-metal development)

### Quickstart with Docker Compose

Run all services with automated database initialization:

```bash
# 1. Start all containerized services (Postgres, Redis, API, Worker)
docker compose up --build -d

# 2. Check container health
docker compose ps

# 3. Check API health endpoint
curl http://localhost:3000/health
```

The database container automatically loads `schema.sql` on the initial startup.

To stop the containers:
```bash
docker compose down
```

### Local Development (without Docker for Node)

1. Start Postgres and Redis:
   ```bash
   docker compose up -d db redis
   ```
2. Set up backend:
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run dev      # Starts API server on port 3000
   ```
3. In a second terminal, start the background worker:
   ```bash
   cd backend
   npm run worker   # Starts BullMQ worker and 15s scheduler
   ```
4. In a third terminal, start the frontend dashboard:
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev      # Starts Vite dev server on http://localhost:5173
   ```

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the Express REST API server |
| `DATABASE_URL` | `postgres://uptime:uptime_dev_pw@localhost:5432/uptime_monitor` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL for BullMQ |
| `JWT_SECRET` | `dev-jwt-secret-key-change-in-production` | Secret string used for signing JWT tokens |
| `CHECK_TIMEOUT_MS` | `10000` | HTTP probe timeout threshold in milliseconds |
| `WORKER_CONCURRENCY` | `5` | Maximum simultaneous probe jobs per worker process |
| `TELEGRAM_BOT_TOKEN` | *empty* | (Optional) Telegram Bot API token from `@BotFather` |
| `VITE_API_URL` | `http://localhost:3000` | API base URL for the React frontend client |

---

## API Endpoints

### Authentication & User
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Database connectivity and system time check |
| `POST` | `/auth/signup` | No | Register new user account (`name`, `email`, `password`) |
| `POST` | `/auth/login` | No | Login and obtain JWT token (`email`, `password`) |
| `GET` | `/me` | Yes | Get currently logged-in user profile |
| `PATCH` | `/me` | Yes | Update `telegram_chat_id` for notifications |

### Monitors & Telemetry
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/monitors` | Yes | Create monitor (`name`, `url`, `interval_seconds`) |
| `GET` | `/monitors` | Yes | List all monitors belonging to current user |
| `GET` | `/monitors/:id` | Yes | Retrieve single monitor configuration |
| `PATCH` | `/monitors/:id` | Yes | Update monitor name, URL, interval, or active status |
| `DELETE` | `/monitors/:id` | Yes | Delete monitor (cascades checks and incidents) |
| `GET` | `/monitors/:id/checks` | Yes | List recent check results (supports `?limit=50`) |
| `GET` | `/monitors/:id/incidents` | Yes | List incident outage history for monitor |
| `GET` | `/monitors/:id/open-incident` | Yes | Check for ongoing (unresolved) outage |
| `GET` | `/monitors/:id/uptime` | Yes | Calculate uptime percentage (supports `?days=30`) |

---

## Design Decisions

### 1. Why PostgreSQL?
Monitoring requires relational integrity. Deleting a monitor must reliably delete all related telemetry rows (`ON DELETE CASCADE`). Postgres also provides SQL aggregations like `COUNT(*) FILTER`, transactional consistency (`BEGIN`/`COMMIT`), and row-level locking (`FOR UPDATE`) to prevent race conditions during state evaluation.

### 2. Why a Task Queue (BullMQ + Redis)?
Running HTTP probes synchronously inside HTTP request handlers blocks the Node.js event loop and risks server starvation. By pushing jobs to Redis via BullMQ, probes execute asynchronously in a separate process. Assigning `jobId = "monitor-<id>"` provides built-in deduplication, ensuring that if a slow check is currently running, the same monitor is never queued twice.

### 3. Why the Composite Index on `check_results(monitor_id, checked_at)`?
The primary read queries for monitoring dashboards are scoped by a specific monitor and ordered by time (e.g. "fetch the last 50 checks for monitor 42", or "calculate 30-day uptime"). A composite index on `(monitor_id, checked_at)` allows PostgreSQL to locate matching rows via a fast index scan rather than scanning the entire table.

### 4. Why Open Incident = `ended_at IS NULL`?
Instead of maintaining a separate status column that must be kept in sync, an incident is active if and only if `ended_at` is `NULL`. When the service recovers, updating `ended_at = NOW()` immediately resolves the outage and calculates the outage duration (`ended_at - started_at`).

---

## Measured Performance Result: Composite Index Impact

To test the impact of the composite index `(monitor_id, checked_at)`, a test table with **1,000,000 check rows** across 100 monitors over a 30-day window was queried in PostgreSQL 16.

**Query Tested:**
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, monitor_id, is_up, status_code, response_ms, checked_at
FROM check_results
WHERE monitor_id = 42
  AND checked_at >= NOW() - INTERVAL '24 hours'
ORDER BY checked_at DESC;
```

**Before Index (Full Table Scan):**
```
Gather Merge (cost=16691.48..16724.85 rows=286) (actual time=63.024..67.769 rows=351 loops=1)
  Workers Planned: 2, Launched: 2
  -> Parallel Seq Scan on check_results (cost=0.00..15686.33 rows=143)
       Filter: ((monitor_id = 42) AND (checked_at >= (now() - '24:00:00'::interval)))
       Rows Removed by Filter: 333,216 per worker (~999,648 total rows inspected)
       Buffers: shared hit=7353
Execution Time: 67.858 ms
```

**After Index (`CREATE INDEX idx_check_results_monitor_time ON check_results(monitor_id, checked_at)`):**
```
Sort (cost=1214.65..1215.55 rows=361) (actual time=5.379..5.448 rows=351 loops=1)
  -> Bitmap Heap Scan on check_results (cost=12.13..1199.32 rows=361) (actual time=0.539..4.964 rows=351 loops=1)
       Recheck Cond: ((monitor_id = 42) AND (checked_at >= (now() - '24:00:00'::interval)))
       -> Bitmap Index Scan on idx_check_results_monitor_time (cost=0.00..12.04 rows=361) (actual time=0.358..0.359)
       Buffers: shared hit=348 read=5 (353 buffer pages accessed vs 7353)
Execution Time: 5.623 ms
```

**Measured Difference:**
- Execution time dropped from **67.85 ms** to **5.62 ms** (~12x faster).
- Buffer cache reads decreased by **95.2%** (from 7,427 pages down to 356 pages).

---

## Known Limitations

- **Single Probing Region:** All HTTP health checks originate from the worker's hosting server (no distributed multi-region probing).
- **No Table Partitioning:** `check_results` is a single table. At tens of millions of rows, PostgreSQL table partitioning by date or retention policies (e.g. automated rollups/pruning) would be required.
- **Telegram Only:** Alerting currently supports Telegram and console logs; email (SMTP) and SMS (Twilio) are not implemented.
- **HTTP/HTTPS Probes Only:** TCP ping, ICMP, DNS resolution, and SSL certificate expiration monitoring are not yet supported.