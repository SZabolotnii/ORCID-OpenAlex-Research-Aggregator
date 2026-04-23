import { Faculty, TenantRole } from '../types';

const API_BASE = '/api';

export interface TenantConfigResponse {
  id: string;
  subdomain: string;
  name: string;
  public: boolean;
  hasAdminPassword: boolean;
  hasViewPassword: boolean;
}

export interface TenantVerifyResponse {
  role: TenantRole | 'denied';
  token?: string;
}

function buildAuthHeaders(authToken?: string | null): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function parseJsonOrThrow(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export async function fetchTenantConfig(tenantId: string): Promise<TenantConfigResponse> {
  const response = await fetch(`${API_BASE}/tenant/${tenantId}/config`);
  return parseJsonOrThrow(response);
}

export async function verifyTenantPassword(
  tenantId: string,
  password: string
): Promise<TenantVerifyResponse> {
  const response = await fetch(`${API_BASE}/tenant/${tenantId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return parseJsonOrThrow(response);
}

export async function updateTenantPasswords(
  tenantId: string,
  payload: {
    adminPassword?: string;
    viewPassword?: string;
    currentAdminPassword?: string;
  },
  authToken?: string | null
): Promise<void> {
  const response = await fetch(`${API_BASE}/tenant/${tenantId}/set-password`, {
    method: 'POST',
    headers: buildAuthHeaders(authToken),
    body: JSON.stringify(payload),
  });
  await parseJsonOrThrow(response);
}

export async function fetchTenantData(
  tenantId: string,
  authToken?: string | null
): Promise<Faculty[]> {
  const response = await fetch(`${API_BASE}/data/${tenantId}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  const data = await parseJsonOrThrow(response);
  return Array.isArray(data) ? data : [];
}

export async function saveTenantData(
  tenantId: string,
  facultyList: Faculty[],
  authToken?: string | null
): Promise<void> {
  const response = await fetch(`${API_BASE}/data/${tenantId}`, {
    method: 'POST',
    headers: buildAuthHeaders(authToken),
    body: JSON.stringify(facultyList),
  });
  await parseJsonOrThrow(response);
}
