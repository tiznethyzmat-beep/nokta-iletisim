// Basit service worker: uygulama olarak yüklenebilirlik için. Veriler her zaman ağdan gelir.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
