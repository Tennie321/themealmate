/**
 * A client-only handoff to the real ChatGPT site. This does not authenticate
 * Astra, access ChatGPT conversation history, or call an undocumented API.
 */
export const CHATGPT_HANDOFF_LIMIT = 1200;

export function buildChatGPTHandoffURL(input: string): string {
  const prompt = input.trim();
  if (!prompt || prompt.length > CHATGPT_HANDOFF_LIMIT) {
    throw new Error('Enter a message of 1–1200 characters.');
  }

  const url = new URL('https://chatgpt.com/');
  url.searchParams.set('q', prompt);
  // Only the optional Astra Safari extension acts on this hint.
  // Without that extension, ChatGPT opens with a prefilled message for review.
  url.searchParams.set('astra_send', '1');
  return url.toString();
}
