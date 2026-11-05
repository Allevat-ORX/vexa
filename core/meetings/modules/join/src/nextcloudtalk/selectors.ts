// Centralized Nextcloud Talk selectors and indicators
// Compatible with Nextcloud 28+ / 35+ Spreed / Talk Vue 3 interface.

export const nextcloudTalkNameInputSelectors: string[] = [
  '#textField.input-field__input',
  'input.input-field__input',
  'input[placeholder*="Convidat"]',
  'input[placeholder*="Guest"]',
  'input[placeholder*="Invitado"]',
  'input[placeholder*="name" i]',
  'input[placeholder*="nom" i]',
  'input[type="text"]:visible',
];

export const nextcloudTalkSubmitNameSelectors: string[] = [
  'button.submit-button',
  'button:has-text("Envia el nom")',
  'button:has-text("Submit name")',
  'button:has-text("Enviar nombre")',
  'button.button-vue--primary:has-text("uneix-te")',
  'button.button-vue--primary:has-text("join")',
  'button.button-vue--primary:has-text("unirse")',
];

export const nextcloudTalkJoinButtonSelectors: string[] = [
  'button.start-call-button--split',
  'button[aria-label*="trucada" i]',
  'button[aria-label*="call" i]',
  'button[aria-label*="llamada" i]',
  'button:has-text("Inicia trucada")',
  'button:has-text("Start call")',
  'button:has-text("Iniciar llamada")',
  'button:has-text("Uneix-te a la trucada")',
  'button:has-text("Join call")',
  'button:has-text("Unirse a la llamada")',
];

export const nextcloudTalkAudioToggleSelectors: string[] = [
  'button.top-bar__button-toggle-audio',
  'button[aria-label*="micro" i]',
  'button[aria-label*="mic" i]',
  'button[aria-label*="audio" i]',
];

export const nextcloudTalkVideoToggleSelectors: string[] = [
  'button.top-bar__button-toggle-video',
  'button[aria-label*="vídeo" i]',
  'button[aria-label*="video" i]',
  'button[aria-label*="càmera" i]',
  'button[aria-label*="cámara" i]',
  'button[aria-label*="cam" i]',
];

export const nextcloudTalkInCallIndicators: string[] = [
  '.video-grid',
  '.call-container',
  'button.top-bar__button-leave-call',
  'button[aria-label*="surt" i]',
  'button[aria-label*="leave" i]',
  'button[aria-label*="salir" i]',
  '.participant-grid',
  '.video-container',
];

export const nextcloudTalkLeaveButtonSelectors: string[] = [
  'button.top-bar__button-leave-call',
  'button.leave-call',
  'button[aria-label*="Surt de la trucada" i]',
  'button[aria-label*="Leave call" i]',
  'button[aria-label*="Salir de la llamada" i]',
  'button.button-vue--danger',
];
