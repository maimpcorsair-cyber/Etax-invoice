#!/usr/bin/env node

const RENDER_API_BASE = 'https://api.render.com/v1';

const DEFAULT_SERVICES = [
  {
    label: 'api',
    defaultName: 'etax-invoice-api',
    envId: 'RENDER_API_SERVICE_ID',
    fallbackEnvId: 'RENDER_SERVICE_ID',
    envName: 'RENDER_API_SERVICE_NAME',
  },
  {
    label: 'worker',
    defaultName: 'etax-invoice-worker',
    envId: 'RENDER_WORKER_SERVICE_ID',
    envName: 'RENDER_WORKER_SERVICE_NAME',
  },
];

function parseArgs(argv) {
  const options = {
    target: process.env.RENDER_TARGET || 'all',
    deploy: process.env.RENDER_DEPLOY_AFTER_SYNC !== 'false',
    dryRun: process.env.RENDER_SYNC_R2_DRY_RUN === 'true',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target' || arg === '--service') options.target = argv[++i] || options.target;
    else if (arg === '--no-deploy') options.deploy = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage:
  RENDER_API_KEY=... \\
  S3_BUCKET=... \\
  S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com \\
  AWS_ACCESS_KEY_ID=... \\
  AWS_SECRET_ACCESS_KEY=... \\
  node scripts/render-sync-r2-env.mjs [options]

Options:
  --target api|worker|all     Which Render service to update. Default: all
  --no-deploy                 Update env vars without triggering deploys
  --dry-run                   Print intended key/service changes only

Accepted aliases:
  R2_BUCKET -> S3_BUCKET
  R2_ACCESS_KEY_ID -> AWS_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY -> AWS_SECRET_ACCESS_KEY
  CLOUDFLARE_ACCOUNT_ID -> builds S3_ENDPOINT when S3_ENDPOINT is absent

Required:
  RENDER_API_KEY
  S3_BUCKET, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

Optional:
  S3_REGION defaults to auto for Cloudflare R2
  RENDER_API_SERVICE_ID / RENDER_SERVICE_ID
  RENDER_WORKER_SERVICE_ID
`);
      process.exit(0);
    }
  }

  return options;
}

function envValue(primary, fallback) {
  return process.env[primary] || (fallback ? process.env[fallback] : '') || '';
}

function buildR2Env() {
  const endpoint =
    process.env.S3_ENDPOINT ||
    (process.env.CLOUDFLARE_ACCOUNT_ID
      ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : '');

  return {
    S3_BUCKET: envValue('S3_BUCKET', 'R2_BUCKET'),
    S3_REGION: process.env.S3_REGION || 'auto',
    S3_ENDPOINT: endpoint,
    AWS_ACCESS_KEY_ID: envValue('AWS_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: envValue('AWS_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY'),
  };
}

function assertRequired(apiKey, r2Env, dryRun) {
  const missing = [];
  if (!apiKey && !dryRun) missing.push('RENDER_API_KEY');
  for (const [key, value] of Object.entries(r2Env)) {
    if (!value) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function normalizeService(raw) {
  const service = raw?.service || raw;
  return {
    id: service?.id || raw?.id || '',
    name: service?.name || raw?.name || '',
  };
}

async function renderFetch(path, apiKey, options = {}) {
  const url = new URL(`${RENDER_API_BASE}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`Render API ${res.status} ${res.statusText}: ${detail}`);
  }

  return body;
}

async function discoverServiceByName(apiKey, name) {
  const body = await renderFetch('/services', apiKey, { query: { limit: 100 } });
  const entries = Array.isArray(body) ? body : body?.services || body?.data || [];
  return entries.map(normalizeService).find((service) => service.name === name);
}

async function resolveService(apiKey, config) {
  const configuredId =
    process.env[config.envId] ||
    (config.fallbackEnvId ? process.env[config.fallbackEnvId] : '') ||
    '';
  const configuredName = process.env[config.envName] || config.defaultName;

  if (configuredId) {
    const raw = await renderFetch(`/services/${configuredId}`, apiKey);
    const service = normalizeService(raw);
    if (!service.id) service.id = configuredId;
    if (!service.name) service.name = configuredName;
    return service;
  }

  const service = await discoverServiceByName(apiKey, configuredName);
  if (!service?.id) {
    throw new Error(
      `Render service not found for ${config.label}. Set ${config.envId}` +
        (config.fallbackEnvId ? ` or ${config.fallbackEnvId}` : '') +
        `, or set ${config.envName}.`,
    );
  }
  return service;
}

async function setEnvVar(apiKey, service, key, value, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] ${service.name}: would set ${key}`);
    return;
  }

  await renderFetch(`/services/${service.id}/env-vars/${encodeURIComponent(key)}`, apiKey, {
    method: 'PUT',
    body: { value },
  });
  console.log(`${service.name}: set ${key}`);
}

async function triggerDeploy(apiKey, service, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] ${service.name}: would trigger deploy`);
    return;
  }

  const body = await renderFetch(`/services/${service.id}/deploys`, apiKey, {
    method: 'POST',
    body: { clearCache: 'clear' },
  });
  const deploy = body?.deploy || body;
  console.log(`${service.name}: deploy triggered (${deploy?.id || 'unknown id'})`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.RENDER_API_KEY;
  const r2Env = buildR2Env();
  assertRequired(apiKey, r2Env, options.dryRun);

  const selected = DEFAULT_SERVICES.filter((service) => {
    if (options.target === 'all') return true;
    return service.label === options.target || service.defaultName === options.target;
  });

  if (selected.length === 0) {
    throw new Error(`No Render services selected for target "${options.target}".`);
  }

  for (const config of selected) {
    const service = apiKey
      ? await resolveService(apiKey, config)
      : {
          id: '(dry-run unresolved)',
          name: process.env[config.envName] || config.defaultName,
        };
    console.log(`Render service: ${service.name} (${service.id})`);
    for (const [key, value] of Object.entries(r2Env)) {
      await setEnvVar(apiKey, service, key, value, options.dryRun);
    }
    if (options.deploy) await triggerDeploy(apiKey, service, options.dryRun);
  }

  console.log('R2 env sync complete. Values were not printed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
