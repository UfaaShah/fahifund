import { useEffect, useState } from "react";
import { CloseIcon, DownloadIcon } from "./icons";

// Chrome/Edge/Android fire this event when the app is installable and hasn't
// been installed yet. Capturing it lets us show our own "Install" button and
// trigger the native install prompt on click, instead of waiting for the
// browser's own (easy to miss) address-bar icon.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag for "already added to home screen"
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const DISMISSED_KEY = "ff-install-prompt-dismissed";

/**
 * A small "Install the app" banner. Shows a real native install prompt on
 * Chrome/Edge/Android (and most other browsers that support
 * `beforeinstallprompt`); on iOS Safari — which has no programmatic install
 * API — shows a one-line "Share → Add to Home Screen" instruction instead,
 * since that's the only way to install a PWA there. Hides itself entirely
 * once the app is already installed/running standalone, or after the
 * visitor dismisses it for this browser.
 */
export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      /* ignore — storage may be unavailable (private browsing, etc.) */
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  // Nothing we can offer: not iOS (which always gets the manual steps) and no
  // captured native prompt (desktop browser without install support, or the
  // event hasn't fired yet).
  if (!deferredPrompt && !isIos()) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
      return;
    }
    if (isIos()) setShowIosSteps(true);
  }

  return (
    <div className="mb-6 w-full max-w-sm rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <DownloadIcon width={20} height={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Install Fahi Fund</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Add it to your home screen for one-tap access, like any other app.
          </p>
          {showIosSteps ? (
            <p className="mt-2 text-xs text-slate-600">
              Tap the <span className="font-semibold">Share</span> icon in Safari's toolbar, then
              choose <span className="font-semibold">Add to Home Screen</span>.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleInstallClick}
              className="mt-2 text-sm font-medium text-brand-600 hover:underline"
            >
              {isIos() ? "How to install" : "Install app"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <CloseIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
