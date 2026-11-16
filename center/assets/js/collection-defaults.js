// «پیش‌فرض مجموعه»: when a card is put in a collection, the collection's default values are
// offered on the form's empty fields, framed in a blue/purple gradient. Nothing is applied
// until the user presses «تایید» on that field («نه» drops the suggestion).
(function () {
  "use strict";
  var esc = function (v) { return window.escapeHtml ? window.escapeHtml(v == null ? "" : String(v)) : String(v == null ? "" : v); };
  var norm = function (s) { return String(s == null ? "" : s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim(); };
  var same = function (a, b) { return !!norm(a) && norm(a) === norm(b); };

  var css = document.createElement("style");
  css.textContent =
    ".cd-hl{border:3px solid transparent!important;border-radius:14px!important;" +
    "background:linear-gradient(var(--glass-3,var(--card-bg)),var(--glass-3,var(--card-bg))) padding-box,linear-gradient(135deg,#3b82f6,#8b5cf6) border-box!important}" +
    ".cd-pick{outline:2px dashed #8b5cf6;outline-offset:2px;border-radius:8px;background:color-mix(in srgb,#8b5cf6 12%,var(--card-bg))!important}" +
    ".cd-ok{border:3px solid transparent!important;border-radius:14px!important;" +
    "background:linear-gradient(var(--glass-3,var(--card-bg)),var(--glass-3,var(--card-bg))) padding-box,linear-gradient(135deg,#22c55e,#059669) border-box!important}" +
    ".cd-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 2px;font-size:.8rem;color:var(--text-dark);line-height:1.8}" +
    ".cd-tag{display:inline-flex;align-items:center;gap:4px;color:#fff;font-weight:bold;padding:1px 10px;border-radius:999px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);box-shadow:0 4px 12px -6px #6d28d9}" +
    ".cd-val{font-weight:bold}" +
    ".cd-yes,.cd-no{border:none;border-radius:999px;padding:2px 12px;font:inherit;font-size:.76rem;font-weight:bold;cursor:pointer}" +
    ".cd-yes{color:#fff;background:linear-gradient(135deg,#22c55e,#059669);box-shadow:0 4px 12px -6px #059669}" +
    ".cd-no{background:transparent;color:var(--text-gray);text-decoration:underline}";
  document.head.appendChild(css);

  /** Effective defaults of a collection (id or object) from the loaded collection lists. */
  function of(col, lists) {
    if (!col) return null;
    if (typeof col !== "object") {
      var all = (lists || []).concat(window.allCollections || []);
      col = all.find(function (c) { return c && String(c.id) === String(col); });
    }
    return col && col.effective_defaults ? col.effective_defaults : null;
  }

  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function visible(el) { return !!el && el.offsetParent !== null && getComputedStyle(el).display !== "none"; }
  function checksOf(box) { return box ? Array.prototype.slice.call(box.querySelectorAll('input[type="checkbox"]')) : []; }
  function peopleName(id) {
    var p = (window.allColleagues || []).find(function (c) { return String(c.id) === String(id); });
    return p ? (p.full_name || p.username) : "";
  }

  /** Removes every pending suggestion inside scope. */
  function clear(scope) {
    if (!scope) return;
    scope.querySelectorAll(".cd-bar").forEach(function (b) { b.remove(); });
    scope.querySelectorAll(".cd-hl").forEach(function (e) { e.classList.remove("cd-hl"); });
    scope.querySelectorAll(".cd-pick").forEach(function (e) { e.classList.remove("cd-pick"); });
  }

  /**
   * Offers defaults on the empty fields inside scope. targets maps a default key to:
   *   { el }                         a select / input (content_type, project_manager, publish_time)
   *   { box }                        a container of checkboxes (team, stages, platforms)
   *   { owners: {stage: selectEl} }  stage owner selects (stage_owners)
   * Optional per target: empty() (when the field counts as empty), frame (element to frame).
   */
  function offer(scope, defaults, targets, opts) {
    opts = opts || {};
    if (!scope) return 0;
    // Only this form's own fields are reset: other suggestions in the same scope stay.
    var keys = Object.keys(targets);
    scope.querySelectorAll(".cd-bar").forEach(function (b) { if (keys.indexOf(b.dataset.cdKey) !== -1) b.remove(); });
    keys.forEach(function (k) {
      var t = targets[k];
      if (!t) return;
      [t.el, t.box, t.frame].concat(t.owners ? Object.keys(t.owners).map(function (s) { return t.owners[s]; }) : []).forEach(function (e) { if (e) e.classList.remove("cd-hl"); });
      if (t.box) t.box.querySelectorAll(".cd-pick").forEach(function (e) { e.classList.remove("cd-pick"); });
    });
    if (!defaults) { if (opts.onChange) opts.onChange(); return 0; }
    var from = defaults._from || {};
    var count = 0;
    Object.keys(targets).forEach(function (key) {
      var t = targets[key], value = defaults[key];
      if (!t || value === undefined || value === null) return;
      var frame, picks = [], label = "", apply;
      if (t.owners) {
        var rows = Object.keys(t.owners).filter(function (st) { var s = t.owners[st]; return s && !s.value && value[st] && s.querySelector('option[value="' + value[st] + '"]'); });
        if (!rows.length) return;
        rows.forEach(function (st) { var s = t.owners[st]; s.classList.add("cd-hl"); s.title = "پیش‌فرض مجموعه: " + peopleName(value[st]); });
        label = rows.map(function (st) { return st + ": " + peopleName(value[st]); }).join("، ");
        frame = null;
        apply = function () { rows.forEach(function (st) { var s = t.owners[st]; s.value = String(value[st]); fire(s); }); };
        var anchor = t.anchor || t.owners[rows[0]].closest("[data-stage]") || t.owners[rows[0]];
        return bar(anchor, key, label, from[key], apply, function () { rows.forEach(function (st) { t.owners[st].classList.remove("cd-hl"); }); }, rows.map(function (st) { return t.owners[st]; }));
      }
      if (t.box) {
        var boxes = checksOf(t.box);
        var isEmpty = t.empty ? t.empty() : !boxes.some(function (c) { return c.checked; });
        if (!isEmpty) return;
        var wanted = (Array.isArray(value) ? value : [value]);
        picks = boxes.filter(function (c) {
          var lbl = c.closest("label") || c;
          return wanted.some(function (v) { return same(v, c.value); }) && (lbl.style.display !== "none");
        });
        if (!picks.length) return;
        frame = t.frame || t.box;
        label = picks.map(function (c) { return c.value; }).join("، ");
        picks.forEach(function (c) { (c.closest("label") || c).classList.add("cd-pick"); });
        apply = function () { picks.forEach(function (c) { if (!c.checked) { c.checked = true; fire(c); } }); };
      } else if (t.el) {
        var el = t.el;
        var empty = t.empty ? t.empty() : !String(el.value || "").trim();
        if (!empty || Array.isArray(value)) return;
        if (el.tagName === "SELECT" && !Array.prototype.some.call(el.options, function (o) { return same(o.value, value); })) return;
        frame = t.frame || el;
        label = String(value);
        apply = function () {
          if (el.tagName === "SELECT") { var o = Array.prototype.find.call(el.options, function (x) { return same(x.value, value); }); el.value = o.value; }
          else el.value = value;
          fire(el);
        };
      } else return;
      frame.classList.add("cd-hl");
      bar(t.anchor || frame, key, label, from[key], apply, function () {
        frame.classList.remove("cd-hl");
        picks.forEach(function (c) { (c.closest("label") || c).classList.remove("cd-pick"); });
      }, [frame]);
    });

    function bar(anchor, key, label, colTitle, apply, unmark, framed) {
      var b = document.createElement("div");
      b.className = "cd-bar";
      b.dataset.cdKey = key;
      b.innerHTML = '<span class="cd-tag" title="' + esc("از مجموعه «" + (colTitle || "") + "»") + '"><i class=ai data-ic=sparkles></i> پیش‌فرض مجموعه' + (colTitle ? " «" + esc(colTitle) + "»" : "") + "</span>" +
        '<span class="cd-val">' + esc(label) + "</span>" +
        '<button type="button" class="cd-yes"><i class=ai data-ic=check></i> تایید</button>' +
        '<button type="button" class="cd-no">نه</button>';
      anchor.insertAdjacentElement("afterend", b);
      b.querySelector(".cd-yes").onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        unmark(); b.remove(); apply();
        (framed || []).forEach(function (f) { if (!f) return; f.classList.add("cd-ok"); setTimeout(function () { f.classList.remove("cd-ok"); }, 1600); });
        if (opts.onChange) opts.onChange();
      };
      b.querySelector(".cd-no").onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        unmark(); b.remove();
        if (opts.onChange) opts.onChange();
      };
      count++;
    }
    if (opts.onChange) opts.onChange();
    return count;
  }

  function pending(scope) { return scope ? scope.querySelectorAll(".cd-bar").length : 0; }

  window.collectionDefaults = { of: of, offer: offer, clear: clear, pending: pending, sameName: same };
})();
