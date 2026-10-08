# Stage 2: Auth + Monitors API

## 1. What was built, in plain English
In this stage, we added user accounts, authentication security, and full monitor management APIs.

Key features:
- **JWT + bcrypt Authentication:** Users can register (`/auth/signup`) and log in (`/auth/login`). Passwords are never stored as plain text—they are hashed using bcrypt with 10 salt rounds. Successful login issues a signed JSON Web Token (JWT).
- **Strict User Isolation (Multi-Tenancy):** Every monitor in the database belongs to a specific user (`user_id`). A logged-in user can only view, edit, or delete their own monitors. If User A tries to query or tamper with User B's monitor, the API immediately responds with `404 Not Found` (pretending the resource doesn't even exist, preventing user enumeration).
- **Zod Input Validation:** Every incoming parameter, query string, and JSON body is validated before touching the database. If a user provides an invalid interval (e.g., 45 seconds instead of 60, 3600, or 86400), the API rejects it with `400 Bad Request`.
- **SQL-Driven Telemetry:** Uptime percentage is calculated directly inside PostgreSQL using `COUNT(*) FILTER (WHERE is_up = true)`. This avoids pulling thousands of rows into Node.js memory just to compute an average.
- **Telegram Notification Preference:** Added `users.telegram_chat_id` to `schema.sql` and `PATCH /me` so users can link their Telegram chat ID for alert notifications.

---

## 2. Walkthrough of the flow
Here is how an incoming request flows through our backend:

1. **`backend/src/middleware/auth.ts` (`authMiddleware`)**:
   - Reads the `Authorization` header and extracts the Bearer token.
   - Verifies the signature using `jwt.verify(token, JWT_SECRET)`.
   - Attaches `req.user = { id: payload.id, email: payload.email }` to the request object.
   - If missing or invalid, immediately stops the request and returns `401 Unauthorized`.

2. **`backend/src/routes/auth.ts`**:
   - `POST /auth/signup`: Validates body using Zod (`signupSchema`), checks for duplicate email, hashes the password with `bcrypt.hash(password, 10)`, inserts the user, signs a JWT, and returns `201 Created`.
   - `POST /auth/login`: Validates email and password, queries the user, compares passwords with `bcrypt.compare`, signs a JWT, and returns `200 OK`.

3. **`backend/src/routes/users.ts`**:
   - `GET /me`: Returns the current user's profile information.
   - `PATCH /me`: Validates and updates `telegram_chat_id` for alerts.

4. **`backend/src/routes/monitors.ts`**:
   - `POST /monitors`: Validates URL and intervals (`60`, `3600`, `86400`), inserts the monitor tied to `req.user.id`, and returns `201 Created`.
   - `GET /monitors`: Fetches only monitors where `user_id = req.user.id`.
   - `GET /monitors/:id`, `PATCH /monitors/:id`, `DELETE /monitors/:id`: Validates the ID parameter, ensures the monitor belongs to `req.user.id`, and performs the requested operation.

5. **`backend/src/routes/monitorStats.ts`**:
   - `GET /monitors/:id/checks`: Returns recent checks limited by `?limit=`.
   - `GET /monitors/:id/incidents`: Returns outage incident history.
   - `GET /monitors/:id/open-incident`: Checks if an active outage is currently open (`ended_at IS NULL`).
   - `GET /monitors/:id/uptime?days=30`: Executes:
     ```sql
     SELECT
       COUNT(*)::int AS total_checks,
       COUNT(*) FILTER (WHERE is_up = true)::int AS up_checks,
       ROUND(
         COALESCE(
           (COUNT(*) FILTER (WHERE is_up = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
           100.0
         ),
         2
       )::float AS uptime_percentage
     FROM check_results
     WHERE monitor_id = $1 AND checked_at >= NOW() - ($2 || ' days')::interval
     ```

---

## 3. Three things that could break and how the code handles each

1. **User attempts to access or modify another user's monitor (IDOR - Insecure Direct Object Reference):**
   - *Risk:* If we queried `SELECT * FROM monitors WHERE id = $1`, User A could guess User B's monitor ID and read or delete their private monitors.
   - *Fix:* Every SQL query includes `AND user_id = $2` with `req.user.id`. If no rows are matched, we return `404 Not Found`. Returning 404 instead of 403 prevents attackers from confirming whether that monitor ID exists on the server.

2. **Division by zero when calculating uptime percentage for a brand-new monitor:**
   - *Risk:* If a monitor was just added and has 0 checks recorded, `COUNT(*)` is 0. Dividing by 0 in SQL (`up_checks / total_checks`) throws an error (`division by zero`).
   - *Fix:* We wrap the divisor in `NULLIF(COUNT(*), 0)`. If count is 0, `NULLIF` turns 0 into `NULL`. Dividing by `NULL` returns `NULL`. We then use `COALESCE(..., 100.0)` so a new monitor defaults safely to 100.0% uptime.

3. **Client passes non-numeric IDs or malicious query strings:**
   - *Risk:* Passing `/monitors/abc` or `/monitors/1/checks?limit=-5` can cause unexpected Postgres syntax errors or excessive memory consumption.
   - *Fix:* Route handlers validate `parseInt` before running any queries. If the ID is `NaN` or limit is outside `1..100`, the handler returns `400 Bad Request` immediately, sparing the database from useless traffic.

---

## 4. Five "Explain Back" Questions for Practice

1. Why do we return `404 Not Found` instead of `403 Forbidden` when User A requests User B's monitor?
2. What is the purpose of `bcrypt.hash(password, 10)`, and why is storing plain-text passwords a critical vulnerability?
3. What is the difference between client mistakes (`400 Bad Request`) and server errors (`500 Internal Server Error`), and why do we only log `console.error` on 500s?
4. Why did we use SQL's `COUNT(*) FILTER (WHERE is_up = true)` to calculate uptime on the database server instead of querying all rows and filtering them in a JavaScript array?
5. Why must `req.user` be attached to the request object in middleware rather than passing the raw JWT token to each route?

---

<details>
<summary><strong>Click to reveal model answers</strong></summary>

### Model Answers

1. **404 vs 403 on Cross-User Access:**
   If we returned `403 Forbidden`, an attacker would learn that the resource exists and belongs to someone else (resource enumeration). By returning `404 Not Found`, the attacker has no idea whether monitor #42 exists or not, keeping the system private.

2. **Bcrypt & Password Security:**
   Bcrypt is an adaptive one-way hashing function designed with a salt and cost factor. Storing plain passwords means any database leak or dump immediately exposes everyone's credentials. With bcrypt, even if the database is leaked, attackers cannot reverse the hashes without immense computational effort.

3. **400 vs 500 Status Codes:**
   400 means the client made a mistake (invalid input, bad URL, missing required field). The client can fix it and try again; it is not a bug in our application, so we don't spam server logs. 500 means our code or infrastructure encountered an unhandled problem (database connection failed, bug in code). We return a generic "Internal server error" message to avoid leaking stack traces to the public, while logging `console.error` internally so developers can debug it.

4. **SQL COUNT FILTER vs JavaScript Array Filter:**
   Calculating metrics in the database leverages Postgres indexes and avoids transferring megabytes of raw check rows across the network into Node.js memory. The database engine calculates the exact aggregate in microseconds and returns a single lightweight number to the backend.

5. **Middleware Extraction of req.user:**
   Centralizing authentication in middleware ensures that decoding and token verification happen once in a standardized place following the DRY (Don't Repeat Yourself) principle. Individual route handlers receive a clean, trusted `req.user` object and don't have to duplicate JWT parsing logic.
</details>
