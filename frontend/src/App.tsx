import { useState, useEffect } from "react";
import type { User } from "./types";
import { getMe, getToken, clearToken } from "./api";
import { Navbar } from "./components/Navbar";
import { AuthForm } from "./components/AuthForm";
import { Dashboard } from "./components/Dashboard";
import { AddMonitor } from "./components/AddMonitor";
import { MonitorDetail } from "./components/MonitorDetail";
import { Settings } from "./components/Settings";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(() => Boolean(getToken()));
  const [currentView, setCurrentView] = useState<"dashboard" | "add-monitor" | "monitor-detail" | "settings">("dashboard");
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }

    getMe()
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => {
        setInitializing(false);
      });
  }, []);

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setCurrentView("dashboard");
    setSelectedMonitorId(null);
  };

  const handleSelectMonitor = (id: number) => {
    setSelectedMonitorId(id);
    setCurrentView("monitor-detail");
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Initializing app...
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthSuccess={(authUser) => setUser(authUser)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar
        user={user}
        currentView={currentView}
        onNavigate={(view) => {
          setSelectedMonitorId(null);
          setCurrentView(view);
        }}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {currentView === "dashboard" && (
          <Dashboard
            onSelectMonitor={handleSelectMonitor}
            onAddMonitor={() => setCurrentView("add-monitor")}
          />
        )}

        {currentView === "add-monitor" && (
          <AddMonitor
            onSuccess={() => setCurrentView("dashboard")}
            onCancel={() => setCurrentView("dashboard")}
          />
        )}

        {currentView === "monitor-detail" && selectedMonitorId !== null && (
          <MonitorDetail
            monitorId={selectedMonitorId}
            onBack={() => {
              setSelectedMonitorId(null);
              setCurrentView("dashboard");
            }}
          />
        )}

        {currentView === "settings" && (
          <Settings
            user={user}
            onUserUpdated={(updatedUser) => setUser(updatedUser)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
