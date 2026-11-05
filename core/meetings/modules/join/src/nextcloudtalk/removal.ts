import type { Page } from "playwright";
import { log } from "../_host";
import { isAdmitted } from "./admission";

/**
 * Poll for removal / end-of-call in Nextcloud Talk.
 * Returns a cleanup fn that stops polling.
 */
export function startNextcloudTalkRemovalMonitor(
  page: Page | null,
  onRemoval?: () => void | Promise<void>,
): () => void {
  if (!page) return () => {};

  let stopped = false;
  let consecutiveNotAdmitted = 0;
  const NOT_ADMITTED_THRESHOLD = 3; // 3 misses × 3s poll = 9s
  const joinedAtMs = Date.now();
  const GRACE_PERIOD_MS = 20_000;

  const origin = (() => {
    try {
      return new URL(page.url()).origin;
    } catch {
      return null;
    }
  })();

  const triggerRemoval = async (reason: string) => {
    if (stopped) return;
    stopped = true;
    const elapsed = ((Date.now() - joinedAtMs) / 1000).toFixed(1);
    log(`[NextcloudTalk] REMOVAL TRIGGERED (${elapsed}s after join): ${reason}`);
    log(`[NextcloudTalk] Current URL at removal: ${page.url()}`);
    if (onRemoval) await onRemoval();
  };

  const onNavigated = (frame: any) => {
    if (stopped || frame !== page.mainFrame()) return;
    const url: string = frame.url();
    if (!url || url.startsWith("about:")) return;
    if (Date.now() - joinedAtMs < GRACE_PERIOD_MS) return;
    try {
      if (origin && new URL(url).origin !== origin) {
        triggerRemoval(`Navigation away from the Nextcloud deployment: ${url}`);
      }
    } catch {
      /* unparsable URL */
    }
  };
  page.on("framenavigated", onNavigated);

  const poll = async () => {
    if (stopped || !page || page.isClosed()) return;

    try {
      if (Date.now() - joinedAtMs >= GRACE_PERIOD_MS) {
        const admitted = await isAdmitted(page);
        if (!admitted) {
          consecutiveNotAdmitted++;
          if (consecutiveNotAdmitted >= NOT_ADMITTED_THRESHOLD) {
            await triggerRemoval(`Nextcloud Talk in-call indicators absent ${consecutiveNotAdmitted}x`);
            return;
          }
        } else {
          consecutiveNotAdmitted = 0;
        }
      }
    } catch {
      await triggerRemoval("Exception in removal poll — page likely navigated away");
      return;
    }

    if (!stopped) {
      setTimeout(poll, 3000);
    }
  };

  setTimeout(poll, 3000);

  return () => {
    stopped = true;
    page.off("framenavigated", onNavigated);
    log("[NextcloudTalk] Removal monitor stopped");
  };
}
