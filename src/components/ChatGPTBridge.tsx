import { useState } from 'react';
import { RemoteBrowserControl } from './RemoteBrowserControl';
import { ArrowRight, ExternalLink, LockKeyhole, MessageSquare, ShieldCheck } from 'lucide-react';
import { buildChatGPTHandoffURL, CHATGPT_HANDOFF_LIMIT } from '../lib/chatgpt-bridge';

/** Link-only handoff plus optional isolated, user-controlled browser worker. */
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
        Write a message here. Astra opens the real ChatGPT website, where you sign in normally.
        Messages go to your ChatGPT account—not Astra's Lovable AI gateway.
      </p>

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
          <strong>Link handoff never requests passwords or tokens.</strong> Without the optional Astra Safari
          extension, review the prefilled message and tap Send in ChatGPT. With the extension installed
          and enabled, Astra's handoff can submit it automatically.
        </span>
      </div>
      <p className="chatgpt-bridge-disclaimer">
        This link-only handoff starts a new ChatGPT conversation and cannot read replies. The optional remote browser below can display and read the currently open ChatGPT tab.
        The message is included in the ChatGPT link and may appear in browser history; avoid passwords or secrets.
      </p>
    </div>
    <RemoteBrowserControl />
  </main>;
}
