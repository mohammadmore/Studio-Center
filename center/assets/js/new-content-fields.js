// Extra fields of the "new content" forms (depot and calendar), so a card can be created
// complete in one go instead of being created and then edited: collection, platforms,
// caption, links and (for the depot) status, publish date and time.
(function () {
  "use strict";
  var STATUSES = [
    ["raw", "ورودی خام"], ["todo", "در صف انتظار"], ["in_progress", "در حال تولید"], ["review", "ارزیابی استودیو"],
    ["client_review", "ارزیابی کارفرما"], ["needs_revision", "نیاز به اصلاح"], ["done", "تکمیل شده"],
    ["approved_by_client", "تایید کارفرما"], ["ready_to_publish", "آماده انتشار"], ["published", "منتشر شده"],
  ];
  var esc = function (v) { return window.escapeHtml ? window.escapeHtml(v) : String(v == null ? "" : v); };
  var field = "width:100%; padding:12px; border:1px solid var(--border-color); border-radius:8px; box-sizing:border-box; background:var(--card-bg); color:var(--text-dark); font-family:inherit;";
  var label = "font-weight:bold; display:block; margin:14px 0 6px;";
  var box = "display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:8px; background:rgba(128,128,128,0.05); padding:12px; border-radius:8px; border:1px solid var(--border-color);";

  /**
   * container: element to fill. opts:
   *   prefix        id prefix for the inputs (unique per form)
   *   getOrgId()    the brand chosen in the form (collections are offered for it)
   *   withSchedule  also show status, publish date and time
   *   settings()    settings object (content types, platforms)
   *   collections() list of collections
   *   defaultTargets() the page's own fields that a collection's defaults may fill
   *                 (see collection-defaults.js); offered when a collection is chosen
   */
  /**
   * The "number of parts" inputs of the new-content forms: one per content type, the same
   * list the card's edit form uses (so "1 reels + 1 story" can be entered when creating).
   */
  window.renderComponentInputs = function (box, cls, settingsData) {
    if (!box) return;
    var s = settingsData || window.allSettings || {};
    var names = [];
    (s.content_type || []).forEach(function (t) {
      var n = String((t && t.setting_key) || "").replace(/\s+/g, " ").trim();
      if (n && t.is_active !== 0 && names.indexOf(n) === -1) names.push(n);
    });
    box.innerHTML = names.length
      ? names.map(function (n) {
          return '<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="text" inputmode="numeric" placeholder="۰" class="' + cls + '" data-name="' + esc(n) + '" style="width:60px; padding:8px; border:1px solid var(--border-color); border-radius:6px; text-align:center;"> ' + esc(n) + "</label>";
        }).join("")
      : '<span style="color:var(--text-gray); font-size:0.85rem;">نوع محتوایی در تنظیمات پایه تعریف نشده است.</span>';
  };

  window.newContentFields = function (container, opts) {
    var p = opts.prefix;
    var settings = function () { return (opts.settings && opts.settings()) || window.allSettings || {}; };
    var cols = function () { return ((opts.collections && opts.collections()) || window.allCollections || []).filter(function (c) { return c && c.status !== "archived"; }); };
    var id = function (n) { return document.getElementById(p + n); };

    function render() {
      var platforms = (settings().platform || []).filter(function (x) { return x && x.is_active !== 0; });
      var html = "";
      html += '<label style="' + label + '" for="' + p + 'Collection">مجموعه (آلبوم)</label>' +
        '<input id="' + p + 'Collection" list="' + p + 'CollectionList" autocomplete="off" placeholder="یک مجموعه را انتخاب کنید یا نام تازه بنویسید" style="' + field + '">' +
        '<datalist id="' + p + 'CollectionList"></datalist>' +
        '<small id="' + p + 'CollectionHint" style="display:block; margin-top:4px; color:var(--text-gray); font-size:0.8rem;"></small>';
      if (opts.withSchedule) {
        html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">' +
          '<div><label style="' + label + '" for="' + p + 'Status">وضعیت (ستون میز کار)</label><select id="' + p + 'Status" style="' + field + '">' +
          STATUSES.map(function (s) { return '<option value="' + s[0] + '">' + esc(s[1]) + '</option>'; }).join("") + '</select></div>' +
          '<div><label style="' + label + '" for="' + p + 'PublishDate">تاریخ انتشار</label><input id="' + p + 'PublishDate" data-jdp placeholder="مثلاً ۱۴۰۵/۰۸/۲۰ — یا از تقویم انتخاب کنید" autocomplete="off" style="' + field + '"></div>' +
          '<div><label style="' + label + '" for="' + p + 'PublishTime">ساعت انتشار</label><input type="time" id="' + p + 'PublishTime" style="' + field + '"></div>' +
          '</div>';
      }
      html += '<span style="' + label + '">پلتفرم‌های انتشار</span><div id="' + p + 'Platforms" style="' + box + '">' +
        (platforms.length
          ? platforms.map(function (x) { return '<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" value="' + esc(x.setting_key) + '"> ' + esc(x.setting_key) + '</label>'; }).join("")
          : '<span style="color:var(--text-gray); font-size:0.85rem;">پلتفرمی در تنظیمات پایه تعریف نشده است.</span>') + '</div>';
      html += '<label style="' + label + '" for="' + p + 'Caption">متن کپشن</label>' +
        '<textarea id="' + p + 'Caption" rows="3" placeholder="همان «متن کپشن» کارت (اختیاری)" style="' + field + ' resize:vertical;"></textarea>';
      html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">' +
        '<div><label style="' + label + '" for="' + p + 'Video">لینک فایل ویدیو</label><input id="' + p + 'Video" dir="ltr" placeholder="https://..." style="' + field + '"></div>' +
        '<div><label style="' + label + '" for="' + p + 'Cover">لینک کاور</label><input id="' + p + 'Cover" dir="ltr" placeholder="https://..." style="' + field + '"></div>' +
        '</div>';
      container.innerHTML = html;
      id("Collection").addEventListener("input", hint);
      id("Collection").addEventListener("change", offerDefaults);
      refreshCollections();
    }

    var pathOf = function (c) { return window.asvaCollectionPath ? window.asvaCollectionPath(c.id, cols()) : c.title; };
    var norm = function (s) { return String(s || "").replace(/\s+/g, " ").trim(); };
    /** Collections offered for the chosen brand (and those without a brand), by full path. */
    function refreshCollections() {
      var list = id("CollectionList");
      if (!list) return;
      var org = opts.getOrgId ? String(opts.getOrgId() || "") : "";
      var paths = {};
      cols().filter(function (c) { return !org || !c.org_id || String(c.org_id) === org; })
        .forEach(function (c) { paths[pathOf(c)] = c.title; });
      list.innerHTML = Object.keys(paths).sort(function (a, b) { return a.localeCompare(b, "fa"); })
        .map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join("");
      hint();
    }

    /** By full path («الف › ب › ج») or, when it is unique enough, by the collection's own name. */
    function matchCollection() {
      var t = norm(id("Collection").value);
      if (!t) return null;
      var org = opts.getOrgId ? String(opts.getOrgId() || "") : "";
      var inOrg = function (c) { return !org || !c.org_id || String(c.org_id) === org; };
      var byPath = cols().filter(function (c) { return inOrg(c) && norm(pathOf(c)) === t; });
      if (byPath.length) return byPath[0];
      var same = cols().filter(function (c) { return norm(c.title) === t; });
      return same.find(function (c) { return org && String(c.org_id) === org; }) || same.find(function (c) { return !c.org_id; }) || same[0] || null;
    }

    function hint() {
      var h = id("CollectionHint");
      if (!h) return;
      var t = norm(id("Collection").value);
      var m = t ? matchCollection() : null;
      h.innerHTML = !t ? "" : m ? "<i class=ai data-ic=check></i> در «" + esc(pathOf(m)) + "» قرار می‌گیرد."
        : "<i class=ai data-ic=info></i> مجموعه‌ای با این نام نیست؛ موقع ذخیره می‌پرسیم که ساخته شود یا نه (و کجا).";
    }

    /** The chosen collection's defaults, offered on the empty fields (each needs «تایید»). */
    var offeredFor = null;
    function offerDefaults() {
      if (!window.collectionDefaults) return;
      var m = matchCollection();
      // Leaving the box fires "change" again: the same collection keeps its open suggestions
      // (re-offering would replace the button the user is about to press).
      var key = m ? String(m.id) : "";
      if (key === offeredFor) return;
      offeredFor = key;
      var scope = container.closest(".modal-box, form, .modal-overlay") || container.parentElement;
      var d = window.collectionDefaults.of(m);
      var targets = Object.assign({ platforms: { box: id("Platforms") } }, opts.withSchedule ? { publish_time: { el: id("PublishTime") } } : {}, opts.defaultTargets ? opts.defaultTargets() : {});
      window.collectionDefaults.offer(scope, d, targets);
    }

    function read() {
      var data = {
        publish_platforms: Array.from(id("Platforms").querySelectorAll("input:checked")).map(function (c) { return c.value; }),
        caption: id("Caption").value.trim(),
        video_link: id("Video").value.trim(),
        cover_link: id("Cover").value.trim(),
      };
      var t = norm(id("Collection").value);
      if (t) {
        var m = matchCollection();
        if (m) data.collection_id = m.id;
        else data.__newCollection = t.split(" › ").pop();
      }
      if (opts.withSchedule) {
        data.status = id("Status").value;
        var d = (id("PublishDate").value || "").trim();
        if (d) data.publish_date = window.normJalaliInput ? window.normJalaliInput(d) : (window.toEnglishDigits ? window.toEnglishDigits(d) : d);
        var tm = id("PublishTime").value;
        if (tm) data.publish_time = tm;
      }
      return data;
    }

    /**
     * read(), but a collection name that does not exist yet is created only after the user
     * confirms it (and picks its parent). Resolves to null when they go back to fix it.
     */
    async function readConfirmed() {
      var data = read();
      if (!data.__newCollection) return data;
      var org = opts.getOrgId ? opts.getOrgId() : "";
      var ok = window.confirmNewCollection ? await window.confirmNewCollection(data.__newCollection, org, cols()) : { parent_id: null };
      if (!ok) { id("Collection").focus(); return null; }
      data.collection_id = data.__newCollection;
      if (ok.parent_id) data.collection_parent_id = ok.parent_id;
      delete data.__newCollection;
      return data;
    }

    function reset() {
      var scope = container.closest(".modal-box, form, .modal-overlay");
      if (scope && window.collectionDefaults) window.collectionDefaults.clear(scope);
      offeredFor = null;
      render();
    }

    render();
    return { read: read, readConfirmed: readConfirmed, reset: reset, refreshCollections: refreshCollections };
  };
})();
