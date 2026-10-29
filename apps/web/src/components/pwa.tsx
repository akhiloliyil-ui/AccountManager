"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Check, Download, Share, Smartphone } from "lucide-react";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "@/app/actions/auth";
import { useAction } from "@/lib/use-action";
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

/* ------------------------------------------------------------------ notifications */

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${browser} on ${os}`;
}

type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Turns the morning bill reminder on or off for this device. */
export function NotificationsCard({ vapidKey, devices }: { vapidKey: string | null; devices: { endpoint: string; label: string }[] }) {
  const { pending, run } = useAction();
  const [state, setState] = useState<PushState>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setState(sub && devices.some((d) => d.endpoint === sub.endpoint) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [devices]);

  const turnOn = async () => {
    if (!vapidKey) return;
    if ((await Notification.requestPermission()) !== "granted") return setState("denied");
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    run(() => subscribePushAction({ endpoint: json.endpoint, keys: json.keys, label: deviceLabel() }), {
      success: "Notifications on for this device",
      onDone: () => {
        setEndpoint(sub.endpoint);
        setState("on");
      },
    });
  };

  const turnOff = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    if (endpoint) run(() => unsubscribePushAction(endpoint), { success: "Notifications off for this device", onDone: () => setState("off") });
    else setState("off");
  };

  const others = devices.filter((d) => d.endpoint !== endpoint);
  const note: Partial<Record<PushState, string>> = {
    unsupported: "This browser can't show notifications from GPA.",
    "ios-install": "On iPhone, add GPA to your Home Screen first (Share → Add to Home Screen), open it from there, then turn notifications on.",
    denied: "Notifications are blocked for GPA in this browser's settings. Allow them there, then come back.",
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">{state === "on" ? <Bell size={18} /> : <BellOff size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Bill reminders</p>
          <p className="text-sm text-muted">A notification at 9:00 when bills on your accounts are due or overdue.</p>
          {!vapidKey ? (
            <p className="mt-2 text-sm text-muted">Notifications aren&apos;t set up on this server.</p>
          ) : note[state] ? (
            <p className="mt-2 text-sm text-muted">{note[state]}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {state === "on" ? (
                <>
                  <Button variant="secondary" className="h-9" disabled={pending} onClick={() => run(() => testPushAction(), { success: "Test notification sent" })}>
                    Send a test
                  </Button>
                  <Button variant="ghost" className="h-9" disabled={pending} onClick={turnOff}>
                    Turn off on this device
                  </Button>
                </>
              ) : (
                <Button className="h-9" disabled={pending || state === "loading"} onClick={turnOn}>
                  <Bell size={15} /> Turn on for this device
                </Button>
              )}
            </div>
          )}
          {others.length > 0 && <p className="mt-2 text-xs text-muted">Also on: {others.map((d) => d.label || "another device").join(", ")}</p>}
        </div>
      </div>
    </Card>
  );
}
