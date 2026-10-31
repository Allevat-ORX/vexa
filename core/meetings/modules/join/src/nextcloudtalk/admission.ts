import type { Page } from "playwright";
import { log, callAwaitingAdmissionCallback, BotConfig } from "../_host";
import { nextcloudTalkInCallIndicators } from "./selectors";

export async function isAdmitted(page: Page): Promise<boolean> {
  // Check DOM indicators for in-call state
  for (const selector of nextcloudTalkInCallIndicators) {
    try {
      if (await page.locator(selector).first().isVisible()) {
        return true;
      }
    } catch {
      // try next selector
    }
  }

  // Check WebRTC media streams directly in page context
  const hasMedia = await page.evaluate(() => {
    try {
      const mediaElements = Array.from(document.querySelectorAll('video, audio')) as (HTMLMediaElement)[];
      return mediaElements.some(m => m.srcObject !== null || !m.paused);
    } catch {
      return false;
    }
  }).catch(() => false);

  return hasMedia;
}

export async function waitForNextcloudTalkAdmission(
  page: Page,
  botConfig: BotConfig,
  timeoutMs: number = 60000
): Promise<boolean> {
  const start = Date.now();
  log(`Waiting for Nextcloud Talk admission (timeoutMs: ${timeoutMs})`);

  while (Date.now() - start < timeoutMs) {
    if (await isAdmitted(page)) {
      log("Successfully admitted to Nextcloud Talk call!");
      return true;
    }

    // Call awaiting admission callback if still waiting
    await callAwaitingAdmissionCallback(botConfig);
    await page.waitForTimeout(2000);
  }

  log(`Timeout waiting for Nextcloud Talk admission (elapsed: ${Date.now() - start})`);
  return false;
}
