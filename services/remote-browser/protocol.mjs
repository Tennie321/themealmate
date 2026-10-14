export const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const KEYS = new Set([
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Space', 'ArrowUp',
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
  'Control+A', 'Meta+A', 'Control+C', 'Meta+C', 'Control+V', 'Meta+V',
]);
const buttons = new Set(['left', 'right', 'middle']);
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function parseCommand(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 10_000) {
    throw new Error('Invalid or oversized browser command.');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('Malformed browser command.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid command.');
  switch (value.type) {
    case 'input.mouse':
      if (!['move', 'down', 'up'].includes(value.action) ||
        !finite(value.x, 0, VIEWPORT.width) || !finite(value.y, 0, VIEWPORT.height) ||
        (value.button !== undefined && !buttons.has(value.button))) throw new Error('Invalid mouse input.');
      return { type: value.type, action: value.action, x: value.x, y: value.y, button: value.button || 'left' };
    case 'input.wheel':
      if (!finite(value.deltaY, -1000, 1000)) throw new Error('Invalid wheel input.');
      return { type: value.type, deltaY: value.deltaY };
    case 'input.key':
      if (!KEYS.has(value.key)) throw new Error('Unsupported browser key.');
      return { type: value.type, key: value.key };
    case 'input.text':
      if (typeof value.text !== 'string' || !value.text || value.text.length > 2000) throw new Error('Invalid browser text.');
      return { type: value.type, text: value.text };
    case 'browser.reload':
    case 'prompt.cancel':
      return { type: value.type };
    case 'prompt.submit':
      if (typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(value.id) ||
        typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 8000) {
        throw new Error('Prompt must contain 1–8000 characters.');
      }
      return { type: value.type, id: value.id, prompt: value.prompt.trim() };
    default:
      throw new Error('Unsupported browser command.');
  }
}
