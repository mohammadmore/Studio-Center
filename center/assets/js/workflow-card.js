/* Workflow panel inside the content card drawer: stage owners and deadlines,
   review versions (with internal approval), platform captions, final delivery,
   time tracking and the client's brief. */
(function () {
  "use strict";
  var e = function (v) { return window.escapeHtml(v); };
  var can = function (p) { return window.asvaCan ? window.asvaCan(p) : false; };
  var CONTENT_PERMS = ["depot", "calendar", "collections", "archive"];
  var currentTab = "stages";

  function item(id) { return (window.allDepotItems || []).find(function (i) { return i.id == id; }); }
  function colleagues() { return window.allColleagues || []; }
  function colleagueName(id) {
    var c = colleagues().find(function (x) { return x.id == id; });
    return c ? c.full_name || c.username : "";
  }
  function refresh(id) {
    // Re-render the panel with the latest card data from the server.
    fetch("/api/get_depot_contents").then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.data) return;
      var fresh = res.data.find(function (c) { return c.id == id; });
      var list = window.allDepotItems || [];
      var idx = list.findIndex(function (c) { return c.id == id; });
      if (fresh && idx !== -1) list[idx] = Object.assign(list[idx], fresh);
      window.renderWorkflowPanel(id);
    }).catch(function () { window.renderWorkflowPanel(id); });
  }
  function showWarnings(list) {
    (list || []).forEach(function (w) { window.showToast && window.showToast("⚠️ " + w, "info"); });
  }

  var VERSION_INTERNAL = { pending: ["در انتظار تایید داخلی", "amber"], approved: ["تایید داخلی", "green"], rejected: ["رد در تایید داخلی", "red"], skipped: ["", ""] };
  var VERSION_CLIENT = { approved: ["تایید کارفرما", "green"], rejected: ["درخواست اصلاح", "red"] };

  window.renderWorkflowPanel = function (id) {
    var it = item(id);
    var host = document.getElementById("detailsContent");
    if (!it || !host) return;
    var old = document.getElementById("wfPanel");
    if (old) old.remove();
    var panel = document.createElement("div");
    panel.id = "wfPanel";
    panel.className = "wf-panel";
    var versions = it.review_versions || [];
    var tabs = [
      ["stages", "مراحل و مسئولان"],
      ["versions", "نسخه‌ها" + (versions.length ? " (" + window.fa(versions.length) + ")" : "")],
      ["captions", "کپشن‌ها"],
      ["delivery", "تحویل نهایی"],
      ["time", "زمان"],
    ];
    if (it.brief) tabs.push(["brief", "بریف کارفرما"]);
    panel.innerHTML = '<h3>گردش کار</h3><div class="wf-tabs" role="tablist">' + tabs.map(function (t) {
      return '<button type="button" role="tab" class="wf-tab' + (t[0] === currentTab ? " active" : "") + '" data-tab="' + t[0] + '">' + e(t[1]) + "</button>";
    }).join("") + '</div><div id="wfPane"></div>';
    var collab = document.getElementById("collabHubWrapper");
    if (collab) host.insertBefore(panel, collab);
    else host.appendChild(panel);
    panel.querySelectorAll(".wf-tab").forEach(function (b) {
      b.onclick = function () { currentTab = b.getAttribute("data-tab"); window.renderWorkflowPanel(id); };
    });
    if (!tabs.some(function (t) { return t[0] === currentTab; })) currentTab = "stages";
    var pane = panel.querySelector("#wfPane");
    ({ stages: stagesPane, versions: versionsPane, captions: captionsPane, delivery: deliveryPane, time: timePane, brief: briefPane })[currentTab](it, pane);
    if (window.wfDatePickers) window.wfDatePickers();
  };

  // ---------- stages ----------
  function stagesPane(it, pane) {
    var stages = it.stages || [];
    if (!stages.length) {
      pane.innerHTML = '<div class="wf-empty-sm">برای این محتوا مرحله تولیدی تعریف نشده است. از ویرایش کارت مراحل را اضافه کنید.</div>';
      return;
    }
    var plan = it.stage_plan || {};
    var done = it.completed_stages || [];
    var editable = can(CONTENT_PERMS) || (window.ASVA_ME && it.project_manager === window.ASVA_ME.full_name);
    var today = window.todayJalali();
    pane.innerHTML = stages.map(function (s, i) {
      var p = plan[s] || {};
      var isDone = done.indexOf(s) !== -1;
      var late = !isDone && p.due_date && p.due_date < today;
      var chip = isDone ? window.statusChip("تکمیل", "green") : late ? window.statusChip("عقب افتاده", "red") : p.due_date ? window.statusChip("موعد " + window.fa(p.due_date), "blue") : "";
      return '<div class="wf-stage-row" data-stage="' + i + '">' +
        '<div class="wf-row between"><b>' + window.fa(i + 1) + ". " + e(s) + "</b>" + chip + "</div>" +
        (editable
          ? '<div class="wf-row">' +
            '<select class="form-control" data-f="owner" aria-label="مسئول ' + e(s) + '">' + window.optionList(colleagues(), "id", "full_name", p.owner_id, "— مسئول —") + "</select>" +
            '<input class="form-control" data-f="due" data-jdp placeholder="موعد تحویل" aria-label="موعد ' + e(s) + '" value="' + e(p.due_date || "") + '">' +
            '<input class="form-control" data-f="hours" type="number" min="0" step="0.5" placeholder="ساعت تخمینی" aria-label="ساعت تخمینی ' + e(s) + '" value="' + e(p.estimated_hours || "") + '">' +
            "</div>"
          : '<div class="muted" style="font-size:.85rem">' + (p.owner_id ? "مسئول: " + e(colleagueName(p.owner_id)) : "بدون مسئول") + (p.estimated_hours ? " — " + window.fa(p.estimated_hours) + " ساعت" : "") + "</div>") +
        "</div>";
    }).join("") +
      (editable ? '<div class="wf-actions"><button type="button" class="wf-btn primary" id="wfSavePlan">ذخیره مسئولان و موعدها</button></div>' : "") +
      '<p class="muted" style="font-size:.78rem;margin-top:8px">با تیک خوردن هر مرحله، مسئول مرحله بعد خودکار خبردار می‌شود. یک روز مانده به موعد یادآوری و پس از موعد به مدیر پروژه ارجاع داده می‌شود.</p>';
    var btn = pane.querySelector("#wfSavePlan");
    if (btn) btn.onclick = async function () {
      var out = {};
      pane.querySelectorAll(".wf-stage-row").forEach(function (row) {
        var s = stages[Number(row.getAttribute("data-stage"))];
        out[s] = {
          owner_id: row.querySelector('[data-f="owner"]').value || null,
          due_date: window.latin(row.querySelector('[data-f="due"]').value),
          estimated_hours: row.querySelector('[data-f="hours"]').value,
        };
      });
      var res = await window.api("/api/update_stage_plan", { id: it.id, plan: out }, { success: "ذخیره شد" });
      if (res) { it.stage_plan = res.stage_plan; showWarnings(res.warnings); window.renderWorkflowPanel(it.id); }
    };
  }

  // ---------- versions ----------
  function feedbackHtml(v) {
    var list = (v.feedback || []).slice().sort(function (a, b) { return (a.timecode || 0) - (b.timecode || 0); });
    if (!list.length) return '<div class="wf-empty-sm">نظری ثبت نشده است.</div>';
    return list.map(function (f) {
      var where = f.timecode !== null && f.timecode !== undefined ? '<span class="wf-timecode">' + fmtTime(f.timecode) + "</span>" : "";
      var pin = f.x !== null && f.x !== undefined ? '<span class="wf-chip purple">📍 نقطه روی تصویر</span>' : "";
      return '<div class="wf-msg ' + (f.author_type === "client" ? "client" : "") + '"' + (f.resolved ? ' style="opacity:.6"' : "") + ">" +
        '<div class="meta"><b>' + e(f.author) + "</b>" + (f.author_type === "client" ? window.statusChip("کارفرما", "blue") : "") + where + pin + "<span>" + e(window.faDateTime(f.at)) + "</span>" +
        (f.author_type === "client" ? '<button type="button" class="wf-btn sm" data-resolve="' + f.id + '" data-state="' + (f.resolved ? "0" : "1") + '">' + (f.resolved ? "بازگشایی" : "✓ انجام شد") + "</button>" : "") +
        "</div>" + e(f.text) + "</div>";
    }).join("");
  }
  function fmtTime(sec) {
    var s = Math.floor(Number(sec) || 0);
    return window.fa(Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"));
  }
  window.wfFmtTime = fmtTime;

  function versionsPane(it, pane) {
    var versions = (it.review_versions || []).slice().reverse();
    var rounds = (it.review_versions || []).filter(function (v) { return v.client && v.client.status === "rejected"; }).length;
    pane.innerHTML =
      '<div class="wf-row between" style="margin-bottom:10px"><span class="muted" style="font-size:.85rem">دور اصلاح کارفرما: ' + window.fa(rounds) + "</span>" +
      '<button type="button" class="wf-btn primary" id="wfNewVersion">➕ ارسال نسخه جدید برای بازبینی</button></div>' +
      (versions.length ? versions.map(function (v) {
        var internal = VERSION_INTERNAL[(v.internal || {}).status] || ["", ""];
        var client = VERSION_CLIENT[(v.client || {}).status] || (v.sent_to_client_at ? ["منتظر نظر کارفرما", "amber"] : ["", ""]);
        var approveBtns = (v.internal || {}).status === "pending" && can("approve_content") && v === versions[0]
          ? '<div class="wf-row" style="margin:8px 0"><button type="button" class="wf-btn success" data-internal="approve">✓ تایید و ارسال برای کارفرما</button><button type="button" class="wf-btn danger" data-internal="reject">↩️ برگشت برای اصلاح</button></div>'
          : "";
        return '<div class="wf-card" style="padding:12px">' +
          '<div class="wf-row between"><b>نسخه ' + window.fa(v.v) + "</b><span>" +
          (internal[0] ? window.statusChip(internal[0], internal[1]) : "") + " " + (client[0] ? window.statusChip(client[0], client[1]) : "") +
          (v.superseded ? " " + window.statusChip("جایگزین شد", "") : "") + "</span></div>" +
          '<div class="muted" style="font-size:.78rem;margin:4px 0">' + e(v.created_by || "") + " — " + e(window.faDateTime(v.created_at)) + "</div>" +
          (v.note ? '<div style="font-size:.88rem;margin-bottom:6px">' + e(v.note) + "</div>" : "") +
          window.fileListHtml(v.files) +
          ((v.internal || {}).note ? '<div class="wf-msg"><div class="meta"><b>تایید داخلی: ' + e(v.internal.by || "") + "</b></div>" + e(v.internal.note) + "</div>" : "") +
          ((v.client || {}).comment ? "" : "") +
          approveBtns +
          '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:.85rem">نظرات (' + window.fa((v.feedback || []).length) + ")</summary>" +
          '<div class="wf-thread">' + feedbackHtml(v) +
          '<div class="wf-row"><input class="form-control" style="flex:1;padding:8px" data-reply="' + v.v + '" placeholder="پاسخ به کارفرما / یادداشت روی این نسخه" aria-label="پاسخ"><button type="button" class="wf-btn" data-send="' + v.v + '">ارسال</button></div>' +
          "</div></details></div>";
      }).join("") : '<div class="wf-empty-sm">هنوز نسخه‌ای برای بازبینی ارسال نشده است. با ارسال نسخه، فایل‌ها برای کارفرما (یا تایید داخلی) فرستاده می‌شود.</div>');

    pane.querySelector("#wfNewVersion").onclick = function () { newVersionModal(it); };
    pane.querySelectorAll("[data-internal]").forEach(function (b) {
      b.onclick = async function () {
        var decision = b.getAttribute("data-internal");
        var note = decision === "reject" ? window.prompt("توضیح برای اصلاح (اختیاری):") || "" : "";
        var res = await window.api("/api/review_versions", { action: "internal", id: it.id, decision: decision, note: note }, { success: "ثبت شد" });
        if (res) refresh(it.id);
      };
    });
    pane.querySelectorAll("[data-send]").forEach(function (b) {
      b.onclick = async function () {
        var v = b.getAttribute("data-send");
        var input = pane.querySelector('[data-reply="' + v + '"]');
        if (!input.value.trim()) return;
        var res = await window.api("/api/review_feedback", { id: it.id, version: v, text: input.value.trim() });
        if (res) refresh(it.id);
      };
    });
    pane.querySelectorAll("[data-resolve]").forEach(function (b) {
      b.onclick = async function () {
        var res = await window.api("/api/review_feedback_resolve", { id: it.id, feedback_id: b.getAttribute("data-resolve"), resolved: b.getAttribute("data-state") === "1" });
        if (res) refresh(it.id);
      };
    });
  }

  function newVersionModal(it) {
    var files = [];
    var m = window.wfModal("نسخه جدید برای بازبینی",
      '<p class="muted" style="font-size:.85rem;margin-top:0">فایل‌های این نسخه (ویدیو، تصویر، PDF یا لینک) را اضافه کنید. کارفرما می‌تواند روی ثانیه‌ای از ویدیو یا نقطه‌ای از تصویر نظر بدهد.</p>' +
      '<div id="nvFiles"></div>' +
      '<label class="wf-label">توضیح نسخه (چه چیزی تغییر کرده؟)<textarea class="form-control" id="nvNote"></textarea></label>' +
      '<div class="wf-actions"><button type="button" class="btn-primary" id="nvSend">ارسال نسخه</button></div>');
    window.wfFilePicker(m.q("#nvFiles"), files);
    m.q("#nvSend").onclick = async function () {
      if (!files.length) return window.showToast("حداقل یک فایل یا لینک اضافه کنید", "error");
      var res = await window.api("/api/review_versions", { action: "submit", id: it.id, files: files, note: m.q("#nvNote").value }, { success: "ارسال شد" });
      if (res) { m.close(); currentTab = "versions"; refresh(it.id); }
    };
  }

  // ---------- captions ----------
  var snippetCache = null;
  async function loadSnippets(orgId) {
    var res = await window.api("/api/snippets?org_id=" + encodeURIComponent(orgId || ""), undefined, { quiet: true });
    snippetCache = (res && res.data) || [];
    return snippetCache;
  }
  async function captionsPane(it, pane) {
    var platforms = (it.publish_platforms || []).slice();
    if (!platforms.length) platforms = ["عمومی"];
    var caps = it.platform_captions || {};
    var approval = it.caption_approval || {};
    var chip = approval.status === "approved" ? window.statusChip("کپشن تایید شده", "green") : approval.status === "rejected" ? window.statusChip("کپشن نیاز به اصلاح", "red") : approval.status === "pending" ? window.statusChip("منتظر تایید کپشن", "amber") : "";
    var snippets = await loadSnippets(it.org_id);
    var snippetOptions = '<option value="">➕ درج از بانک متن…</option>' + snippets.map(function (s) {
      return '<option value="' + s.id + '">' + (s.kind === "hashtag" ? "#️⃣ " : s.kind === "cta" ? "👉 " : "💬 ") + e(s.title) + "</option>";
    }).join("");
    pane.innerHTML =
      (chip ? '<div style="margin-bottom:8px">' + chip + (approval.comment ? ' <span class="muted" style="font-size:.85rem">' + e(approval.comment) + "</span>" : "") + "</div>" : "") +
      platforms.map(function (p, i) {
        var value = caps[p] !== undefined ? caps[p] : (i === 0 ? it.caption || "" : "");
        return '<div class="wf-stage-row"><div class="wf-row between"><b>' + e(p) + '</b><small class="muted" data-count="' + i + '"></small></div>' +
          '<textarea class="form-control" rows="5" data-cap="' + i + '" aria-label="کپشن ' + e(p) + '">' + e(value) + "</textarea>" +
          '<div class="wf-row"><select class="form-control" data-snip="' + i + '" style="flex:1;padding:6px" aria-label="بانک متن">' + snippetOptions + "</select>" +
          (i > 0 ? '<button type="button" class="wf-btn sm" data-copy="' + i + '">کپی از ' + e(platforms[0]) + "</button>" : "") + "</div></div>";
      }).join("") +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfSnipNew">ذخیره متن در بانک</button><button type="button" class="wf-btn primary" id="wfCapSave">ذخیره کپشن‌ها</button></div>' +
      '<p class="muted" style="font-size:.78rem">ویرایش کپشنِ تایید‌شده، آن را دوباره به انتظار تایید کارفرما برمی‌گرداند.</p>';
    var areas = pane.querySelectorAll("[data-cap]");
    var count = function (ta) {
      var n = ta.value.length;
      var tags = (ta.value.match(/#[^\s#]+/g) || []).length;
      pane.querySelector('[data-count="' + ta.getAttribute("data-cap") + '"]').textContent = window.fa(n) + " کاراکتر — " + window.fa(tags) + " هشتگ";
    };
    areas.forEach(function (ta) { count(ta); ta.addEventListener("input", function () { count(ta); }); });
    pane.querySelectorAll("[data-snip]").forEach(function (sel) {
      sel.onchange = function () {
        var s = snippets.find(function (x) { return String(x.id) === sel.value; });
        var ta = pane.querySelector('[data-cap="' + sel.getAttribute("data-snip") + '"]');
        if (s && ta) {
          var pos = ta.selectionStart || ta.value.length;
          ta.value = ta.value.slice(0, pos) + (pos && !/\s$/.test(ta.value.slice(0, pos)) ? "\n" : "") + s.text + ta.value.slice(pos);
          count(ta);
          window.hasUnsavedChanges = true;
        }
        sel.value = "";
      };
    });
    pane.querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = function () {
        pane.querySelector('[data-cap="' + b.getAttribute("data-copy") + '"]').value = areas[0].value;
        count(pane.querySelector('[data-cap="' + b.getAttribute("data-copy") + '"]'));
      };
    });
    pane.querySelector("#wfCapSave").onclick = async function () {
      var out = {};
      areas.forEach(function (ta) { out[platforms[Number(ta.getAttribute("data-cap"))]] = ta.value; });
      var body = { id: it.id, captions: out };
      if (!(it.publish_platforms || []).length) body.caption = areas[0].value;
      var res = await window.api("/api/update_captions", body, { success: "ذخیره شد" });
      if (res) { it.platform_captions = res.platform_captions; refresh(it.id); }
    };
    pane.querySelector("#wfSnipNew").onclick = function () {
      var m = window.wfModal("افزودن به بانک متن",
        '<label class="wf-label">نوع<select class="form-control" id="snKind"><option value="hashtag">هشتگ‌ها</option><option value="phrase">عبارت ثابت</option><option value="cta">دعوت به اقدام</option></select></label>' +
        '<label class="wf-label">عنوان<input class="form-control" id="snTitle"></label>' +
        '<label class="wf-label">متن<textarea class="form-control" id="snText"></textarea></label>' +
        '<label class="wf-label"><input type="checkbox" id="snOrg" checked> فقط برای همین برند</label>' +
        '<div class="wf-actions"><button type="button" class="btn-primary" id="snSave">ذخیره</button></div>');
      m.q("#snSave").onclick = async function () {
        var res = await window.api("/api/snippets", { action: "save", kind: m.q("#snKind").value, title: m.q("#snTitle").value, text: m.q("#snText").value, org_id: m.q("#snOrg").checked ? it.org_id : null }, { success: "ذخیره شد" });
        if (res) { m.close(); window.renderWorkflowPanel(it.id); }
      };
    };
  }

  // ---------- delivery ----------
  function deliveryPane(it, pane) {
    var files = it.deliverables || [];
    pane.innerHTML =
      '<p class="muted" style="font-size:.85rem;margin-top:0">فایل‌های نهایی و باکیفیت را اینجا بگذارید؛ پس از «تحویل به کارفرما» در پنل برند قابل دانلود است.</p>' +
      (it.delivered_at ? '<div style="margin-bottom:8px">' + window.statusChip("تحویل شده: " + window.faDateTime(it.delivered_at), "green") + "</div>" : "") +
      window.fileListHtml(files, { removable: true, download: true, empty: "فایل نهایی اضافه نشده است" }) +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="dvUpload">⬆️ آپلود فایل نهایی</button><button type="button" class="wf-btn" id="dvLink">🔗 لینک</button>' +
      '<button type="button" class="wf-btn primary" id="dvDeliver"' + (files.length ? "" : " disabled") + ">📦 تحویل به کارفرما</button></div>";
    var add = async function (list) {
      if (!list.length) return;
      var res = await window.api("/api/deliverables", { action: "add", id: it.id, files: list });
      if (res) { it.deliverables = res.deliverables; window.renderWorkflowPanel(it.id); }
    };
    pane.querySelector("#dvUpload").onclick = async function () { add(await window.asvaPickAndUpload()); };
    pane.querySelector("#dvLink").onclick = function () {
      var url = window.prompt("لینک فایل نهایی:");
      if (url && /^https?:\/\//.test(url.trim())) add([{ name: url.trim().split("/").pop() || "لینک", url: url.trim() }]);
    };
    pane.querySelectorAll("[data-remove]").forEach(function (b) {
      b.onclick = async function () {
        var f = files[Number(b.getAttribute("data-remove"))];
        var res = await window.api("/api/deliverables", { action: "remove", id: it.id, file_id: f.id });
        if (res) { it.deliverables = res.deliverables; window.renderWorkflowPanel(it.id); }
      };
    });
    pane.querySelector("#dvDeliver").onclick = async function () {
      var res = await window.api("/api/deliverables", { action: "deliver", id: it.id }, { success: "فایل‌ها تحویل شد و کارفرما خبردار شد" });
      if (res) { it.delivered_at = res.delivered_at; window.renderWorkflowPanel(it.id); }
    };
  }

  // ---------- time ----------
  async function timePane(it, pane) {
    pane.innerHTML = '<div class="wf-empty-sm">در حال بارگذاری…</div>';
    var res = await window.api("/api/time_entries?content_id=" + it.id, undefined, { quiet: true });
    var data = (res && res.data) || [];
    var running = res && res.running_timer;
    var mine = running && running.content_id == it.id;
    var stages = it.stages || [];
    pane.innerHTML =
      '<div class="wf-row between" style="margin-bottom:10px"><b>مجموع: ' + window.fa(Math.round(((res && res.total_minutes) || 0) / 6) / 10) + " ساعت</b>" +
      (mine ? '<button type="button" class="wf-btn danger solid" id="tmStop">⏹ توقف تایمر</button>' : '<button type="button" class="wf-btn primary" id="tmStart">▶️ شروع تایمر روی این کار</button>') + "</div>" +
      '<div class="wf-row"><input class="form-control" id="tmHours" type="number" min="0.25" step="0.25" placeholder="ساعت" style="max-width:100px" aria-label="ساعت">' +
      '<input class="form-control" id="tmDay" data-jdp placeholder="تاریخ (امروز)" style="max-width:140px" aria-label="تاریخ">' +
      (stages.length ? '<select class="form-control" id="tmStage" style="max-width:160px" aria-label="مرحله"><option value="">مرحله</option>' + stages.map(function (s) { return "<option>" + e(s) + "</option>"; }).join("") + "</select>" : "") +
      '<input class="form-control" id="tmNote" placeholder="توضیح" style="flex:1" aria-label="توضیح"><button type="button" class="wf-btn" id="tmAdd">ثبت دستی</button></div>' +
      '<div class="wf-table-wrap" style="margin-top:10px"><table class="wf-table"><thead><tr><th>همکار</th><th>تاریخ</th><th>مدت</th><th>توضیح</th><th></th></tr></thead><tbody>' +
      (data.length ? data.map(function (t) {
        return "<tr><td>" + e(t.colleague_name) + "</td><td>" + window.fa(t.date) + "</td><td>" + window.fa(Math.round(t.minutes / 6) / 10) + " ساعت</td><td>" + e([t.stage, t.note].filter(Boolean).join(" — ")) + "</td>" +
          "<td>" + (window.ASVA_ME && (t.colleague_id == window.ASVA_ME.id || can("timesheet_report")) ? '<button type="button" class="wf-btn sm danger" data-del="' + t.id + '">حذف</button>' : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="muted">زمانی ثبت نشده است.</td></tr>') + "</tbody></table></div>";
    var start = pane.querySelector("#tmStart");
    if (start) start.onclick = async function () {
      var r = await window.api("/api/timer", { action: "start", content_id: it.id }, { success: "تایمر شروع شد" });
      if (r) { window.asvaTimerRefresh && window.asvaTimerRefresh(); window.renderWorkflowPanel(it.id); }
    };
    var stop = pane.querySelector("#tmStop");
    if (stop) stop.onclick = async function () {
      var r = await window.api("/api/timer", { action: "stop" }, { success: "زمان ثبت شد" });
      if (r) { window.asvaTimerRefresh && window.asvaTimerRefresh(); window.renderWorkflowPanel(it.id); }
    };
    pane.querySelector("#tmAdd").onclick = async function () {
      var hours = Number(window.latin(pane.querySelector("#tmHours").value));
      if (!(hours > 0)) return window.showToast("مدت را وارد کنید", "error");
      var r = await window.api("/api/time_entries", {
        action: "add", content_id: it.id, minutes: Math.round(hours * 60),
        date: window.latin(pane.querySelector("#tmDay").value), note: pane.querySelector("#tmNote").value,
        stage: pane.querySelector("#tmStage") ? pane.querySelector("#tmStage").value : "",
      }, { success: "ثبت شد" });
      if (r) window.renderWorkflowPanel(it.id);
    };
    pane.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = async function () {
        var r = await window.api("/api/time_entries", { action: "delete", id: b.getAttribute("data-del") });
        if (r) window.renderWorkflowPanel(it.id);
      };
    });
  }

  // ---------- brief ----------
  function briefPane(it, pane) {
    var b = it.brief || {};
    var row = function (label, v) { return v ? "<dt>" + label + "</dt><dd>" + e(v) + "</dd>" : ""; };
    pane.innerHTML = '<dl class="wf-kv">' + row("هدف", b.goal) + row("مخاطب", b.audience) + row("پیام اصلی", b.key_message) + row("نمونه‌های مرجع", b.references) + row("مهلت درخواستی", b.deadline && window.fa(b.deadline)) + row("توضیحات", b.notes) + "</dl>" +
      (it.request_id && can("requests") ? '<div class="wf-actions"><a class="wf-btn" href="/requests?id=' + it.request_id + '">مشاهده درخواست</a></div>' : "");
  }

  // ---------- floating timer (on every staff page) ----------
  var timerTick = null;
  window.asvaTimerRefresh = async function () {
    if (!window.ASVA_ME || !window.ASVA_ME.id) return;
    var res = await window.api("/api/time_entries?content_id=-1", undefined, { quiet: true });
    var t = res && res.running_timer;
    var bar = document.getElementById("asvaTimerBar");
    if (!t) { if (bar) bar.remove(); clearInterval(timerTick); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "asvaTimerBar";
      bar.className = "wf-timer";
      bar.setAttribute("role", "status");
      document.body.appendChild(bar);
    }
    var started = new Date(t.started_at).getTime();
    // Built once; only the clock text changes every second so the button stays clickable.
    bar.innerHTML = '<span class="dot"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">' + e(t.content_title || "کار بدون کارت") + '</span><b class="clock"></b><button type="button" class="wf-btn sm danger solid" id="asvaTimerStop">توقف</button>';
    bar.querySelector("#asvaTimerStop").onclick = async function () {
      var r = await window.api("/api/timer", { action: "stop" }, { success: "زمان ثبت شد" });
      if (r) window.asvaTimerRefresh();
    };
    var clock = bar.querySelector(".clock");
    var draw = function () {
      var s = Math.max(0, Math.floor((Date.now() - started) / 1000));
      var h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
      clock.textContent = window.fa(h + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0"));
    };
    draw();
    clearInterval(timerTick);
    timerTick = setInterval(draw, 1000);
  };
  document.addEventListener("DOMContentLoaded", function () { setTimeout(window.asvaTimerRefresh, 800); });
})();

/* Publish status and statistics of one platform of a card (the modal lives in
   partials/content-identity). Statistics can be fetched automatically. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var latin = function (v) { return window.latin ? window.latin(v) : v; };
  var num = function (v) { var n = parseInt(latin(String(v || "")).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; };

  window.openPlatformMetrics = function (id, platform) {
    var it = (window.allDepotItems || []).find(function (i) { return i.id == id; });
    if (!it || !$("platformMetricsModal")) return;
    var m = (it.platform_metrics || {})[platform] || {};
    $("pmItemId").value = id;
    $("pmPlatform").value = platform;
    $("pmDefaultDate").value = it.publish_date || "";
    $("pmDefaultTime").value = it.publish_time || "";
    $("pmStatus").value = m.status || ((it.published_platforms || []).indexOf(platform) !== -1 ? "published" : "pending");
    $("pmDate").value = m.date || "";
    $("pmTime").value = m.time || "";
    $("pmAutoFill").checked = false;
    $("pmPostLink").value = m.post_link || "";
    $("pmViews").value = m.views != null ? m.views : "";
    $("pmLikes").value = m.likes != null ? m.likes : "";
    $("pmComments").value = m.comments != null ? m.comments : "";
    $("pmShares").value = m.shares != null ? m.shares : "";
    var hasStats = ["views", "likes", "comments", "shares"].some(function (k) { return m[k] != null; });
    $("pmStatsContainer").style.display = hasStats ? "block" : "none";
    $("pmShowStatsBtn").style.display = hasStats ? "none" : "block";
    if ($("pmPlatformName")) $("pmPlatformName").textContent = platform + (m.fetched_at ? " — آخرین دریافت آمار: " + window.faDateTime(m.fetched_at) : "");
    window.togglePmDetails();
    $("platformMetricsModal").style.display = "flex";
  };
  window.togglePlatformPublished = window.togglePlatformPublished || function (id, platform) { window.openPlatformMetrics(id, platform); };
  window.closePlatformMetricsModal = function () { $("platformMetricsModal").style.display = "none"; };
  window.togglePmDetails = function () {
    var st = $("pmStatus").value;
    $("pmDetailsSection").style.display = st === "pending" ? "none" : "block";
    $("pmFeedbackSection").style.display = st === "published" ? "block" : "none";
    $("pmDateLabel").textContent = st === "scheduled" ? "زمان‌بندی" : "انتشار";
  };
  window.checkPmDateMatch = function () {
    $("pmAutoFill").checked = latin($("pmDate").value) === latin($("pmDefaultDate").value) && $("pmTime").value === $("pmDefaultTime").value;
  };
  window.autoFillPmDate = function () {
    if (!$("pmAutoFill").checked) return;
    $("pmDate").value = $("pmDefaultDate").value;
    $("pmTime").value = $("pmDefaultTime").value;
  };
  window.showStatsSection = function () {
    $("pmStatsContainer").style.display = "block";
    $("pmShowStatsBtn").style.display = "none";
  };
  window.fetchLiveStats = async function (ev) {
    if (ev) ev.preventDefault();
    var link = $("pmPostLink").value.trim();
    if (!link) return window.showToast && window.showToast("ابتدا لینک پست را وارد کنید", "error");
    var res = await window.api("/api/fetch_live_stats", { content_id: $("pmItemId").value, platform: $("pmPlatform").value, post_link: link });
    if (!res) return;
    var d = res.data || {};
    if (d.views != null) $("pmViews").value = d.views;
    if (d.likes != null) $("pmLikes").value = d.likes;
    if (d.comments != null) $("pmComments").value = d.comments;
    if (d.shares != null) $("pmShares").value = d.shares;
    window.showStatsSection();
    window.showToast && window.showToast("آمار به‌روز شد", "success");
  };
  window.savePlatformMetrics = async function () {
    var id = $("pmItemId").value, platform = $("pmPlatform").value;
    var it = (window.allDepotItems || []).find(function (i) { return i.id == id; });
    var prev = (it && it.platform_metrics && it.platform_metrics[platform]) || {};
    var data = Object.assign({}, prev, {
      status: $("pmStatus").value,
      date: latin($("pmDate").value),
      time: $("pmTime").value,
      post_link: $("pmPostLink").value.trim(),
      views: num($("pmViews").value),
      likes: num($("pmLikes").value),
      comments: num($("pmComments").value),
      shares: num($("pmShares").value),
    });
    var res = await window.api("/api/update_platform_metrics", { id: id, platform: platform, data: data }, { success: "ذخیره شد" });
    if (!res) return;
    if (it) {
      it.platform_metrics = it.platform_metrics || {};
      it.platform_metrics[platform] = data;
      it.published_platforms = it.published_platforms || [];
      var i = it.published_platforms.indexOf(platform);
      if ((data.status === "published" || data.status === "scheduled") && i === -1) it.published_platforms.push(platform);
      if (data.status === "pending" && i !== -1) it.published_platforms.splice(i, 1);
    }
    window.closePlatformMetricsModal();
    if (window.openContentDetails && window.currentEditingContentId == id) window.openContentDetails(id, window.currentContentEditMode);
  };
})();
