import { pool } from "../db";

export interface Incident {
  id: number;
  monitor_id: number;
  started_at: Date;
  ended_at: Date | null;
}

export const incidentService = {
  async getOpenIncident(monitorId: number): Promise<Incident | null> {
    const query = `
      SELECT *
      FROM incidents
      WHERE monitor_id = $1 AND ended_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await pool.query<Incident>(query, [monitorId]);
    return rows[0] ?? null;
  },

  async getIncidentsByMonitor(monitorId: number, limit: number = 50): Promise<Incident[]> {
    const query = `
      SELECT *
      FROM incidents
      WHERE monitor_id = $1
      ORDER BY started_at DESC
      LIMIT $2;
    `;
    const { rows } = await pool.query<Incident>(query, [monitorId, limit]);
    return rows;
  },

  async getAllIncidents(
    status: "all" | "open" | "resolved" = "all",
    limit: number = 50,
    offset: number = 0
  ): Promise<Incident[]> {
    let whereClause = "";
    if (status === "open") {
      whereClause = "WHERE ended_at IS NULL";
    } else if (status === "resolved") {
      whereClause = "WHERE ended_at IS NOT NULL";
    }

    const query = `
      SELECT *
      FROM incidents
      ${whereClause}
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const { rows } = await pool.query<Incident>(query, [limit, offset]);
    return rows;
  },

  async openIncident(monitorId: number, startedAt: Date = new Date()): Promise<Incident> {
    const query = `
      INSERT INTO incidents (monitor_id, started_at, ended_at)
      VALUES ($1, $2, NULL)
      RETURNING *;
    `;
    const { rows } = await pool.query<Incident>(query, [monitorId, startedAt]);
    return rows[0];
  },

  async resolveIncident(monitorId: number, endedAt: Date = new Date()): Promise<Incident | null> {
    const query = `
      UPDATE incidents
      SET ended_at = $1
      WHERE monitor_id = $2 AND ended_at IS NULL
      RETURNING *;
    `;
    const { rows } = await pool.query<Incident>(query, [endedAt, monitorId]);
    return rows[0] ?? null;
  },
};
