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

  // ---------- base path ----------
  // The app may live under a sub-path (e.g. /studio). The server tells us which
  // one; every absolute app URL ("/api/...", "/uploads/...") goes through asvaUrl.
  var BASE = String(window.ASVA_BASE || "").replace(/\/+$/, "");
  window.ASVA_BASE = BASE;
  function asvaUrl(u) {
    if (!BASE || typeof u !== "string" || u.charAt(0) !== "/" || u.charAt(1) === "/") return u;
    if (u === BASE || u.indexOf(BASE + "/") === 0 || u.indexOf(BASE + "?") === 0 || u.indexOf(BASE + "#") === 0) return u;
    return BASE + u;
  }
  window.asvaUrl = asvaUrl;
  /** Path inside the app, without the base path ("/studio/api/x" -> "/api/x"). */
  function appPath(pathname) {
    return BASE && (pathname === BASE || pathname.indexOf(BASE + "/") === 0) ? pathname.slice(BASE.length) || "/" : pathname;
  }
  window.asvaAppPath = appPath;
  // Links built at runtime ("/depot", "/uploads/x.png") get the base path when clicked.
  if (BASE) {
    var fixLink = function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href");
      var fixed = asvaUrl(href);
      if (fixed !== href) a.setAttribute("href", fixed);
    };
    // mousedown also covers middle-click / "open in new tab".
    document.addEventListener("mousedown", fixLink, true);
    document.addEventListener("click", fixLink, true);
    document.addEventListener("keydown", function (ev) { if (ev.key === "Enter") fixLink(ev); }, true);
  }

  // Older page code sets image/file addresses directly ("img.src = '/uploads/x.png'",
  // or HTML strings without safeUrl). Give those the base path as well.
  if (BASE) {
    [window.HTMLImageElement, window.HTMLMediaElement, window.HTMLSourceElement].forEach(function (Ctor) {
      if (!Ctor) return;
      var desc = Object.getOwnPropertyDescriptor(Ctor.prototype, "src");
      if (!desc || !desc.set) return;
      Object.defineProperty(Ctor.prototype, "src", {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (v) { desc.set.call(this, typeof v === "string" ? asvaUrl(v) : v); },
      });
    });
    // url(/x) not already starting with the base path.
    var STYLE_URL = new RegExp("url\\((['\"]?)\\/(?!\\/|" + BASE.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\/)", "g");
    var fixNode = function (el) {
      if (!el || el.nodeType !== 1) return;
      ["src", "href", "poster", "data-light", "data-dark"].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && v.charAt(0) === "/" && v.charAt(1) !== "/") {
          var fixed = asvaUrl(v);
          if (fixed !== v) el.setAttribute(attr, fixed);
        }
      });
      var st = el.getAttribute("style");
      if (st && st.indexOf("url(") !== -1) {
        var fixedStyle = st.replace(STYLE_URL, "url($1" + BASE + "/");
        if (fixedStyle !== st) el.setAttribute("style", fixedStyle);
      }
    };
    var fixTree = function (root) {
      if (!root || root.nodeType !== 1) return;
      fixNode(root);
      var all = root.querySelectorAll("[src],[href],[poster],[data-light],[data-dark],[style*='url(']");
      for (var i = 0; i < all.length; i++) fixNode(all[i]);
    };
    var startObserver = function () {
      fixTree(document.documentElement);
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          if (m.type === "attributes") fixNode(m.target);
          else m.addedNodes.forEach(fixTree);
        });
      }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "href", "poster", "data-light", "data-dark", "style"],
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
    else startObserver();
  }

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
    return /^(https?:|\/(?!\/)|data:image\/(png|jpe?g|gif|webp);|data:image\/svg\+xml;charset=utf-8,|blob:)/i.test(u) ? asvaUrl(u) : "";
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
        s.src = asvaUrl(src);
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

  // ---------- no connection ----------
  // While the server can't be reached every save button is disabled (html.asva-offline) and
  // a clear bar says so; the server is probed every few seconds and everything comes back
  // on its own when it answers again. Nothing is shown as saved without the server's answer.
  var offlineBar = null, offlineProbe = null, isOfflineNow = false;
  (function () {
    var css = document.createElement("style");
    css.textContent =
      "html.asva-offline :is(.btn-primary,.wf-btn.primary,#qfSave,.qf-actions .save,.cd-yes,button[type=submit]," +
      "button[onclick*='save'],button[onclick*='Save'],button[onclick*='submit'],button[id*='save'],button[id*='Save']){" +
      "opacity:.45!important;pointer-events:none!important;cursor:not-allowed!important;filter:grayscale(.6)}" +
      ".asva-offline-bar{position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#b91c1c;color:#fff;text-align:center;" +
      "padding:10px 14px;font-size:.92rem;font-family:inherit;line-height:1.7;box-shadow:0 6px 20px -8px rgba(0,0,0,.5)}" +
      ".asva-offline-bar b{display:block}";
    (document.head || document.documentElement).appendChild(css);
  })();
  function setOffline(isOffline) {
    if (isOffline === isOfflineNow && (!isOffline || (offlineBar && offlineBar.parentNode))) return;
    isOfflineNow = isOffline;
    document.documentElement.classList.toggle("asva-offline", isOffline);
    if (!document.body) return;
    if (isOffline) {
      if (!offlineBar) {
        offlineBar = document.createElement("div");
        offlineBar.className = "asva-offline-bar";
        offlineBar.setAttribute("role", "alert");
        offlineBar.innerHTML = "<b>ارتباط با سرور قطع است.</b>دکمه‌های ذخیره تا برگشتن اتصال غیرفعال‌اند. پنجره‌ها را نبندید تا چیزی که نوشته‌اید از بین نرود؛ اتصال هر چند ثانیه دوباره بررسی می‌شود.";
      }
      if (!offlineBar.parentNode) document.body.appendChild(offlineBar);
      if (!offlineProbe) offlineProbe = setInterval(probe, 5000);
    } else {
      if (offlineBar && offlineBar.parentNode) {
        offlineBar.parentNode.removeChild(offlineBar);
        notify("اتصال برقرار شد. حالا می‌توانید ذخیره کنید.", "success");
      }
      if (offlineProbe) { clearInterval(offlineProbe); offlineProbe = null; }
    }
  }
  function probe() {
    originalFetch(asvaUrl("/api/check_auth"), { cache: "no-store" }).then(function (r) {
      if (r.status < 500) setOffline(false);
    }, function () {});
  }
  window.asvaIsOffline = function () { return isOfflineNow; };
  window.addEventListener("offline", function () { setOffline(true); });
  window.addEventListener("online", function () { probe(); });

  // ---------- API request handling ----------
  var originalFetch = window.fetch.bind(window);
  var CACHEABLE = ["/api/get_orgs", "/api/get_colleagues", "/api/manage_settings", "/api/get_collections", "/api/get_roles", "/api/get_studio_info"];
  var CACHE_TTL = 60 * 1000;
  var CACHE_PREFIX = "asva-api:";
  var inFlight = {};
  var lastGood = {};
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

  // A bare "#" link is a button in disguise: following it would scroll the page back to the top.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href="#"]') : null;
    if (a) e.preventDefault();
  }, true);

  /**
   * Runs a reload and puts every scroll position back afterwards (the page, lists, open
   * dialogs), so a list redrawn after a change does not jump the user back to the top.
   * Elements replaced by the reload are found again by id.
   */
  window.asvaKeepScroll = async function (fn) {
    var saved = [];
    var root = document.scrollingElement || document.documentElement;
    saved.push({ el: root, top: root.scrollTop, left: root.scrollLeft });
    document.querySelectorAll("body *").forEach(function (el) {
      if (el.scrollTop > 0 || el.scrollLeft > 0) saved.push({ el: el, id: el.id, top: el.scrollTop, left: el.scrollLeft });
    });
    var restore = function () {
      saved.forEach(function (s) {
        var el = s.el.isConnected ? s.el : (s.id ? document.getElementById(s.id) : null);
        if (!el) return;
        if (el.scrollTop !== s.top) el.scrollTop = s.top;
        if (el.scrollLeft !== s.left) el.scrollLeft = s.left;
      });
    };
    try {
      return await fn();
    } finally {
      restore();
      // Content drawn a frame later (images, lazy lists) can change heights once more.
      requestAnimationFrame(restore);
    }
  };

  // An ended session no longer sends the user away from the page (losing what they typed):
  // a small dialog logs them in again right here, then they press save once more.
  var reloginOpen = false;
  function sessionExpired() {
    if (redirecting || reloginOpen || /^\/(index|login)?$/.test(appPath(location.pathname))) return;
    cacheClear();
    if (!document.body) return goToLogin();
    reloginOpen = true;
    var me = window.ASVA_ME || {};
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;inset:0;z-index:2147483645;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit";
    box.innerHTML =
      '<form role="dialog" aria-modal="true" aria-label="ورود دوباره" style="background:var(--card-bg,#fff);color:var(--text-dark,#111);border-radius:16px;padding:22px;max-width:380px;width:100%;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)">' +
      '<h3 style="margin:0 0 6px">نشست شما تمام شده است</h3>' +
      '<p style="margin:0 0 14px;font-size:.88rem;color:var(--text-gray,#555);line-height:1.8">برای این‌که چیزی از کارتان از بین نرود، همین‌جا دوباره وارد شوید و بعد دکمه‌ی ذخیره را یک بار دیگر بزنید.</p>' +
      '<input name="u" autocomplete="username" placeholder="نام کاربری" class="form-control" style="width:100%;margin-bottom:8px;box-sizing:border-box">' +
      '<input name="p" type="password" autocomplete="current-password" placeholder="رمز عبور" class="form-control" style="width:100%;margin-bottom:8px;box-sizing:border-box">' +
      '<div data-err style="color:#b91c1c;font-size:.85rem;min-height:1.4em"></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button type="submit" class="btn-primary" style="flex:1">ورود و ادامه</button>' +
      '<button type="button" data-leave class="btn-outline">رفتن به صفحه‌ی ورود</button></div></form>';
    document.body.appendChild(box);
    var form = box.querySelector("form");
    form.u.value = me.username || "";
    (me.username ? form.p : form.u).focus();
    box.querySelector("[data-leave]").onclick = goToLogin;
    form.onsubmit = function (e) {
      e.preventDefault();
      var err = form.querySelector("[data-err]");
      err.textContent = "";
      originalFetch(asvaUrl("/api/login"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ username: form.u.value, password: form.p.value }),
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
        if (d.status !== "success") { err.textContent = d.message || "ورود انجام نشد"; return; }
        box.remove();
        reloginOpen = false;
        notify("دوباره وارد شدید. اگر چیزی ذخیره نشده بود، دکمه‌ی ذخیره را دوباره بزنید.", "success");
      }, function () { err.textContent = "ارتباط با سرور برقرار نشد"; });
    };
  }
  function goToLogin() {
    redirecting = true;
    var next = location.pathname + location.search;
    location.href = asvaUrl("/") + "?expired=1&next=" + encodeURIComponent(next);
  }

  // ---------- smaller images before upload ----------
  // Profile pictures, logos and icons are resized to the largest size the app
  // shows them at and re-encoded (WebP keeps transparency), so big photos never
  // reach the host. The server does the same as a safety net.
  var IMAGE_MAX_EDGE = { avatar: 256, logo: 512, icon: 128, image: 1600 };
  function shrinkDataUrl(dataUrl, purpose) {
    return new Promise(function (resolve) {
      if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl)) return resolve(dataUrl);
      var max = IMAGE_MAX_EDGE[purpose] || IMAGE_MAX_EDGE.image;
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.max(1, Math.round(img.naturalWidth * scale));
          var h = Math.max(1, Math.round(img.naturalHeight * scale));
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);
          var out = canvas.toDataURL("image/webp", 0.85);
          // Browsers without WebP encoding return PNG: use JPEG for photos without transparency.
          if (out.indexOf("data:image/webp") !== 0) {
            var alpha = false;
            var px = ctx.getImageData(0, 0, w, h).data;
            for (var i = 3; i < px.length; i += 4) if (px[i] < 255) { alpha = true; break; }
            out = alpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
          }
          resolve(out.length < dataUrl.length ? out : dataUrl);
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  window.asvaShrinkImage = shrinkDataUrl;

  window.fetch = function (input, init) {
    if (typeof input === "string") input = asvaUrl(input);
    if (typeof input === "string" && init && typeof init.body === "string" && !init.__shrunk &&
        appPath(new URL(input, location.href).pathname) === "/api/upload_image") {
      var payload = null;
      try { payload = JSON.parse(init.body); } catch (e) {}
      if (payload && typeof payload.image === "string" && payload.image.indexOf("data:image/") === 0) {
        var target = input;
        return shrinkDataUrl(payload.image, payload.purpose).then(function (small) {
          payload.image = small;
          var next = {};
          for (var k in init) next[k] = init[k];
          next.body = JSON.stringify(payload);
          next.__shrunk = true;
          return window.fetch(target, next);
        });
      }
    }
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var path;
    try { path = new URL(url, location.href); } catch (e) { return originalFetch(input, init); }
    var apiPath = appPath(path.pathname);
    if (path.origin !== location.origin || apiPath.indexOf("/api/") !== 0) return originalFetch(input, init);

    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var isRead = method === "GET" || method === "HEAD";
    var cacheKey = apiPath + path.search;
    var cacheable = isRead && CACHEABLE.indexOf(apiPath) !== -1;

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
        // The host answers 502/503/504 itself (an HTML page) when the app is down.
        var hostDown = res.status >= 502 && res.status <= 504 && !/json/.test(res.headers.get("content-type") || "");
        if (hostDown) {
          setOffline(true);
          if (!isRead) notify("سرور در دسترس نیست؛ تغییر ذخیره نشد. پنجره را نبندید و بعد از برگشتن اتصال دوباره ذخیره کنید.", "error");
          if (isRead && lastGood[cacheKey]) return new Response(lastGood[cacheKey], { status: 200, headers: { "Content-Type": "application/json", "X-Asva-Stale": "1" } });
          return jsonResponse({ status: "error", message: "سرور در دسترس نیست؛ تغییر ذخیره نشد." }, 503);
        }
        setOffline(false);
        if (res.status === 401 && apiPath !== "/api/login") sessionExpired();
        // Last good answer of each list, shown again if the connection drops for a moment
        // (instead of empty lists and zero counts).
        if (res.ok && isRead) res.clone().text().then(function (text) { if (text.length < 3e6) lastGood[cacheKey] = text; }, function () {});
        if (res.ok && !isRead) cacheClear();
        if (res.ok && cacheable) {
          res.clone().text().then(function (text) { cacheSet(cacheKey, text); });
        }
        return res;
      },
      function () {
        setOffline(true);
        if (!isRead) notify("ارتباط با سرور برقرار نشد؛ تغییر ذخیره نشد. پنجره را نبندید و بعد از برگشتن اتصال دوباره ذخیره کنید.", "error");
        if (isRead && lastGood[cacheKey]) return new Response(lastGood[cacheKey], { status: 200, headers: { "Content-Type": "application/json", "X-Asva-Stale": "1" } });
        if (isRead && cacheable) {
          try {
            var raw = sessionStorage.getItem(CACHE_PREFIX + cacheKey);
            if (raw) return new Response(JSON.parse(raw).body, { status: 200, headers: { "Content-Type": "application/json", "X-Asva-Stale": "1" } });
          } catch (e) {}
        }
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

  // ---------- date fields ----------
  // Every Jalali date field accepts ۱۴۰۵/۹/۳, 1405-09-03 ... and shows it as ۱۴۰۵/۰۹/۰۳; an
  // impossible date is marked at once (the server rejects it too, instead of clearing it).
  function jalaliCheck(v) {
    var s = String(v || "").replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06f0); }).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }).trim();
    if (!s) return { ok: true, value: "" };
    var m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
    if (!m) return { ok: false };
    var y = +m[1], mo = +m[2], d = +m[3];
    var ok = y >= 1300 && y <= 1500 && mo >= 1 && mo <= 12 && d >= 1 &&
      (window.jalaali && window.jalaali.isValidJalaaliDate ? window.jalaali.isValidJalaaliDate(y, mo, d) : d <= (mo <= 6 ? 31 : 30));
    return ok ? { ok: true, value: m[1] + "/" + ("0" + mo).slice(-2) + "/" + ("0" + d).slice(-2) } : { ok: false };
  }
  window.asvaCheckJalali = jalaliCheck;
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el || !el.matches || !el.matches("input[data-jdp]")) return;
    var r = jalaliCheck(el.value);
    el.setAttribute("aria-invalid", r.ok ? "false" : "true");
    el.style.outline = r.ok ? "" : "2px solid #dc2626";
    el.title = r.ok ? "" : "تاریخ نامعتبر است؛ مثلاً ۱۴۰۵/۰۹/۰۳";
    if (r.ok && r.value) {
      var shown = r.value.replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; });
      if (el.value !== shown) el.value = shown;
    }
    if (!r.ok) notify("تاریخ نامعتبر است. آن را به شکل ۱۴۰۵/۰۹/۰۳ بنویسید یا از تقویم انتخاب کنید.", "error");
  }, true);

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

  // ---------- show / hide password ----------
  // Every password field gets an eye button so people can check what they typed.
  var EYE = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.16 3.19"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
  function setPasswordVisible(input, btn, show) {
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? EYE_OFF : EYE;
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "پنهان کردن رمز عبور" : "نمایش رمز عبور");
    btn.title = show ? "پنهان کردن رمز" : "نمایش رمز";
  }
  function addPasswordEye(input) {
    if (!input || input.getAttribute("data-pw-eye") || !input.parentNode) return;
    input.setAttribute("data-pw-eye", "1");
    var wrap = document.createElement("span");
    wrap.className = "asva-pw-wrap";
    wrap.style.cssText = "position:relative; display:block; width:100%;";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var ltr = (input.getAttribute("dir") || getComputedStyle(input).direction) === "ltr";
    var side = ltr ? "right" : "left";
    input.style[ltr ? "paddingRight" : "paddingLeft"] = "46px";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "asva-pw-eye";
    btn.style.cssText = "position:absolute; top:50%; transform:translateY(-50%); " + side + ":4px; width:38px; height:38px; min-width:38px; min-height:38px; padding:0; margin:0; border:none; background:none; box-shadow:none; color:var(--text-gray, #64748b); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; z-index:2;";
    setPasswordVisible(input, btn, false);
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      var start = input.selectionStart, end = input.selectionEnd;
      setPasswordVisible(input, btn, show);
      input.focus();
      try { input.setSelectionRange(start, end); } catch (e) {}
    });
    wrap.appendChild(btn);
    // A saved or cleared form never leaves a password on screen.
    var form = input.form;
    if (form && !form.getAttribute("data-pw-eye-form")) {
      form.setAttribute("data-pw-eye-form", "1");
      var hideAll = function () {
        form.querySelectorAll(".asva-pw-wrap").forEach(function (w) {
          var i = w.querySelector("input"), b = w.querySelector(".asva-pw-eye");
          if (i && b && i.type === "text") setPasswordVisible(i, b, false);
        });
      };
      form.addEventListener("submit", hideAll, true);
      form.addEventListener("reset", hideAll);
    }
  }
  function scanPasswords(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="password"]')) addPasswordEye(root);
    root.querySelectorAll('input[type="password"]').forEach(addPasswordEye);
  }
  window.asvaAddPasswordEye = addPasswordEye;

  // ---------- "type it twice" for new passwords ----------
  // Same comparison as the server: surrounding spaces ignored, Persian/Arabic digits = Latin digits.
  function normalizePw(v) {
    return String(v || "").trim()
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }
  /**
   * Wires a password field to its "repeat" field and a hint element.
   * Returns { problem() } → a message to show, or "" when the pair can be saved
   * (both empty counts as "no change").
   */
  window.asvaPasswordPair = function (pw, confirm, hint) {
    var update = function () {
      if (!hint) return;
      var a = normalizePw(pw.value), b = normalizePw(confirm.value);
      if (!a && !b) { hint.textContent = ""; return; }
      if (!b) { hint.textContent = "رمز را در خانه‌ی «تکرار» هم بنویسید."; hint.style.color = "var(--text-gray)"; return; }
      var same = a === b;
      hint.innerHTML = same ? "<i class=ai data-ic=check></i> دو رمز یکسان است" : "<i class=ai data-ic=x></i> با رمز بالا یکسان نیست";
      hint.style.color = same ? "var(--success-color, #16a34a)" : "var(--error-color, #ef4444)";
    };
    pw.addEventListener("input", update);
    confirm.addEventListener("input", update);
    return {
      update: update,
      problem: function () {
        var a = normalizePw(pw.value), b = normalizePw(confirm.value);
        if (!a && !b) return "";
        if (!b) return "رمز عبور را برای اطمینان یک بار دیگر در خانه‌ی «تکرار رمز عبور» بنویسید.";
        if (a !== b) return "رمز عبور و تکرار آن یکسان نیستند؛ دوباره بنویسید (می‌توانید با آیکون چشم ببینیدشان).";
        return "";
      },
      clear: function () { pw.value = ""; confirm.value = ""; update(); },
    };
  };
  function startPasswordEyes() {
    scanPasswords(document.body);
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scanPasswords(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPasswordEyes);
  else startPasswordEyes();

  // ---------- live notifications ----------
  // One Socket.IO connection per page; new notifications refresh the badge and
  // show a short toast instead of waiting for the next poll.
  function connectLive() {
    if (/^\/(index|login)?$/.test(appPath(location.pathname))) return;
    var start = function () {
      if (!window.io) return;
      var socket = window.asvaSocket || (window.asvaSocket = window.io({ path: BASE + "/socket.io" }));
      socket.on("connect_error", function (err) {
        if (err && err.message === "unauthorized") socket.disconnect();
      });
      // Someone changed data: forget cached lists so the next load is fresh.
      socket.on("cache_bust", function () {
        cacheClear();
        window.dispatchEvent(new CustomEvent("asva:data_changed"));
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
        var res = await originalFetch(asvaUrl("/api/upload_chunk") + "?upload_id=" + encodeURIComponent(id) + "&offset=" + offset, {
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
          var st = await originalFetch(asvaUrl("/api/upload_status") + "?upload_id=" + encodeURIComponent(id), { credentials: "same-origin" });
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
        row.querySelector(".pct").innerHTML = "<i class=ai data-ic=check></i>";
        uploaded.push(result);
      } catch (e) {
        row.querySelector(".pct").innerHTML = "<i class=ai data-ic=x></i>";
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

// ---------------------------------------------------------------------------
// Icons: the same line-icon family as the sidebar (Lucide). Markup anywhere, in
// templates or in strings built by scripts, is just  <i class=ai data-ic=folder></i>
// (no quotes, so it is safe inside any JS string); it is filled with the SVG as soon as
// it reaches the page. window.asvaIcon(name) returns the same markup for scripts.
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  var ICONS = {
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "check-check": "<path d=\"M18 6 7 17l-5-5\"/><path d=\"m22 10-7.5 7.5L13 16\"/>",
    "x": "<path d=\"M18 6 6 18\"/> <path d=\"m6 6 12 12\"/>",
    "plus": "<path d=\"M5 12h14\"/> <path d=\"M12 5v14\"/>",
    "building-2": "<path d=\"M10 12h4\"/> <path d=\"M10 8h4\"/> <path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/> <path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/> <path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/>",
    "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/> <path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/> <path d=\"M10 9H8\"/> <path d=\"M16 13H8\"/> <path d=\"M16 17H8\"/>",
    "folder": "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>",
    "folder-open": "<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\"/>",
    "palette": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/> <circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/> <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/> <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/> <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
    "image": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/> <circle cx=\"9\" cy=\"9\" r=\"2\"/> <path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>",
    "clapperboard": "<path d=\"m12.296 3.464 3.02 3.956\"/> <path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\"/> <path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/> <path d=\"m6.18 5.276 3.1 3.899\"/>",
    "sparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/> <path d=\"M20 2v4\"/> <path d=\"M22 4h-4\"/> <circle cx=\"4\" cy=\"20\" r=\"2\"/>",
    "package": "<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\"/> <path d=\"M12 22V12\"/> <polyline points=\"3.29 7 12 12 20.71 7\"/> <path d=\"m7.5 4.27 9 5.15\"/>",
    "printer": "<path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"/> <path d=\"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6\"/> <rect x=\"6\" y=\"14\" width=\"12\" height=\"8\" rx=\"1\"/>",
    "timer": "<line x1=\"10\" x2=\"14\" y1=\"2\" y2=\"2\"/> <line x1=\"12\" x2=\"15\" y1=\"14\" y2=\"11\"/> <circle cx=\"12\" cy=\"14\" r=\"8\"/>",
    "type": "<path d=\"M12 4v16\"/> <path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\"/> <path d=\"M9 20h6\"/>",
    "triangle-alert": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/> <path d=\"M12 9v4\"/> <path d=\"M12 17h.01\"/>",
    "calendar-days": "<path d=\"M8 2v3\"/> <path d=\"M16 2v3\"/> <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/> <path d=\"M3 9h18\"/> <path d=\"M8 13h.01\"/> <path d=\"M12 13h.01\"/> <path d=\"M16 13h.01\"/> <path d=\"M8 17h.01\"/> <path d=\"M12 17h.01\"/> <path d=\"M16 17h.01\"/>",
    "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"m9 12 2 2 4-4\"/>",
    "alarm-clock": "<circle cx=\"12\" cy=\"13\" r=\"8\"/> <path d=\"M12 9v4l2 2\"/> <path d=\"M5 3 2 6\"/> <path d=\"m22 6-3-3\"/> <path d=\"M6.38 18.7 4 21\"/> <path d=\"M17.64 18.67 20 21\"/>",
    "map-pin": "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/> <circle cx=\"12\" cy=\"10\" r=\"3\"/>",
    "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/> <path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/> <path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/> <circle cx=\"9\" cy=\"7\" r=\"4\"/>",
    "notebook-pen": "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\"/> <path d=\"M2 6h4\"/> <path d=\"M2 10h4\"/> <path d=\"M2 14h4\"/> <path d=\"M2 18h4\"/> <path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\"/>",
    "chart-column": "<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/> <path d=\"M18 17V9\"/> <path d=\"M13 17V5\"/> <path d=\"M8 17v-3\"/>",
    "music": "<path d=\"M9 18V5l12-2v13\"/> <circle cx=\"6\" cy=\"18\" r=\"3\"/> <circle cx=\"18\" cy=\"16\" r=\"3\"/>",
    "upload": "<path d=\"M12 3v12\"/> <path d=\"m17 8-5-5-5 5\"/> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>",
    "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/> <path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
    "lock-open": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/> <path d=\"M7 11V7a5 5 0 0 1 9.9-1\"/>",
    "folders": "<path d=\"M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z\"/> <path d=\"M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1\"/>",
    "trash-2": "<path d=\"M10 11v6\"/> <path d=\"M14 11v6\"/> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/> <path d=\"M3 6h18\"/> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    "message-circle": "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/>",
    "megaphone": "<path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\"/> <path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\"/> <path d=\"M8 6v8\"/>",
    "mail": "<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/> <rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>",
    "calendar": "<path d=\"M8 2v3\"/> <path d=\"M16 2v3\"/> <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/> <path d=\"M3 9h18\"/>",
    "save": "<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/> <path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\"/> <path d=\"M7 3v4a1 1 0 0 0 1 1h7\"/>",
    "download": "<path d=\"M12 15V3\"/> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/> <path d=\"m7 10 5 5 5-5\"/>",
    "arrow-left": "<path d=\"m12 19-7-7 7-7\"/> <path d=\"M19 12H5\"/>",
    "arrow-right": "<path d=\"M5 12h14\"/> <path d=\"m12 5 7 7-7 7\"/>",
    "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/> <path d=\"m15 5 4 4\"/>",
    "ban": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M4.929 4.929 19.07 19.071\"/>",
    "lightbulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/> <path d=\"M9 18h6\"/> <path d=\"M10 22h4\"/>",
    "smartphone": "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/> <path d=\"M12 18h.01\"/>",
    "scale": "<path d=\"M12 3v18\"/> <path d=\"m19 8 3 8a5 5 0 0 1-6 0zV7\"/> <path d=\"M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1\"/> <path d=\"m5 8 3 8a5 5 0 0 1-6 0zV7\"/> <path d=\"M7 21h10\"/>",
    "target": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <circle cx=\"12\" cy=\"12\" r=\"6\"/> <circle cx=\"12\" cy=\"12\" r=\"2\"/>",
    "paperclip": "<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\"/>",
    "video": "<path d=\"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5\"/> <rect x=\"2\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\"/>",
    "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/> <circle cx=\"12\" cy=\"7\" r=\"4\"/>",
    "settings": "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/> <circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/> <circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "rocket": "<path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\"/> <path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\"/> <path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\"/> <path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\"/>",
    "send": "<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\"/> <path d=\"m21.854 2.147-10.94 10.939\"/>",
    "credit-card": "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\"/> <line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\"/>",
    "bell": "<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/> <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/>",
    "file-signature": "<path d=\"M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z\"/> <path d=\"M14.487 7.858A1 1 0 0 1 14 7V2\"/> <path d=\"M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516\"/> <path d=\"M8 18h1\"/>",
    "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>",
    "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/> <path d=\"M12 17h.01\"/>",
    "drama": "<path d=\"M10 11h.01\"/> <path d=\"M14 6h.01\"/> <path d=\"M18 6h.01\"/> <path d=\"M6.5 13.1h.01\"/> <path d=\"M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3\"/> <path d=\"M17.4 9.9c-.8.8-2 .8-2.8 0\"/> <path d=\"M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7\"/> <path d=\"M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4\"/>",
    "square": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>",
    "refresh-cw": "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/> <path d=\"M21 3v5h-5\"/> <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/> <path d=\"M8 16H3v5\"/>",
    "puzzle": "<path d=\"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z\"/>",
    "tag": "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/> <circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
    "life-buoy": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"m4.93 4.93 4.24 4.24\"/> <path d=\"m14.83 9.17 4.24-4.24\"/> <path d=\"m14.83 14.83 4.24 4.24\"/> <path d=\"m9.17 14.83-4.24 4.24\"/> <circle cx=\"12\" cy=\"12\" r=\"4\"/>",
    "circle": "<circle cx=\"12\" cy=\"12\" r=\"10\"/>",
    "inbox": "<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"/> <path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/>",
    "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M12 6v6l4 2\"/>",
    "search": "<path d=\"m21 21-4.34-4.34\"/> <circle cx=\"11\" cy=\"11\" r=\"8\"/>",
    "receipt": "<path d=\"M12 17V7\"/> <path d=\"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8\"/> <path d=\"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z\"/>",
    "trending-up": "<path d=\"M16 7h6v6\"/> <path d=\"m22 7-8.5 8.5-5-5L2 17\"/>",
    "hourglass": "<path d=\"M5 22h14\"/> <path d=\"M5 2h14\"/> <path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\"/> <path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\"/>",
    "pin": "<path d=\"M12 17v5\"/> <path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\"/>",
    "phone": "<path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"/>",
    "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
    "sun-moon": "<path d=\"M12 2v2\"/> <path d=\"M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715\"/> <path d=\"M16 12a4 4 0 0 0-4-4\"/> <path d=\"m19 5-1.256 1.256\"/> <path d=\"M20 12h2\"/>",
    "pointer": "<path d=\"M22 14a8 8 0 0 1-8 8\"/> <path d=\"M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2\"/> <path d=\"M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1\"/> <path d=\"M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10\"/> <path d=\"M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\"/>",
    "circle-stop": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1\"/>",
    "file-archive": "<path d=\"M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5\"/> <path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/> <path d=\"M8 12v-1\"/> <path d=\"M8 18v-2\"/> <path d=\"M8 7V6\"/> <circle cx=\"8\" cy=\"20\" r=\"2\"/>",
    "hash": "<line x1=\"4\" x2=\"20\" y1=\"9\" y2=\"9\"/> <line x1=\"4\" x2=\"20\" y1=\"15\" y2=\"15\"/> <line x1=\"10\" x2=\"8\" y1=\"3\" y2=\"21\"/> <line x1=\"16\" x2=\"14\" y1=\"3\" y2=\"21\"/>",
    "undo-2": "<path d=\"M9 14 4 9l5-5\"/> <path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>",
    "badge-check": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\"/> <path d=\"m9 12 2 2 4-4\"/>",
    "play": "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>",
    "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M12 16v-4\"/> <path d=\"M12 8h.01\"/>",
    "arrow-up": "<path d=\"m5 12 7-7 7 7\"/> <path d=\"M12 19V5\"/>",
    "arrow-down": "<path d=\"M12 5v14\"/> <path d=\"m19 12-7 7-7-7\"/>",
    "external-link": "<path d=\"M15 3h6v6\"/> <path d=\"M10 14 21 3\"/> <path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>",
    "image-off": "<line x1=\"2\" x2=\"22\" y1=\"2\" y2=\"22\"/> <path d=\"M10.41 10.41a2 2 0 1 1-2.83-2.83\"/> <line x1=\"13.5\" x2=\"6\" y1=\"13.5\" y2=\"21\"/> <line x1=\"18\" x2=\"21\" y1=\"12\" y2=\"15\"/> <path d=\"M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59\"/> <path d=\"M21 15V5a2 2 0 0 0-2-2H9\"/>"
  };

  function svg(name) {
    var body = ICONS[name];
    return body ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + "</svg>" : "";
  }
  window.asvaIconSvg = svg;
  /** Old saved labels may still carry an emoji (e.g. media types); show them without it. */
  window.asvaNoEmoji = function (s) {
    return String(s == null ? "" : s).replace(/(?:[\u2600-\u27BF\u2B00-\u2BFF\u2300-\u23FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])\uFE0F?|\uFE0F/g, "").replace(/\s{2,}/g, " ").trim();
  };
  window.asvaIcon = function (name, cls) {
    return "<i class=\"ai" + (cls ? " " + cls : "") + "\" data-ic=\"" + name + "\" aria-hidden=\"true\">" + svg(name) + "</i>";
  };
  function fill(el) {
    if (el.firstElementChild) return;
    var s = svg(el.getAttribute("data-ic"));
    if (!s) return;
    el.innerHTML = s;
    if (!el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", "true");
  }
  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.hasAttribute("data-ic")) fill(node);
    if (node.firstElementChild) {
      var list = node.querySelectorAll("i[data-ic]");
      for (var i = 0; i < list.length; i++) fill(list[i]);
    }
  }
  window.asvaIconsScan = scan;

  // Images whose file is missing: <img data-fallback-src="..."> swaps to that address once;
  // <img data-fallback-icon="image-off"> is replaced by a same-sized box with that icon.
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (!img || img.tagName !== "IMG") return;
    var alt = img.getAttribute("data-fallback-src");
    if (alt && !img.hasAttribute("data-fallback-used")) {
      img.setAttribute("data-fallback-used", "");
      img.src = alt;
      return;
    }
    var icon = img.getAttribute("data-fallback-icon");
    if (!icon || !ICONS[icon]) return;
    var box = document.createElement("span");
    box.style.cssText = img.style.cssText;
    box.style.display = "inline-flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.color = "var(--text-gray, #64748b)";
    box.style.fontSize = "2rem";
    box.title = "فایل این تصویر پیدا نشد";
    box.innerHTML = window.asvaIcon(icon);
    img.replaceWith(box);
  }, true);

  var css = "i.ai{display:inline-flex;align-items:center;justify-content:center;width:1.15em;height:1.15em;vertical-align:-0.2em;font-style:normal;flex-shrink:0;line-height:1}" +
    "i.ai>svg{width:100%;height:100%;display:block}" +
    "i.ai.ai-fill>svg{fill:currentColor}" +
    "i.ai.ai-lg{width:1em;height:1em}";
  var style = document.createElement("style");
  style.setAttribute("data-asva-icons", "");
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      for (var r = 0; r < records.length; r++) {
        var added = records[r].addedNodes;
        for (var a = 0; a < added.length; a++) scan(added[a]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { scan(document.body); });
  else scan(document.body);
})();

// ---------------------------------------------------------------------------
// Glass look: "reduce transparency" (per user; the server passes the saved choice, the
// browser keeps a copy so it applies before the first paint), and the page header that
// turns to glass once it sticks to the top while scrolling.
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  var KEY = "asva-reduce-glass";
  var root = document.documentElement;
  function apply(on) { root.classList.toggle("reduce-glass", !!on); }
  var fromServer = typeof window.ASVA_REDUCE_GLASS === "number" ? window.ASVA_REDUCE_GLASS === 1 : null;
  var local = null;
  try { local = localStorage.getItem(KEY); } catch (e) {}
  if (fromServer !== null) {
    apply(fromServer);
    try { localStorage.setItem(KEY, fromServer ? "1" : "0"); } catch (e) {}
  } else if (local !== null) apply(local === "1");

  window.asvaReduceGlass = function () { return root.classList.contains("reduce-glass"); };
  window.asvaSetReduceGlass = function (on) {
    apply(on);
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    try {
      fetch(window.asvaUrl ? window.asvaUrl("/api/my_ui_prefs") : "/api/my_ui_prefs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reduce_glass: !!on }),
      }).catch(function () {});
    } catch (e) {}
    document.dispatchEvent(new CustomEvent("asva:glass", { detail: { reduced: !!on } }));
  };

  function watchHeader() {
    var header = document.querySelector(".main-content > .page-header-container");
    if (!header || !window.IntersectionObserver) return;
    var sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "height:1px;margin-bottom:-1px;";
    header.parentNode.insertBefore(sentinel, header);
    new IntersectionObserver(function (entries) {
      header.classList.toggle("is-stuck", !entries[0].isIntersecting);
    }, { rootMargin: "-10px 0px 0px 0px" }).observe(sentinel);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchHeader);
  else watchHeader();
})();
