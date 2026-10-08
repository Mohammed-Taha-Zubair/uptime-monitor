# Stage 5: Docker, CI, and Documentation

## 1. What was built, in plain English
In this final stage, we containerized the entire system, set up automated continuous integration (CI), documented real deployment procedures, and measured real database performance.

Key features:
- **Multi-Stage Dockerfile:** Built a clean 2-stage `backend/Dockerfile`. The build stage compiles TypeScript using Node 22; the production runner image contains only production dependencies and compiled JavaScript, keeping images lightweight and fast.
- **Docker Compose for the Entire Stack:** Defined `docker-compose.yml` orchestrating `db` (Postgres 16), `redis` (Redis 7), `api` (Express REST server), and `worker` (BullMQ probe engine). Added auto-initialization so `schema.sql` is automatically mounted into `/docker-entrypoint-initdb.d/` and runs on a fresh clone.
- **GitHub Actions CI Pipeline (`.github/workflows/ci.yml`):** Automatically spins up Postgres 16 and Redis 7 service containers on GitHub, runs TypeScript typechecks, executes the full Vitest suite, builds the frontend, and runs a Docker build test.
- **DEPLOY.md:** Clear, honest, step-by-step instructions for deploying to cloud providers (Railway and Render) with managed databases and worker processes.
- **README.md with Real Benchmarks:** Clear architecture diagrams, endpoint documentation, and real `EXPLAIN (ANALYZE)` benchmarks measured against 1,000,000 check results demonstrating the 12x performance improvement of the composite index.

---

## 2. Walkthrough of the flow
Here is how shipping and deployment work across the stack:

1. **`backend/Dockerfile`**:
   - `FROM node:22-alpine AS builder`: Installs devDependencies, runs `npm run build` with `tsc`.
   - `FROM node:22-alpine AS runner`: Copies only `./dist` and runs `npm ci --omit=dev`.
   - The same container image is reused for both `uptime-api` (running `dist/index.js`) and `uptime-worker` (running `dist/worker/worker.js`).

2. **`docker-compose.yml`**:
   - `db`: Maps port `5432:5432`, mounts `./schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro`.
   - `redis`: Maps port `6379:6379`.
   - `api`: Builds backend image and connects to `db` and `redis`.
   - `worker`: Builds backend image, overrides command with `node dist/worker/worker.js`.

3. **`.github/workflows/ci.yml`**:
   - Runs on every push or PR to `main`.
   - Spins up PostgreSQL and Redis service containers with automated health checks.
   - Runs:
     1. Database schema initialization (`psql -f schema.sql`)
     2. Backend typecheck (`npm run typecheck`)
     3. Backend test suite (`npm test`)
     4. Frontend build (`npm run build`)
     5. Docker build test (`docker build backend/`)

4. **Performance Measurement**:
   - Tested in Postgres with 1,000,000 rows.
   - Verified that `CREATE INDEX idx_check_results_monitor_time ON check_results(monitor_id, checked_at)` converts a sequential table scan into an index scan, speeding up queries from 67.85 ms to 5.62 ms.

---

## 3. Three things that could break and how the code handles each

1. **Docker Compose running on a fresh machine without pre-loaded tables:**
   - *Risk:* If a developer clones the repo and runs `docker compose up`, the API and worker crash if tables don't exist yet.
   - *Fix:* We mount `./schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro` into the Postgres container. Official PostgreSQL Docker images automatically execute any `.sql` file in this directory when the database directory is initialized for the first time.

2. **Secrets accidentally committed to GitHub:**
   - *Risk:* Hardcoding database passwords or JWT secrets in source code or Git history leads to security compromise.
   - *Fix:* All `.env` files are added to `.gitignore`. Configuration reads from environment variables, and `docker-compose.yml` uses `${VARIABLE:-fallback}` syntax with sensible defaults for local development only.

3. **Broken TypeScript types breaking production deployments:**
   - *Risk:* A developer modifies a route and tests locally with `tsx` (which skips type checking), but production Docker or CI builds fail.
   - *Fix:* We added `npm run typecheck` (`tsc --noEmit`) to `backend/package.json` and wired it directly into `.github/workflows/ci.yml`, ensuring type errors block merging before code reaches production.

---

## 4. Five "Explain Back" Questions for Practice

1. Why do we use a multi-stage Dockerfile instead of a single-stage Dockerfile?
2. How does mounting `schema.sql` into `/docker-entrypoint-initdb.d/` work in Docker Compose?
3. Why did we reuse the same Docker image for both the `api` and `worker` services in `docker-compose.yml`?
4. What does `EXPLAIN (ANALYZE, BUFFERS)` tell you about a PostgreSQL query that standard `EXPLAIN` does not?
5. Why are service containers used in GitHub Actions CI workflows instead of mocking Postgres and Redis?

---

<details>
<summary><strong>Click to reveal model answers</strong></summary>

### Model Answers

1. **Multi-Stage Dockerfile:**
   Multi-stage builds separate the build environment (compilers, devDependencies, TypeScript toolchains) from the runtime environment. The final image only contains the compiled JavaScript files and production dependencies, resulting in smaller image sizes, faster download times, and a reduced attack surface.

2. **/docker-entrypoint-initdb.d/ Mechanism:**
   The official PostgreSQL Docker entrypoint script is programmed to scan `/docker-entrypoint-initdb.d/` when the data directory is empty. Any `.sql` or `.sh` files found there are automatically executed against the database in alphabetical order during container initialization.

3. **Single Image for API and Worker:**
   Both the API server (`src/index.ts`) and the probe worker (`src/worker/worker.ts`) share the same codebase, dependencies, database models, and types. Compiling both into `dist/` allows us to build Docker layers once and simply supply different execution commands (`node dist/index.js` vs `node dist/worker/worker.js`).

4. **EXPLAIN (ANALYZE, BUFFERS):**
   Standard `EXPLAIN` only shows the query planner's *estimates* (hypothetical cost and row count). Adding `ANALYZE` actually runs the query and measures exact execution time in milliseconds and real rows returned. Adding `BUFFERS` shows real I/O metrics—specifically how many 8KB memory buffer pages were read from cache (`shared hit`) or disk (`read`).

5. **Real Service Containers in CI:**
   Mocking databases in tests can hide subtle syntax errors, dialect differences, and indexing mistakes. Running actual PostgreSQL and Redis containers in CI tests the real application against real database engines, providing complete confidence that code will work in production.
</details>
