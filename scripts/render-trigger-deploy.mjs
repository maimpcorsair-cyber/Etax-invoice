#!/usr/bin/env node

const DEFAULT_SERVICES = [
  {
    label: 'api',
    envId: 'RENDER_API_SERVICE_ID',
    fallbackEnvId: 'RENDER_SERVICE_ID',
    envName: 'RENDER_API_SERVICE_NAME',
    defaultName: 'etax-invoice-api',
  },
  {
    label: 'worker',
    envId: 'RENDER_WORKER_SERVICE_ID',
    envName: 'RENDER_WORKER_SERVICE_NAME',
    defaultName: 'etax-invoice-worker',
  },
];

const RENDER_API_BASE = 'https://api.render.com/v1';

function parseArgs(argv) {
  const options = {
    target: process.env.RENDER_TARGET || 'all',
    clearCache: process.env.RENDER_CLEAR_CACHE !== 'false',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') options.target = argv[++i] || options.target;
    else if (arg === '--service') options.target = argv[++i] || options.target;
    else if (arg === '--no-clear-cache') options.clearCache = false;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  RENDER_API_KEY=... node scripts/render-trigger-deploy.mjs [options]

Options:
  --target api|worker|all     Which Render service to deploy. Default: all
  --no-clear-cache            Do not clear Render build cache

Environment:
  RENDER_API_KEY              Required
  RENDER_API_SERVICE_ID       Preferred API service id
  RENDER_WORKER_SERVICE_ID    Preferred worker service id
  RENDER_SERVICE_ID           Backward-compatible API service id fallback
`);
}

function normalizeService(raw) {
  const service = raw?.service || raw;
  return {
    id: service?.id || raw?.id || '',
    name: service?.name || raw?.name || '',
  };
}

function normalizeDeploy(raw) {
  const deploy = raw?.deploy || raw;
  return {
    id: deploy?.id || raw?.id || '',
    status: deploy?.status || raw?.status || '',
    commitId: deploy?.commit?.id || '',
    commitMessage: deploy?.commit?.message || '',
  };
}

async function renderFetch(path, apiKey, options = {}) {
  const response = await fetch(`${RENDER_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for non-JSON errors.
  }

  if (!response.ok) {
    const printable = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`Render API ${response.status} ${response.statusText}: ${printable}`);
  }

  return body;
}

async function discoverServiceByName(apiKey, name) {
  const body = await renderFetch('/services?limit=100', apiKey);
  const entries = Array.isArray(body) ? body : body?.services || body?.data || [];
  const services = entries.map(normalizeService);
  return services.find((service) => service.name === name);
}

async function resolveService(apiKey, config) {
  const configuredId =
    process.env[config.envId] ||
    (config.fallbackEnvId ? process.env[config.fallbackEnvId] : '') ||
    '';
  const configuredName = process.env[config.envName] || config.defaultName;

  if (configuredId) {
    return {
      id: configuredId,
      name: configuredName,
    };
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

async function triggerDeploy(apiKey, service, clearCache) {
  const body = await renderFetch(`/services/${service.id}/deploys`, apiKey, {
    method: 'POST',
    body: JSON.stringify(clearCache ? { clearCache: 'clear' } : {}),
  });
  return normalizeDeploy(body);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    throw new Error('RENDER_API_KEY is required.');
  }

  const selectedServices = DEFAULT_SERVICES.filter((service) => {
    if (options.target === 'all') return true;
    return service.label === options.target || service.defaultName === options.target;
  });

  if (selectedServices.length === 0) {
    throw new Error(`Unknown target "${options.target}". Use api, worker, or all.`);
  }

  for (const config of selectedServices) {
    const service = await resolveService(apiKey, config);
    const deploy = await triggerDeploy(apiKey, service, options.clearCache);
    console.log(
      `Triggered ${service.name} (${service.id}): deploy=${deploy.id || '(unknown)'} status=${
        deploy.status || '(queued)'
      } commit=${deploy.commitId ? deploy.commitId.slice(0, 12) : '(pending)'}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
