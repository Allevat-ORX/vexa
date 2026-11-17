import { Page } from "playwright";
import { log, callAwaitingAdmissionCallback } from "../_host";
import { BotConfig } from "../_host";
import { checkEscalation, triggerEscalation, getEscalationExtensionMs } from "../shared/escalation";
import { AdmissionError } from "../shared/admission";
import {
  nextcloudTalkLeaveCallSelectors,
  nextcloudTalkInCallIndicators,
  nextcloudTalkPrejoinIndicators,
  nextcloudTalkRejectionTexts,
  nextcloudTalkRemovalTexts,
} from "./selectors";

/**
 * Check if the bot is confirmed inside a Talk call.
 *
 * Primary:   the in-call container flag (`.app-spreed.in-call` / `[class*="in-call"]`) — only
 *            rendered once Talk has entered the call, never on the pre-join screen.
 * Fallback1: the leave-call control is visible (pre-join screens have no such control).
 * Fallback2: the name-entry form is gone AND an in-call indicator exists.
 */
export async function isAdmitted(page: Page): Promise<boolean> {
  try {
    for (const sel of nextcloudTalkInCallIndicators) {
      const visible = await page.locator(sel).first().isVisible({ timeout: 400 }).catch(() => false);
      if (visible) return true;
    }
    for (const sel of nextcloudTalkLeaveCallSelectors) {
      const visible = await page.locator(sel).first().isVisible({ timeout: 400 }).catch(() => false);
      if (visible) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True while the guest entry (name) screen is still up. */
async function isOnPrejoin(page: Page): Promise<boolean> {
  return await page.evaluate((sels: string[]) => {
    return sels.some((s) => !!document.querySelector(s));
  }, nextcloudTalkPrejoinIndicators).catch(() => false);
}

/** Detect a removal / end-of-call (terminal states). */
async function isRejectedOrEnded(page: Page): Promise<string | null> {
  try {
    return await page.evaluate((texts: string[]) => {
      const bodyText = (document.body?.innerText || "").toLowerCase();
      for (const t of texts) if (bodyText.includes(t.toLowerCase())) return t;
      return null;
    }, [...nextcloudTalkRejectionTexts, ...nextcloudTalkRemovalTexts]).catch(() => null);
  } catch {
    return null;
  }
}

export async function waitForNextcloudTalkAdmission(
  page: Page,
  timeoutMs: number,
  botConfig: BotConfig,
): Promise<boolean> {
  if (!page) throw new Error("[NextcloudTalk] Page required for admission check");

  log("[NextcloudTalk] Checking admission state...");

  // Fast path: rooms with an active call admit immediately after the modal.
  if (await isAdmitted(page)) {
    log("[NextcloudTalk] Bot admitted immediately");
    return true;
  }

  // Guests can sit on the entry screen for a beat before start-call resolves; surface that state.
  if (await isOnPrejoin(page)) {
    log("[NextcloudTalk] Still on the guest name screen");
  }

  const startTime = Date.now();
  const pollInterval = 2000;
  let unknownStateDuration = 0;
  const effectiveTimeout = () => timeoutMs + getEscalationExtensionMs();

  while (Date.now() - startTime < effectiveTimeout()) {
    await page.waitForTimeout(pollInterval);

    const terminal = await isRejectedOrEnded(page);
    if (terminal) {
      log(`[NextcloudTalk] Terminal state during admission wait (matched: "${terminal}")`);
      throw new AdmissionError("denial", `Bot was rejected from the Talk call or the call ended (matched: "${terminal}")`);
    }

    if (await isAdmitted(page)) {
      log("[NextcloudTalk] Bot admitted — call is live");
      return true;
    }

    const prejoin = await isOnPrejoin(page);
    if (!prejoin) unknownStateDuration += pollInterval;
    else unknownStateDuration = 0;

    const elapsedMs = Date.now() - startTime;
    const escalation = checkEscalation(elapsedMs, timeoutMs, unknownStateDuration);
    if (escalation) {
      await triggerEscalation(botConfig, escalation.reason);
    }

    log(`[NextcloudTalk] Still waiting for admission... ${Math.round(elapsedMs / 1000)}s elapsed`);
  }

  throw new AdmissionError("lobby_timeout", `[NextcloudTalk] Bot not admitted within ${effectiveTimeout()}ms timeout`);
}

export async function checkForNextcloudTalkAdmissionSilent(page: Page): Promise<boolean> {
  if (!page) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isAdmitted(page)) return true;
    if (attempt < 2) await page.waitForTimeout(1000);
  }
  return false;
}
