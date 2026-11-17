import { Page } from "playwright";
import { log, logJSON, callLeaveCallback, stopNextcloudRecording } from "../_host";
import { BotConfig } from "../_host";
import {
  nextcloudTalkMicToggleSelectors,
  nextcloudTalkCameraToggleSelectors,
  nextcloudTalkLeaveCallSelectors,
} from "./selectors";

/**
 * Best-effort media mute for a recorder bot. Talk renders the mic/camera toggles as
 * `.audio-control-button` / `.video-control-button` on current versions and reports the device
 * state through aria-label ("No audio" / "No camera" when off). We only click when the control is
 * present — guests with no device already enter muted, and a failed toggle must never block the join.
 */
export async function prepareForRecording(page: Page): Promise<void> {
  if (!page || page.isClosed()) return;
  try {
    const clicked = await page.evaluate((payload: { mic: string[]; cam: string[] }) => {
      const clickFirst = (sels: string[]): boolean => {
        for (const s of sels) {
          const el = document.querySelector(s) as HTMLElement | null;
          if (el) { el.click(); return true; }
        }
        return false;
      };
      const mic = clickFirst(payload.mic);
      const cam = clickFirst(payload.cam);
      return { mic, cam };
    }, { mic: nextcloudTalkMicToggleSelectors, cam: nextcloudTalkCameraToggleSelectors }).catch(() => null);
    log(`[NextcloudTalk] Media mute attempt: ${JSON.stringify(clicked ?? { mic: false, cam: false })}`);
  } catch (e: any) {
    logJSON({ level: "warn", msg: "[NextcloudTalk] Media mute failed; continuing", error_message: e?.message });
  }
}

export async function leaveNextcloudTalk(
  page: Page | null,
  botConfig?: BotConfig,
  reason: string = "manual_leave",
): Promise<boolean> {
  log(`[NextcloudTalk] Leaving call (reason: ${reason})`);

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
    try { await stopNextcloudRecording(page ?? undefined, botConfig); } catch { /* ignore */ }
    log("[NextcloudTalk] Page not available for leave — skipping UI leave");
    return true;
  }

  try {
    const clicked = await page.evaluate((selectors: string[]) => {
      for (const sel of selectors) {
        const btn = document.querySelector(sel) as HTMLElement | null;
        if (btn) { btn.click(); return sel; }
      }
      return null;
    }, nextcloudTalkLeaveCallSelectors).catch(() => null);

    if (clicked) {
      log(`[NextcloudTalk] Leave clicked (selector: ${clicked})`);
      await page.waitForTimeout(1500);
    } else {
      log("[NextcloudTalk] Leave selectors all missed — forcing navigation away");
      await page.goto("about:blank").catch(() => {});
      await page.waitForTimeout(1000);
    }
  } catch (e: any) {
    logJSON({
      level: "error",
      msg: "[NextcloudTalk] Error during leave",
      error_message: e?.message,
      leave_reason: reason,
    });
  }

  // Recording is a HOST concern — let the embedder drain its pipeline.
  try {
    await stopNextcloudRecording(page, botConfig);
  } catch (e: any) {
    logJSON({
      level: "error",
      msg: "[NextcloudTalk] Error stopping recording during leave",
      error_message: e?.message,
      leave_reason: reason,
    });
  }

  return true;
}
