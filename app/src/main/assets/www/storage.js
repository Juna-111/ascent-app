/* Versioned local-storage helpers shared by the offline feature layer and Node tests. */
(function (root) {
  "use strict";
  function load(key, fallbackFactory, storage, now) {
    var target = storage || (root && root.localStorage);
    var fallback = typeof fallbackFactory === "function" ? fallbackFactory : function () { return {}; };
    var raw = null;
    try {
      raw = target ? target.getItem(key) : null;
      if (raw == null) return fallback();
      var value = JSON.parse(raw);
      if (!value || value.version !== 1) throw new Error("Unsupported data version");
      return Object.assign(fallback(), value);
    } catch (error) {
      try {
        if (target && raw != null) target.setItem(key + ".corrupt." + (now == null ? Date.now() : now), raw);
      } catch (preserveError) { /* Keep recovery available if storage is full. */ }
      return fallback();
    }
  }
  function save(key, value, storage) {
    var target = storage || (root && root.localStorage);
    if (!target) return false;
    value.version = 1;
    try { target.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
  }
  function sanitizeImportedState(source) {
    var clean = JSON.parse(JSON.stringify(source || {}));
    if (clean.daily && typeof clean.daily === "object") {
      Object.keys(clean.daily).forEach(function (date) {
        if (clean.daily[date] && typeof clean.daily[date] === "object") delete clean.daily[date].sleep;
      });
    }
    return clean;
  }
  function unpackBackup(parsed) {
    var wrapped = parsed && parsed.state && typeof parsed.state === "object";
    var source = wrapped ? parsed.state : parsed;
    var keys = ["settings", "daily", "weekly", "units", "setup", "tests", "errors"];
    if (!source || typeof source !== "object" || !keys.some(function (key) { return Object.prototype.hasOwnProperty.call(source, key); })) {
      throw new Error("Not an Ascent backup");
    }
    return {
      state: sanitizeImportedState(source),
      extraData: wrapped && parsed.extraData && typeof parsed.extraData === "object" ? parsed.extraData : {}
    };
  }
  var api = { load: load, save: save, sanitizeImportedState: sanitizeImportedState, unpackBackup: unpackBackup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AscentStorage = api;
})(typeof window !== "undefined" ? window : null);