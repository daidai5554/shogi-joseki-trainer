/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/sw" />
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

/** GitHub Pages のサブパス配信にも対応した index.html のパス */
const INDEX_PATH = `${import.meta.env.BASE_URL}index.html`.replace(/\/{2,}/g, "/");

function withCoiHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(
    async (options) => {
      const handler = createHandlerBoundToURL(INDEX_PATH);
      return withCoiHeaders(await handler(options));
    },
    {
      denylist: [/^\/__/, /\/[^/?]+\.[^/]+$/],
    },
  ),
);

self.skipWaiting();
clientsClaim();
