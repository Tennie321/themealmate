import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
type Status = { protected: boolean; authenticated: boolean; misconfigured: boolean };
export function AccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const lock = () => {
      void fetch('/api/access/logout', { method: 'POST', credentials: 'same-origin' })
        .then(response => { if (!response.ok) throw new Error('Could not lock workspace'); setStatus({ protected: true, authenticated: false, misconfigured: false }); })
        .catch(() => setError('Could not lock the workspace. Please retry.'));
    };
    window.addEventListener('astra:lock', lock);
    return () => window.removeEventListener('astra:lock', lock);
  }, []);
  useEffect(() => {
    let mounted = true;
    fetch('/api/access/status', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Could not confirm access.');
      return await response.json() as Status;
    }).then(result => { if (mounted) setStatus(result); })
      .catch(() => { if (mounted) setError('Astra could not reach its server API. Check that Lovable Cloud is enabled and this project is deployed with its server routes.'); });
    return () => { mounted = false; };
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !code) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/access/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ code }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || 'Could not unlock the beta.');
      setStatus({ protected: true, authenticated: true, misconfigured: false });
      setCode('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not unlock the beta.');
    } finally { setLoading(false); }
  }
  if (status && (!status.protected || status.authenticated)) return <>{children}</>;
  return <main className="access-page">
    <div className="access-card">
      <div className="access-mark"><Sparkles size={24}/></div>
      <span className="access-eyebrow">ASTRA PRIVATE BETA</span>
      <h1>{status?.misconfigured ? 'Setup required' : (!status && error ? 'Backend unavailable' : 'A secure place to work.')}</h1>
      <p>{status?.misconfigured ? 'This deployment needs a valid server-side access code and signing secret.' : !status && error ? 'The app needs a working backend deployment to verify private access and run AI features.' :
        'Enter your beta access code to use this workspace. Your AI usage is billed through the connected Lovable project.'}</p>
      {status && !status.misconfigured && <form onSubmit={unlock}>
        <label htmlFor="access-code">Access code</label>
        <input id="access-code" type="password" autoComplete="current-password" required
          value={code} onChange={e => setCode(e.target.value)} placeholder="Enter access code" />
        <button type="submit" disabled={loading || !code}><LockKeyhole size={16}/>{loading ? 'Checking...' : 'Unlock Astra'}<ArrowRight size={16}/></button>
      </form>}
      {error && <div role="alert" className="access-error">{error}</div>}
      {!status && !error && <p>Checking access...</p>}
      <div className="access-foot"><ShieldCheck size={14}/> Protected server-side. No API keys in your browser.</div>
    </div>
  </main>;
}
