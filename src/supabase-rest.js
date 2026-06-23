import { config, requireEnv } from './config.js';

function cleanPayload(value) {
  if (Array.isArray(value)) {
    return value.map(cleanPayload);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, cleanPayload(entryValue)]),
    );
  }

  return value;
}

export class SupabaseRestClient {
  constructor({
    url = config.supabaseUrl,
    serviceRoleKey = config.supabaseServiceRoleKey,
  } = {}) {
    this.url = url.replace(/\/$/, '');
    this.serviceRoleKey = serviceRoleKey;
  }

  ensureConfigured() {
    requireEnv('SUPABASE_URL', this.url);
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', this.serviceRoleKey);
  }

  headers(prefer) {
    this.ensureConfigured();
    const headers = {
      apikey: this.serviceRoleKey,
      'Content-Type': 'application/json',
    };

    if (!this.serviceRoleKey.startsWith('sb_secret_')) {
      headers.Authorization = `Bearer ${this.serviceRoleKey}`;
    }

    if (prefer) {
      headers.Prefer = prefer;
    }

    return headers;
  }

  tableUrl(table, query = '') {
    const prefix = `${this.url}/rest/v1/${table}`;
    return query ? `${prefix}?${query}` : prefix;
  }

  async request(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    const body = parseJson(text);

    if (!response.ok) {
      const message = body?.message || body?.hint || text || response.statusText;
      const error = new Error(message);
      error.status = response.status;
      error.body = body || text;
      throw error;
    }

    return body;
  }

  async insert(table, payload) {
    return this.request(this.tableUrl(table), {
      method: 'POST',
      headers: this.headers('return=representation'),
      body: JSON.stringify(cleanPayload(payload)),
    });
  }

  async upsert(table, payload, onConflict) {
    const query = new URLSearchParams({ on_conflict: onConflict }).toString();
    const body = Array.isArray(payload) ? payload : [payload];

    return this.request(this.tableUrl(table, query), {
      method: 'POST',
      headers: this.headers('resolution=merge-duplicates,return=representation'),
      body: JSON.stringify(cleanPayload(body)),
    });
  }

  async listCalls({ status, handled, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    if (status) {
      params.set('status', `eq.${status}`);
    }
    if (handled === 'true' || handled === 'false') {
      params.set('handled', `eq.${handled}`);
    }

    return this.request(this.tableUrl('calls', params.toString()), {
      method: 'GET',
      headers: this.headers(),
    });
  }

  async findRingingCandidate({ callerNumber, startedAt }) {
    if (!callerNumber || !startedAt) {
      return null;
    }

    const center = new Date(startedAt);
    const from = new Date(center.getTime() - 5 * 60 * 1000).toISOString();
    const to = new Date(center.getTime() + 5 * 60 * 1000).toISOString();
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('status', 'eq.ringing');
    params.set('caller_number', `eq.${callerNumber}`);
    params.set('created_at', `gte.${from}`);
    params.append('created_at', `lte.${to}`);
    params.set('order', 'created_at.asc');
    params.set('limit', '1');

    const rows = await this.request(this.tableUrl('calls', params.toString()), {
      method: 'GET',
      headers: this.headers(),
    });

    return rows[0] || null;
  }

  async updateCall(id, patch) {
    const params = new URLSearchParams({ id: `eq.${id}` });
    return this.request(this.tableUrl('calls', params.toString()), {
      method: 'PATCH',
      headers: this.headers('return=representation'),
      body: JSON.stringify(cleanPayload({ ...patch, updated_at: new Date().toISOString() })),
    });
  }

  async deleteCall(id) {
    const params = new URLSearchParams({ id: `eq.${id}` });
    return this.request(this.tableUrl('calls', params.toString()), {
      method: 'DELETE',
      headers: this.headers('return=representation'),
    });
  }
}

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const supabase = new SupabaseRestClient();
