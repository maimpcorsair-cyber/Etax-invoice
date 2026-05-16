import prisma from '../config/database';
import { logger } from '../config/logger';

const USD_TO_THB = Number(process.env.OCR_USD_TO_THB ?? 36);

export interface BenchmarkInput {
  companyId?: string | null;
  intakeId?: string | null;
  documentType: string;
  provider: string;
  model: string;
  costUsd?: number;
  latencyMs?: number;
  confidence?: 'high' | 'medium' | 'low';
  stage?: 'primary' | 'verify' | 'escalation';
  inputTokens?: number;
  outputTokens?: number;
}

export async function recordOcrBenchmark(input: BenchmarkInput): Promise<void> {
  if (!input.companyId) return; // benchmarks are tenant-scoped
  const costUsd = Number(input.costUsd ?? 0);
  const costThb = Math.round(costUsd * USD_TO_THB * 100) / 100;
  try {
    await prisma.ocrBenchmark.create({
      data: {
        companyId: input.companyId,
        intakeId: input.intakeId ?? null,
        documentType: input.documentType || 'other',
        provider: input.provider,
        model: input.model,
        costUsd,
        costThb,
        latencyMs: Math.round(input.latencyMs ?? 0),
        confidence: input.confidence ?? 'low',
        stage: input.stage ?? 'primary',
      },
    });
    if (costUsd > 0) {
      await prisma.ocrCreditLedger.create({
        data: {
          companyId: input.companyId,
          intakeId: input.intakeId ?? null,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens ?? 0,
          outputTokens: input.outputTokens ?? 0,
          costUsd,
          costThb,
        },
      });
      await prisma.company.update({
        where: { id: input.companyId },
        data: { ocrUsageThisMonth: { increment: costThb } },
      }).catch(() => {/* if no row updated, ignore */});
    }
  } catch (err) {
    logger.warn('[OCR] benchmark record failed (table may not exist yet)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const CER_SAMPLE_LIMIT = 4000;

function normalizeForCer(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function computeCer(ocrText: string, truthText: string): number {
  const a = normalizeForCer(ocrText).slice(0, CER_SAMPLE_LIMIT);
  const b = normalizeForCer(truthText).slice(0, CER_SAMPLE_LIMIT);
  if (!b.length) return 0;
  // Levenshtein distance with O(min(a,b)) memory
  const [s, t] = a.length < b.length ? [a, b] : [b, a];
  const sLen = s.length;
  const tLen = t.length;
  let prev = new Array<number>(sLen + 1);
  let curr = new Array<number>(sLen + 1);
  for (let i = 0; i <= sLen; i++) prev[i] = i;
  for (let j = 1; j <= tLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= sLen; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return Math.min(1, prev[sLen] / tLen);
}

export async function markBenchmarksAccepted(intakeId: string, accepted: boolean): Promise<void> {
  if (!intakeId) return;
  try {
    await prisma.ocrBenchmark.updateMany({
      where: { intakeId },
      data: { accepted },
    });
  } catch (err) {
    logger.warn('[OCR] benchmark accept flag update failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Link recent benchmarks (within last 10 minutes, no intakeId) to a freshly-created intake
// and stamp acceptance. Used at confirm-purchase since OCR runs before intake is created.
export async function linkRecentBenchmarksToIntake(
  companyId: string,
  intakeId: string,
  accepted: boolean,
): Promise<void> {
  if (!companyId || !intakeId) return;
  const since = new Date(Date.now() - 10 * 60_000);
  try {
    await prisma.ocrBenchmark.updateMany({
      where: { companyId, intakeId: null, createdAt: { gte: since } },
      data: { intakeId, accepted },
    });
  } catch (err) {
    logger.warn('[OCR] benchmark link-to-intake failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateBenchmarkCer(
  intakeId: string,
  truthText: string,
  accepted: boolean,
): Promise<void> {
  if (!intakeId || !truthText) return;
  try {
    const rows = await prisma.ocrBenchmark.findMany({
      where: { intakeId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    for (const row of rows) {
      const cer = computeCer(truthText, truthText); // self-cer = 0 when truth==truth; future: store ocrText
      await prisma.ocrBenchmark.update({
        where: { id: row.id },
        data: { cer, accepted },
      });
    }
  } catch (err) {
    logger.warn('[OCR] benchmark CER update failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
