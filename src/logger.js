import { randomUUID } from 'node:crypto';

export function createRequestId() {
  return randomUUID();
}

export function maskPhone(value) {
  if (!value) {
    return value;
  }

  const text = String(value);
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7) {
    return text;
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function safeDetails(details = {}) {
  const blockedKeys = new Set([
    'pass',
    'passwd',
    'password',
    'secret',
    'token',
    'authorization',
    'apikey',
    'supabase_service_role_key',
  ]);

  const output = {};
  for (const [key, value] of Object.entries(details)) {
    const lowered = key.toLowerCase();
    if ([...blockedKeys].some((blocked) => lowered.includes(blocked))) {
      output[key] = '[redacted]';
      continue;
    }

    if (lowered.includes('phone') || lowered.includes('number') || lowered.includes('caller')) {
      output[key] = maskPhone(value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function log(level, event, details = {}) {
  const record = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...safeDetails(details),
  };

  const line = JSON.stringify(record);
  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

export function logInfo(event, details) {
  log('info', event, details);
}

export function logError(event, details) {
  log('error', event, details);
}
