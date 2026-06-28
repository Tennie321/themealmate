import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Home, ShoppingBasket, User, CheckCircle2, Users } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/auth";
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const hideNav = path.startsWith("/onboarding");

  return (
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      {!hideNav && <BottomNav path={path} />}
    </div>
  );
}

function BottomNav({ path }: { path: string }) {
  const items = [
    { to: "/dashboard", label: "Today", icon: Home },
    { to: "/shopping", label: "List", icon: ShoppingBasket },
    { to: "/feed", label: "Feed", icon: Users },
    { to: "/checkin", label: "Check-in", icon: CheckCircle2 },
    { to: "/profile", label: "Me", icon: User },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-40">
      <div className="max-w-md mx-auto grid grid-cols-5 px-2 pt-2 pb-[env(safe-area-inset-bottom)]">
        {items.map((it) => {
          const active = path === it.to || path.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <it.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}