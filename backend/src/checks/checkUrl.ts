/**
 * checkUrl:
 * Sends an HTTP GET request to the target URL and measures if it is UP or DOWN.
 *
 * Requirements:
 * 1. Any 2xx status code (200-299) = UP. Redirects (3xx) are followed automatically.
 * 2. Any other status code (4xx, 5xx) or network failure (timeout, connection refused) = DOWN.
 * 3. Never throws: all exceptions are caught and returned as isUp = false with an error message.
 * 4. Response time is measured in milliseconds. If the site is unreachable (offline/timeout),
 *    statusCode and responseMs are null.
 */

export interface CheckResult {
  isUp: boolean;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
}

export async function checkUrl(url: string): Promise<CheckResult> {
  // Read timeout limit from environment variable, safely falling back to 10000 ms if missing or invalid
  const rawTimeout = process.env.CHECK_TIMEOUT_MS;
  const parsedTimeout = rawTimeout ? parseInt(rawTimeout, 10) : NaN;
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000;

  // We use AbortController to cancel the request if the server takes longer than timeoutMs
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const startTime = Date.now();

  try {
    // Native fetch follows redirects by default (redirect: 'follow')
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "UptimeMonitorBot/1.0",
      },
    });

    const elapsedMs = Date.now() - startTime;
    const isUp = response.status >= 200 && response.status < 300;

    return {
      isUp,
      statusCode: response.status,
      responseMs: elapsedMs,
      error: isUp ? null : `HTTP status ${response.status} ${response.statusText}`.trim(),
    };
  } catch (err: unknown) {
    // If the controller was aborted, it means the request exceeded our timeout threshold
    if (controller.signal.aborted) {
      return {
        isUp: false,
        statusCode: null,
        responseMs: null,
        error: `Request timed out after ${timeoutMs}ms`,
      };
    }

    // For any other network error (DNS failure, connection refused, invalid URL)
    const message = err instanceof Error ? err.message : String(err);
    return {
      isUp: false,
      statusCode: null,
      responseMs: null,
      error: message,
    };
  } finally {
    // Always clear the timeout to prevent open timers in the Node event loop
    clearTimeout(timer);
  }
}
