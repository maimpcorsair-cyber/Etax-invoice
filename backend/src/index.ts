import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './config/logger';
import { authRouter } from './routes/auth';
import { invoicesRouter } from './routes/invoices';
import { customersRouter } from './routes/customers';
import { productsRouter } from './routes/products';
import { auditRouter } from './routes/audit';
import { adminRouter } from './routes/admin';
import { systemRouter } from './routes/system';
import { paymentsRouter } from './routes/payments';
import { dashboardRouter } from './routes/dashboard';
import { authenticate } from './middleware/auth';
import { billingRouter, stripeWebhookRouter } from './routes/billing';
import { notificationsRouter } from './routes/notifications';
import { purchaseInvoicesRouter } from './routes/purchaseInvoices';
import { vatSummaryRouter } from './routes/vatSummary';
import { pp30Router } from './routes/pp30';

// ─── BullMQ Workers ──────────────────────────────────────────────────────────
// Workers must be imported to start listening on their queues.
// Each import triggers `new Worker(...)` which registers the worker with Redis.
import './queues/workers/pdfWorker';
import './queues/workers/rdSubmitWorker';
import './queues/workers/rdComplianceWorker'; // cron: runs on 10th of each month
import './queues/workers/billingRenewalWorker'; // cron: runs daily for renewal reminders

const app = express();
const PORT = process.env.PORT ?? 4000;

function getAllowedOrigins() {
  const configured = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'http://localhost:3000,http://app.localhost:3000,http://ops.localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured);
}

app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, getAllowedOrigins().has(origin));
  },
  credentials: true,
}));
app.use('/api/billing/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRouter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// 200 req/min per IP across all API routes
const limiter = rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

// 10 req/min per IP on auth routes (brute-force protection)
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Keep-alive endpoint — no auth required, used by UptimeRobot to prevent Render cold starts
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/logout', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);
app.use('/api/invoices', authenticate, invoicesRouter);
app.use('/api/invoices/:invoiceId/payments', authenticate, paymentsRouter);
app.use('/api/customers', authenticate, customersRouter);
app.use('/api/products', authenticate, productsRouter);
app.use('/api/audit', authenticate, auditRouter);
app.use('/api/admin', authenticate, adminRouter);
app.use('/api/system', authenticate, systemRouter);
app.use('/api/dashboard', authenticate, dashboardRouter);
app.use('/api/company', authenticate, dashboardRouter);
app.use('/api/notifications', authenticate, notificationsRouter);
app.use('/api/purchase-invoices', purchaseInvoicesRouter);
app.use('/api/vat-summary', vatSummaryRouter);
app.use('/api/pp30', pp30Router);

app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

app.listen(PORT, () => logger.info(`e-Tax Invoice API running on port ${PORT}`));

export default app;
