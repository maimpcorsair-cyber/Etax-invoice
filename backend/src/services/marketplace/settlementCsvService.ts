export interface MarketplaceSettlementMapping {
  externalRef: string;
  settledAt?: string | null;
  gross?: string | null;
  fee?: string | null;
  refund?: string | null;
  adjustment?: string | null;
  net?: string | null;
}

export interface ParsedMarketplaceSettlement {
  externalRef: string;
  settledAt: Date | null;
  gross: number;
  fee: number;
  refund: number;
  adjustment: number;
  net: number;
}

export interface SettlementCsvPreview {
  headers: string[];
  rows: string[][];
  guessedMapping: MarketplaceSettlementMapping;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvRows(buffer: Buffer): { headers: string[]; rows: string[][] } {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  return {
    headers: splitCsvLine(lines[0]),
    rows: lines.slice(1).map(splitCsvLine),
  };
}

export function guessSettlementMapping(headers: string[]): MarketplaceSettlementMapping {
  const find = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) ?? '';

  return {
    externalRef: find([/order.?id/, /order.?sn/, /transaction.?id/, /payout.?id/, /reference/, /ref\b/, /เลขที่/, /รายการ/]),
    settledAt: find([/settle/, /paid.?at/, /payout.?date/, /transaction.?date/, /\bdate\b/, /วันที่/]),
    gross: find([/gross/, /sales?.?amount/, /order.?amount/, /subtotal/, /ยอดขาย/, /ยอดรวม/]),
    fee: find([/fee/, /commission/, /platform.?fee/, /transaction.?fee/, /ค่าธรรมเนียม/, /คอมมิชชัน/]),
    refund: find([/refund/, /return/, /คืนเงิน/, /คืนสินค้า/]),
    adjustment: find([/adjust/, /other/, /rebate/, /ส่วนปรับ/, /ปรับปรุง/]),
    net: find([/net/, /settlement.?amount/, /payout.?amount/, /amount.?paid/, /เงินเข้า/, /ยอดสุทธิ/]),
  };
}

export function parseMoney(input?: string | null): number {
  if (!input) return 0;
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const negative = /^\(.*\)$/.test(trimmed) || /^-/.test(trimmed);
  const numeric = trimmed.replace(/[(),฿บาท\s]/g, '').replace(/[^\d.-]/g, '');
  const value = Number.parseFloat(numeric);
  if (!Number.isFinite(value)) return 0;
  return negative ? -Math.abs(value) : value;
}

export function parseSettlementDate(input?: string | null): Date | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    const dt = new Date(year, Number(slash[2]) - 1, Number(slash[1]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function parseSettlementCsv(buffer: Buffer, mapping: MarketplaceSettlementMapping): ParsedMarketplaceSettlement[] {
  const { headers, rows } = parseCsvRows(buffer);
  const idx = (name?: string | null) => (name ? headers.indexOf(name) : -1);
  const refIdx = idx(mapping.externalRef);
  if (refIdx < 0) throw new Error('externalRef column does not exist in CSV');

  const settledAtIdx = idx(mapping.settledAt);
  const grossIdx = idx(mapping.gross);
  const feeIdx = idx(mapping.fee);
  const refundIdx = idx(mapping.refund);
  const adjustmentIdx = idx(mapping.adjustment);
  const netIdx = idx(mapping.net);
  if (grossIdx < 0 && netIdx < 0) throw new Error('gross or net column is required');

  const parsed: ParsedMarketplaceSettlement[] = [];
  for (const cells of rows) {
    const externalRef = (cells[refIdx] ?? '').trim();
    if (!externalRef) continue;
    const gross = grossIdx >= 0 ? parseMoney(cells[grossIdx]) : 0;
    const fee = feeIdx >= 0 ? Math.abs(parseMoney(cells[feeIdx])) : 0;
    const refund = refundIdx >= 0 ? Math.abs(parseMoney(cells[refundIdx])) : 0;
    const adjustment = adjustmentIdx >= 0 ? parseMoney(cells[adjustmentIdx]) : 0;
    const net = netIdx >= 0 ? parseMoney(cells[netIdx]) : gross - fee - refund + adjustment;
    parsed.push({
      externalRef,
      settledAt: settledAtIdx >= 0 ? parseSettlementDate(cells[settledAtIdx]) : null,
      gross,
      fee,
      refund,
      adjustment,
      net,
    });
  }
  return parsed;
}
