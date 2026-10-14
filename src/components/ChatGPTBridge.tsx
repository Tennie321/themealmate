import { useState } from 'react';
import { RemoteBrowserPanel } from './RemoteBrowserPanel';
import { ArrowRight, ExternalLink, LockKeyhole, MessageSquare, ShieldCheck } from 'lucide-react';
import { buildChatGPTHandoffURL, CHATGPT_HANDOFF_LIMIT } from '../lib/chatgpt-bridge';

/**
 * Offers a remote browser viewer and a link-only fallback. Authentication
 * happens inside ChatGPT and does not expose account cookies to this app.
 */
export function ChatGPTBridge() {
  const [prompt, setPrompt] = useState('');
  const trimmed = prompt.trim();
  const ready = trimmed.length > 0 && trimmed.length <= CHATGPT_HANDOFF_LIMIT;
  const handoff = ready ? buildChatGPTHandoffURL(prompt) : undefined;

  return <main className="chatgpt-bridge" aria-label="ChatGPT bridge">
    <div className="chatgpt-bridge-card">
      <div className="chatgpt-bridge-mark"><MessageSquare size={22} /></div>
      <div className="chatgpt-bridge-eyebrow">YOUR CHATGPT ACCOUNT</div>
      <h1>Send from Astra<br /><em>to ChatGPT.</em></h1>
      <p className="chatgpt-bridge-intro">
        Use the remote viewer to sign in and work inside ChatGPT, or send a prefilled link below.
        Both use your ChatGPT account, not Astra's Lovable AI gateway.
      </p>

      <RemoteBrowserPanel />
      <div className="chatgpt-bridge-eyebrow">ALTERNATIVE · LINK HANDOFF</div>
      <label htmlFor="chatgpt-bridge-prompt" className="chatgpt-bridge-label">Message to ChatGPT</label>
      <textarea
        id="chatgpt-bridge-prompt"
        className="chatgpt-bridge-input"
        placeholder="What do you want to ask ChatGPT?"
        value={prompt}
        maxLength={CHATGPT_HANDOFF_LIMIT}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
      />
      <div className="chatgpt-bridge-meta">{prompt.length} / {CHATGPT_HANDOFF_LIMIT} characters</div>
      <div className="chatgpt-bridge-actions">
        <a className={ready ? 'chatgpt-bridge-send' : 'chatgpt-bridge-send disabled'} href={handoff} target="_blank" rel="noopener noreferrer"
          aria-disabled={!ready} onClick={e => { if (!ready) e.preventDefault(); }}>
          Open in ChatGPT <ArrowRight size={18} />
        </a>
        <a className="chatgpt-bridge-open" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">
          <LockKeyhole size={16} /> Sign in to ChatGPT <ExternalLink size={14} />
        </a>
      </div>
      <div className="chatgpt-bridge-note"><ShieldCheck size={17} />
        <span>
          <strong>No passwords or tokens shared with Astra.</strong> Without the optional Astra Safari
          extension, review the prefilled message and tap Send in ChatGPT. With the extension installed
          and enabled, Astra's handoff can submit it automatically.
        </span>
      </div>
      <p className="chatgpt-bridge-disclaimer">
        This link starts a new ChatGPT conversation and does not read its replies. The optional remote browser above can stream replies while connected.
        The message is included in the ChatGPT link and may appear in browser history; avoid passwords or secrets.
      </p>
    </div>
  </main>;
}
