#!/usr/bin/env node

const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';
const tenantId = process.env.SMOKE_TENANT_ID || 'default';
const privateTenantId = process.env.SMOKE_PRIVATE_TENANT_ID || '';
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || '';
const viewerPassword = process.env.SMOKE_VIEWER_PASSWORD || '';

function logStep(message) {
  console.log(`\n[smoke] ${message}`);
}

function fail(message) {
  console.error(`[smoke] FAIL: ${message}`);
  process.exit(1);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function expectOk(path, options = {}) {
  const { response, body } = await requestJson(path, options);
  if (!response.ok) {
    fail(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function expectStatus(path, status, options = {}) {
  const { response, body } = await requestJson(path, options);
  if (response.status !== status) {
    fail(`${path} expected ${status}, got ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function verifyPassword(targetTenantId, password) {
  return expectOk(`/api/tenant/${targetTenantId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

async function main() {
  logStep(`Checking health at ${baseUrl}`);
  const health = await expectOk('/api/health');
  if (health.status !== 'ok') {
    fail(`Unexpected health payload: ${JSON.stringify(health)}`);
  }

  logStep(`Checking tenant config for ${tenantId}`);
  const config = await expectOk(`/api/tenant/${tenantId}/config`);
  if (!config.id || !config.name) {
    fail(`Unexpected config payload: ${JSON.stringify(config)}`);
  }

  logStep(`Checking data read for ${tenantId}`);
  const tenantData = await expectOk(`/api/data/${tenantId}`);
  if (!Array.isArray(tenantData)) {
    fail(`Expected array payload for tenant data, got: ${JSON.stringify(tenantData)}`);
  }

  if (privateTenantId) {
    logStep(`Checking unauthenticated access is blocked for private tenant ${privateTenantId}`);
    await expectStatus(`/api/data/${privateTenantId}`, 401);

    if (viewerPassword) {
      logStep(`Checking viewer token works for ${privateTenantId}`);
      const viewerAuth = await verifyPassword(privateTenantId, viewerPassword);
      if (viewerAuth.role !== 'viewer' || !viewerAuth.token) {
        fail(`Expected viewer token, got: ${JSON.stringify(viewerAuth)}`);
      }

      const viewerRead = await expectOk(`/api/data/${privateTenantId}`, {
        headers: { Authorization: `Bearer ${viewerAuth.token}` },
      });
      if (!Array.isArray(viewerRead)) {
        fail(`Viewer read returned unexpected payload: ${JSON.stringify(viewerRead)}`);
      }
    }

    if (adminPassword) {
      logStep(`Checking admin token can write to ${privateTenantId}`);
      const adminAuth = await verifyPassword(privateTenantId, adminPassword);
      if (adminAuth.role !== 'admin' || !adminAuth.token) {
        fail(`Expected admin token, got: ${JSON.stringify(adminAuth)}`);
      }

      const currentData = await expectOk(`/api/data/${privateTenantId}`, {
        headers: { Authorization: `Bearer ${adminAuth.token}` },
      });

      await expectOk(`/api/data/${privateTenantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminAuth.token}`,
        },
        body: JSON.stringify(currentData),
      });
    }
  }

  logStep('All smoke checks passed');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
