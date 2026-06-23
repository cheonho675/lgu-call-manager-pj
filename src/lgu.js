import { createHash } from 'node:crypto';

export function sha512(value) {
  return createHash('sha512').update(String(value)).digest('hex');
}

export function normalizePhone(value) {
  if (!value) {
    return '';
  }

  const digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

export function normalizeLguStatus(value) {
  const status = String(value || '').trim().toUpperCase().replace(/_/g, '-').replace(/\s+/g, ' ');

  if (!status) {
    return 'unknown';
  }
  if (status === 'ANSWERED' || status === 'ANSWER') {
    return 'answered';
  }
  if (status.includes('NO') && status.includes('ANS')) {
    return 'missed';
  }
  if (status === 'CANCEL' || status === 'CANCELED' || status === 'CANCELLED') {
    return 'cancelled';
  }
  if (status === 'BUSY') {
    return 'busy';
  }
  if (status.includes('FAIL')) {
    return 'failed';
  }

  return status.toLowerCase().replace(/\s+/g, '_');
}

export function parseKoreanDateTime(value) {
  if (!value) {
    return null;
  }

  const compact = String(value).trim().replace(/\s+/g, ' ');
  const match = compact.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`).toISOString();
  }

  const parsed = new Date(compact);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function makeDedupeKey({ callerNumber, receiverNumber, startedAt }) {
  const caller = normalizePhone(callerNumber) || 'unknown-caller';
  const receiver = normalizePhone(receiverNumber) || 'unknown-receiver';
  const started = startedAt ? new Date(startedAt).toISOString().replace(/\.\d{3}Z$/, 'Z') : 'unknown-time';

  return `lgu:${caller}:${receiver}:${started}`;
}

export function makeRingDedupeKey({ callerNumber, receiverNumber, innerNumber, receivedAt }) {
  const caller = normalizePhone(callerNumber) || 'unknown-caller';
  const receiver = normalizePhone(receiverNumber) || 'unknown-receiver';
  const inner = normalizePhone(innerNumber) || 'unknown-inner';
  const time = new Date(receivedAt);
  time.setSeconds(0, 0);

  return `ring:${caller}:${receiver}:${inner}:${time.toISOString()}`;
}

export function parseRingPayload(params, receivedAt = new Date().toISOString()) {
  const rawPayload = Object.fromEntries(
    Object.entries(params)
      .filter(([key]) => !['secret', 'token', 'pass', 'passwd', 'password'].includes(key.toLowerCase()))
      .map(([key, value]) => [key, value ?? '']),
  );
  const callerNumber = normalizePhone(params.sender);
  const receiverNumber = normalizePhone(params.receiver);
  const innerNumber = normalizePhone(params.inner_num);
  const kind = String(params.kind || '1');

  return {
    event: {
      event_type: kind === '2' ? 'sms' : 'ring',
      caller_number: callerNumber,
      receiver_number: receiverNumber,
      inner_number: innerNumber,
      raw_payload: rawPayload,
    },
    call: {
      dedupe_key: makeRingDedupeKey({
        callerNumber,
        receiverNumber,
        innerNumber,
        receivedAt,
      }),
      caller_number: callerNumber,
      receiver_number: receiverNumber,
      inner_number: innerNumber,
      status: 'ringing',
      started_at: receivedAt,
      source: 'lgu_webhook',
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    },
  };
}

export function mapCentrexInboundCall(row) {
  const startedAt = parseKoreanDateTime(row.TIME);
  const endedAt = parseKoreanDateTime(row.ENDTIME);
  const callerNumber = normalizePhone(row.SRC);
  const receiverNumber = normalizePhone(row.DST);
  const status = normalizeLguStatus(row.STATUS);

  return {
    dedupe_key: makeDedupeKey({
      callerNumber,
      receiverNumber,
      startedAt,
    }),
    caller_number: callerNumber,
    receiver_number: receiverNumber,
    inner_number: '',
    status,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: integerOrNull(row.DURATION),
    source: 'lgu_sync',
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

function integerOrNull(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
