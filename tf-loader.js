/* =========================================================================
   tf-loader.js
   -------------------------------------------------------------------------
   Loads TensorFlow.js from the local vendored copy (vendor/tf.min.js) so
   the app works fully offline / behind firewalls that block CDNs like
   jsdelivr, unpkg, or cdnjs (a very common cause of the app getting stuck
   on "Could not load the model" — the library itself never arrived, so
   `tf` was undefined). If the local copy is somehow missing, this falls
   back to a CDN copy so the app can still work when the CDN *is* reachable.
========================================================================= */
(function () {
  var LOCAL_SRC = "vendor/tf.min.js";
  var CDN_FALLBACKS = [
    "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js",
    "https://unpkg.com/@tensorflow/tfjs@4.20.0/dist/tf.min.js"
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = function () { resolve(src); };
      script.onerror = function () { reject(new Error("Failed to load script: " + src)); };
      document.head.appendChild(script);
    });
  }

  // Expose a status object + promise so main.js can check whether loading
  // already finished (success or failure) even if it attaches its
  // event listeners after the fact — avoids a race condition where a
  // fast (e.g. cached) local script load fires the event before main.js
  // has started listening for it.
  window.tfjsLoaderStatus = { done: false, ok: false, error: null };
  window.tfjsLoaderPromise = (async function loadTensorFlow() {
    var sources = [LOCAL_SRC].concat(CDN_FALLBACKS);
    var lastError = null;
    for (var i = 0; i < sources.length; i += 1) {
      try {
        await loadScript(sources[i]);
        if (typeof window.tf !== "undefined") {
          window.tfjsLoaderStatus = { done: true, ok: true, error: null, source: sources[i] };
          window.dispatchEvent(new CustomEvent("tfjs-ready", { detail: { source: sources[i] } }));
          return;
        }
        lastError = new Error("Script loaded but window.tf is still undefined: " + sources[i]);
      } catch (err) {
        lastError = err;
      }
    }
    window.tfjsLoaderStatus = { done: true, ok: false, error: lastError };
    window.dispatchEvent(new CustomEvent("tfjs-failed", { detail: { error: lastError } }));
  })();
})();
