/**
 * Optional private beta protection. Configure both ASTRA_ACCESS_CODE and
 * ASTRA_SESSION_SECRET in server-only environment variables to enable.
 * This is a single-owner gate, NOT full per-user authentication.
 */
const MAX_SESSION = 7 * 24 * 60 * 60 * 1000;
const cookieName = 'astra_beta_session';
const encoder = new TextEncoder();

function configured(): boolean {
  return Boolean(process.env.ASTRA_ACCESS_CODE);
}
function signingSecret(): string | null {
  const value = process.env.ASTRA_SESSION_SECRET;
  return typeof value === 'string' && value.length >= 32 ? value : null;
}
export function accessSetupError(): string | null {
  if (!configured()) return null;
  if ((process.env.ASTRA_ACCESS_CODE || '').length < 12) return 'ASTRA_ACCESS_CODE must be at least 12 characters.';
  if (!signingSecret()) return 'ASTRA_SESSION_SECRET must be at least 32 characters.';
  return null;
}
export function privateBetaEnabled(): boolean {
  return configured();
}
async function digest(input: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
async function hmac(input: string): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error('Private beta session secret missing.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
  return Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function checkAccessCode(code: string): Promise<boolean> {
  if (accessSetupError() || !configured()) return false;
  return constantTimeEqual(await digest(code), await digest(process.env.ASTRA_ACCESS_CODE || ''));
}
export async function createAccessCookie(request: Request): Promise<string> {
  const until = Date.now() + MAX_SESSION;
  const token = `${until}.${await hmac(String(until))}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${token}; Path=/; Max-Age=604800; HttpOnly; SameSite=Strict${secure}`;
}
export function clearAccessCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}
export async function isAccessGranted(request: Request): Promise<boolean> {
  if (!configured()) return true;
  if (accessSetupError()) return false;
  const token = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token) return false;
  const match = token.match(/^(\d{13})\.([0-9a-f]{64})$/);
  if (!match) return false;
  const expiry = Number(match[1]);
  const now = Date.now();
  if (!Number.isSafeInteger(expiry) || expiry < now || expiry > now + MAX_SESSION) return false;
  const expected = await hmac(match[1]);
  return constantTimeEqual(encoder.encode(match[2]), encoder.encode(expected));
}
export async function denyIfPrivate(request: Request): Promise<Response | null> {
  const setup = accessSetupError();
  if (setup) return Response.json({ error: 'Private beta configuration is incomplete. Check server access credentials.' }, { status: 503 });
  if (!await isAccessGranted(request)) return Response.json({ error: 'Please unlock the private beta before using AI.' }, { status: 401 });
  return null;
}
