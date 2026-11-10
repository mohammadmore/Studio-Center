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
   */
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
          '<div><label style="' + label + '" for="' + p + 'PublishDate">تاریخ انتشار</label><input id="' + p + 'PublishDate" placeholder="مثلاً 1405/08/20" autocomplete="off" style="' + field + '"></div>' +
          '<div><label style="' + label + '" for="' + p + 'PublishTime">ساعت انتشار</label><input type="time" id="' + p + 'PublishTime" style="' + field + '"></div>' +
          '</div>';
      }
      html += '<span style="' + label + '">پلتفرم‌های انتشار</span><div id="' + p + 'Platforms" style="' + box + '">' +
        (platforms.length
          ? platforms.map(function (x) { return '<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" value="' + esc(x.setting_key) + '"> ' + esc(x.setting_key) + '</label>'; }).join("")
          : '<span style="color:var(--text-gray); font-size:0.85rem;">پلتفرمی در تنظیمات پایه تعریف نشده است.</span>') + '</div>';
      html += '<label style="' + label + '" for="' + p + 'Caption">کپشن / توضیحات</label>' +
        '<textarea id="' + p + 'Caption" rows="3" placeholder="متن کپشن یا توضیح تولید (اختیاری)" style="' + field + ' resize:vertical;"></textarea>';
      html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">' +
        '<div><label style="' + label + '" for="' + p + 'Video">لینک فایل ویدیو</label><input id="' + p + 'Video" dir="ltr" placeholder="https://..." style="' + field + '"></div>' +
        '<div><label style="' + label + '" for="' + p + 'Cover">لینک کاور</label><input id="' + p + 'Cover" dir="ltr" placeholder="https://..." style="' + field + '"></div>' +
        '</div>';
      container.innerHTML = html;
      id("Collection").addEventListener("input", hint);
      refreshCollections();
    }

    /** Collections offered for the chosen brand (and those without a brand). */
    function refreshCollections() {
      var list = id("CollectionList");
      if (!list) return;
      var org = opts.getOrgId ? String(opts.getOrgId() || "") : "";
      var titles = {};
      cols().filter(function (c) { return !org || !c.org_id || String(c.org_id) === org; })
        .forEach(function (c) { titles[c.title] = true; });
      list.innerHTML = Object.keys(titles).sort(function (a, b) { return a.localeCompare(b, "fa"); })
        .map(function (t) { return '<option value="' + esc(t) + '"></option>'; }).join("");
      hint();
    }

    function matchCollection() {
      var t = (id("Collection").value || "").trim();
      if (!t) return null;
      var org = opts.getOrgId ? String(opts.getOrgId() || "") : "";
      var same = cols().filter(function (c) { return c.title === t; });
      return same.find(function (c) { return org && String(c.org_id) === org; }) || same.find(function (c) { return !c.org_id; }) || same[0] || null;
    }

    function hint() {
      var h = id("CollectionHint");
      if (!h) return;
      var t = (id("Collection").value || "").trim();
      h.textContent = !t ? "" : matchCollection() ? "✓ در همین مجموعه قرار می‌گیرد." : "➕ مجموعه‌ی تازه‌ای با این نام برای همین برند ساخته می‌شود.";
    }

    function read() {
      var data = {
        publish_platforms: Array.from(id("Platforms").querySelectorAll("input:checked")).map(function (c) { return c.value; }),
        caption: id("Caption").value.trim(),
        video_link: id("Video").value.trim(),
        cover_link: id("Cover").value.trim(),
      };
      var t = (id("Collection").value || "").trim();
      if (t) { var m = matchCollection(); data.collection_id = m ? m.id : t; }
      if (opts.withSchedule) {
        data.status = id("Status").value;
        var d = (id("PublishDate").value || "").trim();
        if (d) data.publish_date = window.toEnglishDigits ? window.toEnglishDigits(d) : d;
        var tm = id("PublishTime").value;
        if (tm) data.publish_time = tm;
      }
      return data;
    }

    function reset() { render(); }

    render();
    return { read: read, reset: reset, refreshCollections: refreshCollections };
  };
})();
