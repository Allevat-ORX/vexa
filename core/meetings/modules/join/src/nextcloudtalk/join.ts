import { Page } from "playwright";
import { log, callJoiningCallback } from "../_host";
import { BotConfig } from "../_host";
import { isAdmitted } from "./admission";
import {
  nextcloudTalkNameInputSelector,
  nextcloudTalkSubmitNameSelectors,
  nextcloudTalkStartCallSelectors,
  nextcloudTalkJoinCallSelectors,
} from "./selectors";

// NOTE vs the other platforms: Nextcloud Talk rooms live on a SELF-HOSTED deployment at an
// arbitrary host (https://<host>/call/<room-token>), so the join layer never rewrites or infers
// the host — the URL the embedder hands in IS the room. Per-speaker capture and recording are HOST
// concerns and stay outside this brick.

/**
 * Extract the room token from a Nextcloud Talk meeting URL (`/call/<token>`). Returns null when
 * the URL is not a Talk room link. The path form is validated but not reconstructed — the bot
 * always navigates to the caller-supplied URL.
 */
export function parseNextcloudTalkToken(meetingUrl: string): string | null {
  try {
    const url = new URL(meetingUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const m = url.pathname.match(/^\/call\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Build the navigation URL for a Talk room. Kept separate from the raw input so the flow has ONE
 * place that documents Talk's URL shape; currently it returns the URL unchanged (Talk reads no
 * pre-join config overrides from the hash — the guest name is typed into the real input).
 */
export function buildNextcloudTalkMeetingUrl(
  meetingUrl: string,
  _opts: { botName?: string } = {},
): string {
  const token = parseNextcloudTalkToken(meetingUrl);
  if (!token) {
    throw new Error(`Invalid Nextcloud Talk meeting URL (expected https://<host>/call/<token>): ${meetingUrl}`);
  }
  return meetingUrl;
}

async function clickFirst(page: Page, selectors: string[], timeoutMs: number): Promise<string | null> {
  for (const sel of selectors) {
    const clicked = await page.evaluate((s: string) => {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) return false;
      el.click();
      return true;
    }, sel).catch(() => false);
    if (clicked) return sel;
    const visible = await page.locator(sel).first().isVisible({ timeout: timeoutMs / selectors.length }).catch(() => false);
    if (visible) {
      await page.locator(sel).first().click({ timeout: timeoutMs / selectors.length }).catch(() => {});
      return sel;
    }
  }
  return null;
}

export async function joinNextcloudTalk(
  page: Page,
  meetingUrl: string,
  botName: string,
  botConfig: BotConfig,
): Promise<void> {
  if (!page) throw new Error("[NextcloudTalk] Page is required for Talk join");

  const navUrl = buildNextcloudTalkMeetingUrl(meetingUrl, { botName });
  log(`[NextcloudTalk] Navigating to: ${navUrl}`);
  await page.goto(navUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  // Notify the host: joining
  await callJoiningCallback(botConfig);

  // Some rooms auto-admit guests with a joined flag already set; bail early when the call UI
  // is already up so we never click through a stale start-call button.
  if (await isAdmitted(page)) {
    log("[NextcloudTalk] Already in call — nothing to enter");
    return;
  }

  // Guest entry screen ("Enter your name" + "Submit name and join").
  const nameField = page.locator(nextcloudTalkNameInputSelector).first();
  const haveNameField = await nameField
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (haveNameField) {
    // Real keyboard events — the name form enables its submit button on input.
    const current = await nameField.inputValue().catch(() => "");
    if (current !== botName) {
      await nameField.click({ timeout: 5000 }).catch(() => {});
      await nameField.fill("");
      await page.keyboard.type(botName, { delay: 25 });
    }
    log(`[NextcloudTalk] Name entered: "${botName}"`);

    const submitted = await clickFirst(page, nextcloudTalkSubmitNameSelectors, 8000);
    if (submitted) {
      log(`[NextcloudTalk] Name submitted (selector: ${submitted})`);
    } else {
      log("[NextcloudTalk] No submit-name button found — continuing");
    }
    await page.waitForTimeout(2000);
  } else {
    log("[NextcloudTalk] No guest name field detected — proceeding to start-call checks");
  }

  // Start the call (a guest entering a room without an active call must start one).
  const started = await clickFirst(page, nextcloudTalkStartCallSelectors, 12000);
  if (started) {
    log(`[NextcloudTalk] Start-call clicked (selector: ${started})`);
    await page.waitForTimeout(1500);
    // Admission dialog ("Join call") observed on Talk 25.0.7 after start-call.
    const joinedModal = await clickFirst(page, nextcloudTalkJoinCallSelectors, 6000);
    if (joinedModal) log(`[NextcloudTalk] Join modal confirmed (selector: ${joinedModal})`);
  } else {
    log("[NextcloudTalk] No start-call button found — a call may already be running; admission will verify");
  }
}
