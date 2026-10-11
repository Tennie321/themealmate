import { createFileRoute } from '@tanstack/react-router';
import { AgentApp } from '../components/AgentApp';
import { AccessGate } from '../components/AccessGate';

export const Route = createFileRoute('/')({ component: () => <AccessGate><AgentApp /></AccessGate> });
