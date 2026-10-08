import type { User, Monitor, CheckResultItem, Incident, UptimeStats } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Helper: retrieve stored JWT token from localStorage
export function getToken(): string | null {
  return localStorage.getItem("token");
}

// Helper: store token in localStorage
export function setToken(token: string): void {
  localStorage.setItem("token", token);
}

// Helper: remove token on logout
export function clearToken(): void {
  localStorage.removeItem("token");
}

// Helper: internal fetch wrapper with authorization header and error handling
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

// Auth API Calls
export async function signup(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<{ user: User }> {
  return request("/me");
}

export async function updateTelegramChatId(telegram_chat_id: string | null): Promise<{ user: User }> {
  return request("/me", {
    method: "PATCH",
    body: JSON.stringify({ telegram_chat_id }),
  });
}

// Monitors API Calls
export async function getMonitors(): Promise<{ monitors: Monitor[] }> {
  return request("/monitors");
}

export async function getMonitor(id: number): Promise<{ monitor: Monitor }> {
  return request(`/monitors/${id}`);
}

export async function createMonitor(data: { name: string; url: string; interval_seconds: number }): Promise<{ monitor: Monitor }> {
  return request("/monitors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteMonitor(id: number): Promise<{ message: string }> {
  return request(`/monitors/${id}`, {
    method: "DELETE",
  });
}

export async function getMonitorChecks(id: number, limit = 50): Promise<{ checks: CheckResultItem[] }> {
  return request(`/monitors/${id}/checks?limit=${limit}`);
}

export async function getMonitorIncidents(id: number): Promise<{ incidents: Incident[] }> {
  return request(`/monitors/${id}/incidents`);
}

export async function getMonitorOpenIncident(id: number): Promise<{ incident: Incident | null }> {
  return request(`/monitors/${id}/open-incident`);
}

export async function getMonitorUptime(id: number, days = 30): Promise<UptimeStats> {
  return request(`/monitors/${id}/uptime?days=${days}`);
}
