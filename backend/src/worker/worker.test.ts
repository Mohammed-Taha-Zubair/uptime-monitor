import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { pool } from "../db";
import { executeCheck } from "./executeCheck";
import { CheckResult } from "../checks/checkUrl";
import { AlertContext } from "../alerts/notifier";

describe("Worker Decision Table and Alerting", () => {
  let userId: number;
  let monitorId: number;

  let downAlertsCount = 0;
  let recoveredAlertsCount = 0;

  const mockSendDownAlert = async (_ctx: AlertContext) => {
    downAlertsCount++;
  };

  const mockSendRecoveredAlert = async (_ctx: AlertContext) => {
    recoveredAlertsCount++;
  };

  const upProbe = async (): Promise<CheckResult> => ({
    isUp: true,
    statusCode: 200,
    responseMs: 80,
    error: null,
  });

  const downProbe = async (): Promise<CheckResult> => ({
    isUp: false,
    statusCode: 500,
    responseMs: 120,
    error: "Internal Server Error",
  });

  beforeAll(async () => {
    // Create test user and monitor
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, telegram_chat_id)
       VALUES ('Worker Test User', $1, 'hashed_pw', '123456')
       RETURNING id`,
      [`worker_test_${Date.now()}@example.com`]
    );
    userId = userRes.rows[0].id;

    const monitorRes = await pool.query(
      `INSERT INTO monitors (user_id, name, url, interval_seconds)
       VALUES ($1, 'Decision Test Monitor', 'https://test-example.com', 60)
       RETURNING id`,
      [userId]
    );
    monitorId = monitorRes.rows[0].id;
  });

  beforeEach(async () => {
    // Reset alerts and database records for this monitor before each test
    downAlertsCount = 0;
    recoveredAlertsCount = 0;
    await pool.query("DELETE FROM incidents WHERE monitor_id = $1", [monitorId]);
    await pool.query("DELETE FROM check_results WHERE monitor_id = $1", [monitorId]);
  });

  it("Decision Case 1: Open incident = NO, check = UP -> do nothing", async () => {
    const res = await executeCheck(monitorId, {
      checkUrlFn: upProbe,
      sendDownAlertFn: mockSendDownAlert,
      sendRecoveredAlertFn: mockSendRecoveredAlert,
    });

    expect(res.isUp).toBe(true);
    expect(res.action).toBe("none");

    // Assert exact incident rows in DB
    const incidents = await pool.query("SELECT * FROM incidents WHERE monitor_id = $1", [monitorId]);
    expect(incidents.rows.length).toBe(0);

    // Assert alerts
    expect(downAlertsCount).toBe(0);
    expect(recoveredAlertsCount).toBe(0);

    // Assert check was recorded
    const checks = await pool.query("SELECT * FROM check_results WHERE monitor_id = $1", [monitorId]);
    expect(checks.rows.length).toBe(1);
    expect(checks.rows[0].is_up).toBe(true);
  });

  it("Decision Case 2: Open incident = NO, check = DOWN -> INSERT incident and send down alert once", async () => {
    const res = await executeCheck(monitorId, {
      checkUrlFn: downProbe,
      sendDownAlertFn: mockSendDownAlert,
      sendRecoveredAlertFn: mockSendRecoveredAlert,
    });

    expect(res.isUp).toBe(false);
    expect(res.action).toBe("opened");

    // Assert exact incident rows in DB
    const incidents = await pool.query("SELECT * FROM incidents WHERE monitor_id = $1", [monitorId]);
    expect(incidents.rows.length).toBe(1);
    expect(incidents.rows[0].ended_at).toBeNull();

    // Assert alerts
    expect(downAlertsCount).toBe(1);
    expect(recoveredAlertsCount).toBe(0);
  });

  it("Decision Case 3: Open incident = YES, check = DOWN -> do nothing (already reported)", async () => {
    // Seed an existing open incident
    await pool.query(
      "INSERT INTO incidents (monitor_id, started_at, ended_at) VALUES ($1, NOW() - interval '5 minutes', NULL)",
      [monitorId]
    );

    const res = await executeCheck(monitorId, {
      checkUrlFn: downProbe,
      sendDownAlertFn: mockSendDownAlert,
      sendRecoveredAlertFn: mockSendRecoveredAlert,
    });

    expect(res.isUp).toBe(false);
    expect(res.action).toBe("none");

    // Assert incident rows remain exactly 1, still open
    const incidents = await pool.query("SELECT * FROM incidents WHERE monitor_id = $1", [monitorId]);
    expect(incidents.rows.length).toBe(1);
    expect(incidents.rows[0].ended_at).toBeNull();

    // No duplicate alert sent
    expect(downAlertsCount).toBe(0);
    expect(recoveredAlertsCount).toBe(0);
  });

  it("Decision Case 4: Open incident = YES, check = UP -> UPDATE incident ended_at and send recovered alert once", async () => {
    // Seed an existing open incident
    await pool.query(
      "INSERT INTO incidents (monitor_id, started_at, ended_at) VALUES ($1, NOW() - interval '5 minutes', NULL)",
      [monitorId]
    );

    const res = await executeCheck(monitorId, {
      checkUrlFn: upProbe,
      sendDownAlertFn: mockSendDownAlert,
      sendRecoveredAlertFn: mockSendRecoveredAlert,
    });

    expect(res.isUp).toBe(true);
    expect(res.action).toBe("resolved");

    // Assert incident rows: still 1, but ended_at is now set!
    const incidents = await pool.query("SELECT * FROM incidents WHERE monitor_id = $1", [monitorId]);
    expect(incidents.rows.length).toBe(1);
    expect(incidents.rows[0].ended_at).not.toBeNull();

    // Assert alerts
    expect(downAlertsCount).toBe(0);
    expect(recoveredAlertsCount).toBe(1);
  });

  it("Two consecutive DOWN checks produce exactly ONE incident and ONE down alert", async () => {
    // First DOWN check
    await executeCheck(monitorId, {
      checkUrlFn: downProbe,
      sendDownAlertFn: mockSendDownAlert,
      sendRecoveredAlertFn: mockSendRecoveredAlert,
    });

    expect(downAlertsCount).toBe(1);

    // Second consecutive DOWN check
    await executeCheck(monitorId, {
      checkUrlFn: downProbe,
      sendDownAlertFn: mockSendDownAlert,
      sendRecoveredAlertFn: mockSendRecoveredAlert,
    });

    // Verify still only 1 down alert and 1 incident
    expect(downAlertsCount).toBe(1);
    expect(recoveredAlertsCount).toBe(0);

    const incidents = await pool.query("SELECT * FROM incidents WHERE monitor_id = $1", [monitorId]);
    expect(incidents.rows.length).toBe(1);
    expect(incidents.rows[0].ended_at).toBeNull();

    // But check_results has both checks recorded
    const checks = await pool.query("SELECT * FROM check_results WHERE monitor_id = $1", [monitorId]);
    expect(checks.rows.length).toBe(2);
  });
});
