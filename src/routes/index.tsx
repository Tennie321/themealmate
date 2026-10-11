import { createFileRoute } from '@tanstack/react-router';
import { AgentApp } from '../components/AgentApp';

export const Route = createFileRoute('/')({ component: AgentApp });
