'use client';

import { useEffect } from 'react';

/** Registers the app-shell service worker so the installed PWA opens instantly on iOS/Android, even offline. */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        // Installability degrades gracefully to a normal web app if registration fails.
      });
    });
  }, []);

  return null;
}
