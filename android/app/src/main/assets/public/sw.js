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
    "revision": "3e211bbf4c4f216ea281e45fefc53502"
  }, {
    "url": "pwa-maskable-192x192.png",
    "revision": "7a3c27b81e8c7d163d51bacc25491f0e"
  }, {
    "url": "pwa-512x512.png",
    "revision": "23a305db62bc14262a098ac19d6222cd"
  }, {
    "url": "pwa-192x192.png",
    "revision": "ef0ecc6c123be2f388b60ad4cc8f59eb"
  }, {
    "url": "index.html",
    "revision": "e15488db68fc27966f5252876103d9b7"
  }, {
    "url": "icon.svg",
    "revision": "3dba4a42c17c860d98da222aa4898d4c"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "f63840d67a5e280cb2c87a357112a28e"
  }, {
    "url": "assets/web-wKBQcs8C.js",
    "revision": null
  }, {
    "url": "assets/web-uyYYFAIf.js",
    "revision": null
  }, {
    "url": "assets/purify.es-BQJV6A36.js",
    "revision": null
  }, {
    "url": "assets/native-IMoCA0G9.js",
    "revision": null
  }, {
    "url": "assets/index.es-Atx0Q-h3.js",
    "revision": null
  }, {
    "url": "assets/index-BI3RH8u5.css",
    "revision": null
  }, {
    "url": "assets/index--BnLF9fu.js",
    "revision": null
  }, {
    "url": "assets/html2canvas-UQah6ENR.js",
    "revision": null
  }, {
    "url": "assets/base-DV7-0tXx.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "f63840d67a5e280cb2c87a357112a28e"
  }, {
    "url": "icon.svg",
    "revision": "3dba4a42c17c860d98da222aa4898d4c"
  }, {
    "url": "pwa-192x192.png",
    "revision": "ef0ecc6c123be2f388b60ad4cc8f59eb"
  }, {
    "url": "pwa-512x512.png",
    "revision": "23a305db62bc14262a098ac19d6222cd"
  }, {
    "url": "pwa-maskable-192x192.png",
    "revision": "7a3c27b81e8c7d163d51bacc25491f0e"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "3e211bbf4c4f216ea281e45fefc53502"
  }, {
    "url": "manifest.webmanifest",
    "revision": "20e60a1311fcc383d05289177798dde3"
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
