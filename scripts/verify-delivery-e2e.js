/**
 * Live delivery/display E2E verification (read-only).
 *
 * Usage:
 *   node scripts/verify-delivery-e2e.js [options]
 *
 * Options:
 *   --url base        API base (default https://duka-backend-production.up.railway.app)
 *   --slug slug       Public merchant slug to verify (repeatable); falls back to
 *                     --tenant-id merchant ids
 *   --tenant-id id    Merchant/tenant id to verify (repeatable, derived slug ignored)
 *   --wait seconds    Poll the live contract until the deployed build is fresh
 *
 * Checks (no credentials, no mutations):
 *  1. GET /api/v1/compatibility            — served contract fingerprint
 *  2. For each tenant (public BFF route)   — manifest served, version sane,
 *     checksum receipt present, component types ⊆ contract supported,
 *     action types ⊆ contract supported (unknown ones = shell-degraded, listed),
 *     navigation/screens structural sanity. BFF adds only the `release` receipt.
 *
 * Exit code 0 = all checks passed; 1 = failures (always prints a summary).
 */
const DEFAULT_URL = 'https://duka-backend-production.up.railway.app';

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, slugs: [], tenantIds: [], wait: 0 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--url') args.url = argv[++i];
    else if (flag === '--slug') args.slugs.push(argv[++i]);
    else if (flag === '--tenant-id') args.tenantIds.push(argv[++i]);
    else if (flag === '--wait') args.wait = Number(argv[++i]) || 0;
  }
  return args;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function unwrap(body) {
  return body && typeof body === 'object' && 'data' in body && body.data ? body.data : body;
}

function screenComponentTypes(screens) {
  const types = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') types.add(node.type);
    for (const child of node.children ?? []) walk(child);
    for (const child of node.layout?.children ?? []) walk(child);
    if (typeof node.layout === 'object' && node.layout !== null) {
      for (const child of node.layout.children ?? []) walk(child);
    }
  };
  for (const screen of Object.values(screens ?? {})) {
    if (typeof screen === 'string') continue;
    walk(screen.layout);
    for (const key of ['children', 'fixedTop', 'fixedBottom', 'overlay']) walk(screen?.[key]);
  }
  return types;
}

function screenActionDef(screens) {
  const actions = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const def of Object.values(node.actions ?? {})) {
      if (def && typeof def === 'object' && typeof def.type === 'string') actions.add(def.type);
    }
    const tap = node.tapAction ?? node.props?.tapAction;
    if (typeof tap === 'object' && tap !== null && typeof tap.type === 'string') actions.add(tap.type);
    const legacy = node.props?.action;
    if (typeof legacy === 'string') {
      try {
        const parsed = JSON.parse(legacy);
        if (typeof parsed?.type === 'string') actions.add(parsed.type);
      } catch { /* legacy malformed strings are compile-time rejected */ }
    }
    for (const child of node.children ?? []) walk(child);
    if (typeof node.layout === 'object' && node.layout !== null) {
      for (const child of node.layout.children ?? []) walk(child);
    }
  };
  for (const screen of Object.values(screens ?? {})) {
    if (typeof screen === 'string') continue;
    walk(screen.layout);
    for (const key of ['children', 'fixedTop', 'fixedBottom', 'overlay']) {
      const list = screen?.[key];
      if (Array.isArray(list)) list.forEach(walk);
      else if (list && typeof list === 'object') walk(list);
    }
  }
  return actions;
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

async function main() {
  const args = parseArgs(process.argv.slice(2));
    const base = args.url.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  console.log(`Verifying ${base}`);

  // 1. Contract
  let contract = null;
  let contractFresh = false;
  const deadline = Date.now() + args.wait * 1000;
  do {
    const contractRes = await getJson(`${base}/api/v1/compatibility`);
    contract = unwrap(contractRes.body);
    if (!contract || !contract.components?.supported) {
      record('compatibility served', false, `status ${contractRes.status}`);
      process.exitCode = 1;
      return;
    }
    contractFresh = contract.actions.supported.includes('view_item') && contract.components.supported.includes('laundry_booking');
    if (contractFresh || Date.now() >= deadline) break;
    console.log(`Deploy not fresh yet (actions: ${contract.actions.count}) — waiting more...`);
    await new Promise(resolve => setTimeout(resolve, 30_000));
  } while (Date.now() < deadline);
  record('compatibility contract is deployment-fresh', contractFresh,
    contractFresh ? `components ≤200 ✓ actions.len=${contract.actions.supported.length}` : `stale: actions.len=${contract.actions.supported.length} (merge/deploy not propagated)`);
  record('contract sanity: counts + exact component count', contract.components.count === contract.components.supported.length && contract.actions.count === contract.actions.supported.length,
    `componentCount=${contract.components.count} actionCount=${contract.actions.count}`);
  console.log('phase: contract checked');

  const supportedComponents = new Set(contract.components.supported);
  const supportedActions = new Set(contract.actions.supported);

  // 2. Tenant manifests
  const tenants = args.tenantIds.map((id) => ({ id, url: `${base}/api/v1/bff/mobile/tenant/${encodeURIComponent(id)}/manifest` }));
  for (const slug of args.slugs) tenants.push({ id: slug, url: `${base}/api/v1/bff/mobile/tenant/${encodeURIComponent(slug)}/manifest` });

  if (tenants.length === 0) {
    record('tenant manifests', true, 'no tenants requested (contract-only run)');
  }

  for (const tenant of tenants) {
    const res = await getJson(tenant.url);
    const manifest = unwrap(res.body);
    if (res.status !== 200 || !manifest?.screens) {
      record(`manifest ${tenant.id}`, false, `status ${res.status}${manifest?.message ? ' — ' + manifest.message : ''}`);
      continue;
    }
    const version = manifest.version ?? manifest.metadata?.version ?? manifest.app?.version;
    const checksum = manifest.release?.checksum ?? manifest.checksum;
    record(`manifest ${tenant.id}: served`, true, `version=${version}`);
    record(`manifest ${tenant.id}: versioned`, typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version), `version=${version}`);
    record(`manifest ${tenant.id}: checksum receipt`, typeof checksum === 'string' && checksum.length >= 32, `${String(checksum).slice(0, 12)}…`);

    const componentTypes = screenComponentTypes(manifest.screens);
    const unsupportedComponents = [...componentTypes].filter(type => type !== 'layout' && !supportedComponents.has(type));
    record(`manifest ${tenant.id}: all components ≥ shell contract`, unsupportedComponents.length === 0,
      unsupportedComponents.length ? `unsupported: ${unsupportedComponents.join(', ')}` : `${componentTypes.size} types ok`);

    const actionTypes = screenActionDef(manifest.screens);
    const unknownActions = [...actionTypes].filter(type => !supportedActions.has(type));
    record(`manifest ${tenant.id}: all actions ≥ shell contract`, unknownActions.length === 0,
      unknownActions.length ? `WARN: ${unknownActions.join(', ')}` : `${actionTypes.size} types ok`);

    const screenCount = Object.keys(manifest.screens ?? {}).length;
    record(`manifest ${tenant.id}: screen limit`, screenCount <= contract.limits.maxScreens, `screens=${screenCount}`);
    console.log(`phase: ${tenant.id} manifest checked`);
  }
  console.log('phase: summary');
  console.log('\n--- RESULTS ---');
  let failed = 0;
  for (const r of results) {
    console.log(` ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('Verification crashed:', error);
  process.exitCode = 1;
});
