export interface User {
  id: number;
  name: string;
  email: string;
  telegram_chat_id: string | null;
  created_at: string;
}

export interface Monitor {
  id: number;
  user_id: number;
  name: string;
  url: string;
  interval_seconds: number;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
}

export interface CheckResultItem {
  id: number;
  monitor_id: number;
  is_up: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  checked_at: string;
}

export interface Incident {
  id: number;
  monitor_id: number;
  started_at: string;
  ended_at: string | null;
}

export interface UptimeStats {
  uptimePercentage: number;
  totalChecks: number;
  upChecks: number;
  days: number;
}
