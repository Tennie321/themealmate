import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '../styles.css?url';
export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Signal — Kalshi Research Desk' }, { name: 'description', content: 'Evidence-led Kalshi market research and paper strategy tracking.' }], links: [{ rel: 'stylesheet', href: appCss }] }),
  shellComponent: RootShell,
  component: () => <Outlet />,
});
function RootShell({ children }: { children: ReactNode }) { return <html lang="en"><head><HeadContent /></head><body style={{ margin: 0 }}><div id="root">{children}</div><Scripts /></body></html>; }
