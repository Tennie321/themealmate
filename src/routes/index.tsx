import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: SignalApp });
function SignalApp() {
  return <iframe title="Signal Kalshi Research Desk" src="/desk.html" style={{ display: 'block', width: '100%', height: '100dvh', border: 0 }} />;
}
