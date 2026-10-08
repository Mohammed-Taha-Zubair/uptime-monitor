# Stage 1: checkUrl — Health Check Engine

## 1. What was built, in plain English
In this stage, we built the core "heartbeat probe" function called `checkUrl`. Given any website URL (like `https://example.com`), this function sends a real HTTP GET request, measures how many milliseconds it took to get a reply, and decides whether the website is considered **UP** or **DOWN**.

Key design choices made for safety:
- **It never crashes the process:** Even if the network cable is unplugged, DNS resolution fails, the server responds with gibberish, or the site times out, `checkUrl` will **never throw an exception**. Instead, it catches the error and cleanly returns `{ isUp: false, ... }`.
- **Any 2xx status code is UP:** 200 OK, 201 Created, 204 No Content are all considered UP.
- **Redirects are followed automatically:** If a site redirects from HTTP to HTTPS (`301` or `302`), native `fetch` follows the chain until it lands on the final destination.
- **Strict timeout protection:** We don't want a hung website to hold a connection open forever. If a server doesn't respond within the timeout window (10 seconds by default, configurable via `CHECK_TIMEOUT_MS`), `checkUrl` cancels the request using `AbortController` and marks the site as DOWN.

---

## 2. Walkthrough of the flow
The core code lives in `backend/src/checks/checkUrl.ts`:

1. **`checkUrl(url: string)`**:
   - Reads `process.env.CHECK_TIMEOUT_MS` (or defaults to `10000`).
   - Creates an `AbortController` and schedules `setTimeout(() => controller.abort(), timeoutMs)` to enforce the deadline.
   - Captures `const startTime = Date.now()`.
   - Calls `await fetch(url, { signal: controller.signal, headers: { "User-Agent": "UptimeMonitorBot/1.0" } })`.
   - When the response arrives:
     - Calculates `elapsedMs = Date.now() - startTime`.
     - Evaluates `isUp = response.status >= 200 && response.status < 300`.
     - Returns `{ isUp, statusCode: response.status, responseMs: elapsedMs, error: isUp ? null : 'HTTP status ...' }`.
   - Inside `catch (err)`:
     - If `controller.signal.aborted` is true, we know the request timed out. We return `{ isUp: false, statusCode: null, responseMs: null, error: 'Request timed out after ...' }`.
     - Otherwise, we capture the network error (e.g., DNS lookup failure, connection refused) and return `{ isUp: false, statusCode: null, responseMs: null, error: message }`.
   - Inside `finally`:
     - Calls `clearTimeout(timer)` so the Node.js event loop doesn't hold open inactive timers.

---

## 3. Three things that could break and how the code handles each

1. **The target server hangs and never responds:**
   - *Risk:* Without a timeout, an HTTP request can sit waiting for TCP packets indefinitely, leaking sockets and memory.
   - *Fix:* We wire an `AbortController` signal into `fetch` with a `setTimeout`. If the timeout fires, `controller.abort()` cancels the socket immediately. The catch block identifies that `signal.aborted` is true and returns a clean timeout error object without throwing.

2. **The domain name doesn't exist or connection is refused (DNS/TCP failure):**
   - *Risk:* When DNS fails (`ENOTFOUND`) or a port is closed (`ECONNREFUSED`), `fetch` rejects the Promise with a `TypeError`. If unhandled, this would crash the background worker.
   - *Fix:* The entire fetch call is wrapped in a `try...catch` block. The error is converted into `{ isUp: false, statusCode: null, responseMs: null, error: err.message }`. Notice that `statusCode` and `responseMs` are legitimately `null` because no HTTP response was ever received.

3. **`CHECK_TIMEOUT_MS` environment variable is invalid or undefined:**
   - *Risk:* If someone sets `CHECK_TIMEOUT_MS="abc"`, `parseInt` returns `NaN`. Passing `NaN` to `setTimeout` causes Node.js to warn or default to 1ms, causing every request to fail instantly.
   - *Fix:* We validate `Number.isFinite(parsedTimeout) && parsedTimeout > 0`, safely falling back to 10,000 ms if the environment variable is missing, negative, or unparseable.

---

## 4. Five "Explain Back" Questions for Practice

Test your understanding! Try answering these questions out loud or on paper before reading the answers below.

1. Why does `checkUrl` return `statusCode: null` and `responseMs: null` when a website times out or fails DNS resolution, instead of returning `0`?
2. What is an `AbortController` in modern JavaScript, and why is `clearTimeout(timer)` required in the `finally` block?
3. Why did we write `checkUrl` to never throw an error, instead of letting errors bubble up to `try/catch` in the caller?
4. If a target URL returns a `301 Moved Permanently` redirect to a working `200 OK` page, what does `checkUrl` return and why?
5. What would happen to our backend worker if we had 1,000 active monitors and forgot to put a timeout on `fetch`?

---

<details>
<summary><strong>Click to reveal model answers</strong></summary>

### Model Answers

1. **Why `null` instead of `0`:**
   In HTTP and SQL, `null` means "no value / unknown". A server that never responded doesn't have an HTTP status code of 0 (HTTP status codes are standardized integers from 100 to 599). Similarly, measuring response latency requires an end-to-end HTTP response. Recording `null` accurately mirrors the database schema (`status_code INTEGER, response_ms INTEGER` where both are nullable).

2. **AbortController & clearTimeout:**
   `AbortController` is a standard browser and Node.js Web API that lets you signal cancellation to asynchronous operations like `fetch`. `clearTimeout(timer)` in the `finally` block cancels the timeout timer once the fetch finishes early. Without clearing it, the timer would stay registered in the Node.js event loop until its full duration expired, which wastes memory and can keep test runners or CLI processes alive unnecessarily.

3. **Why `checkUrl` never throws:**
   Probing external websites will routinely fail—websites go down all the time! A downed website is a **normal result** of a check, not an exceptional crash in our system. By returning a predictable data shape `{ isUp, statusCode, responseMs, error }`, callers (like the worker queue) don't need complex defensive try/catch blocks just to inspect the outcome.

4. **Handling of 301/302 redirects:**
   Native `fetch` defaults to `redirect: 'follow'`. It automatically makes the follow-up request to the redirected destination. When it reaches the final `200 OK` page, `response.status` is 200, so `isUp` is `true`.

5. **Impact of missing timeout with 1,000 monitors:**
   If unresponsive target servers leave TCP connections hanging, the Node.js process would accumulate open file descriptors and hung Promises. Over time, the server would exhaust available network sockets, run out of memory, and starve healthy checks from running (resource exhaustion).
</details>
