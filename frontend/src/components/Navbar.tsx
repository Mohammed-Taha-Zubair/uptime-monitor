import React from "react";
import type { User } from "../types";

interface NavbarProps {
  user: User;
  currentView: string;
  onNavigate: (view: "dashboard" | "add-monitor" | "settings") => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, currentView, onNavigate, onLogout }) => {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div
            onClick={() => onNavigate("dashboard")}
            className="flex items-center space-x-2 cursor-pointer font-bold text-lg text-slate-900"
          >
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>Uptime Monitor</span>
          </div>

          <nav className="flex space-x-2 text-sm font-medium">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`px-3 py-1.5 rounded-md ${
                currentView === "dashboard"
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monitors
            </button>
            <button
              onClick={() => onNavigate("add-monitor")}
              className={`px-3 py-1.5 rounded-md ${
                currentView === "add-monitor"
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              + Add Monitor
            </button>
            <button
              onClick={() => onNavigate("settings")}
              className={`px-3 py-1.5 rounded-md ${
                currentView === "settings"
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-4 text-sm">
          <span className="text-slate-500">{user.email}</span>
          <button
            onClick={onLogout}
            className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};
