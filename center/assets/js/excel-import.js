// One definition per Excel import: the guide shown to the user, the sample file
// and the parser are all built from the same column list, so they cannot disagree.
(function () {
  "use strict";
  var specs = {};

  function esc(v) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(v);
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg, type) {
    if (typeof window.showToast === "function") window.showToast(msg, type);
  }

  /** Header text compared loosely: spacing, half-spaces, Arabic letters and "(...)" hints do not matter. */
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[‌‎‏ ]/g, " ")
      .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ۀ/g, "ه")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[\s_\-\/\\:|*]+/g, " ")
      .trim()
      .toLowerCase();
  }
  function digits(v) {
    return String(v == null ? "" : v)
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }
  function text(v) { return v == null ? "" : String(v).trim(); }
  function num(v) {
    var n = parseFloat(digits(v).replace(/[,٬،\s]/g, ""));
    return isNaN(n) ? null : n;
  }
  function list(v) {
    if (Array.isArray(v)) return v.map(text).filter(Boolean);
    return text(v).split(/[,،|؛;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  /** Excel stores a typed time (18:00) as a fraction of a day. */
  function time(v) {
    if (typeof v === "number" && v >= 0 && v < 1) {
      var mins = Math.round(v * 24 * 60);
      return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
    }
    var m = /^(\d{1,2})[:٫.](\d{2})/.exec(digits(v).trim());
    return m ? m[1].padStart(2, "0") + ":" + m[2] : text(digits(v));
  }
  /** A Jalali date written as 1405/2/5, ۱۴۰۵-۰۲-۰۵ or 14050205. */
  function jdate(v) {
    var t = digits(v).trim();
    var m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t) || /^(\d{4})(\d{2})(\d{2})$/.exec(t);
    return m ? m[1] + "/" + m[2].padStart(2, "0") + "/" + m[3].padStart(2, "0") : t;
  }
  function bool(v) {
    var s = norm(digits(v));
    return ["1", "true", "yes", "y", "بله", "بلی", "دارد", "هست", "است", "✓", "✔", "x"].indexOf(s) !== -1;
  }

  function define(key, spec) { specs[key] = spec; return spec; }
  function spec(key) {
    var s = specs[key];
    if (!s) throw new Error("Unknown Excel import: " + key);
    return s;
  }
  function valuesOf(col, ctx) {
    var v = typeof col.values === "function" ? col.values(ctx || {}) : col.values;
    if (Array.isArray(v)) {
      v = v.filter(function (x) { return x !== undefined && x !== null && String(x).trim() !== ""; });
      if (!v.length) return col.emptyValues || "";
      var shown = v.slice(0, 25).join("، ");
      return v.length > 25 ? shown + " و " + (v.length - 25).toLocaleString("fa-IR") + " مورد دیگر" : shown;
    }
    return v || "";
  }

  /** The guide as HTML: what each column means, whether it is required and what it accepts. */
  function guideHtml(key, ctx) {
    var s = spec(key);
    var rows = s.columns.map(function (c) {
      return '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid var(--border-color);font-weight:700;min-width:84px;vertical-align:top">' + esc(c.name) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid var(--border-color);white-space:nowrap;vertical-align:top">' + (c.required ? '<span style="color:var(--error-color,#ef4444);font-weight:700">اجباری</span>' : 'اختیاری') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid var(--border-color);line-height:1.7;overflow-wrap:anywhere">' + esc(c.desc || "") +
          (valuesOf(c, ctx) ? '<div style="margin-top:4px;color:var(--text-gray);font-size:.8rem">مقادیر مجاز: ' + esc(valuesOf(c, ctx)) + '</div>' : '') +
          (c.example !== undefined && c.example !== "" ? '<div style="margin-top:2px;color:var(--text-gray);font-size:.8rem">مثال: <code>' + esc(c.example) + '</code></div>' : '') +
        '</td></tr>';
    }).join("");
    var notes = (s.notes || []).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");
    return (s.intro ? '<p style="color:var(--text-gray);margin:0 0 10px;line-height:1.8;font-size:.9rem">' + esc(s.intro) + '</p>' : '') +
      '<div style="overflow-x:auto;border:1px solid var(--border-color);border-radius:10px;margin-bottom:12px"><table style="width:100%;border-collapse:collapse;text-align:right;font-size:.85rem;table-layout:auto;min-width:0;margin:0" class="asva-excel-guide">' +
      '<thead><tr style="background:rgba(128,128,128,.08)"><th style="padding:8px;text-align:right">نام ستون (ردیف اول فایل)</th><th style="padding:8px;text-align:right">وضعیت</th><th style="padding:8px;text-align:right">توضیح</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<ul style="margin:0 0 12px;padding-right:18px;color:var(--text-gray);font-size:.85rem;line-height:1.8">' +
        '<li>ترتیب ستون‌ها مهم نیست؛ فقط نام ستون‌ها در ردیف اول باید مثل جدول بالا باشد.</li>' +
        '<li>ستون‌های اختیاری را می‌توانید حذف کنید یا خالی بگذارید.</li>' + notes +
      '</ul>' +
      '<button type="button" class="btn-outline" data-excel-sample="' + esc(key) + '" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:12px">📄 دریافت فایل نمونه با همین ستون‌ها (.xlsx)</button>';
  }

  /** Fills a container with the guide and wires its "download sample" button. */
  function renderGuide(el, key, ctx) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    el.innerHTML = guideHtml(key, ctx);
    var btn = el.querySelector("[data-excel-sample]");
    if (btn) btn.onclick = function () { downloadSample(key, ctx); };
  }

  async function downloadSample(key, ctx) {
    ctx = ctx || {};
    var s = spec(key);
    var XLSX = await window.ensureXLSX();
    if (!XLSX) { toast("کتابخانه اکسل بارگذاری نشد؛ صفحه را دوباره باز کنید", "error"); return; }
    var header = s.columns.map(function (c) { return c.name; });
    var examples = (typeof s.examples === "function" ? s.examples(ctx) : s.examples) || [];
    if (!examples.length) {
      var one = {};
      s.columns.forEach(function (c) { one[c.key] = c.example !== undefined ? c.example : ""; });
      examples = [one];
    }
    var data = [header].concat(examples.map(function (ex) {
      return s.columns.map(function (c) { return ex[c.key] !== undefined ? ex[c.key] : ""; });
    }));
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = s.columns.map(function (c) { return { wch: Math.max(14, String(c.name).length + 4) }; });
    XLSX.utils.book_append_sheet(wb, ws, (s.sheetName || "داده‌ها").slice(0, 31));
    var guide = [["نام ستون", "وضعیت", "توضیح", "مقادیر مجاز", "مثال"]].concat(s.columns.map(function (c) {
      return [c.name, c.required ? "اجباری" : "اختیاری", c.desc || "", valuesOf(c, ctx), c.example !== undefined ? c.example : ""];
    }));
    guide.push([]);
    guide.push(["نکته‌ها"]);
    ["ترتیب ستون‌ها مهم نیست؛ فقط نام ستون‌ها در ردیف اول باید مثل همین فایل باشد.", "ستون‌های اختیاری را می‌توانید حذف کنید یا خالی بگذارید."].concat(s.notes || []).forEach(function (n) { guide.push([n]); });
    var wg = XLSX.utils.aoa_to_sheet(guide);
    wg["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 60 }, { wch: 60 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wg, "راهنما");
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.writeFile(wb, s.fileName || ("Asva_" + key + "_sample.xlsx"));
    toast("فایل نمونه دانلود شد. ردیف‌های نمونه را با اطلاعات خودتان جایگزین کنید.", "success");
  }

  /**
   * Reads the first data sheet and returns rows keyed by column key.
   * { rows, missing: [required column names], unknown: [unrecognised headers] }
   */
  async function read(file, key) {
    var s = spec(key);
    var XLSX = await window.ensureXLSX();
    var wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    var sheetName = wb.SheetNames.find(function (n) { return norm(n) !== norm("راهنما") && !/راهنما|guide/i.test(n); }) || wb.SheetNames[0];
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
    var lookup = {};
    s.columns.forEach(function (c) {
      [c.name].concat(c.aliases || []).forEach(function (a) { lookup[norm(a)] = c.key; });
    });
    // The header is the first of the top rows that names at least one known column.
    var headerIdx = -1, best = 0;
    for (var i = 0; i < Math.min(aoa.length, 6); i++) {
      var hits = (aoa[i] || []).filter(function (h) { return lookup[norm(h)]; }).length;
      if (hits > best) { best = hits; headerIdx = i; }
    }
    var map = {}, unknown = [], seen = {};
    if (headerIdx >= 0) {
      (aoa[headerIdx] || []).forEach(function (h, idx) {
        var k = lookup[norm(h)];
        if (k && !seen[k]) { map[idx] = k; seen[k] = true; }
        else if (text(h)) unknown.push(text(h));
      });
    }
    // Old files without a header row, laid out by column position.
    if (best === 0 && s.positional && aoa.length) {
      headerIdx = 0; map = {}; unknown = []; seen = {};
      s.positional.forEach(function (k, idx) { if (k && k.charAt(0) !== "_") { map[idx] = k; seen[k] = true; } });
    }
    var missing = s.columns.filter(function (c) { return c.required && !seen[c.key]; }).map(function (c) { return c.name; });
    var rows = [];
    for (var r = headerIdx + 1; headerIdx >= 0 && r < aoa.length; r++) {
      var row = aoa[r] || [], obj = { _row: r + 1 }, any = false;
      Object.keys(map).forEach(function (idx) {
        var v = row[idx];
        if (typeof v === "string") v = v.trim();
        obj[map[idx]] = v;
        if (v !== "" && v !== null && v !== undefined) any = true;
      });
      if (any) rows.push(obj);
    }
    return { rows: rows, missing: missing, unknown: unknown, headerFound: headerIdx >= 0 };
  }

  /** read() plus the user-facing messages; resolves to the rows, or null when nothing can be imported. */
  async function load(file, key) {
    if (!file) return null;
    var s = spec(key);
    try {
      var res = await read(file, key);
      if (!res.headerFound) {
        toast("ردیف اول فایل نام ستون‌ها را ندارد. از «دریافت فایل نمونه» در راهنما استفاده کنید.", "error");
        return null;
      }
      if (res.missing.length) {
        toast("ستون اجباری پیدا نشد: «" + res.missing.join("»، «") + "». نام ستون‌ها را با راهنما مقایسه کنید.", "error");
        return null;
      }
      var required = s.columns.filter(function (c) { return c.required; });
      var rows = res.rows.filter(function (r) { return required.every(function (c) { return text(r[c.key]) !== ""; }); });
      var dropped = res.rows.length - rows.length;
      if (!rows.length) { toast("هیچ ردیفی با ستون‌های اجباری پر شده پیدا نشد.", "error"); return null; }
      var notes = [];
      if (res.unknown.length) notes.push("ستون‌های «" + res.unknown.slice(0, 5).join("»، «") + "» شناخته نشدند و نادیده گرفته شدند");
      if (dropped) notes.push(dropped.toLocaleString("fa-IR") + " ردیف به دلیل خالی بودن ستون اجباری کنار گذاشته شد");
      if (notes.length) toast(notes.join("؛ ") + ".", "info");
      return rows;
    } catch (e) {
      console.error(e);
      toast("فایل خوانده نشد. فایل باید xlsx، xls یا csv باشد.", "error");
      return null;
    }
  }

  window.AsvaExcel = { define: define, spec: spec, guideHtml: guideHtml, renderGuide: renderGuide, downloadSample: downloadSample, read: read, load: load, norm: norm, text: text, num: num, list: list, bool: bool, digits: digits, time: time, jdate: jdate };
})();
