import { pool } from "../db";
import { Monitor } from "./monitor.service";
import { incidentService } from "./incident.service";
import { ProbeResult } from "./probe.service";

export type MonitorStateTransition =
  | "REMAINED_UP"
  | "REMAINED_DOWN"
  | "ENTERED_DOWN"
  | "RECOVERED";

export interface StateMachineEvaluation {
  transition: MonitorStateTransition;
  incidentId: number | null;
  notified: boolean;
  message: string;
}

export const alertService = {
  /**
   * Evaluates the alert state machine for a monitor probe result.
   * Manages incident lifecycle (opening on failure, closing on recovery)
   * and deduplicates alert notifications to prevent flapping.
   */
  async processProbeResult(
    monitor: Monitor,
    result: ProbeResult
  ): Promise<StateMachineEvaluation> {
    const checkedAt = new Date();

    // 1. Record the probe telemetry into check_results
    await pool.query(
      `
      INSERT INTO check_results (monitor_id, is_up, status_code, response_ms, error, checked_at)
      VALUES ($1, $2, $3, $4, $5, $6);
    `,
      [
        monitor.id,
        result.isUp,
        result.statusCode,
        result.responseMs,
        result.error,
        checkedAt,
      ]
    );

    // 2. Update monitor last_checked_at timestamp
    await pool.query(
      `UPDATE monitors SET last_checked_at = $1 WHERE id = $2;`,
      [checkedAt, monitor.id]
    );

    // 3. Check for existing open incident
    const activeIncident = await incidentService.getOpenIncident(monitor.id);

    // 4. State Machine Transition Logic
    if (!result.isUp) {
      if (!activeIncident) {
        // Transition: UP -> DOWN (New outage detected)
        const newIncident = await incidentService.openIncident(monitor.id, checkedAt);
        const alertMsg = `[ALERT] Monitor "${monitor.name}" (${monitor.url}) is DOWN. Error: ${result.error || "Probe failed"}`;
        console.warn(alertMsg);

        return {
          transition: "ENTERED_DOWN",
          incidentId: newIncident.id,
          notified: true,
          message: alertMsg,
        };
      } else {
        // State remains DOWN: ongoing outage, suppress duplicate alerts
        return {
          transition: "REMAINED_DOWN",
          incidentId: activeIncident.id,
          notified: false,
          message: `Monitor "${monitor.name}" remains down. Incident #${activeIncident.id} is active.`,
        };
      }
    } else {
      if (activeIncident) {
        // Transition: DOWN -> RECOVERED (Service restored)
        const closedIncident = await incidentService.resolveIncident(monitor.id, checkedAt);
        const outageDurationSec = Math.round(
          (checkedAt.getTime() - new Date(activeIncident.started_at).getTime()) / 1000
        );
        const recoveryMsg = `[RECOVERY] Monitor "${monitor.name}" (${monitor.url}) has recovered. Total downtime: ${outageDurationSec}s.`;
        console.log(recoveryMsg);

        return {
          transition: "RECOVERED",
          incidentId: closedIncident?.id ?? activeIncident.id,
          notified: true,
          message: recoveryMsg,
        };
      } else {
        // State remains UP: normal healthy operation
        return {
          transition: "REMAINED_UP",
          incidentId: null,
          notified: false,
          message: `Monitor "${monitor.name}" is healthy (${result.responseMs}ms).`,
        };
      }
    }
  },
};
