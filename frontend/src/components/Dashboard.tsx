import React, { useEffect, useState } from "react";
import { getMonitors, getMonitorUptime, getMonitorOpenIncident, deleteMonitor } from "../api";
import type { Monitor } from "../types";

interface MonitorSummary extends Monitor {
  uptimePercentage?: number;
  isOpenIncident?: boolean;
}

interface DashboardProps {
  onSelectMonitor: (id: number) => void;
  onAddMonitor: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectMonitor, onAddMonitor }) => {
  const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitors = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMonitors();
      const list = res.monitors;

      // Fetch uptime & incident status in parallel for each monitor
      const enriched = await Promise.all(
        list.map(async (m) => {
          try {
            const [uptimeRes, incidentRes] = await Promise.all([
              getMonitorUptime(m.id, 30),
              getMonitorOpenIncident(m.id),
            ]);
            return {
              ...m,
              uptimePercentage: uptimeRes.uptimePercentage,
              isOpenIncident: incidentRes.incident !== null,
            };
          } catch {
            return m;
          }
        })
      );

      setMonitors(enriched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load monitors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitors();
  }, []);

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete monitor "${name}"?`)) {
      return;
    }
    try {
      await deleteMonitor(id);
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete monitor");
    }
  };

  const formatInterval = (sec: number) => {
    if (sec === 60) return "1 min";
    if (sec === 3600) return "1 hr";
    if (sec === 86400) return "24 hrs";
    return `${sec}s`;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-slate-500 text-sm">
        Loading monitors...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={fetchMonitors} className="underline font-medium">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monitors</h1>
          <p className="text-sm text-slate-500">Live uptime and performance tracking</p>
        </div>
        <button
          onClick={onAddMonitor}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm"
        >
          + Add Monitor
        </button>
      </div>

      {monitors.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-600 font-medium">No monitors added yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">
            Start monitoring your websites and APIs with automated 60s health checks.
          </p>
          <button
            onClick={onAddMonitor}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-sm"
          >
            Create Your First Monitor
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden shadow-sm">
          {monitors.map((m) => {
            const isDown = m.isOpenIncident === true;
            const isPending = !m.last_checked_at;

            return (
              <div
                key={m.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-start space-x-3.5">
                  <div className="pt-0.5">
                    {isPending ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">
                        PENDING
                      </span>
                    ) : isDown ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
                        DOWN
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                        UP
                      </span>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={() => onSelectMonitor(m.id)}
                      className="text-base font-semibold text-slate-900 hover:text-emerald-600 text-left"
                    >
                      {m.name}
                    </button>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{m.url}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-6 text-sm text-slate-600">
                  <div className="text-right">
                    <div className="text-xs text-slate-400 uppercase font-medium">Uptime (30d)</div>
                    <div className="font-semibold text-slate-900">
                      {m.uptimePercentage !== undefined ? `${m.uptimePercentage}%` : "—"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-400 uppercase font-medium">Interval</div>
                    <div className="font-medium text-slate-800">{formatInterval(m.interval_seconds)}</div>
                  </div>

                  <div className="text-right min-w-[120px]">
                    <div className="text-xs text-slate-400 uppercase font-medium">Last Checked</div>
                    <div className="text-xs text-slate-600">
                      {m.last_checked_at
                        ? new Date(m.last_checked_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "Not checked yet"}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                    <button
                      onClick={() => onSelectMonitor(m.id)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => handleDelete(m.id, m.name)}
                      className="px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
