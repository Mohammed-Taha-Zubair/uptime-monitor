export interface ProbeResult {
  isUp: boolean;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
}

export const probeService = {
  /**
   * Executes an automated HTTP/HTTPS probe against a target endpoint.
   * Measures response latency and handles DNS/timeout/network errors cleanly.
   */
  async executeProbe(url: string, timeoutMs: number = 10000): Promise<ProbeResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "UptimeMonitorProbe/1.0 (+https://github.com/Mohammed-Taha-Zubair/uptime-monitor)",
        },
      });

      const latency = Math.round(performance.now() - startTime);
      clearTimeout(timeoutId);

      // Status code 2xx and 3xx are considered healthy
      const isUp = response.status >= 200 && response.status < 400;
      const errorMsg = isUp
        ? null
        : `HTTP ${response.status} ${response.statusText || "Response Unhealthy"}`;

      return {
        isUp,
        statusCode: response.status,
        responseMs: latency,
        error: errorMsg,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);

      let errorMessage = "Network check failed";
      if (err.name === "AbortError") {
        errorMessage = `Timeout after ${timeoutMs}ms`;
      } else if (err.cause?.code) {
        errorMessage = `Connection error: ${err.cause.code}`;
      } else if (err.message) {
        errorMessage = err.message;
      }

      return {
        isUp: false,
        statusCode: null,
        responseMs: latency > timeoutMs ? timeoutMs : latency,
        error: errorMessage,
      };
    }
  },
};
