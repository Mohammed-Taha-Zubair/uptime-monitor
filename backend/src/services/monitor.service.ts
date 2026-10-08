import { pool } from "../db";
import { CreateMonitorInput, UpdateMonitorInput } from "../schemas/monitor.schema";

export interface Monitor {
  id: number;
  user_id: number;
  name: string;
  url: string;
  interval_seconds: number;
  is_active: boolean;
  last_checked_at: Date | null;
  created_at: Date;
}

export interface CheckResult {
  id: string;
  monitor_id: number;
  is_up: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  checked_at: Date;
}

export const monitorService = {
  async createMonitor(input: CreateMonitorInput): Promise<Monitor> {
    const query = `
      INSERT INTO monitors (user_id, name, url, interval_seconds, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [
      input.user_id,
      input.name,
      input.url,
      input.interval_seconds,
      input.is_active ?? true,
    ];
    const { rows } = await pool.query<Monitor>(query, values);
    return rows[0];
  },

  async getAllMonitors(userId?: number): Promise<Monitor[]> {
    if (userId) {
      const query = `SELECT * FROM monitors WHERE user_id = $1 ORDER BY created_at DESC;`;
      const { rows } = await pool.query<Monitor>(query, [userId]);
      return rows;
    }
    const query = `SELECT * FROM monitors ORDER BY created_at DESC;`;
    const { rows } = await pool.query<Monitor>(query);
    return rows;
  },

  async getMonitorById(id: number): Promise<Monitor | null> {
    const query = `SELECT * FROM monitors WHERE id = $1;`;
    const { rows } = await pool.query<Monitor>(query, [id]);
    return rows[0] ?? null;
  },

  async updateMonitor(id: number, input: UpdateMonitorInput): Promise<Monitor | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.url !== undefined) {
      fields.push(`url = $${idx++}`);
      values.push(input.url);
    }
    if (input.interval_seconds !== undefined) {
      fields.push(`interval_seconds = $${idx++}`);
      values.push(input.interval_seconds);
    }
    if (input.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(input.is_active);
    }

    if (fields.length === 0) {
      return this.getMonitorById(id);
    }

    values.push(id);
    const query = `
      UPDATE monitors
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING *;
    `;

    const { rows } = await pool.query<Monitor>(query, values);
    return rows[0] ?? null;
  },

  async deleteMonitor(id: number): Promise<boolean> {
    const query = `DELETE FROM monitors WHERE id = $1 RETURNING id;`;
    const { rowCount } = await pool.query(query, [id]);
    return (rowCount ?? 0) > 0;
  },

  /**
   * Retrieves high-performance time-series telemetry.
   * Utilizes composite index idx_check_results_monitor_time ON check_results(monitor_id, checked_at)
   * for sub-millisecond query execution.
   */
  async getMetrics(monitorId: number, limit: number = 50): Promise<CheckResult[]> {
    const query = `
      SELECT id, monitor_id, is_up, status_code, response_ms, error, checked_at
      FROM check_results
      WHERE monitor_id = $1
      ORDER BY checked_at DESC
      LIMIT $2;
    `;
    const { rows } = await pool.query<CheckResult>(query, [monitorId, limit]);
    return rows;
  },

  /**
   * Fetches active monitors due for a probe check.
   */
  async getMonitorsDueForCheck(limit: number = 50): Promise<Monitor[]> {
    const query = `
      SELECT *
      FROM monitors
      WHERE is_active = true
        AND (
          last_checked_at IS NULL
          OR last_checked_at <= NOW() - (interval_seconds || ' seconds')::INTERVAL
        )
      ORDER BY last_checked_at ASC NULLS FIRST
      LIMIT $1;
    `;
    const { rows } = await pool.query<Monitor>(query, [limit]);
    return rows;
  },

  async updateLastChecked(id: number, checkedAt: Date = new Date()): Promise<void> {
    await pool.query(
      `UPDATE monitors SET last_checked_at = $1 WHERE id = $2;`,
      [checkedAt, id]
    );
  },
};
