// Guarded service worker registration. Refuses to register in any preview,
// dev, iframe, or kill-switch context per Lovable PWA guidance.
export async function registerAppSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const isPreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");

  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isPreview ||
    new URL(window.location.href).searchParams.get("sw") === "off";

  if (refused) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => r.active?.scriptURL?.endsWith("/sw.js"))
          .map((r) => r.unregister()),
      );
    } catch {}
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {}
}