import React, { useEffect, useState } from "react";
import {
  getMonitor,
  getMonitorChecks,
  getMonitorIncidents,
  getMonitorOpenIncident,
  getMonitorUptime,
} from "../api";
import type { Monitor, CheckResultItem, Incident, UptimeStats } from "../types";

interface MonitorDetailProps {
  monitorId: number;
  onBack: () => void;
}

export const MonitorDetail: React.FC<MonitorDetailProps> = ({ monitorId, onBack }) => {
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [checks, setChecks] = useState<CheckResultItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);
  const [uptime, setUptime] = useState<UptimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getMonitor(monitorId),
      getMonitorChecks(monitorId, 50),
      getMonitorIncidents(monitorId),
      getMonitorOpenIncident(monitorId),
      getMonitorUptime(monitorId, 30),
    ])
      .then(([mRes, cRes, incRes, openIncRes, upRes]) => {
        if (!isMounted) return;
        setMonitor(mRes.monitor);
        setChecks(cRes.checks);
        setIncidents(incRes.incidents);
        setOpenIncident(openIncRes.incident);
        setUptime(upRes);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load monitor details");
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [monitorId, refreshKey]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-slate-500 text-sm">
        Loading monitor details...
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg mb-4">
          {error || "Monitor not found"}
        </div>
        <button onClick={onBack} className="text-sm text-slate-600 hover:underline">
          &larr; Back to Dashboard
        </button>
      </div>
    );
  }

  // Response time SVG sparkline calculation
  const validTimes = checks
    .map((c) => c.response_ms)
    .filter((ms): ms is number => ms !== null);

  // SVG chart dimensions
  const svgWidth = 600;
  const svgHeight = 60;
  const maxMs = validTimes.length > 0 ? Math.max(...validTimes, 200) : 200;
  const points = validTimes.slice(0, 30).reverse().map((ms, idx, arr) => {
    const x = arr.length > 1 ? (idx / (arr.length - 1)) * (svgWidth - 20) + 10 : svgWidth / 2;
    const y = svgHeight - (ms / maxMs) * (svgHeight - 16) - 8;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium mb-2 block"
          >
            &larr; Back to Monitors
          </button>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900">{monitor.name}</h1>
            {openIncident ? (
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
                DOWN
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                UP
              </span>
            )}
          </div>
          <a
            href={monitor.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 font-mono hover:underline mt-0.5 inline-block"
          >
            {monitor.url}
          </a>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            setRefreshKey((k) => k + 1);
          }}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh Data
        </button>
      </div>

      {/* Active Outage Banner if currently down */}
      {openIncident && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center justify-between">
          <div>
            <strong>Active Outage:</strong> This service has been unreachable since{" "}
            {new Date(openIncident.started_at).toLocaleString()}.
          </div>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            30-Day Uptime
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {uptime ? `${uptime.uptimePercentage}%` : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {uptime ? `${uptime.upChecks} UP / ${uptime.totalChecks} checks` : "No checks yet"}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Check Frequency
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {monitor.interval_seconds === 60 ? "1 min" : `${monitor.interval_seconds}s`}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Last checked: {monitor.last_checked_at ? new Date(monitor.last_checked_at).toLocaleTimeString() : "Never"}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Incidents
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {incidents.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {openIncident ? "1 currently active" : "All resolved"}
          </div>
        </div>
      </div>

      {/* Response Time Graph */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Response Time Trend (Recent Checks)</h2>
          <span className="text-xs text-slate-400">Peak: {maxMs}ms</span>
        </div>

        {validTimes.length > 1 ? (
          <div className="w-full overflow-hidden">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-16">
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                points={points}
              />
            </svg>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            Not enough data yet for response time chart
          </div>
        )}
      </div>

      {/* Incident History List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800">Incident History</h2>
        </div>
        {incidents.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No recorded outages</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Outage Started</th>
                <th className="py-2.5 px-4">Outage Ended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {incidents.map((inc) => (
                <tr key={inc.id}>
                  <td className="py-3 px-4 font-semibold">
                    {inc.ended_at ? (
                      <span className="text-slate-600">Resolved</span>
                    ) : (
                      <span className="text-rose-600 font-bold">Ongoing</span>
                    )}
                  </td>
                  <td className="py-3 px-4">{new Date(inc.started_at).toLocaleString()}</td>
                  <td className="py-3 px-4">
                    {inc.ended_at ? new Date(inc.ended_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Checks Table (Last 50 checks) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-800">Recent Checks (Last 50)</h2>
        </div>
        {checks.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No checks logged yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Checked At</th>
                  <th className="py-2.5 px-4">HTTP Status</th>
                  <th className="py-2.5 px-4">Response Time</th>
                  <th className="py-2.5 px-4">Details / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 font-sans">
                      {c.is_up ? (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                          UP
                        </span>
                      ) : (
                        <span className="text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded text-[11px]">
                          DOWN
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">{new Date(c.checked_at).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-4">{c.status_code ?? "—"}</td>
                    <td className="py-2.5 px-4">{c.response_ms !== null ? `${c.response_ms}ms` : "—"}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-500">{c.error ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
