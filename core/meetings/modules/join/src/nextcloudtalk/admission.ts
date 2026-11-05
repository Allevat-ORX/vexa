import type { Page } from "playwright";
import { log, callAwaitingAdmissionCallback, BotConfig } from "../_host";
import { nextcloudTalkLeaveButtonSelectors, nextcloudTalkModalJoinSelectors } from "./selectors";

export async function isAdmitted(page: Page): Promise<boolean> {
  // If pre-call modal or setup dialog is open, the bot is definitely not in the call yet
  try {
    const modalVisible = await page.evaluate(() => {
      const modal = document.querySelector('div[role="dialog"], .modal-container, .modal-mask, .modal-wrapper');
      return modal ? (modal as HTMLElement).offsetParent !== null : false;
    });
    if (modalVisible) {
      return false;
    }
  } catch {
    // ignore
  }

  // Canonical proof of being inside the call: leave button is visible
  for (const selector of nextcloudTalkLeaveButtonSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible()) {
        return true;
      }
    } catch {
      // try next selector
    }
  }

  return false;
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

    // If modal is still visible, retry clicking modal join button
    for (const modalJoinSel of nextcloudTalkModalJoinSelectors) {
      try {
        const modalBtn = page.locator(modalJoinSel).first();
        if (await modalBtn.isVisible()) {
          log(`[NextcloudTalk] Retrying click on modal join button via ${modalJoinSel}`);
          await modalBtn.click({ force: true });
          break;
        }
      } catch {
        // ignore
      }
    }

    // Call awaiting admission callback if still waiting
    await callAwaitingAdmissionCallback(botConfig);
    await page.waitForTimeout(2000);
  }

  log(`Timeout waiting for Nextcloud Talk admission (elapsed: ${Date.now() - start})`);
  return false;
}
