/**
 * Standalone tests for the Nextcloud Talk URL builder/parser — the shape the bot relies on
 * before navigating to a Talk room (`https://<host>/call/<token>`).
 *
 * Run: npx tsx src/nextcloudtalk/join.test.ts
 */

import { buildNextcloudTalkMeetingUrl, parseNextcloudTalkToken } from "./join";

let passed = 0;
let failed = 0;

function expect(name: string, actual: any, expected: any) {
  if (actual === expected) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    passed++;
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`);
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function expectThrows(name: string, fn: () => any, msgMatch?: string) {
  try {
    fn();
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name} (expected throw, got value)`);
    failed++;
  } catch (e: any) {
    if (msgMatch && !String(e.message).includes(msgMatch)) {
      console.log(`  \x1b[31mFAIL\x1b[0m  ${name} (wrong message: ${e.message})`);
      failed++;
      return;
    }
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    passed++;
  }
}

console.log("\n=== parseNextcloudTalkToken ===");

expect("canonical room link", parseNextcloudTalkToken("https://workspace.axialtechinc.com/call/tsibay4z"), "tsibay4z");
expect("trailing slash", parseNextcloudTalkToken("https://cloud.example.org/call/abc123/"), "abc123");
expect("query preserved out of the token", parseNextcloudTalkToken("https://cloud.example.org/call/abc?x=1"), "abc");
expect("http accepted", parseNextcloudTalkToken("http://cloud.example.org/call/abc"), "abc");
expect("not a /call path → null", parseNextcloudTalkToken("https://cloud.example.org/index.php/call/abc"), null);
expect("other host → null", parseNextcloudTalkToken("https://meet.google.com/abc-defg-hij"), null);
expect("garbage → null", parseNextcloudTalkToken("not a url"), null);

console.log("\n=== buildNextcloudTalkMeetingUrl ===");

expect(
  "returns the URL unchanged (Talk reads no pre-join hash overrides)",
  buildNextcloudTalkMeetingUrl("https://workspace.axialtechinc.com/call/tsibay4z"),
  "https://workspace.axialtechinc.com/call/tsibay4z",
);
expectThrows(
  "non-/call URL rejected",
  () => buildNextcloudTalkMeetingUrl("https://workspace.axialtechinc.com/"),
  "Invalid Nextcloud Talk meeting URL",
);
expectThrows(
  "malformed URL rejected",
  () => buildNextcloudTalkMeetingUrl("workspace.axialtechinc.com/call/x"),
  "Invalid Nextcloud Talk meeting URL",
);

console.log(`\n=== summary: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
