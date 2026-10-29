"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Check, Download, Share, Smartphone } from "lucide-react";
import { Button, Card } from "./ui";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* The browser fires beforeinstallprompt once, often before Settings is open, so it is kept here. */
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type InstallState = "installed" | "prompt" | "ios" | "manual";

function snapshot(): InstallState {
  if (installed || matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return "installed";
  if (deferred) return "prompt";
  // iPhone and iPad browsers have no install prompt; Add to Home Screen is in the Share menu.
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "manual";
}

/** Mounted once in the root layout: registers the service worker and listens for the install prompt. */
export function PwaSetup() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPromptEvent;
      notify();
    };
    const onInstalled = () => {
      installed = true;
      deferred = null;
      notify();
    };
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    // Development keeps no service worker, so hot reload always serves fresh code.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("[gpa] service worker not registered", error));
    }
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

export function InstallCard() {
  const state = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!state) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === "accepted") installed = true;
    notify();
  };

  return (
    <Card className="mb-4 flex items-start gap-4 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong">
        {state === "installed" ? <Check size={18} /> : <Smartphone size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        {state === "installed" ? (
          <>
            <p className="font-medium">Installed as an app</p>
            <p className="text-sm text-muted">Long-press the GPA icon for shortcuts to add a transaction, open this week’s list or import a statement.</p>
          </>
        ) : (
          <>
            <p className="font-medium">Install GPA on this device</p>
            <p className="text-sm text-muted">
              {state === "ios" ? (
                <>
                  In Safari, tap <Share size={14} className="inline align-[-2px]" aria-label="Share" /> Share, then <b>Add to Home Screen</b>.
                </>
              ) : state === "prompt" ? (
                "Opens full screen from your home screen or dock, like the Money Manager app."
              ) : (
                "Use your browser’s menu: Install app, or Add to Home screen. Chrome and Edge on Android, Windows and Mac support it; on iPhone use Safari's Share menu."
              )}
            </p>
            {state === "prompt" && (
              <Button className="mt-3 h-9" onClick={install}>
                <Download size={16} /> Install
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
