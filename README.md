# Uptime Monitor

A self-hosted HTTP uptime monitor and incident alert system with automated health checks, a PostgreSQL time-series log, and a React dashboard.

---

## What It Does

A user registers an account and adds website or API URLs with a check interval (60s, 1h, or 24h). A background worker pings each active URL on schedule, measuring response time and HTTP status codes. When a service fails or times out, the system opens an incident and sends a single down alert. Subsequent failures log check results without repeating alerts. When the target responds with a 2xx status code again, the incident is closed and a recovery alert is dispatched.

---

## Status

**Done (tested locally):**
- [x] Automated HTTP probe with 10s `AbortController` timeout
- [x] User auth with bcrypt password hashing and JWT
- [x] User-scoped monitor CRUD (monitors isolated per user)
- [x] 15-second scheduler and BullMQ worker queue backed by Redis
- [x] State transition decision table inside a database transaction
- [x] Telegram bot notifications and console alert logging
- [x] React dashboard with recent checks table and SVG latency line
- [x] Multi-stage Dockerfile and Docker Compose orchestration

**Planned:**
- [ ] Multi-region probing locations
- [ ] Table partitioning and automated data retention policies
- [ ] Email (SMTP) and SMS alert channels
- [ ] SSL certificate expiration tracking

---

## Architecture

```mermaid
flowchart TD
    Client["React SPA (Vite + Tailwind)"] -->|HTTP / JWT| API["Express REST API"]
    API -->|Read / Write| DB[("PostgreSQL 16")]
    Scheduler["15s Scheduler Loop"] -->|Queue check| Redis[("Redis 7 (BullMQ)")]
    Redis -->|Process job| Worker["Probe Worker Process"]
    Worker -->|HTTP probe| Target["Target Website"]
    Worker -->|Record check & incident| DB
    Worker -->|Send alert| Telegram["Telegram Bot / Console"]
```

---

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, pg, BullMQ, ioredis, Zod, bcrypt, jsonwebtoken
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS
- **Databases:** PostgreSQL 16, Redis 7
- **Testing:** Vitest

---

## How It Works

Health checks follow a strict decision table evaluated inside a PostgreSQL transaction:

| Open incident? | This check | Action |
| :--- | :--- | :--- |
| **No** | **UP** | None |
| **No** | **DOWN** | INSERT incident (`ended_at = NULL`), send DOWN alert once |
| **Yes** | **DOWN** | None (outage already reported) |
| **Yes** | **UP** | UPDATE incident (`ended_at = NOW()`), send RECOVERY alert once |

**Health Rule:** Any HTTP 2xx status code (redirects followed) is **UP**. Any other status code (4xx, 5xx) or lack of response (timeout, connection refused, DNS error) is **DOWN**.

---

## Database

- `users`: Account credentials and notification settings (`id`, `name`, `email`, `password_hash`, `telegram_chat_id`, `created_at`).
- `monitors`: Monitored URLs (`id`, `user_id`, `name`, `url`, `interval_seconds`, `is_active`, `last_checked_at`, `created_at`).
- `check_results`: Individual probe telemetry (`id`, `monitor_id`, `is_up`, `status_code`, `response_ms`, `error`, `checked_at`).
- `incidents`: Outage periods (`id`, `monitor_id`, `started_at`, `ended_at`).
- **Composite Index:** `idx_check_results_monitor_time ON check_results(monitor_id, checked_at)` speeds up monitor history queries. On a test database seeded with 1,000,000 rows across 100 monitors, running `EXPLAIN (ANALYZE, BUFFERS)` on a 24-hour history query dropped execution time from **67.85 ms** (sequential scan across ~999,648 rows) to **5.62 ms** (bitmap index scan reading 351 matching rows).

---

## Run It Locally

### Docker Compose (Full Stack)

```bash
# 1. Start all services
docker compose up --build -d

# 2. Verify API health
curl http://localhost:3000/health
```

### Local Development

```bash
# 1. Start Postgres and Redis
docker compose up -d db redis

# 2. Start API server
cd backend && cp ../.env.example .env && npm install && npm run dev

# 3. Start background worker (separate terminal)
cd backend && npm run worker

# 4. Start frontend (separate terminal)
cd frontend && cp .env.example .env && npm install && npm run dev
# Open http://localhost:5173
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/health` | No | Database connection check |
| `POST` | `/auth/signup` | No | Register new user account |
| `POST` | `/auth/login` | No | Login and obtain JWT token |
| `GET` | `/me` | Yes | Get current user profile |
| `PATCH` | `/me` | Yes | Update `telegram_chat_id` |
| `GET` | `/monitors` | Yes | List all monitors for user |
| `POST` | `/monitors` | Yes | Create monitor |
| `GET` | `/monitors/:id` | Yes | Get monitor by ID |
| `PATCH` | `/monitors/:id` | Yes | Update monitor |
| `DELETE` | `/monitors/:id` | Yes | Delete monitor |
| `GET` | `/monitors/:id/checks` | Yes | List recent check results (`?limit=50`) |
| `GET` | `/monitors/:id/incidents` | Yes | List incident history |
| `GET` | `/monitors/:id/open-incident` | Yes | Get active outage if any |
| `GET` | `/monitors/:id/uptime` | Yes | Calculate uptime percentage (`?days=30`) |

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the Express API server |
| `DATABASE_URL` | `postgres://uptime:uptime_dev_pw@localhost:5432/uptime_monitor` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string for BullMQ |
| `JWT_SECRET` | `dev-jwt-secret-key-change-in-production` | Secret string for signing JWTs |
| `CHECK_TIMEOUT_MS` | `10000` | HTTP request timeout in milliseconds |
| `WORKER_CONCURRENCY` | `5` | Concurrent checks per worker process |
| `TELEGRAM_BOT_TOKEN` | *(empty)* | Optional Telegram Bot API token |
| `VITE_API_URL` | `http://localhost:3000` | Backend API URL for frontend |

---

## Known Limitations

- **Single Probe Region:** All checks run from the host machine running the worker.
- **Unpartitioned Telemetry:** `check_results` is a single table without partitioning.
- **Alert Channels:** Alerts support Telegram and console output; email (SMTP) and SMS are not implemented.
- **Protocol Support:** HTTP/HTTPS GET checks only; ICMP ping and SSL certificate monitoring are not supported.

---

## Author

- **Mohammed Taha Zubair** — [GitHub](https://github.com/Mohammed-Taha-Zubair) · [Email](mailto:tahazubairmohammed@gmail.com)
- **License:** MIT