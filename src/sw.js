/*
 * 単一のService Worker:
 * - オフライン用プリキャッシュ(Workbox)
 * - 全レスポンスへの COOP/COEP 付与(SharedArrayBuffer 有効化。GitHub Pages はヘッダーを設定できないため)
 * coi-serviceworker との二重構成はリロードループの原因になったため、これ1本に統合している。
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, PrecacheController } from "workbox-precaching";

const precache = new PrecacheController();
precache.addToCacheList(self.__WB_MANIFEST);

cleanupOutdatedCaches();

self.addEventListener("install", (event) => {
  event.waitUntil(precache.install(event));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(precache.activate(event));
});

self.skipWaiting();
clientsClaim();

function withCoiHeaders(response) {
  if (!response || response.status === 0 || response.type === "opaque") {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function indexUrl() {
  return new URL("index.html", self.registration.scope).href;
}

async function handleFetch(request) {
  const isNavigation = request.mode === "navigate";
  const target = isNavigation ? indexUrl() : request.url;

  const cached = await precache.matchPrecache(target);
  if (cached) {
    return withCoiHeaders(cached);
  }

  try {
    return withCoiHeaders(await fetch(request));
  } catch (error) {
    if (isNavigation) {
      const fallback = await precache.matchPrecache(indexUrl());
      if (fallback) {
        return withCoiHeaders(fallback);
      }
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(handleFetch(event.request));
});
