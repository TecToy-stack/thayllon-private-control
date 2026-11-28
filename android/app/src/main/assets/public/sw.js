/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "fa6049d8093e521a4dcf24371ed6722d"
  }, {
    "url": "pwa-maskable-192x192.png",
    "revision": "ff588244de266e03b318c991486931b0"
  }, {
    "url": "pwa-512x512.png",
    "revision": "a7009f573d5d10587675091ee2ae2cd5"
  }, {
    "url": "pwa-192x192.png",
    "revision": "333c920f26e769d28a2661672da5a79e"
  }, {
    "url": "orbe-logo.png",
    "revision": "8f64b8775cfece735a369e74ab1e2f98"
  }, {
    "url": "orbe-logo-dark.png",
    "revision": "6a7058600b6bef5f30b93d48161b53f8"
  }, {
    "url": "index.html",
    "revision": "fbdba455f8f993ff6e0b18f31fea93c5"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "2ada3eeebac891cadccbea4998e13c44"
  }, {
    "url": "assets/web-C6jj5L7r.js",
    "revision": null
  }, {
    "url": "assets/web-ByKr028I.js",
    "revision": null
  }, {
    "url": "assets/purify.es-BQJV6A36.js",
    "revision": null
  }, {
    "url": "assets/native-BudLF15B.js",
    "revision": null
  }, {
    "url": "assets/index.es-CrZmi3zK.js",
    "revision": null
  }, {
    "url": "assets/index-pNpSVKgx.js",
    "revision": null
  }, {
    "url": "assets/index-COy-LWZd.css",
    "revision": null
  }, {
    "url": "assets/html2canvas-D55mqMQG.js",
    "revision": null
  }, {
    "url": "assets/base-D2ilL8fQ.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "2ada3eeebac891cadccbea4998e13c44"
  }, {
    "url": "orbe-logo-dark.png",
    "revision": "6a7058600b6bef5f30b93d48161b53f8"
  }, {
    "url": "orbe-logo.png",
    "revision": "8f64b8775cfece735a369e74ab1e2f98"
  }, {
    "url": "pwa-192x192.png",
    "revision": "333c920f26e769d28a2661672da5a79e"
  }, {
    "url": "pwa-512x512.png",
    "revision": "a7009f573d5d10587675091ee2ae2cd5"
  }, {
    "url": "pwa-maskable-192x192.png",
    "revision": "ff588244de266e03b318c991486931b0"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "fa6049d8093e521a4dcf24371ed6722d"
  }, {
    "url": "manifest.webmanifest",
    "revision": "fed42ea2ac849ddd522260a3e3145c12"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
