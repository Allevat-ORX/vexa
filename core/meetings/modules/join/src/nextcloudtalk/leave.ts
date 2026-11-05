import type { Page } from "playwright";
import { log, logJSON, callLeaveCallback, BotConfig } from "../_host";
import { nextcloudTalkLeaveButtonSelectors } from "./selectors";

export async function leaveNextcloudTalk(
  page: Page | null,
  botConfig?: BotConfig,
  reason: string = "manual_leave"
): Promise<boolean> {
  log(`[NextcloudTalk] Leaving meeting (reason: ${reason})`);

  if (botConfig) {
    try {
      await callLeaveCallback(botConfig, reason);
    } catch (callbackError: any) {
      logJSON({
        level: "warn",
        msg: "[NextcloudTalk] Leave callback failed; continuing with leave attempt",
        error_message: callbackError?.message,
        leave_reason: reason,
      });
    }
  }

  if (!page || page.isClosed()) {
    log("[NextcloudTalk] Page not available for leave — skipping UI leave");
    return true;
  }

  try {
    // Attempt clicking the leave button
    for (const selector of nextcloudTalkLeaveButtonSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible()) {
          await btn.click({ force: true });
          log(`[NextcloudTalk] Clicked leave button (selector: ${selector})`);
          await page.waitForTimeout(1000);
          return true;
        }
      } catch {
        // try next selector
      }
    }

    // Fallback: navigate away to close WebRTC peer connection
    log("[NextcloudTalk] Leave selectors missed — navigating to about:blank");
    await page.goto("about:blank", { timeout: 5000 }).catch(() => {});
    return true;
  } catch (err: any) {
    logJSON({
      level: "error",
      msg: "[NextcloudTalk] Error during leave attempt",
      error_message: err?.message,
    });
    return false;
  }
}
