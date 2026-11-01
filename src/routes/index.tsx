import { createFileRoute } from '@tanstack/react-router';
import { AccessGate } from '../components/AccessGate';

export const Route = createFileRoute('/')({ component: SignalApp });
function SignalApp() {
  return <AccessGate><iframe title="Signal Kalshi Research Desk" src="/desk.html" style={{ display: 'block', width: '100%', height: '100dvh', border: 0 }} /></AccessGate>;
}
