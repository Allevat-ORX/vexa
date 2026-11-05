import type { Page } from "playwright";
import { log, logJSON, callJoiningCallback, BotConfig } from "../_host";
import {
  nextcloudTalkNameInputSelectors,
  nextcloudTalkSubmitNameSelectors,
  nextcloudTalkJoinButtonSelectors,
  nextcloudTalkModalJoinSelectors,
  nextcloudTalkAudioToggleSelectors,
  nextcloudTalkVideoToggleSelectors,
} from "./selectors";
import { waitForNextcloudTalkAdmission, isAdmitted } from "./admission";

export async function joinNextcloudTalkMeeting(
  page: Page,
  botConfig: BotConfig
): Promise<{ admitted: boolean }> {
  const meetingUrl = botConfig.meetingUrl;
  const botName = botConfig.botName || "Vexa AI Notetaker";

  log(`[NextcloudTalk] Starting join flow for ${meetingUrl} as "${botName}"`);
  await callJoiningCallback(botConfig);

  // 1. Navigate to the Talk room
  await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  // Dismiss any warning toasts (e.g. browser warning) if present so they don't block clicks
  try {
    const toastClose = page.locator('.toast-close, .toastify .toast-close, button[aria-label="Close"]').first();
    if (await toastClose.isVisible()) {
      await toastClose.click({ force: true });
    }
  } catch {
    // ignore
  }

  // 2. Handle guest name input if present
  let nameFilled = false;
  for (const selector of nextcloudTalkNameInputSelectors) {
    try {
      const input = page.locator(selector).first();
      if (await input.isVisible()) {
        await input.fill(botName);
        nameFilled = true;
        log(`[NextcloudTalk] Filled bot name "${botName}" via selector: ${selector}`);
        await page.waitForTimeout(500);

        // Click submit name button if present
        for (const submitSel of nextcloudTalkSubmitNameSelectors) {
          try {
            const submitBtn = page.locator(submitSel).first();
            if (await submitBtn.isVisible()) {
              await submitBtn.click({ force: true });
              log(`[NextcloudTalk] Clicked submit name button via selector: ${submitSel}`);
              await page.waitForTimeout(2000);
              break;
            }
          } catch {
            // try next submit selector
          }
        }
        break;
      }
    } catch {
      // try next name input selector
    }
  }

  // 3. Click the Join / Start call button in the room bar if not already in call
  if (!(await isAdmitted(page))) {
    for (const joinSel of nextcloudTalkJoinButtonSelectors) {
      try {
        const joinBtn = page.locator(joinSel).first();
        if (await joinBtn.isVisible()) {
          await joinBtn.click({ force: true });
          log(`[NextcloudTalk] Clicked room call button via selector: ${joinSel}`);
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        // try next join selector
      }
    }

    // 4. Handle pre-call media modal dialog
    // Ensure display name is filled if input is present in modal
    try {
      const modalNameInput = page.locator('div[role="dialog"] input[type="text"], .modal-container input[type="text"]').first();
      if (await modalNameInput.isVisible({ timeout: 1500 })) {
        const val = await modalNameInput.inputValue();
        if (!val || val.trim() === '') {
          await modalNameInput.fill(botName);
          log(`[NextcloudTalk] Filled display name "${botName}" inside modal`);
        }
      }
    } catch {
      // ignore
    }

    // Mute camera and microphone toggles if visible
    for (const camSel of nextcloudTalkVideoToggleSelectors) {
      try {
        const camBtn = page.locator(camSel).first();
        if (await camBtn.isVisible()) {
          await camBtn.click({ force: true });
          log("[NextcloudTalk] Clicked camera toggle to disable video");
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        // ignore
      }
    }

    for (const micSel of nextcloudTalkAudioToggleSelectors) {
      try {
        const micBtn = page.locator(micSel).first();
        if (await micBtn.isVisible()) {
          await micBtn.click({ force: true });
          log("[NextcloudTalk] Clicked mic toggle to mute audio");
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        // ignore
      }
    }

    // Click modal confirm join button (e.g. button.join-call)
    for (const modalJoinSel of nextcloudTalkModalJoinSelectors) {
      try {
        const modalBtn = page.locator(modalJoinSel).first();
        if (await modalBtn.isVisible({ timeout: 2500 })) {
          await modalBtn.click({ force: true });
          log(`[NextcloudTalk] Clicked modal dialog join confirmation button via selector: ${modalJoinSel}`);
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        // try next selector
      }
    }
  }

  // 5. Wait for admission & confirmation
  const timeoutMs = botConfig.automaticLeave?.waitingRoomTimeout || 60000;
  const admitted = await waitForNextcloudTalkAdmission(page, botConfig, timeoutMs);

  return { admitted };
}
