// Single source of truth for the current Privacy/ToS/DPA bundle version.
// Bump this string (date-stamped) whenever the legal i18n in
// frontend/src/i18n/locales/{th,en,zh}.json#legal.* is materially updated.
// On bump, every existing user whose `User.legalAcceptedVersion` is older
// will be served the re-consent modal before they can continue using the app.
export const CURRENT_LEGAL_VERSION = '2026-05-19';
