/*
 * Shared helpers loaded first on every page.
 *  - escaping helpers used when building HTML strings
 *  - one place that handles API requests: expired sessions, lost connection,
 *    duplicate submissions and short-lived caching of reference data
 *  - loadScriptOnce() for heavy libraries that are only needed on demand
 */
(function () {
  if (window.__asvaCore) return;
  window.__asvaCore = true;

  // ---------- escaping ----------
  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
  window.escapeHtml = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"'`]/g, function (c) { return HTML_ESCAPES[c]; });
  };
  window.jsAttr = function (v) {
    return window.escapeHtml(JSON.stringify(String(v == null ? "" : v)));
  };
  window.safeColor = function (c) {
    c = String(c == null ? "" : c).trim();
    return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i.test(c) ? c : "";
  };
  window.safeUrl = function (u) {
    u = String(u == null ? "" : u).trim();
    return /^(https?:|\/(?!\/)|data:image\/(png|jpe?g|gif|webp);|data:image\/svg\+xml;charset=utf-8,|blob:)/i.test(u) ? u : "";
  };

  // Local placeholder avatar (first letter on a colour derived from the name),
  // so no external avatar service is needed.
  var AVATAR_COLORS = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#14b8a6", "#ef4444"];
  window.initialsAvatar = function (name) {
    name = String(name == null ? "" : name).trim() || "?";
    var sum = 0;
    for (var i = 0; i < name.length; i++) sum = (sum + name.charCodeAt(i)) % 997;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="' +
      AVATAR_COLORS[sum % AVATAR_COLORS.length] + '"/><text x="50%" y="54%" font-family="Tahoma,sans-serif" font-size="30" fill="#fff" text-anchor="middle" dominant-baseline="middle">' +
      window.escapeHtml(name.charAt(0)) + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };

  // ---------- on-demand scripts ----------
  var loadingScripts = {};
  window.loadScriptOnce = function (src) {
    if (!loadingScripts[src]) {
      loadingScripts[src] = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () {
          delete loadingScripts[src];
          reject(new Error("بارگذاری " + src + " ممکن نشد"));
        };
        document.head.appendChild(s);
      });
    }
    return loadingScripts[src];
  };
  window.ensureXLSX = function () {
    return window.XLSX ? Promise.resolve(window.XLSX) : window.loadScriptOnce("/assets/js/xlsx.full.min.js").then(function () { return window.XLSX; });
  };
  window.ensureHtml2Pdf = function () {
    return window.html2pdf ? Promise.resolve(window.html2pdf) : window.loadScriptOnce("/assets/js/html2pdf.bundle.min.js").then(function () { return window.html2pdf; });
  };

  // ---------- undo after delete ----------
  // Shows "message" with a «بازگردانی» button that runs undoFn.
  window.toastWithUndo = function (message, undoFn) {
    if (typeof window.showToast !== "function") return;
    window.showToast(message, "info", {
      text: "بازگردانی",
      callback: async function () {
        try {
          var ok = await undoFn();
          window.showToast(ok ? "با موفقیت بازگردانی شد" : "بازگردانی ممکن نشد", ok ? "success" : "error");
        } catch (e) {
          window.showToast("بازگردانی ممکن نشد", "error");
        }
      },
    });
  };
  // Restores an item that the server moved to the recycle bin.
  window.restoreFromBin = async function (binId) {
    var res = await fetch("/api/recycle_bin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", bin_id: binId }),
    });
    var data = await res.json();
    return data.status === "success";
  };

  // ---------- small UI helpers used before the page's own toast exists ----------
  function notify(message, type) {
    if (typeof window.showToast === "function") window.showToast(message, type || "error");
  }

  var offlineBar = null;
  function setOffline(isOffline) {
    if (!document.body) return;
    if (isOffline) {
      if (!offlineBar) {
        offlineBar = document.createElement("div");
        offlineBar.setAttribute("role", "status");
        offlineBar.style.cssText =
          "position:fixed;top:0;left:0;right:0;z-index:100000;background:#b91c1c;color:#fff;" +
          "text-align:center;padding:8px 12px;font-size:0.9rem;font-family:inherit;";
        offlineBar.textContent = "ارتباط با سرور برقرار نیست. تغییرات شما ذخیره نمی‌شود تا اتصال برگردد.";
      }
      if (!offlineBar.parentNode) document.body.appendChild(offlineBar);
    } else if (offlineBar && offlineBar.parentNode) {
      offlineBar.parentNode.removeChild(offlineBar);
    }
  }
  window.addEventListener("offline", function () { setOffline(true); });
  window.addEventListener("online", function () { setOffline(false); });

  // ---------- API request handling ----------
  var originalFetch = window.fetch.bind(window);
  var CACHEABLE = ["/api/get_orgs", "/api/get_colleagues", "/api/manage_settings", "/api/get_collections", "/api/get_roles", "/api/get_studio_info"];
  var CACHE_TTL = 60 * 1000;
  var CACHE_PREFIX = "asva-api:";
  var inFlight = {};
  var redirecting = false;

  function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), { status: status, headers: { "Content-Type": "application/json" } });
  }
  function cacheGet(key) {
    try {
      var raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.t > CACHE_TTL) return null;
      return entry.body;
    } catch (e) { return null; }
  }
  function cacheSet(key, body) {
    try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), body: body })); } catch (e) {}
  }
  function cacheClear() {
    try {
      Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(CACHE_PREFIX) === 0) sessionStorage.removeItem(k); });
    } catch (e) {}
  }
  window.clearApiCache = cacheClear;

  function sessionExpired() {
    if (redirecting || /^\/(index|login)?$/.test(location.pathname)) return;
    redirecting = true;
    cacheClear();
    notify("نشست شما به پایان رسیده است. در حال انتقال به صفحه ورود...", "error");
    var next = location.pathname + location.search;
    setTimeout(function () {
      location.href = "/?expired=1&next=" + encodeURIComponent(next);
    }, 1500);
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var path;
    try { path = new URL(url, location.href); } catch (e) { return originalFetch(input, init); }
    if (path.origin !== location.origin || path.pathname.indexOf("/api/") !== 0) return originalFetch(input, init);

    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var isRead = method === "GET" || method === "HEAD";
    var cacheKey = path.pathname + path.search;
    var cacheable = isRead && CACHEABLE.indexOf(path.pathname) !== -1;

    if (cacheable) {
      var cached = cacheGet(cacheKey);
      if (cached !== null) return Promise.resolve(new Response(cached, { status: 200, headers: { "Content-Type": "application/json" } }));
    }

    // The same request sent twice while the first is still running (double click).
    var body = init && typeof init.body === "string" ? init.body : "";
    var dedupeKey = isRead ? null : method + " " + cacheKey + " " + body;
    if (dedupeKey && inFlight[dedupeKey]) {
      return inFlight[dedupeKey].then(function (r) { return r.clone(); });
    }

    // Disable the button that triggered a save until the server answered.
    var trigger = null;
    if (!isRead) {
      var active = document.activeElement;
      if (active && (active.tagName === "BUTTON" || (active.tagName === "INPUT" && /submit|button/.test(active.type))) && !active.disabled) {
        trigger = active;
        trigger.disabled = true;
        trigger.setAttribute("aria-busy", "true");
      }
    }

    var request = originalFetch(input, init).then(
      function (res) {
        setOffline(false);
        if (res.status === 401) sessionExpired();
        if (res.ok && !isRead) cacheClear();
        if (res.ok && cacheable) {
          res.clone().text().then(function (text) { cacheSet(cacheKey, text); });
        }
        return res;
      },
      function () {
        setOffline(true);
        if (!isRead) notify("ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید.", "error");
        return jsonResponse({ status: "error", message: "ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید." }, 503);
      }
    ).finally(function () {
      if (dedupeKey) delete inFlight[dedupeKey];
      if (trigger) {
        trigger.disabled = false;
        trigger.removeAttribute("aria-busy");
      }
    });
    if (dedupeKey) inFlight[dedupeKey] = request;
    return dedupeKey ? request.then(function (r) { return r.clone(); }) : request;
  };

  // Forms without a JS handler: block a second submit while the page is leaving.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (form.dataset.submitting === "1") { e.preventDefault(); return; }
    setTimeout(function () { if (!e.defaultPrevented) form.dataset.submitting = "1"; }, 0);
  }, true);

  // Inputs that have neither a label nor a placeholder get an accessible name
  // from the nearest preceding label-like text.
  function nameUnlabelledFields(root) {
    (root || document).querySelectorAll("input:not([type=hidden]), select, textarea").forEach(function (el) {
      if (el.getAttribute("aria-label") || (el.labels && el.labels.length) || el.id && document.querySelector('label[for="' + el.id + '"]')) return;
      var name = el.placeholder || el.title;
      if (!name) {
        var prev = el.previousElementSibling;
        if (prev && /^(LABEL|SPAN|STRONG|B|DIV)$/.test(prev.tagName) && prev.textContent.trim().length < 60) name = prev.textContent.trim();
      }
      if (!name && el.tagName === "SELECT" && el.options.length) name = el.options[0].textContent.trim();
      if (name) el.setAttribute("aria-label", name.replace(/[:：]\s*$/, ""));
    });
  }
  document.addEventListener("DOMContentLoaded", function () { nameUnlabelledFields(); });

  // ---------- charts ----------
  // Canvas can't read CSS variables, so "var(--x)" colours rendered black.
  // Resolve them, use the app font and Persian digits for every chart.
  function resolveCssColor(v) {
    if (typeof v !== "string" || v.indexOf("var(") === -1) return v;
    var styles = getComputedStyle(document.documentElement);
    return v.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, function (_m, name, fallback) {
      return styles.getPropertyValue(name).trim() || (fallback || "#6366f1").trim();
    });
  }
  function setupCharts() {
    if (!window.Chart || window.Chart.__asvaThemed) return;
    var Chart = window.Chart;
    Chart.__asvaThemed = true;
    Chart.defaults.locale = "fa-IR";
    Chart.defaults.font.family = "'Vazirmatn', 'VazirmatnLocal', Tahoma, sans-serif";
    Chart.register({
      id: "asvaTheme",
      beforeUpdate: function (chart) {
        Chart.defaults.color = resolveCssColor(Chart.defaults.color);
        Chart.defaults.borderColor = resolveCssColor(Chart.defaults.borderColor);
        (chart.data.datasets || []).forEach(function (ds) {
          ["backgroundColor", "borderColor", "hoverBackgroundColor", "pointBackgroundColor"].forEach(function (k) {
            if (Array.isArray(ds[k])) ds[k] = ds[k].map(resolveCssColor);
            else if (ds[k]) ds[k] = resolveCssColor(ds[k]);
          });
        });
      },
    });
  }
  window.setupCharts = setupCharts;
  document.addEventListener("DOMContentLoaded", setupCharts);

  // ---------- live notifications ----------
  // One Socket.IO connection per page; new notifications refresh the badge and
  // show a short toast instead of waiting for the next poll.
  function connectLive() {
    if (/^\/(index|login)?$/.test(location.pathname)) return;
    var start = function () {
      if (!window.io) return;
      var socket = window.asvaSocket || (window.asvaSocket = window.io());
      socket.on("connect_error", function (err) {
        if (err && err.message === "unauthorized") socket.disconnect();
      });
      socket.on("notification", function (n) {
        notify((n && n.title ? n.title + ": " : "") + (n && n.description ? n.description : "اعلان جدید"), "info");
        if (typeof window.fetchNotifications === "function") window.fetchNotifications();
        window.dispatchEvent(new CustomEvent("asva:notification", { detail: n }));
      });
    };
    if (window.io) start();
    else window.loadScriptOnce("/socket.io/socket.io.js").then(start, function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", connectLive);
  else connectLive();

  // ---------- resumable uploads for big files ----------
  // Sends the file in pieces; a dropped piece is retried and the upload resumes
  // where the server stopped, so a 2GB video survives a flaky connection.
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function postJson(url, body) {
    var res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.status !== "success") throw new Error(data.message || "خطا در ارتباط با سرور");
    return data;
  }
  window.asvaUpload = async function (file, opts) {
    opts = opts || {};
    var init = await postJson("/api/upload_init", { name: file.name, size: file.size });
    var id = init.upload_id;
    var size = init.chunk_size || 4 * 1024 * 1024;
    var offset = 0;
    var failures = 0;
    while (offset < file.size) {
      if (opts.signal && opts.signal.aborted) {
        postJson("/api/upload_cancel", { upload_id: id }).catch(function () {});
        throw new Error("آپلود لغو شد");
      }
      var piece = file.slice(offset, offset + size);
      try {
        var res = await originalFetch("/api/upload_chunk?upload_id=" + encodeURIComponent(id) + "&offset=" + offset, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: piece,
          credentials: "same-origin",
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.status === 409 && typeof data.received === "number") { offset = data.received; continue; }
        if (res.status === 401) { sessionExpired(); throw new Error("نشست منقضی شده است"); }
        if (!res.ok || data.status !== "success") throw new Error(data.message || "خطا در ارسال فایل");
        offset = data.received;
        failures = 0;
        if (opts.onProgress) opts.onProgress(offset / file.size, offset, file.size);
      } catch (e) {
        if (/نشست|منقضی/.test(e.message) || ++failures > 6) throw e;
        setOffline(!navigator.onLine);
        await sleep(Math.min(30000, 1000 * Math.pow(2, failures)));
        // Ask where the server stopped before sending again.
        try {
          var st = await originalFetch("/api/upload_status?upload_id=" + encodeURIComponent(id), { credentials: "same-origin" });
          var sd = await st.json();
          if (sd && typeof sd.received === "number") offset = sd.received;
        } catch (e2) {}
      }
    }
    var done = await postJson("/api/upload_complete", { upload_id: id });
    return { name: file.name, url: done.url, size: file.size, type: file.type || done.mime || "" };
  };

  /** Opens the file chooser, uploads every chosen file with a progress panel. */
  window.asvaPickAndUpload = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var input = document.createElement("input");
      input.type = "file";
      if (opts.multiple !== false) input.multiple = true;
      if (opts.accept) input.accept = opts.accept;
      input.style.display = "none";
      input.onchange = async function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.remove();
        if (!files.length) return resolve([]);
        resolve(await window.asvaUploadFiles(files));
      };
      document.body.appendChild(input);
      input.click();
    });
  };

  window.asvaUploadFiles = async function (files) {
    var panel = document.createElement("div");
    panel.className = "asva-upload-panel";
    panel.setAttribute("role", "status");
    panel.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483646;background:var(--card-bg,#fff);color:var(--text-dark,#111);border:1px solid var(--border-color,#ddd);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:14px;width:320px;max-width:calc(100vw - 40px);font-size:.85rem;";
    document.body.appendChild(panel);
    var controller = new AbortController();
    var uploaded = [];
    var rows = files.map(function (f) {
      var row = document.createElement("div");
      row.style.cssText = "margin-bottom:10px";
      row.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + window.escapeHtml(f.name) + '</span><span class="pct">۰٪</span></div><div style="height:6px;background:rgba(128,128,128,.2);border-radius:4px;margin-top:4px;overflow:hidden"><div class="bar" style="height:100%;width:0;background:var(--primary-color,#4f46e5);transition:width .2s"></div></div>';
      panel.appendChild(row);
      return row;
    });
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "لغو آپلود";
    cancel.style.cssText = "background:none;border:1px solid var(--border-color,#ddd);border-radius:8px;padding:4px 10px;cursor:pointer;color:inherit;font-family:inherit";
    cancel.onclick = function () { controller.abort(); };
    panel.appendChild(cancel);
    for (var i = 0; i < files.length; i++) {
      var row = rows[i];
      try {
        var result = await window.asvaUpload(files[i], {
          signal: controller.signal,
          onProgress: function (p) {
            row.querySelector(".bar").style.width = Math.round(p * 100) + "%";
            row.querySelector(".pct").textContent = Math.round(p * 100).toLocaleString("fa-IR") + "٪";
          },
        });
        row.querySelector(".pct").textContent = "✓";
        uploaded.push(result);
      } catch (e) {
        row.querySelector(".pct").textContent = "✗";
        notify(files[i].name + ": " + e.message, "error");
        if (controller.signal.aborted) break;
      }
    }
    setTimeout(function () { panel.remove(); }, 1200);
    return uploaded;
  };

  window.formatFileSize = function (bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n.toLocaleString("fa-IR") + " بایت";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }) + " کیلوبایت";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }) + " مگابایت";
    return (n / 1024 / 1024 / 1024).toFixed(2).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }) + " گیگابایت";
  };
  window.nameUnlabelledFields = nameUnlabelledFields;
})();
