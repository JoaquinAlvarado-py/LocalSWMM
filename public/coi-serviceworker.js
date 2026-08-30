/*! coi-serviceworker v0.1.7 - Guido Zouffrey, MIT License */
/* https://github.com/gzuidhof/coi-serviceworker */
(() => {
    'use strict';

    if (typeof window === 'undefined') {
        self.addEventListener('install', () => self.skipWaiting());
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

        self.addEventListener('fetch', function (event) {
            if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
                return;
            }
            event.respondWith(
                fetch(event.request)
                    .then(response => {
                        if (response.status === 0 || response.type === 'opaque') {
                            return response;
                        }
                        const newHeaders = new Headers(response.headers);
                        newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
                        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

                        return new Response(response.body, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: newHeaders,
                        });
                    })
            );
        });
    } else {
        // Register service worker if page is not cross-origin isolated
        if (!window.crossOriginIsolated && 'serviceWorker' in navigator) {
            navigator.serviceWorker.register('./coi-serviceworker.js').then(
                registration => {
                    registration.addEventListener('updatefound', () => {
                        window.location.reload();
                    });
                    if (registration.active && !navigator.serviceWorker.controller) {
                        window.location.reload();
                    }
                },
                err => {
                    console.error('COI Service Worker registration failed:', err);
                }
            );
        }
    }
})();
