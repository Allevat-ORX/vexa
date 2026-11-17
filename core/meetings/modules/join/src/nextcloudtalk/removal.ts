import { Page } from "playwright";
import { log } from "../_host";
import { isAdmitted } from "./admission";
import {
  nextcloudTalkRemovalTexts,
  nextcloudTalkLeaveCallSelectors,
} from "./selectors";

/**
 * Poll for removal / end-of-call. Returns a cleanup fn that stops polling.
 *
 * Signals, strongest first:
 *   1. Leave-call control gone for N consecutive polls (the call UI unmounts on leave/kick).
 *   2. Removal/termination text ("The call has ended", "you have been removed", …).
 *   3. A post-meeting affordance (start-call button) visible while not admitted.
 * The in-call container flag is deliberately NOT used as a positive here: it disappears during
 * transient reconnects too, so the removal verdict pairs the missing leave control with a
 * post-meeting indicator before firing.
 */
export function startNextcloudTalkRemovalMonitor(
  page: Page | null,
  onRemoval?: () => void | Promise<void>,
): () => void {
  if (!page) return () => {};

  let stopped = false;
  let consecutiveLeaveMisses = 0;
  const LEAVE_MISS_THRESHOLD = 3; // 3 misses × 3s poll = 9s
  const joinedAtMs = Date.now();
  const GRACE_PERIOD_MS = 20_000;

  const triggerRemoval = async (reason: string) => {
    if (stopped) return;
    stopped = true;
    const elapsed = ((Date.now() - joinedAtMs) / 1000).toFixed(1);
    log(`[NextcloudTalk] REMOVAL TRIGGERED (${elapsed}s after join): ${reason}`);
    log(`[NextcloudTalk] Current URL at removal: ${page.url()}`);
    onRemoval && await onRemoval();
  };

  const poll = async () => {
    if (stopped || !page || page.isClosed()) return;

    try {
      const stillInCall = await isAdmitted(page);

      if (!stillInCall && Date.now() - joinedAtMs >= GRACE_PERIOD_MS) {
        consecutiveLeaveMisses++;
        if (consecutiveLeaveMisses >= LEAVE_MISS_THRESHOLD) {
          await triggerRemoval(`Leave-call control absent ${consecutiveLeaveMisses}x and call flag cleared`);
          return;
        }
      } else if (stillInCall) {
        if (consecutiveLeaveMisses > 0) {
          log(`[NextcloudTalk] Call UI recovered after ${consecutiveLeaveMisses} miss(es)`);
        }
        consecutiveLeaveMisses = 0;
      }

      const detected = await page.evaluate((texts: string[]) => {
        const bodyText = (document.body?.innerText || "").toLowerCase();
        return texts.find((t) => bodyText.includes(t.toLowerCase())) || null;
      }, nextcloudTalkRemovalTexts).catch(() => null);
      if (detected) {
        await triggerRemoval(`Removal detected via text: "${detected}"`);
        return;
      }
    } catch {
      await triggerRemoval("Exception in removal poll — page likely navigated away");
      return;
    }

    if (!stopped) setTimeout(poll, 3000);
  };

  setTimeout(poll, 3000);

  return () => {
    stopped = true;
    log("[NextcloudTalk] Removal monitor stopped");
  };
}
