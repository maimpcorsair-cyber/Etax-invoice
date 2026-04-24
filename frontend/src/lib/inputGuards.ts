const THAI_TEXT_PATTERN = /^[\u0E00-\u0E7F0-9\s.,()\/&+\-'"]*$/;
const ENGLISH_TEXT_PATTERN = /^[A-Za-z0-9\s.,()\/&+\-'"]*$/;
const THAI_TEXT_REQUIRED_PATTERN = /[\u0E00-\u0E7F]/;
const ENGLISH_TEXT_REQUIRED_PATTERN = /[A-Za-z]/;

export function digitsOnly(value: string, maxLength?: number) {
  const next = value.replace(/\D/g, '');
  return typeof maxLength === 'number' ? next.slice(0, maxLength) : next;
}

export function thaiTextOnly(value: string) {
  return Array.from(value).filter((char) => THAI_TEXT_PATTERN.test(char)).join('');
}

export function englishTextOnly(value: string) {
  return Array.from(value).filter((char) => ENGLISH_TEXT_PATTERN.test(char)).join('');
}

export function isThaiText(value: string, required = false) {
  const trimmed = value.trim();
  if (!trimmed) return !required;
  return THAI_TEXT_PATTERN.test(trimmed) && (!required || THAI_TEXT_REQUIRED_PATTERN.test(trimmed));
}

export function isEnglishText(value: string, required = false) {
  const trimmed = value.trim();
  if (!trimmed) return !required;
  return ENGLISH_TEXT_PATTERN.test(trimmed) && (!required || ENGLISH_TEXT_REQUIRED_PATTERN.test(trimmed));
}

export function isThirteenDigitId(value: string) {
  return /^\d{13}$/.test(value);
}

export function isFiveDigitBranchCode(value: string) {
  return /^\d{5}$/.test(value);
}

export function guardedInputClass(isInvalid: boolean, extra = '') {
  return `input-field ${extra} ${isInvalid ? 'border-amber-400 bg-amber-50 focus:ring-amber-500' : ''}`.trim();
}

export function inputGuide(isInvalid = false) {
  return `mt-1 text-xs ${isInvalid ? 'text-amber-700' : 'text-gray-400'}`;
}
