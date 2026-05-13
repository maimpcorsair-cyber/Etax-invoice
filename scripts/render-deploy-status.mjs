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
    commit: process.env.CHECK_COMMIT || process.env.GITHUB_SHA || '',
    limit: Number.parseInt(process.env.RENDER_DEPLOY_LIMIT || '10', 10),
    logs: process.env.RENDER_INCLUDE_LOGS !== 'false',
    requireCommitLive: process.env.RENDER_REQUIRE_COMMIT_LIVE !== 'false',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') options.target = argv[++i] || options.target;
    else if (arg === '--service') options.target = argv[++i] || options.target;
    else if (arg === '--commit') options.commit = argv[++i] || '';
    else if (arg === '--limit') options.limit = Number.parseInt(argv[++i] || '10', 10);
    else if (arg === '--no-logs') options.logs = false;
    else if (arg === '--allow-stale') options.requireCommitLive = false;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    options.limit = 10;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  RENDER_API_KEY=... node scripts/render-deploy-status.mjs [options]

Options:
  --target api|worker|all     Which Render service to inspect. Default: all
  --commit <sha>              Commit SHA to verify. Default: CHECK_COMMIT/GITHUB_SHA
  --limit <n>                 Number of recent deploys to inspect. Default: 10
  --no-logs                   Skip failed-build log lookup
  --allow-stale               Exit 0 even if the target commit is not live

Environment:
  RENDER_API_KEY              Required
  RENDER_API_SERVICE_ID       Preferred API service id
  RENDER_WORKER_SERVICE_ID    Preferred worker service id
  RENDER_SERVICE_ID           Backward-compatible API service id fallback
`);
}

function shortSha(sha) {
  return sha ? sha.slice(0, 12) : '';
}

function normalizeService(raw) {
  const service = raw?.service || raw;
  return {
    id: service?.id || raw?.id || '',
    name: service?.name || raw?.name || '',
    ownerId: service?.ownerId || service?.owner?.id || raw?.ownerId || raw?.owner?.id || '',
    raw,
  };
}

function normalizeDeploy(raw) {
  const deploy = raw?.deploy || raw;
  const commit = deploy?.commit || {};
  return {
    id: deploy?.id || raw?.id || '',
    status: deploy?.status || raw?.status || '',
    createdAt: deploy?.createdAt || raw?.createdAt || '',
    finishedAt: deploy?.finishedAt || raw?.finishedAt || '',
    failureReason: deploy?.failureReason || deploy?.failureReasonText || raw?.failureReason || '',
    commitId: commit?.id || '',
    commitMessage: commit?.message || '',
    raw,
  };
}

async function renderFetch(path, apiKey, params) {
  const url = new URL(`${RENDER_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text body; Render can return plain text for some errors.
  }

  if (!response.ok) {
    const printable = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`Render API ${response.status} ${response.statusText}: ${printable}`);
  }

  return body;
}

async function discoverServiceByName(apiKey, name) {
  const body = await renderFetch('/services', apiKey, { limit: 100 });
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
    try {
      const raw = await renderFetch(`/services/${configuredId}`, apiKey);
      const service = normalizeService(raw);
      if (!service.id) service.id = configuredId;
      if (!service.name) service.name = configuredName;
      return service;
    } catch (error) {
      console.warn(`Could not load service ${configuredId}; trying name lookup: ${error.message}`);
    }
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

async function listDeploys(apiKey, serviceId, limit) {
  const body = await renderFetch(`/services/${serviceId}/deploys`, apiKey, { limit });
  const entries = Array.isArray(body) ? body : body?.deploys || body?.data || [];
  return entries.map(normalizeDeploy);
}

async function fetchBuildLogs(apiKey, service, deploy) {
  if (!service.ownerId) {
    return ['Render owner id is unavailable; cannot query build logs.'];
  }

  const end = deploy.finishedAt || new Date().toISOString();
  const start = deploy.createdAt || new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const body = await renderFetch('/logs', apiKey, {
    ownerId: service.ownerId,
    resource: service.id,
    type: 'build',
    taskRun: deploy.id,
    startTime: start,
    endTime: end,
    direction: 'forward',
    limit: 100,
  });

  const entries = Array.isArray(body) ? body : body?.logs || body?.items || body?.data || [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return ['No Render build logs returned for this deploy id.'];
  }

  return entries.map((entry) => {
    const time = entry.timestamp || entry.time || entry.createdAt || '';
    const message = entry.message || entry.text || entry.log || entry.line || JSON.stringify(entry);
    return `${time}\t${message}`;
  });
}

function printDeployTable(deploys) {
  for (const deploy of deploys) {
    const commit = deploy.commitId ? `${shortSha(deploy.commitId)} ${deploy.commitMessage}` : '(no commit)';
    const finished = deploy.finishedAt ? ` finished=${deploy.finishedAt}` : '';
    console.log(`  - ${deploy.id} status=${deploy.status} commit=${commit}${finished}`);
  }
}

function commitMatches(deploy, commit) {
  if (!commit || !deploy.commitId) return false;
  return deploy.commitId === commit || deploy.commitId.startsWith(commit) || commit.startsWith(deploy.commitId);
}

async function inspectService(apiKey, config, options) {
  const service = await resolveService(apiKey, config);
  const deploys = await listDeploys(apiKey, service.id, options.limit);
  const latest = deploys[0];
  const matchingDeploys = options.commit
    ? deploys.filter((deploy) => commitMatches(deploy, options.commit))
    : [];
  const liveMatching = matchingDeploys.find((deploy) => deploy.status === 'live') || null;
  const matching = liveMatching || matchingDeploys[0] || null;
  const liveMatch = Boolean(liveMatching);

  console.log('');
  console.log(`Render service: ${service.name} (${service.id})`);
  if (options.commit) {
    console.log(`Expected commit: ${shortSha(options.commit)}`);
  }
  console.log('Recent deploys:');
  printDeployTable(deploys);

  if (latest) {
    console.log(`Latest deploy: ${latest.id} status=${latest.status} commit=${shortSha(latest.commitId) || '(none)'}`);
  }

  if (options.commit) {
    if (liveMatch) {
      console.log(`OK: commit ${shortSha(options.commit)} is live on ${service.name}.`);
      if (matchingDeploys[0]?.id && matchingDeploys[0].id !== liveMatching.id) {
        console.log(
          `Note: newer deploy ${matchingDeploys[0].id} for the same commit is currently ${matchingDeploys[0].status}.`,
        );
      }
    } else if (matching) {
      console.log(
        `NOT LIVE: commit ${shortSha(options.commit)} was found on ${service.name} with status=${matching.status}.`,
      );
    } else {
      console.log(`NOT FOUND: commit ${shortSha(options.commit)} was not found in the last ${deploys.length} deploys.`);
    }
  }

  const failed = (matching && matching.status !== 'live' ? matching : latest?.status?.includes('failed') ? latest : null);
  if (options.logs && failed?.id) {
    console.log(`Build logs for ${failed.id}:`);
    try {
      const lines = await fetchBuildLogs(apiKey, service, failed);
      for (const line of lines) console.log(`  ${line}`);
    } catch (error) {
      console.log(`  Could not fetch build logs: ${error.message}`);
    }
  }

  return !options.commit || liveMatch || !options.requireCommitLive;
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

  let ok = true;
  for (const service of selectedServices) {
    const serviceOk = await inspectService(apiKey, service, options);
    ok = ok && serviceOk;
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
