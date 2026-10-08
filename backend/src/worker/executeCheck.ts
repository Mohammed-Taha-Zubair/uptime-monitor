import { pool } from "../db";
import { checkUrl, CheckResult } from "../checks/checkUrl";
import { sendDownAlert, sendRecoveredAlert, AlertContext } from "../alerts/notifier";

export interface ExecuteCheckOptions {
  checkUrlFn?: (url: string) => Promise<CheckResult>;
  sendDownAlertFn?: (ctx: AlertContext) => Promise<void>;
  sendRecoveredAlertFn?: (ctx: AlertContext) => Promise<void>;
}

/**
 * executeCheck:
 * Performs one end-to-end check for a given monitor ID:
 * 1. Loads monitor details and owner settings from the DB.
 * 2. Runs checkUrl() to determine HTTP status and latency.
 *    (Note: a down website is a normal RESULT, not a job failure.
 *     Only unexpected internal errors like DB failure will throw,
 *     which BullMQ will retry with exponential backoff).
 * 3. Records check_results row.
 * 4. Runs the decision table inside a database transaction:
 *      open incident? | this check | action
 *      no             | up         | nothing
 *      no             | down       | INSERT incident, send "down" alert once
 *      yes            | down       | nothing (already reported)
 *      yes            | up         | UPDATE incident ended_at = NOW(), send "recovered" alert once
 * 5. Updates monitors.last_checked_at = NOW().
 * 6. Dispatches alerts outside the transaction so notification failures cannot break the check.
 */
export async function executeCheck(
  monitorId: number,
  options?: ExecuteCheckOptions
): Promise<{ isUp: boolean; action: "none" | "opened" | "resolved" }> {
  const probeFn = options?.checkUrlFn || checkUrl;
  const onDownAlert = options?.sendDownAlertFn || sendDownAlert;
  const onRecoveredAlert = options?.sendRecoveredAlertFn || sendRecoveredAlert;

  // 1. Load monitor and user's alert preferences
  const monitorRes = await pool.query(
    `SELECT m.id, m.name, m.url, m.is_active, u.telegram_chat_id
     FROM monitors m
     JOIN users u ON m.user_id = u.id
     WHERE m.id = $1`,
    [monitorId]
  );

  if (monitorRes.rows.length === 0 || !monitorRes.rows[0].is_active) {
    return { isUp: true, action: "none" };
  }

  const monitor = monitorRes.rows[0];

  // 2. Perform HTTP probe (never throws)
  const probeResult = await probeFn(monitor.url);

  // 3. Database transaction for check results and decision table
  const client = await pool.connect();
  let action: "none" | "opened" | "resolved" = "none";

  try {
    await client.query("BEGIN");

    // Insert telemetry into check_results
    await client.query(
      `INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        monitor.id,
        probeResult.isUp,
        probeResult.statusCode,
        probeResult.responseMs,
        probeResult.error,
      ]
    );

    // Query whether there is an active (unresolved) outage
    const openIncidentRes = await client.query(
      `SELECT id, started_at
       FROM incidents
       WHERE monitor_id = $1 AND ended_at IS NULL
       FOR UPDATE`,
      [monitor.id]
    );

    const hasOpenIncident = openIncidentRes.rows.length > 0;

    // Decision Table Logic:
    if (!hasOpenIncident && !probeResult.isUp) {
      // Outage started: create open incident
      await client.query(
        `INSERT INTO incidents (monitor_id, started_at, ended_at)
         VALUES ($1, NOW(), NULL)`,
        [monitor.id]
      );
      action = "opened";
    } else if (hasOpenIncident && probeResult.isUp) {
      // Outage resolved: close incident
      const incidentId = openIncidentRes.rows[0].id;
      await client.query(
        `UPDATE incidents
         SET ended_at = NOW()
         WHERE id = $1`,
        [incidentId]
      );
      action = "resolved";
    } else {
      // No state transition required
      action = "none";
    }

    // Always update last_checked_at after every check
    await client.query(
      `UPDATE monitors
       SET last_checked_at = NOW()
       WHERE id = $1`,
      [monitor.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // Re-throw so BullMQ knows an unexpected database error occurred
    throw err;
  } finally {
    client.release();
  }

  // 4. Send alerts outside transaction (failures will not roll back DB changes)
  const alertCtx: AlertContext = {
    monitorName: monitor.name,
    url: monitor.url,
    telegramChatId: monitor.telegram_chat_id,
    error: probeResult.error,
  };

  try {
    if (action === "opened") {
      await onDownAlert(alertCtx);
    } else if (action === "resolved") {
      await onRecoveredAlert(alertCtx);
    }
  } catch (alertErr) {
    console.warn("Failed to dispatch alert:", alertErr);
  }

  return { isUp: probeResult.isUp, action };
}
