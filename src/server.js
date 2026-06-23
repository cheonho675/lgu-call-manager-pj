import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { config, isProduction, requireEnv } from './config.js';
import { createRequestId, logError, logInfo } from './logger.js';
import { mapCentrexInboundCall, parseRingPayload } from './lgu.js';
import { supabase } from './supabase-rest.js';

const allowedCallPatchFields = new Set(['memo', 'handled', 'status']);

const server = createServer(async (request, response) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const result = await route({ request, url, requestId });
    sendJson(response, result.status || 200, result.body, requestId);
  } catch (error) {
    const status = error.status || 500;
    logError('request_failed', {
      request_id: requestId,
      method: request.method,
      url: request.url,
      status,
      error: error.message,
    });

    sendJson(response, status, {
      ok: false,
      error: status === 500 ? 'internal server error' : error.message,
    }, requestId);
  } finally {
    logInfo('request_completed', {
      request_id: requestId,
      method: request.method,
      url: request.url,
      duration_ms: Date.now() - startedAt,
    });
  }
});

server.listen(config.port, () => {
  logInfo('server_started', {
    port: config.port,
    node_env: config.nodeEnv,
  });
});

async function route({ request, url, requestId }) {
  if (request.method === 'GET' && url.pathname === '/health') {
    return {
      body: {
        ok: true,
        service: 'lgu-call-manager-backend',
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (
    (request.method === 'GET' || request.method === 'POST') &&
    (url.pathname === '/lgu/ring.html' || url.pathname === '/api/lgu/ring')
  ) {
    return handleLguRing({ request, url, requestId });
  }

  if (
    (request.method === 'GET' || request.method === 'POST') &&
    url.pathname === '/api/lgu/sync'
  ) {
    return handleLguSync({ url, requestId });
  }

  if (request.method === 'GET' && url.pathname === '/api/calls') {
    requireAdminSecret(url, request);
    return {
      body: {
        ok: true,
        calls: await supabase.listCalls({
          status: url.searchParams.get('status') || '',
          handled: url.searchParams.get('handled') || '',
          limit: clampInt(url.searchParams.get('limit'), 50, 1, 200),
          offset: clampInt(url.searchParams.get('offset'), 0, 0, 100000),
        }),
      },
    };
  }

  const callMatch = url.pathname.match(/^\/api\/calls\/([0-9a-fA-F-]{36})$/);
  if (callMatch && request.method === 'PATCH') {
    requireAdminSecret(url, request);
    const body = await readBody(request);
    const patch = Object.fromEntries(
      Object.entries(body).filter(([key]) => allowedCallPatchFields.has(key)),
    );

    if (Object.keys(patch).length === 0) {
      throw httpError(400, 'no editable fields provided');
    }

    return {
      body: {
        ok: true,
        call: await supabase.updateCall(callMatch[1], patch),
      },
    };
  }

  if (callMatch && request.method === 'DELETE') {
    requireAdminSecret(url, request);
    return {
      body: {
        ok: true,
        deleted: await supabase.deleteCall(callMatch[1]),
      },
    };
  }

  throw httpError(404, 'not found');
}

async function handleLguRing({ request, url, requestId }) {
  requireSecret('LGU_WEBHOOK_SECRET', config.lguWebhookSecret, getProvidedSecret(url, request));

  const body = request.method === 'POST' ? await readBody(request) : {};
  const params = {
    ...Object.fromEntries(url.searchParams.entries()),
    ...body,
  };

  for (const field of ['sender', 'receiver', 'kind']) {
    if (!params[field]) {
      throw httpError(400, `missing ${field}`);
    }
  }

  const receivedAt = new Date().toISOString();
  const parsed = parseRingPayload(params, receivedAt);
  const insertedEvent = await supabase.insert('call_events', parsed.event);
  const upsertedCall = await supabase.upsert('calls', parsed.call, 'dedupe_key');

  logInfo('lgu_ring_saved', {
    request_id: requestId,
    caller_number: parsed.call.caller_number,
    receiver_number: parsed.call.receiver_number,
    inner_number: parsed.call.inner_number,
  });

  return {
    status: 201,
    body: {
      ok: true,
      event: insertedEvent?.[0] || insertedEvent,
      call: upsertedCall?.[0] || upsertedCall,
    },
  };
}

async function handleLguSync({ url, requestId }) {
  requireSecret('SYNC_SECRET', config.syncSecret, url.searchParams.get('secret') || '');
  requireEnv('LGU_ID', config.lguId);
  requireEnv('LGU_PASS_HASH', config.lguPassHash);

  if (config.lguProductType !== 'centrex') {
    throw httpError(400, `unsupported LGU_PRODUCT_TYPE: ${config.lguProductType}`);
  }

  const page = clampInt(url.searchParams.get('page'), 1, 1, 9999);
  const numPerPage = clampInt(url.searchParams.get('num_per_page'), 50, 1, 200);
  const response = await fetchCentrexInboundCalls({ page, numPerPage });

  if (response.SVC_RT && response.SVC_RT !== '0000' && response.SVC_RT !== '4004') {
    throw httpError(502, `LGU+ sync failed: ${response.SVC_RT} ${response.SVC_MSG || ''}`.trim());
  }

  const rows = Array.isArray(response.DATAS) ? response.DATAS : [];
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const call = mapCentrexInboundCall(row);
    const candidate = await supabase.findRingingCandidate({
      callerNumber: call.caller_number,
      startedAt: call.started_at,
    });

    if (candidate) {
      await supabase.updateCall(candidate.id, call);
      updated += 1;
    } else {
      await supabase.upsert('calls', call, 'dedupe_key');
      inserted += 1;
    }
  }

  logInfo('lgu_sync_completed', {
    request_id: requestId,
    received: rows.length,
    inserted,
    updated,
  });

  return {
    body: {
      ok: true,
      received: rows.length,
      inserted,
      updated,
      lgu_code: response.SVC_RT || '',
      lgu_message: response.SVC_MSG || '',
    },
  };
}

async function fetchCentrexInboundCalls({ page, numPerPage }) {
  const params = new URLSearchParams({
    id: config.lguId,
    pass: config.lguPassHash,
    page: String(page),
    num_per_page: String(numPerPage),
  });

  const response = await fetch(`${config.lguBaseUrl}/getinboundcall`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError(502, `LGU+ returned non-JSON response: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw httpError(502, `LGU+ HTTP ${response.status}`);
  }

  return body;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw httpError(413, 'request body too large');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = request.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }

  return { raw };
}

function requireAdminSecret(url, request) {
  if (!config.adminApiSecret) {
    if (isProduction()) {
      throw httpError(500, 'ADMIN_API_SECRET is not configured');
    }
    return;
  }

  requireSecret('ADMIN_API_SECRET', config.adminApiSecret, getProvidedSecret(url, request));
}

function getProvidedSecret(url, request) {
  return (
    url.searchParams.get('secret') ||
    request.headers['x-api-secret'] ||
    request.headers['x-webhook-secret'] ||
    ''
  );
}

function requireSecret(name, expected, provided) {
  if (!expected) {
    if (isProduction()) {
      throw httpError(500, `${name} is not configured`);
    }
    return;
  }

  if (!safeEqual(expected, provided)) {
    throw httpError(403, 'invalid secret');
  }
}

function safeEqual(expected, provided) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(provided));
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(response, status, body, requestId) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Request-Id': requestId,
  });
  response.end(JSON.stringify(body));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}
