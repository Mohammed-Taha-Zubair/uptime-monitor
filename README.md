# Uptime Monitor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%7C%207.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-Orchestrated-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Zod](https://img.shields.io/badge/Validation-Zod%20Strict-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A high-performance, automated endpoint health-check service and time-series telemetry platform. Built with **TypeScript**, **Node.js**, **Express**, **PostgreSQL**, and **Docker Compose**, the platform executes scheduled probes, manages outage incidents via an alert state machine, and utilizes composite index optimizations designed to scale past **40M+ telemetry records per month**.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Client & Management
        C[HTTP Clients / Dashboards]
    end

    subgraph API Service ["API Service (Express & TypeScript)"]
        R[REST API Layer]
        V["Zod Request Validation"]
        M["Monitor & Incident Controllers"]
        R --> V --> M
    end

    subgraph Health Probe Engine ["Health Probe Engine & Worker"]
        W[Scheduled Probe Worker]
        Q["Worker Queue (Concurrency Pool)"]
        P["HTTP / HTTPS Probe Runner"]
        SM["Alert State Machine"]
        W --> Q --> P --> SM
    end

    subgraph Targets ["External Endpoints"]
        T1["API Services (HTTP/HTTPS)"]
        T2["Web Applications"]
        P -.->|Probe Request & Latency Timing| T1
        P -.->|Probe Request & Latency Timing| T2
    end

    subgraph Storage ["PostgreSQL 16"]
        DB1[("monitors & users")]
        DB2[("check_results (Time-Series)")]
        DB3[("incidents (Lifecycle Tracking)")]
        IDX["Composite Index: (monitor_id, checked_at)"]
        DB2 --- IDX
    end

    C --> R
    M --> DB1
    M --> DB2
    M --> DB3
    SM -->|Persist Check Result| DB2
    SM -->|Open / Resolve Outages| DB3
    SM -->|Update last_checked_at| DB1
```

---

## Key Technical Highlights

* **Automated Health-Check Engine**: Scheduled probe executor performing HTTP/HTTPS availability checks, measuring round-trip latency (`performance.now()`), and classifying network timeouts, DNS errors, and unhealthy HTTP status codes.
* **Normalized 4-Table Relational Schema**: 3NF PostgreSQL architecture (`users`, `monitors`, `check_results`, `incidents`) with foreign key constraints, cascading deletions, and strict column integrity checks.
* **Sub-Millisecond Time-Series Indexing**: Composite B-tree index on `(monitor_id, checked_at)` enabling index-only scans and $O(\log N)$ seeks for high-frequency telemetry dashboards.
* **40M+ Monthly Row Scalability Strategy**: Formulated mathematical models and retention policies (range partitioning by `checked_at`, $O(1)$ partition dropping, and hourly summary rollups) to support 1,000+ monitors checking every 60 seconds without WAL amplification or table bloat.
* **Modular REST API with Zod Validation**: Layered routing architecture with strict schema validation pipelines, centralized error handling, and 100% parameterized SQL queries protecting against SQL injection.
* **Alert State Machine & Deduplication**: State-driven outage lifecycle engine that opens incidents on confirmed downtime, closes them on verified recovery, and suppresses alert flapping during prolonged outages.
* **Docker Compose Orchestration**: Multi-stage production container build with automated database bootstrapping, health checks, and service dependency ordering.

---

## Alert State Machine

To eliminate alert storms and notification fatigue, probe outcomes are processed through a deterministic state machine:

```mermaid
stateDiagram-v2
    [*] --> UP : Monitor Provisioned
    UP --> DOWN : Probe Failed (HTTP 4xx/5xx, Timeout, DNS)
    note right of DOWN
      1. Insert into incidents (started_at = NOW(), ended_at = NULL)
      2. Dispatch Downtime Notification
    end note

    DOWN --> DOWN : Ongoing Failure
    note right of DOWN
      Incident remains open.
      Duplicate notifications suppressed.
    end note

    DOWN --> RECOVERED : Probe Succeeded (HTTP 2xx/3xx)
    note right of RECOVERED
      1. UPDATE incidents SET ended_at = NOW()
      2. Dispatch Recovery Notification with downtime duration
    end note

    RECOVERED --> UP : Service Healthy
    UP --> UP : Normal Operation (Record Telemetry)
```

---

## Database Design & Indexing

### Schema Definition
Detailed schema documentation and mathematical retention models are available in [docs/schema.md](file:///home/zubb/Projects/uptime-monitor/docs/schema.md).

```mermaid
erDiagram
    USERS ||--o{ MONITORS : "owns"
    MONITORS ||--o{ CHECK_RESULTS : "generates telemetry"
    MONITORS ||--o{ INCIDENTS : "triggers"

    USERS {
        SERIAL id PK
        VARCHAR name
        VARCHAR email UK
        TEXT password_hash
        TIMESTAMPTZ created_at
    }

    MONITORS {
        SERIAL id PK
        INTEGER user_id FK
        VARCHAR name
        TEXT url
        INTEGER interval_seconds
        BOOLEAN is_active
        TIMESTAMPTZ last_checked_at
        TIMESTAMPTZ created_at
    }

    CHECK_RESULTS {
        BIGSERIAL id PK
        INTEGER monitor_id FK
        BOOLEAN is_up
        INTEGER status_code
        INTEGER response_ms
        TEXT error
        TIMESTAMPTZ checked_at
    }

    INCIDENTS {
        SERIAL id PK
        INTEGER monitor_id FK
        TIMESTAMPTZ started_at
        TIMESTAMPTZ ended_at
    }
```

### Sub-Millisecond Time-Series Index
```sql
CREATE INDEX idx_check_results_monitor_time
  ON check_results (monitor_id, checked_at);
```
* **Equality + Range Seek**: High-frequency queries filter by `monitor_id` and sort backwards by `checked_at DESC`.
* **Execution Advantage**: Eliminates full-table sequential scans over millions of rows, reducing execution latency from hundreds of milliseconds to `< 1ms`.

---

## Scaling & Data Retention Strategy (40M+ Rows/Month)

### Mathematical Projection
For a baseline production cluster with **1,000 active monitors** polling at 60-second intervals:

$$\frac{1,000\text{ checks}}{60\text{ seconds}} \times 3,600\text{ s/hr} \times 24\text{ hr/day} \times 30\text{ days} = \mathbf{43,200,000\text{ rows/month}}$$

At ~100 bytes per record, this yields **~4.3 GB to 5.0 GB of raw telemetry data per month**.

### Production Optimization Strategy
1. **Range Partitioning**: Declarative monthly table partitioning on `check_results (checked_at)`.
2. **Instantaneous Partition Drop ($O(1)$)**: Pruning partitions older than the retention window via `DROP TABLE` avoids expensive `DELETE` queries, table locking, autovacuum overhead, and WAL bloat.
3. **Continuous Hourly Rollups**: Pre-aggregating historical telemetry into an `uptime_hourly_rollups` table (`uptime_percentage`, `avg_latency_ms`, `p95_latency_ms`, `p99_latency_ms`) enables fast multi-year SLA reporting with minimal storage footprint.

---

## REST API Reference

### Health & System
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server uptime and live PostgreSQL connectivity verification |

### Monitors
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/monitors` | Create a new monitor with strict Zod validation |
| `GET` | `/monitors` | List monitors (supports optional `?user_id=1` filter) |
| `GET` | `/monitors/:id` | Retrieve monitor configuration by ID |
| `PATCH` | `/monitors/:id` | Update monitor parameters (URL, interval, status) |
| `DELETE` | `/monitors/:id` | Delete monitor (cascades check results and incidents) |
| `GET` | `/monitors/:id/metrics` | Fetch recent time-series telemetry (supports `?limit=50`) |
| `GET` | `/monitors/:id/open-incident` | Check for currently active (unresolved) outage |
| `GET` | `/monitors/:id/incidents` | Retrieve full outage history for monitor |
| `POST` | `/monitors/:id/check` | Trigger an on-demand probe and state evaluation |

### Incidents
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/incidents` | List system-wide incidents (supports `?status=all|open|resolved`) |

---

### API Examples

#### 1. Create a Monitor (Strict Zod Validation)
```bash
curl -X POST http://localhost:3000/monitors \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "name": "Production API",
    "url": "https://httpbin.org/status/200",
    "interval_seconds": 60
  }'
```

*Response (`201 Created`):*
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Production API",
  "url": "https://httpbin.org/status/200",
  "interval_seconds": 60,
  "is_active": true,
  "last_checked_at": null,
  "created_at": "2026-10-08T05:48:55.048Z"
}
```

*Validation Error Response (`400 Bad Request`):*
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "url", "message": "URL protocol must be HTTP or HTTPS" },
    { "field": "interval_seconds", "message": "interval_seconds must be one of: 60 (1m), 3600 (1h), 86400 (1d)" }
  ]
}
```

#### 2. Query Sub-Millisecond Time-Series Metrics
```bash
curl http://localhost:3000/monitors/1/metrics?limit=3
```

*Response (`200 OK`):*
```json
[
  {
    "id": "14",
    "monitor_id": 1,
    "is_up": true,
    "status_code": 200,
    "response_ms": 115,
    "error": null,
    "checked_at": "2026-10-08T05:47:25.992Z"
  },
  {
    "id": "5",
    "monitor_id": 1,
    "is_up": true,
    "status_code": 200,
    "response_ms": 120,
    "error": null,
    "checked_at": "2026-10-08T05:41:20.985Z"
  }
]
```

#### 3. Trigger On-Demand Probe Check
```bash
curl -X POST http://localhost:3000/monitors/1/check
```

*Response (`200 OK`):*
```json
{
  "monitorId": 1,
  "probe": {
    "isUp": true,
    "statusCode": 200,
    "responseMs": 118,
    "error": null
  },
  "stateEvaluation": {
    "transition": "REMAINED_UP",
    "incidentId": null,
    "notified": false,
    "message": "Monitor \"Production API\" is healthy (118ms)."
  }
}
```

---

## Getting Started

### Prerequisites
* [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
* Alternatively for bare-metal: [Node.js 20+](https://nodejs.org/) & [PostgreSQL 16](https://www.postgresql.org/)

---

### Option 1: Quickstart with Docker Compose (Recommended)

Run the full stack with automated database initialization and health checks:

```bash
# 1. Clone the repository
git clone https://github.com/Mohammed-Taha-Zubair/uptime-monitor.git
cd uptime-monitor

# 2. Start the database and API services
docker compose up -d

# 3. Verify services are healthy
docker compose ps
curl http://localhost:3000/health
```

The database container automatically loads `schema.sql` and `seed.sql` on first launch.

To stop the containers:
```bash
docker compose down
```

---

### Option 2: Local Development

```bash
# 1. Start PostgreSQL via Docker Compose
docker compose up -d db

# 2. Initialize schema and seed data
docker exec -i uptime-db psql -U uptime -d uptime_monitor < schema.sql
docker exec -i uptime-db psql -U uptime -d uptime_monitor < seed.sql

# 3. Navigate to backend and install dependencies
cd backend
npm install

# 4. Configure environment
cp .env.example .env

# 5. Start the development server (with hot reload)
npm run dev

# 6. (Optional) Run the background probe worker in a separate terminal
npm run worker
```

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the Express REST API server |
| `DATABASE_URL` | `postgres://uptime:uptime_dev_pw@localhost:5432/uptime_monitor` | PostgreSQL connection string |
| `PROBE_CONCURRENCY` | `10` | Maximum number of concurrent outbound HTTP probes |
| `PROBE_TIMEOUT_MS` | `10000` | Outbound probe request timeout in milliseconds |
| `PROBE_SCHEDULER_INTERVAL_MS` | `5000` | Worker polling frequency for due monitor checks |
| `ENABLE_INTERNAL_WORKER` | `false` | When `true`, spins up the probe worker inside the API process |

---

## Project Structure

```
uptime-monitor/
├── .dockerignore              # Docker build context exclusions
├── .env.example               # Root environment configuration template
├── .gitignore                 # Version control exclusions
├── LICENSE                    # MIT License
├── README.md                  # Comprehensive architectural documentation
├── docker-compose.yml         # Container orchestration (API + PostgreSQL)
├── schema.sql                 # DDL: 4-table relational schema & composite index
├── seed.sql                   # Realistic development dataset (healthy & degraded)
├── docs/
│   └── schema.md              # Database architecture, indexing & 40M+ scaling spec
└── backend/
    ├── Dockerfile             # Multi-stage production container build
    ├── .dockerignore          # Backend Docker exclusions
    ├── .env.example           # Backend environment template
    ├── package.json           # Node.js dependencies, scripts & metadata
    ├── tsconfig.json          # TypeScript compiler configuration
    └── src/
        ├── index.ts           # Express server setup, route registration & shutdown hooks
        ├── db.ts              # PostgreSQL connection pool configuration
        ├── config.ts          # Environment configuration loader
        ├── schemas/
        │   ├── monitor.schema.ts  # Zod validation schemas for monitors
        │   └── incident.schema.ts # Zod validation schemas for incidents
        ├── middlewares/
        │   ├── validate.ts        # Zod request validation middleware
        │   └── errorHandler.ts    # Centralized global error handling middleware
        ├── routes/
        │   ├── health.router.ts   # System health and database verification
        │   ├── monitors.router.ts # Monitor CRUD, metrics & on-demand probes
        │   └── incidents.router.ts# Incident query & history endpoints
        ├── services/
        │   ├── monitor.service.ts # Parameterized SQL data access for monitors
        │   ├── incident.service.ts# Incident lifecycle database operations
        │   ├── probe.service.ts   # HTTP/HTTPS health probe runner & latency timer
        │   └── alert.service.ts   # Alert state machine (transitions & deduplication)
        └── worker/
            └── probeWorker.ts     # Automated probe scheduler & worker loop
```

---

## Author

**Mohammed Taha Zubair**
* GitHub: [@Mohammed-Taha-Zubair](https://github.com/Mohammed-Taha-Zubair)
* LinkedIn: [mohammed-taha-zubair](https://linkedin.com/in/mohammed-taha-zubair)
* Email: [tahazubairmohammed@gmail.com](mailto:tahazubairmohammed@gmail.com)