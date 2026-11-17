// Nextcloud Talk (self-hosted, guest-join flow) selectors — the JOIN layer's read
// surface (join / admission / leave / removal). Capture and speaker-tile selectors
// are recording concerns and stay OUTSIDE this brick.
//
// Selectors below were verified against a LIVE Nextcloud 25 / Talk 25.0.7 deployment
// (workspace.axialtechinc.com) on 2026-11-17: guest name field `#textField.input-field__input`,
// submit `button.submit-button`, start-call `button.start-call-button--split`, the admission
// modal `button.join-call`, in-call `.app-spreed` + `button.leave-call`, and the media toggles
// `.audio-control-button` / `.video-control-button`.
//
// TEXT-SELECTOR SEMANTICS (Playwright): quoted `text="foo"` is EXACT match; unquoted `text=foo`
// is SUBSTRING (case-insensitive). `*Texts` exports are raw strings scanned inside page.evaluate().

// ---- Guest entry (pre-join) ----
export const nextcloudTalkNameInputSelector =
  '#textField.input-field__input, input[placeholder*="name" i], input[name="user"]';

export const nextcloudTalkSubmitNameSelectors: string[] = [
  'button.submit-button',
  'button[type="submit"]',
];

// The pre-join guest screen container — present before the name is submitted, gone after.
export const nextcloudTalkPrejoinIndicators: string[] = [
  '#textField.input-field__input',
  'button.submit-button',
];

// ---- Start / join the call ----
export const nextcloudTalkStartCallSelectors: string[] = [
  'button.start-call-button--split',
  'button.start-call-button',
  'button.action-item--single',
];

export const nextcloudTalkJoinCallSelectors: string[] = [
  'button.join-call',
  'button[data-testid*="join" i]',
  'button.action-button',
];

// ---- In-call indicators ----
export const nextcloudTalkLeaveCallSelectors: string[] = [
  'button.leave-call',
  '[aria-label="Leave call"]',
  'button[data-testid*="leave" i]',
];

// `.app-spreed.in-call` was observed in the live DOM once the call starts; the attribute
// form covers versions that move the flag to another container.
export const nextcloudTalkInCallIndicators: string[] = [
  '.app-spreed.in-call',
  '[class*="in-call"]',
];

// ---- Media toggles (best-effort mute; a recorder bot is receive-only) ----
export const nextcloudTalkMicToggleSelectors: string[] = [
  '.mic-toggle',
  '.audio-control-button',
  '[aria-label*="mute" i]',
  '[data-testid*="microphone" i]',
];

export const nextcloudTalkCameraToggleSelectors: string[] = [
  '.camera-toggle',
  '.video-control-button',
  '[aria-label*="camera" i]',
  '[data-testid*="camera" i]',
];

// ---- Rejection / end-of-call text (page.evaluate scans) ----
export const nextcloudTalkRejectionTexts = [
  'you have been removed from the call',
  'you have been kicked',
  'your request to join has been declined',
  'the conversation is no longer accessible',
];

export const nextcloudTalkRemovalTexts = [
  'the call has ended',
  'call ended',
  'you left the call',
  'the conversation has been closed',
];

// ---- Post-meeting / rejoin indicators ----
export const nextcloudTalkPostMeetingIndicators: string[] = [
  'button.start-call-button--split',
];
