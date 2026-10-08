# Deployment Guide (Render & Railway)

This guide provides step-by-step instructions for deploying the **Uptime Monitor** to cloud platforms like **Railway** or **Render**.

> **Note for the developer:** Follow these steps manually in your cloud dashboard. Do not deploy until you are ready!

---

## Architecture Overview in Production

In production, the application consists of 5 components:
1. **Managed PostgreSQL**: Relational database storing users, monitors, checks, and incidents.
2. **Managed Redis**: Message broker for the BullMQ job queue.
3. **API Web Service**: Express REST API server responding to client web traffic.
4. **Background Worker Service**: Dedicated Node.js process running the 15-second scheduler and probe worker.
5. **Frontend Web Service**: Static SPA (Single Page App) built with Vite and served via CDN.

---

## Option A: Deploying on Railway (Recommended for Ease)

Railway makes deploying multi-service architectures straightforward.

### Step 1: Create a Railway Project
1. Log in to [railway.app](https://railway.app/).
2. Click **New Project** &rarr; **Provision PostgreSQL**.
3. In the same project, click **New** &rarr; **Database** &rarr; **Add Redis**.

### Step 2: Initialize Database Schema
1. Connect to your Railway PostgreSQL database using `psql` or a GUI client (like TablePlus / DBeaver) using the `DATABASE_URL` found in the Postgres service **Connect** tab.
2. Run the SQL statements in `schema.sql`:
   ```bash
   psql "<RAILWAY_DATABASE_URL>" < schema.sql
   ```

### Step 3: Deploy the API Service
1. Click **New** &rarr; **GitHub Repo** &rarr; select `uptime-monitor`.
2. Under service settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/index.js`
3. Add Environment Variables:
   - `PORT`: `3000`
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` (use Railway reference variable)
   - `REDIS_URL`: `${{Redis.REDIS_URL}}`
   - `JWT_SECRET`: Generate a secure random string (e.g. `openssl rand -hex 32`)
   - `CHECK_TIMEOUT_MS`: `10000`
4. Under **Networking**, click **Generate Domain** to get a public URL (e.g. `https://uptime-api.up.railway.app`).

### Step 4: Deploy the Background Worker Service
1. In the same project, click **New** &rarr; **GitHub Repo** &rarr; select `uptime-monitor` again.
2. Rename the service to `uptime-worker`.
3. Under service settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/worker/worker.js`
4. Add Environment Variables:
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL`: `${{Redis.REDIS_URL}}`
   - `WORKER_CONCURRENCY`: `5`
   - `CHECK_TIMEOUT_MS`: `10000`
   - `TELEGRAM_BOT_TOKEN`: (Optional) Your bot token from `@BotFather`
5. Note: The worker does **not** need a public HTTP domain since it only pulls jobs from Redis.

### Step 5: Deploy the Frontend
1. Click **New** &rarr; **GitHub Repo** &rarr; select `uptime-monitor`.
2. Rename service to `uptime-frontend`.
3. Under service settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npx vite preview --host 0.0.0.0 --port 8080`
4. Environment Variables:
   - `VITE_API_URL`: Your API URL from Step 3 (e.g. `https://uptime-api.up.railway.app`)
5. Under **Networking**, generate a public domain for the frontend.

---

## Option B: Deploying on Render

### Step 1: Create Databases
1. Go to [dashboard.render.com](https://dashboard.render.com/).
2. Create a **New PostgreSQL** instance. Note the *Internal Database URL*.
3. Connect using `psql` and execute `schema.sql`.
4. Create a **New Redis** instance. Note the *Internal Redis URL*.

### Step 2: Deploy the API Web Service
1. Create a **New Web Service** pointing to your repo.
2. Root Directory: `backend`
3. Environment: `Node`
4. Build Command: `npm ci && npm run build`
5. Start Command: `node dist/index.js`
6. Add environment variables:
   - `DATABASE_URL`: Internal Postgres URL
   - `REDIS_URL`: Internal Redis URL
   - `JWT_SECRET`: Random 32+ character string
   - `CHECK_TIMEOUT_MS`: `10000`

### Step 3: Deploy the Worker as a Background Worker
1. In Render, click **New** &rarr; **Background Worker**.
2. Root Directory: `backend`
3. Build Command: `npm ci && npm run build`
4. Start Command: `node dist/worker/worker.js`
5. Add the same environment variables (`DATABASE_URL`, `REDIS_URL`, `WORKER_CONCURRENCY`, `TELEGRAM_BOT_TOKEN`).

### Step 4: Deploy the Frontend as a Static Site
1. Click **New** &rarr; **Static Site**.
2. Root Directory: `frontend`
3. Build Command: `npm ci && npm run build`
4. Publish Directory: `dist`
5. Environment Variable:
   - `VITE_API_URL`: The public HTTPS URL of your Render API web service.

---

## Setting Up Telegram Bot Alerts (Optional)

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to choose a bot name and username.
3. Copy the HTTP API token provided by BotFather and set it as `TELEGRAM_BOT_TOKEN` in your worker service.
4. Start a chat with your bot by clicking the link provided by BotFather and pressing **Start**.
5. To get your personal chat ID, search for `@userinfobot` in Telegram and send `/start`. It will reply with your numeric `Id`.
6. Open your Uptime Monitor dashboard, go to **Settings**, paste your chat ID, and save.
