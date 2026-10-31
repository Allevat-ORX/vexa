import type { Page } from "playwright";
import { log, logJSON, callJoiningCallback, BotConfig } from "../_host";
import {
  nextcloudTalkNameInputSelectors,
  nextcloudTalkSubmitNameSelectors,
  nextcloudTalkJoinButtonSelectors,
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
  await page.waitForTimeout(2000);

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
              await submitBtn.click();
              log(`[NextcloudTalk] Clicked submit name button via selector: ${submitSel}`);
              await page.waitForTimeout(1500);
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

  // 3. Mute camera and microphone to be receive-only
  for (const camSel of nextcloudTalkVideoToggleSelectors) {
    try {
      const camBtn = page.locator(camSel).first();
      if (await camBtn.isVisible()) {
        await camBtn.click();
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
        await micBtn.click();
        log("[NextcloudTalk] Clicked mic toggle to mute audio");
        await page.waitForTimeout(300);
        break;
      }
    } catch {
      // ignore
    }
  }

  // 4. Click the Join / Start call button if not already in call
  if (!(await isAdmitted(page))) {
    for (const joinSel of nextcloudTalkJoinButtonSelectors) {
      try {
        const joinBtn = page.locator(joinSel).first();
        if (await joinBtn.isVisible()) {
          await joinBtn.click();
          log(`[NextcloudTalk] Clicked join button via selector: ${joinSel}`);
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        // try next join selector
      }
    }
  }

  // 5. Wait for admission & media stream confirmation
  const timeoutMs = botConfig.automaticLeave?.waitingRoomTimeout || 60000;
  const admitted = await waitForNextcloudTalkAdmission(page, botConfig, timeoutMs);

  return { admitted };
}
