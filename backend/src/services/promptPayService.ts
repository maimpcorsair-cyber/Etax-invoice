import QRCode from 'qrcode';

function formatAmount(amount: number) {
  return amount.toFixed(2);
}

function crc16(input: string) {
  let crc = 0xffff;
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string) {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function normalizeTarget(target: string) {
  const digits = target.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return `0066${digits.slice(1)}`;
  }
  return digits;
}

export function buildPromptPayPayload(target: string, amount: number, reference: string) {
  const normalizedTarget = normalizeTarget(target);
  const merchantInfo = tlv(
    '29',
    `${tlv('00', 'A000000677010111')}${tlv('01', normalizedTarget)}`,
  );
  const additionalData = tlv('62', tlv('05', reference.slice(0, 25)));

  const payloadWithoutCrc = [
    tlv('00', '01'),
    tlv('01', '12'),
    merchantInfo,
    tlv('53', '764'),
    tlv('54', formatAmount(amount)),
    tlv('58', 'TH'),
    additionalData,
    '6304',
  ].join('');

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}

export async function buildPromptPayQr(target: string, amount: number, reference: string) {
  const payload = buildPromptPayPayload(target, amount, reference);
  const imageDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });

  return {
    payload,
    imageDataUrl,
  };
}
