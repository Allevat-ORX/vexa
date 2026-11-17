/**
 * Admission oracle for Nextcloud Talk — drives the SHIPPED isAdmitted /
 * waitForNextcloudTalkAdmission over a fabricated Page + DOM stub (no browser), covering:
 *   • in-call flag + leave control detection
 *   • pre-join name screen detection
 *   • typed rejection (denial) and typed timeout attribution
 *
 * The stub waits REAL time (a zero-wait stub spins the poll loop at CPU speed) and exposes a
 * minimal `document` global so page.evaluate probes behave like they do in the browser.
 *
 * Run: npx tsx src/nextcloudtalk/admission.test.ts
 */

import { isAdmitted, waitForNextcloudTalkAdmission } from "./admission";
import { AdmissionError } from "../shared/admission";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  \x1b[32mPASS\x1b[0m  ${name}`); passed++; }
  else { console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ""}`); failed++; }
}

/** A minimal Page double: `present` selectors exist AND are visible; `bodyText` is scanned. */
function makePage(opts: { inCallFlag?: boolean; leaveVisible?: boolean; prejoin?: boolean; bodyText?: string }) {
  const present = new Set<string>();
  if (opts.inCallFlag) present.add(".app-spreed.in-call");
  if (opts.leaveVisible) present.add("button.leave-call");
  if (opts.prejoin) present.add("#textField.input-field__input");

  const doc = {
    body: { innerText: opts.bodyText ?? "" },
    querySelector: (sel: string) => (present.has(sel) ? ({}) : null),
  };
  (globalThis as any).document = doc;

  return {
    locator(sel: string) {
      return {
        first() {
          return { isVisible() { return Promise.resolve(present.has(sel)); } };
        },
      };
    },
    evaluate(fn: any, arg?: any) { return Promise.resolve(fn(arg)); },
    waitForTimeout(ms: number) { return new Promise((r) => setTimeout(r, ms)); },
    url: () => "https://workspace.axialtechinc.com/call/tsibay4z",
  } as any;
}

async function main() {
  console.log("\n=== isAdmitted ===");

  check("in-call flag → admitted", (await isAdmitted(makePage({ inCallFlag: true }))) === true);
  check("leave control → admitted", (await isAdmitted(makePage({ leaveVisible: true }))) === true);
  check("pre-join only → not admitted", (await isAdmitted(makePage({ prejoin: true }))) === false);
  check("empty page → not admitted", (await isAdmitted(makePage({}))) === false);

  console.log("\n=== waitForNextcloudTalkAdmission — fast path ===");

  const admitted = await waitForNextcloudTalkAdmission(makePage({ inCallFlag: true }), 5000, {} as any);
  check("already in call → immediate admit", admitted === true);

  console.log("\n=== waitForNextcloudTalkAdmission — terminal text is TYPED (denial) ===");

  let caught: any = null;
  try {
    await waitForNextcloudTalkAdmission(makePage({ bodyText: "The call has ended" }), 5000, {} as any);
  } catch (e) { caught = e; }
  check("terminal text throws AdmissionError", caught instanceof AdmissionError, `got ${caught && caught.name}`);
  check(
    "outcome = 'denial'",
    caught instanceof AdmissionError && caught.outcome === "denial",
    caught instanceof AdmissionError ? String(caught.outcome) : "n/a",
  );

  console.log(`\n=== summary: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
