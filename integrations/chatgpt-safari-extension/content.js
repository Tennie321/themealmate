/* Astra's optional browser-side sender. No cookies, tokens or responses are read.
 * This runs only on chatgpt.com with the Astra one-shot URL marker.
 * ChatGPT's DOM is not an API and may change at any time.
 */
(() => {
  'use strict';
  const incoming = new URL(window.location.href);
  const prompt = incoming.searchParams.get('q');
  const nonce = incoming.searchParams.get('astra_nonce');
  if (incoming.origin !== 'https://chatgpt.com' ||
      incoming.searchParams.get('astra_send') !== '1' ||
      !prompt || !prompt.trim() || prompt.length > 1200 ||
      !nonce || !/^[a-f0-9-]{36}$/i.test(nonce)) return;

  const replayKey = 'astra-submitted-' + nonce;
  try {
    if (window.sessionStorage.getItem(replayKey) === '1') return;
  } catch {
    // Some privacy modes disable sessionStorage. Refuse automatic submission.
    return;
  }

  let complete = false;
  let scheduled = false;
  let observer;
  let timeout;
  const normalize = (text) => text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const expected = normalize(prompt);

  function stop() {
    if (observer) observer.disconnect();
    if (timeout) clearTimeout(timeout);
  }

  function findComposer() {
    return document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="composer-text-input"]') ||
      document.querySelector('[contenteditable="true"][data-placeholder]');
  }

  function attemptSend() {
    scheduled = false;
    if (complete) return;
    const composer = findComposer();
    if (!composer) return;
    const text = 'value' in composer ? composer.value : (composer.innerText || composer.textContent || '');
    // Never submit another message, or submit before ChatGPT has loaded our prompt.
    if (normalize(text) !== expected) return;

    const button = document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send prompt"]');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;

    complete = true;
    stop();
    // Mark before clicking so reloads cannot submit the message a second time.
    try { window.sessionStorage.setItem(replayKey, '1'); } catch { return; }
    button.click();

    // Remove the message and trigger from the visible URL after clicking.
    try {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('q');
      clean.searchParams.delete('astra_send');
      clean.searchParams.delete('astra_nonce');
      window.history.replaceState(window.history.state, '', clean.toString());
    } catch { /* ChatGPT owns subsequent navigation. */ }
  }

  function scheduleSend() {
    if (complete || scheduled) return;
    scheduled = true;
    setTimeout(attemptSend, 75);
  }

  function watch() {
    if (!document.documentElement) return;
    observer = new MutationObserver(scheduleSend);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
    timeout = setTimeout(stop, 25000);
    scheduleSend();
  }

  if (document.documentElement) watch();
  else document.addEventListener('DOMContentLoaded', watch, { once: true });
})();
