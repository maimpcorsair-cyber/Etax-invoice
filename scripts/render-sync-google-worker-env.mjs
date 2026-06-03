#!/usr/bin/env node

const RENDER_API_BASE = 'https://api.render.com/v1';

const API_SERVICE = {
  label: 'api',
  defaultName: 'etax-invoice-api',
  envId: 'RENDER_API_SERVICE_ID',
  fallbackEnvId: 'RENDER_SERVICE_ID',
  envName: 'RENDER_API_SERVICE_NAME',
};

const WORKER_SERVICE = {
  label: 'worker',
  defaultName: 'etax-invoice-worker',
  envId: 'RENDER_WORKER_SERVICE_ID',
  envName: 'RENDER_WORKER_SERVICE_NAME',
};

const COPY_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REDIRECT_URI',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CONFIG_ENCRYPTION_KEY',
  'JWT_SECRET',
];

function parseArgs(argv) {
  const options = {
    deploy: process.env.RENDER_DEPLOY_AFTER_SYNC !== 'false',
    dryRun: process.env.RENDER_SYNC_GOOGLE_DRY_RUN === 'true',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-deploy') options.deploy = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage:
  RENDER_API_KEY=... node scripts/render-sync-google-worker-env.mjs [options]

Copies Google Drive/Sheets and token-encryption env vars from the Render API
service to the Render worker service. Secret values are never printed.

Options:
  --no-deploy     Update env vars without triggering a worker deploy
  --dry-run       Print intended key changes only

Environment:
  RENDER_API_KEY
  RENDER_API_SERVICE_ID / RENDER_SERVICE_ID
  RENDER_WORKER_SERVICE_ID
`);
      process.exit(0);
    }
  }

  return options;
}

function normalizeService(raw) {
  const service = raw?.service || raw;
  return {
    id: service?.id || raw?.id || '',
    name: service?.name || raw?.name || '',
  };
}

function normalizeEnvVar(raw) {
  const envVar = raw?.envVar || raw;
  return {
    key: envVar?.key || raw?.key || '',
    value: envVar?.value ?? raw?.value ?? '',
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
    throw new Error(`Render service not found for ${config.label}. Set ${config.envId}, or set ${config.envName}.`);
  }
  return service;
}

async function listEnvVars(apiKey, service) {
  const body = await renderFetch(`/services/${service.id}/env-vars`, apiKey, { query: { limit: 100 } });
  const entries = Array.isArray(body) ? body : body?.envVars || body?.data || [];
  return new Map(entries.map(normalizeEnvVar).filter((entry) => entry.key).map((entry) => [entry.key, entry.value]));
}

function isMasked(value) {
  return typeof value === 'string' && /^\*{3,}$/.test(value.trim());
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
  if (!apiKey && !options.dryRun) throw new Error('RENDER_API_KEY is required.');

  const api = apiKey ? await resolveService(apiKey, API_SERVICE) : { id: '(dry-run unresolved)', name: API_SERVICE.defaultName };
  const worker = apiKey ? await resolveService(apiKey, WORKER_SERVICE) : { id: '(dry-run unresolved)', name: WORKER_SERVICE.defaultName };
  console.log(`Source Render service: ${api.name} (${api.id})`);
  console.log(`Target Render service: ${worker.name} (${worker.id})`);

  const sourceEnv = apiKey ? await listEnvVars(apiKey, api) : new Map();
  const copied = [];
  const missing = [];
  const unreadable = [];

  for (const key of COPY_KEYS) {
    const value = sourceEnv.get(key);
    if (!value) {
      missing.push(key);
      continue;
    }
    if (isMasked(value)) {
      unreadable.push(key);
      continue;
    }
    await setEnvVar(apiKey, worker, key, value, options.dryRun);
    copied.push(key);
  }

  console.log(`Copied ${copied.length} key(s): ${copied.join(', ') || '(none)'}`);
  if (missing.length) console.log(`Missing on API service, skipped: ${missing.join(', ')}`);
  if (unreadable.length) {
    throw new Error(`Render returned masked values for: ${unreadable.join(', ')}. Set those keys manually on the worker service.`);
  }
  if (!copied.length) throw new Error('No Google/Drive env vars were copied; API service does not expose the needed keys.');

  if (options.deploy) await triggerDeploy(apiKey, worker, options.dryRun);
  console.log('Google Drive worker env sync complete. Values were not printed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
