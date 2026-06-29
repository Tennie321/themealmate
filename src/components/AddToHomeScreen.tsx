import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Share, PlusSquare, X } from "lucide-react";

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function AddToHomeScreen() {
  const [open, setOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const iosDevice = isIOS();
    setIos(iosDevice);
    const standalone = isStandalone();

    if (!iosDevice || standalone) return;

    // Show banner once per session after 3s
    const dismissed = sessionStorage.getItem("mm_dismiss_a2hs");
    if (!dismissed) {
      const t = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const dismissBanner = () => {
    setShowBanner(false);
    sessionStorage.setItem("mm_dismiss_a2hs", "1");
  };

  if (!ios || isStandalone()) return null;

  return (
    <>
      {/* Floating banner */}
      {showBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                <PlusSquare className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Add MealMate to your Home Screen
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Open like an app — no browser chrome.
                </p>
              </div>
              <button
                onClick={dismissBanner}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Button
              className="w-full mt-3 rounded-xl h-10 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setShowBanner(false);
                setOpen(true);
              }}
            >
              Show me how
            </Button>
          </div>
        </div>
      )}

      {/* Instruction sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-8">
          <SheetHeader>
            <SheetTitle className="text-lg">Add to Home Screen</SheetTitle>
            <SheetDescription className="text-sm">
              MealMate works best as an app on your home screen.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-sm shrink-0">
                1
              </div>
              <p className="text-sm text-foreground">
                Tap the{" "}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded-md text-xs font-medium">
                  <Share className="w-3 h-3" /> Share
                </span>{" "}
                button in Safari's toolbar.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-sm shrink-0">
                2
              </div>
              <p className="text-sm text-foreground">
                Scroll down and tap{" "}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded-md text-xs font-medium">
                  <PlusSquare className="w-3 h-3" /> Add to Home Screen
                </span>
                .
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-sm shrink-0">
                3
              </div>
              <p className="text-sm text-foreground">
                Tap <span className="font-semibold">Add</span> in the top-right corner.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-center">
            <img
              src="/icon-512.png"
              alt="MealMate app icon"
              className="w-16 h-16 rounded-2xl shadow-sm"
              loading="lazy"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
