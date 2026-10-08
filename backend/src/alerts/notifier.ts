/**
 * alerts/notifier.ts
 * Dispatches alert notifications when a monitor goes DOWN or RECOVERS.
 *
 * Requirements:
 * - If TELEGRAM_BOT_TOKEN and user's telegramChatId exist: sends message via Telegram Bot API (using fetch).
 * - Otherwise: logs the alert message clearly to the console.
 * - IMPORTANT: Alert dispatch failures must NEVER throw or break the check transaction.
 */

export interface AlertContext {
  monitorName: string;
  url: string;
  telegramChatId?: string | null;
  error?: string | null;
}

/**
 * Send an alert when a website first goes DOWN.
 */
export async function sendDownAlert(ctx: AlertContext): Promise<void> {
  const reason = ctx.error ? ` Reason: ${ctx.error}` : "";
  const message = `🚨 DOWN ALERT: "${ctx.monitorName}" (${ctx.url}) is unreachable!${reason}`;

  await dispatchAlert(message, ctx.telegramChatId);
}

/**
 * Send an alert when a website RECOVERS and is back UP.
 */
export async function sendRecoveredAlert(ctx: AlertContext): Promise<void> {
  const message = `✅ RECOVERY ALERT: "${ctx.monitorName}" (${ctx.url}) is back UP and healthy!`;

  await dispatchAlert(message, ctx.telegramChatId);
}

/**
 * Internal helper to send via Telegram or fallback to console.
 */
async function dispatchAlert(message: string, chatId?: string | null): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (token && chatId) {
    try {
      const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      });

      if (!response.ok) {
        console.warn(`Telegram API warning: status ${response.status}`);
      }
      return;
    } catch (err) {
      // Alert failures must NOT break the monitoring flow or throw exceptions
      console.warn("Failed to deliver Telegram alert:", err);
      return;
    }
  }

  // Fallback: log alert to standard output when Telegram is not configured
  console.log(`[ALERT NOTIFICATION] ${message}`);
}
