import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function intFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 8080),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  adminApiSecret: process.env.ADMIN_API_SECRET || '',
  lguProductType: process.env.LGU_PRODUCT_TYPE || 'centrex',
  lguBaseUrl: (process.env.LGU_BASE_URL || 'https://centrex.uplus.co.kr/RestApi').replace(/\/$/, ''),
  lguId: process.env.LGU_ID || '',
  lguPassHash: process.env.LGU_PASS_HASH || '',
  lguWebhookSecret: process.env.LGU_WEBHOOK_SECRET || '',
  syncSecret: process.env.SYNC_SECRET || process.env.ADMIN_API_SECRET || '',
};

export function isProduction() {
  return config.nodeEnv === 'production';
}

export function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}
