import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { app } from "./app";
import { pool } from "./db";

describe("Auth and Monitors API Integration Tests", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Start Express app on an ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /health returns 200 with status ok and db timestamp", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.dbTime).toBeDefined();
  });

  describe("Authentication Flow", () => {
    const testUser = {
      name: "Alice Tester",
      email: `alice_${Date.now()}@example.com`,
      password: "password123",
    };

    it("POST /auth/signup rejects invalid email or short password with 400", async () => {
      const res = await fetch(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A", email: "invalid-email", password: "123" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("POST /auth/signup successfully registers a new user", async () => {
      const res = await fetch(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe(testUser.email);
      expect(data.user.name).toBe(testUser.name);
    });

    it("POST /auth/signup rejects duplicate email", async () => {
      const res = await fetch(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("already registered");
    });

    it("POST /auth/login fails with wrong password", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testUser.email, password: "wrongpassword" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid email or password");
    });

    it("POST /auth/login succeeds with correct password", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testUser.email, password: testUser.password }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe(testUser.email);
    });
  });

  describe("Monitors CRUD and User Scoping", () => {
    let tokenUserA: string;
    let tokenUserB: string;
    let monitorIdA: number;

    beforeAll(async () => {
      // Create User A
      const resA = await fetch(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "User A",
          email: `usera_${Date.now()}@example.com`,
          password: "password123",
        }),
      });
      const dataA = await resA.json();
      tokenUserA = dataA.token;

      // Create User B
      const resB = await fetch(`${baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "User B",
          email: `userb_${Date.now()}@example.com`,
          password: "password123",
        }),
      });
      const dataB = await resB.json();
      tokenUserB = dataB.token;
    });

    it("rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/monitors`);
      expect(res.status).toBe(401);
    });

    it("PATCH /me updates telegram_chat_id and GET /me retrieves it", async () => {
      const patchRes = await fetch(`${baseUrl}/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({ telegram_chat_id: "987654321" }),
      });
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.user.telegram_chat_id).toBe("987654321");

      const getRes = await fetch(`${baseUrl}/me`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.user.telegram_chat_id).toBe("987654321");
    });

    it("POST /monitors validates invalid interval_seconds", async () => {
      const res = await fetch(`${baseUrl}/monitors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({
          name: "My Site",
          url: "https://example.com",
          interval_seconds: 120, // Only 60, 3600, 86400 allowed
        }),
      });
      expect(res.status).toBe(400);
    });

    it("POST /monitors creates a monitor for User A", async () => {
      const res = await fetch(`${baseUrl}/monitors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({
          name: "User A Website",
          url: "https://example.org",
          interval_seconds: 60,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.monitor.id).toBeDefined();
      expect(data.monitor.name).toBe("User A Website");
      monitorIdA = data.monitor.id;
    });

    it("GET /monitors returns only User A's monitors", async () => {
      const resA = await fetch(`${baseUrl}/monitors`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      const dataA = await resA.json();
      expect(dataA.monitors.some((m: any) => m.id === monitorIdA)).toBe(true);

      const resB = await fetch(`${baseUrl}/monitors`, {
        headers: { Authorization: `Bearer ${tokenUserB}` },
      });
      const dataB = await resB.json();
      expect(dataB.monitors.some((m: any) => m.id === monitorIdA)).toBe(false);
    });

    it("User B receives 404 when trying to read or modify User A's monitor", async () => {
      // User B tries GET
      const getRes = await fetch(`${baseUrl}/monitors/${monitorIdA}`, {
        headers: { Authorization: `Bearer ${tokenUserB}` },
      });
      expect(getRes.status).toBe(404);

      // User B tries PATCH
      const patchRes = await fetch(`${baseUrl}/monitors/${monitorIdA}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenUserB}`,
        },
        body: JSON.stringify({ name: "Hacked Name" }),
      });
      expect(patchRes.status).toBe(404);

      // User B tries DELETE
      const deleteRes = await fetch(`${baseUrl}/monitors/${monitorIdA}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenUserB}` },
      });
      expect(deleteRes.status).toBe(404);
    });

    it("calculates uptime percentage using COUNT(*) FILTER", async () => {
      // Insert 3 UP checks and 1 DOWN check for monitorIdA
      await pool.query(
        `INSERT INTO check_results (monitor_id, is_up, status_code, response_ms)
         VALUES
           ($1, true, 200, 100),
           ($1, true, 200, 120),
           ($1, true, 200, 110),
           ($1, false, 500, 80)`,
        [monitorIdA]
      );

      const res = await fetch(`${baseUrl}/monitors/${monitorIdA}/uptime?days=7`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalChecks).toBeGreaterThanOrEqual(4);
      expect(data.upChecks).toBeGreaterThanOrEqual(3);
      // 3 up out of 4 total is 75.0%
      expect(data.uptimePercentage).toBe(75);
    });

    it("GET /monitors/:id/checks retrieves recent check results", async () => {
      const res = await fetch(`${baseUrl}/monitors/${monitorIdA}/checks?limit=10`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.checks.length).toBeGreaterThanOrEqual(4);
    });

    it("PATCH /monitors/:id updates monitor for owner", async () => {
      const res = await fetch(`${baseUrl}/monitors/${monitorIdA}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({ name: "Updated Site Name", interval_seconds: 3600 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.monitor.name).toBe("Updated Site Name");
      expect(data.monitor.interval_seconds).toBe(3600);
    });

    it("DELETE /monitors/:id deletes the monitor for owner", async () => {
      const res = await fetch(`${baseUrl}/monitors/${monitorIdA}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect(res.status).toBe(200);

      // Verify it is gone
      const verifyRes = await fetch(`${baseUrl}/monitors/${monitorIdA}`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect(verifyRes.status).toBe(404);
    });
  });
});
