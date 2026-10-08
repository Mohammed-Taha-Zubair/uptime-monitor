# Stage 3: Redis + BullMQ Scheduler and Worker

## 1. What was built, in plain English
In this stage, we built the background engine that automatically monitors websites 24/7 without blocking HTTP API requests.

Key features:
- **Redis Service:** Added Redis (`redis:7-alpine`) via Docker Compose to manage the background job queue.
- **BullMQ Queue & Job Deduplication:** Configured BullMQ to manage probe jobs. To prevent pileups if a website is slow, every job is assigned `jobId = "monitor-<id>"`. BullMQ ensures a job with the same ID cannot be queued twice if one is already waiting or active.
- **15-Second Scheduler Loop:** Every 15 seconds, the scheduler queries the database for active monitors that are due for a check (`last_checked_at IS NULL OR last_checked_at + interval <= NOW()`).
- **Independent Worker Process:** Ran via `npm run worker` with configurable concurrency. The worker pulls jobs from BullMQ, pings the target site using `checkUrl()`, records telemetry, and runs the decision table.
- **Outage Decision Table in a DB Transaction:**
  - If a site goes DOWN and had no open incident: creates an incident and sends **one** DOWN alert.
  - If a site stays DOWN: records the check, but does **not** spam duplicate alerts.
  - If a site recovers to UP and had an open incident: marks the incident resolved (`ended_at = NOW()`) and sends **one** RECOVERY alert.
- **Resilient Alerting:** Alerts are sent via Telegram Bot API (or console fallback). Dispatch happens *outside* the DB transaction so network issues contacting Telegram never roll back recorded checks or incident updates.

---

## 2. Walkthrough of the flow
Here is how the automated monitoring loop executes:

1. **`backend/src/worker/scheduler.ts` (`scheduleDueChecks`)**:
   - Executes SQL query:
     ```sql
     SELECT id FROM monitors
     WHERE is_active = TRUE
       AND (last_checked_at IS NULL OR last_checked_at + interval_seconds * interval '1 second' <= NOW())
     ```
   - For each due monitor, adds a BullMQ job to `monitorQueue` with `jobId: monitor-${monitor.id}`.

2. **`backend/src/worker/worker.ts`**:
   - Spawns BullMQ `Worker` listening on `monitor-checks`.
   - Concurrency is read from `WORKER_CONCURRENCY` (default 5).
   - When a job arrives, it invokes `executeCheck(monitorId)`.

3. **`backend/src/worker/executeCheck.ts` (`executeCheck`)**:
   - Queries monitor settings and owner's `telegram_chat_id`.
   - Pings website with `await checkUrl(monitor.url)`.
     *(Note: A down website is a normal probe result, not an unhandled error!).*
   - Begins a database transaction (`BEGIN`):
     - Inserts the probe outcome into `check_results`.
     - Queries `SELECT id FROM incidents WHERE monitor_id = $1 AND ended_at IS NULL FOR UPDATE`.
     - Evaluates the 4 decision-table states:
       - No open incident + down $\rightarrow$ `INSERT INTO incidents ...`
       - Open incident + up $\rightarrow$ `UPDATE incidents SET ended_at = NOW() ...`
     - Updates `monitors.last_checked_at = NOW()`.
     - `COMMIT` transaction (or `ROLLBACK` on unexpected DB failure).
   - Outside the transaction, calls `sendDownAlert()` or `sendRecoveredAlert()`.

4. **`backend/src/alerts/notifier.ts`**:
   - If `TELEGRAM_BOT_TOKEN` and user's `telegramChatId` are present, posts message to Telegram.
   - Otherwise, logs the alert to console.
   - Catches all delivery errors safely to prevent bubbling.

---

## 3. Three things that could break and how the code handles each

1. **A website is down or timing out:**
   - *Risk:* A developer might assume an HTTP 500 or timeout should throw an error and make BullMQ fail and retry the job.
   - *Fix:* In monitoring, a down website is a valid **result**, not a system crash. `checkUrl()` captures the downtime safely and returns `{ isUp: false }`. The worker records the outage, updates the decision table, and marks the job as successfully completed. Only genuine system errors (e.g. Postgres is down) cause BullMQ to retry with exponential backoff.

2. **A slow check causes duplicate jobs to queue up (Queue stampede):**
   - *Risk:* If a site takes 9 seconds to check and the scheduler runs every 15 seconds, multiple jobs for the same monitor could stack up in Redis.
   - *Fix:* We assign each job a deterministic `jobId: monitor-${monitor.id}`. BullMQ guarantees that if a job with this ID is currently waiting or running, attempting to add another job with the exact same ID is ignored until the current job finishes.

3. **Telegram API is temporarily offline or rate-limiting:**
   - *Risk:* If sending a Telegram message threw an unhandled exception inside the database transaction, the check and incident records would be rolled back, causing an infinite alert loop.
   - *Fix:* We commit the DB transaction *before* attempting notification delivery. Furthermore, `dispatchAlert` wraps network calls in a `try...catch` and only logs a warning if Telegram is unreachable.

---

## 4. Five "Explain Back" Questions for Practice

1. Why do we run the background worker as a separate process from the Express API server?
2. What does `jobId: monitor-${id}` do in BullMQ, and why is it important for our scheduler?
3. Why do we consider a down website a "successful" job rather than a failed job in BullMQ?
4. Why is `FOR UPDATE` used when checking for an open incident inside the database transaction?
5. Why must alerts be dispatched *outside* of the database transaction?

---

<details>
<summary><strong>Click to reveal model answers</strong></summary>

### Model Answers

1. **Separate Worker Process:**
   Decoupling the API from the worker ensures that intensive outbound HTTP network operations and long timeouts never block incoming user web requests. They can also scale independently (e.g., run 1 API container and 5 worker containers).

2. **Deduplication with jobId:**
   Setting `jobId = monitor-${id}` tells BullMQ to use that string as the unique key in Redis. If the same monitor is already waiting in the queue or being checked, BullMQ rejects adding a duplicate job. This prevents queue bloat and double-checks.

3. **Down Website as Normal Result:**
   The job of the worker is to measure status. Reporting that a target website is offline is the primary purpose of an uptime monitor, not an infrastructure bug in our application. Retrying via BullMQ would falsely treat the target website's outage as an internal worker defect.

4. **FOR UPDATE Lock:**
   `SELECT ... FOR UPDATE` locks the matching incident row at the database level for the duration of the transaction. This prevents race conditions if multiple worker threads happen to inspect the state of the same monitor simultaneously.

5. **Alerts Outside Transaction:**
   External network requests (like the Telegram API) are slow and unreliable. Holding a database transaction open while waiting for Telegram would keep database locks held unnecessarily long. Furthermore, if Telegram failed or timed out, we don't want our database changes to roll back.
</details>
