import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const AUDIENCE = 'astra-remote-browser';
const MAX_AGE_MS = 90_000;

function secretBytes(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('BROWSER_BRIDGE_SECRET must be at least 32 characters.');
  }
  return Buffer.from(secret, 'utf8');
}

export function createBrowserToken(sessionCookie, secret, now = Date.now()) {
  const key = secretBytes(secret);
  if (typeof sessionCookie !== 'string' || !/^\d{13}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(sessionCookie)) {
    throw new Error('An authenticated Astra session is required.');
  }
  const sid = createHmac('sha256', key).update('profile:' + sessionCookie).digest('hex').slice(0, 40);
  const payload = Buffer.from(JSON.stringify({
    aud: AUDIENCE, sid, iat: now, exp: now + MAX_AGE_MS, nonce: randomUUID(),
  })).toString('base64url');
  const mac = createHmac('sha256', key).update(payload).digest('base64url');
  return payload + '.' + mac;
}

export function verifyBrowserToken(token, secret, now = Date.now()) {
  const key = secretBytes(secret);
  if (typeof token !== 'string' || token.length > 1200 || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [payload, receivedMac] = token.split('.');
  const expected = Buffer.from(createHmac('sha256', key).update(payload).digest('base64url'));
  const received = Buffer.from(receivedMac);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.aud !== AUDIENCE || !/^[a-f0-9]{40}$/.test(data.sid) ||
        !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) ||
        data.iat > now + 5_000 || data.exp <= now || data.exp > data.iat + MAX_AGE_MS ||
        !/^[a-f0-9-]{36}$/.test(data.nonce)) return null;
    return { sid: data.sid };
  } catch { return null; }
}
