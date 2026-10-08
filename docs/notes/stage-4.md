# Stage 4: Minimal Dashboard (Frontend)

## 1. What was built, in plain English
In this stage, we created the frontend client web application using **Vite, React, TypeScript, and Tailwind CSS**.

Key features:
- **Zero Heavy Frameworks or Bloat:** We did not add complex state managers (like Redux) or heavy component libraries. Standard React `useState`, `useEffect`, and native browser `fetch` handle all application state and server communication.
- **Centralized API Layer:** Every single API call (`signup`, `login`, `getMonitors`, `createMonitor`, `deleteMonitor`, etc.) lives in a single clean module (`src/api.ts`). No scattered `fetch` calls across components.
- **JWT Storage in localStorage:** On login or signup, the JWT token is saved to `localStorage`. On page reload, the app reads the token and calls `/me` to restore the user's active session.
- **Intuitive Single Page Interface:**
  - **Dashboard:** Lists monitors with real-time status badges (`UP` / `DOWN` / `PENDING`), 30-day uptime percentage, interval, and last checked timestamp.
  - **Add Monitor Form:** Allows adding new monitors with instant validation.
  - **Monitor Detail:** Displays 3-card metric summary, an inline SVG response-time trend line, an incident outage history table, and a detailed table of the last 50 checks.
  - **Settings:** Allows users to view and update their Telegram Chat ID for alerts.
  - **Auth Screen:** Toggle between Sign In and Sign Up with friendly error messages.

---

## 2. Walkthrough of the flow
Here is how data flows through the React frontend:

1. **`frontend/src/api.ts`**:
   - Manages token storage (`getToken`, `setToken`, `clearToken`).
   - Defines a central `request<T>(endpoint, options)` wrapper that automatically injects `Authorization: Bearer <token>` and parses response JSON.
   - Provides strongly-typed helper functions for each backend REST endpoint.

2. **`frontend/src/App.tsx` (`App`)**:
   - On initial mount, reads token from `localStorage`. If present, calls `getMe()` to authenticate.
   - If not authenticated, renders `<AuthForm />`.
   - If authenticated, renders `<Navbar />` and dynamically switches the active view (`dashboard`, `add-monitor`, `monitor-detail`, `settings`).

3. **`frontend/src/components/Dashboard.tsx` (`Dashboard`)**:
   - Calls `getMonitors()` and parallelizes requests for 30-day uptime (`getMonitorUptime`) and open incidents (`getMonitorOpenIncident`).
   - Renders monitor cards with green/red badges and actions to open details or delete.

4. **`frontend/src/components/MonitorDetail.tsx` (`MonitorDetail`)**:
   - Loads the monitor, last 50 checks, incident history, and uptime statistics using `Promise.all`.
   - Computes coordinates for an SVG `<polyline>` to draw a latency sparkline without any charting libraries.
   - Renders a table of the last 50 checks and incident outage logs.

5. **`frontend/src/components/Settings.tsx` (`Settings`)**:
   - Allows entering and saving a Telegram Chat ID via `updateTelegramChatId(chatId)`.

---

## 3. Three things that could break and how the code handles each

1. **User opens the site with an expired or invalid JWT in localStorage:**
   - *Risk:* If the stored token has expired, API requests will fail with 401 Unauthorized, leaving the UI in an inconsistent broken state.
   - *Fix:* In `App.tsx`, on startup `getMe()` is called with the stored token. If the server rejects the token (returns 401 or throws), the `catch` block calls `clearToken()` and resets `user = null`, smoothly presenting the login screen.

2. **Rapid concurrent requests or slow network connections when loading monitor telemetry:**
   - *Risk:* Loading 10 monitors could make 20 separate API calls sequentially, making the dashboard sluggish.
   - *Fix:* We use `Promise.all` in `Dashboard.tsx` and `MonitorDetail.tsx` to execute independent HTTP requests concurrently in parallel. We also provide clear loading states (`loading === true`) and error recovery buttons.

3. **Rendering an SVG latency chart when a monitor has no checks or only 1 check:**
   - *Risk:* Computing coordinate ratios `idx / (arr.length - 1)` with 0 or 1 point causes division by zero (`NaN`), which breaks SVG rendering.
   - *Fix:* `MonitorDetail.tsx` checks `validTimes.length > 1`. If there are 0 or 1 data points, it renders a friendly placeholder ("Not enough data yet for response time chart") instead of attempting to draw the polyline.

---

## 4. Five "Explain Back" Questions for Practice

1. Why did we centralize all `fetch()` calls into a single `src/api.ts` file instead of writing `fetch()` directly in each React component?
2. How does the SVG line chart work in `MonitorDetail.tsx` without importing any third-party charting libraries?
3. What happens when a user clicks "Logout", and why must we clear both React state and `localStorage`?
4. Why is `Promise.all` preferred when fetching a monitor's details, recent checks, and incident history?
5. What are the advantages of using Tailwind CSS utility classes over custom CSS files for a simple dashboard?

---

<details>
<summary><strong>Click to reveal model answers</strong></summary>

### Model Answers

1. **Centralized API Module:**
   Having a single `api.ts` file keeps URL paths, headers, authentication token injection, and error handling in one place. If the backend URL or header format changes, we only need to update one file rather than hunting through multiple component files.

2. **Vanilla SVG Sparkline:**
   SVG `<polyline points="..." />` takes a list of `x,y` coordinate pairs. We simply calculate the `x` position proportionally across the width (`(index / total) * width`) and map the latency `response_ms` to the `y` height (`height - (ms / maxMs) * height`). This creates a lightweight visual graph in ~15 lines of code with zero bundle overhead.

3. **Logout Handling:**
   React state lives only in memory; `localStorage` persists across page reloads. If you only reset React state, refreshing the page would re-read the old token from storage and log the user right back in. Clearing both ensures the session is completely terminated.

4. **Promise.all Concurrency:**
   Instead of waiting for the monitor query to finish before starting the checks query (waterfall loading), `Promise.all` dispatches all network requests in parallel. The browser initiates them simultaneously, reducing total load time to the duration of the single slowest request.

5. **Tailwind CSS Advantages:**
   Tailwind's utility classes allow rapid UI development directly in JSX with consistent spacing, colors, and responsive modifiers (`md:flex-row`). It prevents stylesheet bloat because duplicate custom class names aren't created, and the compiler automatically purges unused styles in the production build.
</details>
