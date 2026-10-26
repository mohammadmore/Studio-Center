/* Small helpers shared by the workflow pages (requests, contracts, shoots, ...). */
(function () {
  "use strict";
  var FA = "۰۱۲۳۴۵۶۷۸۹";

  window.fa = function (v) {
    return String(v === null || v === undefined ? "" : v).replace(/\d/g, function (d) { return FA[d]; });
  };
  window.latin = function (v) {
    return String(v || "").replace(/[۰-۹]/g, function (d) { return String(FA.indexOf(d)); }).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  };
  window.money = function (n) {
    var v = Math.round(Number(n) || 0);
    return window.fa(String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (v < 0 ? "−" : "") + " تومان";
  };
  window.faDateTime = function (iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso; }
  };
  window.todayJalali = function () {
    return window.latin(new Intl.DateTimeFormat("fa-IR-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())).replace(/-/g, "/");
  };
  window.jalaliYearMonth = function () {
    var t = window.todayJalali().split("/").map(Number);
    return { year: t[0], month: t[1] };
  };
  window.addDaysJalali = function (jalali, days) {
    if (!window.jalaali) return jalali;
    var p = window.latin(jalali).split("/").map(Number);
    var g = window.jalaali.toGregorian(p[0], p[1], p[2]);
    var d = new Date(g.gy, g.gm - 1, g.gd + days);
    var j = window.jalaali.toJalaali(d);
    return j.jy + "/" + String(j.jm).padStart(2, "0") + "/" + String(j.jd).padStart(2, "0");
  };
  window.JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

  /** JSON API call; shows the server's message on failure and resolves to the body (or null). */
  window.api = async function (url, body, opts) {
    opts = opts || {};
    try {
      var res = await fetch(url, body === undefined ? undefined : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || (data.status && data.status === "error")) {
        if (!opts.quiet && window.showToast) window.showToast(data.message || "خطا در ارتباط با سرور", "error");
        return opts.raw ? data : null;
      }
      if (opts.success && window.showToast) window.showToast(data.message || opts.success, "success");
      return data;
    } catch (e) {
      if (!opts.quiet && window.showToast) window.showToast("خطا در ارتباط با سرور", "error");
      return null;
    }
  };

  // ---------- modal ----------
  window.wfModal = function (title, html, opts) {
    opts = opts || {};
    var overlay = document.createElement("div");
    overlay.className = "wf-overlay";
    overlay.innerHTML =
      '<div class="wf-modal' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-label="' + window.escapeHtml(title) + '">' +
      '<div class="wf-modal-head"><h3>' + window.escapeHtml(title) + '</h3><button type="button" class="wf-x" aria-label="بستن">&times;</button></div>' +
      '<div class="wf-modal-body">' + html + "</div></div>";
    var close = function () {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      if (opts.onClose) opts.onClose();
    };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".wf-x").onclick = close;
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    if (window.wfDatePickers) window.wfDatePickers(overlay);
    var first = overlay.querySelector("input,select,textarea");
    if (first) setTimeout(function () { if (!overlay.contains(document.activeElement)) first.focus(); }, 50);
    return { el: overlay, close: close, q: function (s) { return overlay.querySelector(s); } };
  };

  /** Jalali date picker on inputs marked with data-jdp (pages without the sidebar load it here). */
  window.wfDatePickers = function () {
    if (window.jalaliDatepicker) return;
    if (window.__wfJdpLoading) return;
    window.__wfJdpLoading = true;
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/assets/css/jalalidatepicker.min.css";
    document.head.appendChild(css);
    window.loadScriptOnce("/assets/js/jalalidatepicker.min.js").then(function () {
      if (window.jalaliDatepicker) window.jalaliDatepicker.startWatch({ persianDigits: true, autoHide: true, hideAfterChange: true, showTodayBtn: true, showEmptyBtn: true });
    });
  };

  // ---------- files ----------
  window.fileIcon = function (f) {
    var n = String((f && (f.name || f.url)) || "").toLowerCase();
    if (/\.(mp4|mov|webm|mkv)$/.test(n)) return "🎬";
    if (/\.(png|jpe?g|gif|webp)$/.test(n)) return "🖼️";
    if (/\.(mp3|wav)$/.test(n)) return "🎵";
    if (/\.pdf$/.test(n)) return "📄";
    if (/\.(zip|rar)$/.test(n)) return "🗜️";
    return "📎";
  };
  window.fileKind = function (f) {
    var n = String((f && (f.url || f.name)) || "").toLowerCase().split("?")[0];
    if (/\.(mp4|mov|webm)$/.test(n)) return "video";
    if (/\.(png|jpe?g|gif|webp)$/.test(n)) return "image";
    if (/\.(mp3|wav)$/.test(n)) return "audio";
    if (/\.pdf$/.test(n)) return "pdf";
    return "other";
  };
  window.fileListHtml = function (files, opts) {
    opts = opts || {};
    if (!files || !files.length) return '<div class="wf-empty-sm">' + (opts.empty || "فایلی ثبت نشده است") + "</div>";
    return '<ul class="wf-files">' + files.map(function (f, i) {
      var url = window.safeUrl(f.url);
      var dl = url && url.indexOf("/uploads/") === 0 ? url + (url.indexOf("?") === -1 ? "?" : "&") + "download=1" : url;
      return "<li>" +
        '<span class="wf-file-icon">' + window.fileIcon(f) + "</span>" +
        '<a href="' + window.escapeHtml(url) + '" target="_blank" rel="noopener">' + window.escapeHtml(f.name || "فایل") + "</a>" +
        (f.size ? '<small class="muted">' + window.formatFileSize(f.size) + "</small>" : "") +
        (opts.download ? '<a class="wf-btn sm" href="' + window.escapeHtml(dl) + '" download>دانلود</a>' : "") +
        (opts.removable ? '<button type="button" class="wf-btn sm danger" data-remove="' + i + '">حذف</button>' : "") +
        "</li>";
    }).join("") + "</ul>";
  };

  /** A file list with "upload" and "add link" buttons, backed by an array. */
  window.wfFilePicker = function (container, files, onChange) {
    var list = files || [];
    function render() {
      container.innerHTML =
        window.fileListHtml(list, { removable: true }) +
        '<div class="wf-row" style="margin-top:8px">' +
        '<button type="button" class="wf-btn" data-act="upload">⬆️ آپلود فایل (حتی حجیم)</button>' +
        '<button type="button" class="wf-btn" data-act="link">🔗 افزودن لینک</button>' +
        "</div>";
      container.querySelector('[data-act="upload"]').onclick = async function () {
        var up = await window.asvaPickAndUpload();
        if (up.length) { list.push.apply(list, up); render(); if (onChange) onChange(list); }
      };
      container.querySelector('[data-act="link"]').onclick = function () {
        var m = window.wfModal("افزودن لینک فایل",
          '<label class="wf-label">نام فایل<input class="form-control" id="lnkName"></label>' +
          '<label class="wf-label">لینک (Google Drive، Dropbox و …)<input class="form-control ltr" id="lnkUrl" placeholder="https://"></label>' +
          '<div class="wf-actions"><button type="button" class="btn-primary" id="lnkOk">افزودن</button></div>');
        m.q("#lnkOk").onclick = function () {
          var url = m.q("#lnkUrl").value.trim();
          if (!/^https?:\/\//i.test(url)) return window.showToast("لینک باید با http شروع شود", "error");
          list.push({ name: m.q("#lnkName").value.trim() || url.split("/").pop() || "لینک", url: url });
          m.close();
          render();
          if (onChange) onChange(list);
        };
      };
      container.querySelectorAll("[data-remove]").forEach(function (b) {
        b.onclick = function () { list.splice(Number(b.getAttribute("data-remove")), 1); render(); if (onChange) onChange(list); };
      });
    }
    render();
    return { get: function () { return list; } };
  };

  window.statusChip = function (label, tone) {
    return '<span class="wf-chip ' + (tone || "") + '">' + window.escapeHtml(label) + "</span>";
  };

  window.optionList = function (items, valueKey, labelKey, selected, placeholder) {
    return (placeholder !== undefined ? '<option value="">' + window.escapeHtml(placeholder) + "</option>" : "") +
      (items || []).map(function (it) {
        var v = it[valueKey];
        return '<option value="' + window.escapeHtml(v) + '"' + (String(v) === String(selected) ? " selected" : "") + ">" + window.escapeHtml(it[labelKey]) + "</option>";
      }).join("");
  };

  /** Relative date ranges ("this week" starts on Saturday) as Jalali strings. */
  window.periodRange = function (kind) {
    var today = window.todayJalali();
    var dow = (new Date().getDay() + 1) % 7; // Saturday = 0
    var weekStart = window.addDaysJalali(today, -dow);
    if (kind === "this_week") return { today: today, from: weekStart, to: window.addDaysJalali(weekStart, 6) };
    if (kind === "next_week") return { today: today, from: window.addDaysJalali(weekStart, 7), to: window.addDaysJalali(weekStart, 13) };
    if (kind === "this_month") return { today: today, from: today.slice(0, 8) + "01", to: today.slice(0, 8) + "31" };
    return { today: today, from: "", to: "" };
  };

  /** "Saved views" dropdown: stores the current filter values under a name. */
  window.wfSavedViews = function (opts) {
    var box = opts.container;
    if (!box) return;
    var views = [];
    function current() {
      var f = {};
      opts.fields.forEach(function (id) { var el = document.getElementById(id); if (el) f[id] = el.value; });
      if (opts.getExtra) f.__extra = opts.getExtra();
      return f;
    }
    function apply(v) {
      opts.fields.forEach(function (id) { var el = document.getElementById(id); if (el && v.filters[id] !== undefined) el.value = v.filters[id]; });
      if (opts.setExtra && v.filters.__extra) opts.setExtra(v.filters.__extra);
      opts.apply();
    }
    function render() {
      box.innerHTML = '<select class="form-control" aria-label="نماهای ذخیره‌شده" style="width:auto;padding:12px;border-radius:8px;min-width:150px">' +
        '<option value="">⭐ نماهای ذخیره‌شده</option>' + views.map(function (v) { return '<option value="' + window.escapeHtml(v.id) + '">' + window.escapeHtml(v.name) + "</option>"; }).join("") +
        '<option value="__save">➕ ذخیره فیلترهای فعلی…</option>' + (views.length ? '<option value="__delete">🗑️ حذف یک نما…</option>' : "") + "</select>";
      var sel = box.querySelector("select");
      sel.onchange = async function () {
        var val = sel.value;
        sel.value = "";
        if (val === "__save") {
          var name = window.prompt("نام این نما (مثلاً «ریلزهای این هفته برند X»):");
          if (!name || !name.trim()) return;
          var res = await window.api("/api/saved_views", { page: opts.page, name: name.trim(), filters: current() }, { success: "نما ذخیره شد" });
          if (res) { views = res.data.filter(function (v) { return v.page === opts.page; }); render(); }
        } else if (val === "__delete") {
          var names = views.map(function (v, i) { return window.fa(i + 1) + ". " + v.name; }).join("\n");
          var pick = window.prompt("شماره نمایی که حذف شود:\n" + names);
          var idx = Number(window.latin(pick || "")) - 1;
          if (!views[idx]) return;
          var r = await window.api("/api/saved_views", { action: "delete", id: views[idx].id }, { success: "حذف شد" });
          if (r) { views = r.data.filter(function (v) { return v.page === opts.page; }); render(); }
        } else if (val) {
          var v = views.find(function (x) { return x.id === val; });
          if (v) apply(v);
        }
      };
    }
    window.api("/api/saved_views?page=" + encodeURIComponent(opts.page), undefined, { quiet: true }).then(function (res) {
      views = (res && res.data) || [];
      render();
    });
  };

  /** Personal channels: messenger chat ids and channels the person opts out of. */
  window.openMyChannels = async function () {
    var res = await window.api("/api/my_channels");
    var d = (res && res.data) || {};
    var off = d.notify_opt_out || [];
    var e = window.escapeHtml;
    var m = window.wfModal("دریافت اعلان‌ها",
      '<p class="muted" style="margin-top:0;font-size:.85rem">علاوه بر پیامک و ایمیل، اعلان‌ها (درخواست تایید، موعدها، تحویل فایل، فاکتور) را در تلگرام یا بله هم بگیرید. ابتدا ربات استودیو را استارت کنید و شناسه گفت‌وگو (chat id) خود را اینجا وارد کنید.</p>' +
      '<label class="wf-label">شناسه گفت‌وگو در تلگرام<input class="form-control ltr" id="mcTg" value="' + e(d.telegram_chat_id || "") + '"></label>' +
      '<label class="wf-label">شناسه گفت‌وگو در بله<input class="form-control ltr" id="mcBale" value="' + e(d.bale_chat_id || "") + '"></label>' +
      '<div class="wf-label">کانال‌هایی که نمی‌خواهید: ' + [["sms", "پیامک"], ["email", "ایمیل"], ["telegram", "تلگرام"], ["bale", "بله"]].map(function (x) {
        return '<label style="margin-left:12px;white-space:nowrap"><input type="checkbox" value="' + x[0] + '" class="mcOff"' + (off.indexOf(x[0]) !== -1 ? " checked" : "") + "> " + x[1] + "</label>";
      }).join("") + "</div>" +
      '<div class="wf-actions"><button type="button" class="btn-primary" id="mcSave">ذخیره</button></div>');
    m.q("#mcSave").onclick = async function () {
      var r = await window.api("/api/my_channels", {
        telegram_chat_id: m.q("#mcTg").value,
        bale_chat_id: m.q("#mcBale").value,
        notify_opt_out: Array.prototype.map.call(m.el.querySelectorAll(".mcOff:checked"), function (x) { return x.value; }),
      }, { success: "ذخیره شد" });
      if (r) m.close();
    };
  };

  /** Private calendar feed link for Google Calendar / phone calendars. */
  window.showIcsLink = async function () {
    var res = await window.api("/api/ics_link");
    if (!res) return;
    var m = window.wfModal("لینک تقویم",
      '<p class="muted" style="margin-top:0">این لینک را در Google Calendar (افزودن تقویم ← از طریق URL) یا تقویم آیفون/اندروید (Subscribed Calendar) وارد کنید تا موعدها، انتشارها و تصویربرداری‌ها خودکار در تقویم شما بیاید. لینک خصوصی است؛ آن را به اشتراک نگذارید.</p>' +
      '<input class="form-control ltr" readonly value="' + window.escapeHtml(res.url) + '" onclick="this.select()" aria-label="لینک تقویم">' +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="icsNew">ساخت لینک جدید (باطل کردن قبلی)</button><a class="wf-btn" href="' + window.escapeHtml(res.webcal) + '">افزودن به تقویم دستگاه</a><button type="button" class="btn-primary" id="icsCopy">کپی لینک</button></div>');
    m.q("#icsCopy").onclick = function () { window.copyText(res.url); };
    m.q("#icsNew").onclick = async function () {
      var r = await window.api("/api/ics_link", {}, { success: "لینک جدید ساخته شد" });
      if (r) { m.close(); window.showIcsLink(); }
    };
  };

  window.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      window.showToast && window.showToast("کپی شد", "success");
    } catch (e) {
      window.prompt("کپی کنید:", text);
    }
  };
})();
