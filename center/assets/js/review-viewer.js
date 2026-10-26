/* Client review viewer: shows each version's files, lets the brand comment on a
   moment of a video or a point of an image, approve or ask for changes, and
   approve the captions separately. */
(function () {
  "use strict";
  var e = function (v) { return window.escapeHtml(v); };
  var fmt = function (sec) {
    var s = Math.floor(Number(sec) || 0);
    return window.fa(Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"));
  };

  window.openReviewViewer = async function (contentId, onDone) {
    var res = await window.api("/api/review_detail?id=" + encodeURIComponent(contentId));
    if (!res) return;
    var d = res.data;
    var versions = d.versions || [];
    var state = { v: versions.length ? versions[versions.length - 1].v : null, file: 0, pending: null };
    var m = window.wfModal("بازبینی: " + d.title, '<div id="rvBody"></div>', { wide: true, onClose: function () { if (onDone) onDone(); } });
    var body = m.q("#rvBody");

    function version() { return versions.find(function (v) { return v.v == state.v; }); }

    function render() {
      var v = version();
      var awaiting = d.status === "client_review" || d.status === "pending_client_review";
      var limitNote = d.revision_limit ? " از " + window.fa(d.revision_limit) + " دور مجاز قرارداد" : "";
      var html = "";
      if (versions.length > 1) {
        html += '<div class="wf-row" style="margin-bottom:10px">' + versions.map(function (x) {
          return '<button type="button" class="wf-btn sm ' + (x.v == state.v ? "primary" : "") + '" data-ver="' + x.v + '">نسخه ' + window.fa(x.v) + "</button>";
        }).join("") + "</div>";
      }
      if (!v) {
        html += '<div class="wf-empty-sm">فایل نسخه‌ای برای این محتوا بارگذاری نشده است؛ از لینک‌های کارت استفاده کنید.</div>';
      } else {
        var files = v.files || [];
        var f = files[state.file] || files[0];
        if (files.length > 1) {
          html += '<div class="wf-row" style="margin-bottom:8px">' + files.map(function (x, i) {
            return '<button type="button" class="wf-btn sm ' + (i === state.file ? "primary" : "") + '" data-file="' + i + '">' + window.fileIcon(x) + " " + e(x.name) + "</button>";
          }).join("") + "</div>";
        }
        var kind = f ? window.fileKind(f) : "other";
        var url = f ? window.safeUrl(f.url) : "";
        var pins = (v.feedback || []).filter(function (x) { return x.file_index === state.file && x.x !== null && x.x !== undefined; });
        if (kind === "video") {
          html += '<div class="wf-viewer"><video id="rvVideo" src="' + e(url) + '" controls playsinline preload="metadata"></video></div>';
        } else if (kind === "image") {
          html += '<div class="wf-viewer" id="rvImgWrap" style="cursor:crosshair"><div style="position:relative;display:inline-block"><img id="rvImg" src="' + e(url) + '" alt="' + e(f.name) + '">' +
            pins.map(function (p, i) { return '<span class="wf-pin" style="left:' + p.x + "%;top:" + p.y + '%">' + window.fa(i + 1) + "</span>"; }).join("") +
            (state.pending && state.pending.x !== undefined ? '<span class="wf-pin pending" style="left:' + state.pending.x + "%;top:" + state.pending.y + '%">+</span>' : "") +
            "</div></div><p class='muted' style='font-size:.8rem'>برای نظر روی بخشی از تصویر، روی همان نقطه کلیک کنید.</p>";
        } else if (kind === "audio") {
          html += '<audio id="rvVideo" src="' + e(url) + '" controls style="width:100%"></audio>';
        } else if (kind === "pdf") {
          html += '<div class="wf-actions" style="justify-content:flex-start"><a class="wf-btn primary" href="' + e(url) + '" target="_blank" rel="noopener">📄 باز کردن PDF</a></div>';
        } else if (f) {
          html += '<div class="wf-actions" style="justify-content:flex-start"><a class="wf-btn primary" href="' + e(url) + '" target="_blank" rel="noopener">🔗 مشاهده فایل</a></div>';
        }
        if (v.note) html += '<div class="wf-msg" style="margin-top:10px"><div class="meta"><b>توضیح استودیو درباره این نسخه</b></div>' + e(v.note) + "</div>";

        // Comment box
        html += '<div class="wf-card" style="margin-top:12px;padding:12px">' +
          '<div class="wf-row">' +
          (kind === "video" || kind === "audio" ? '<button type="button" class="wf-btn" id="rvAtTime">⏱️ نظر در همین لحظه</button>' : "") +
          '<span id="rvWhere" class="muted" style="font-size:.85rem">' + whereLabel() + "</span></div>" +
          '<div class="wf-row" style="margin-top:8px"><textarea class="form-control" id="rvText" rows="2" style="flex:1" placeholder="نظر یا اصلاحیه خود را بنویسید…" aria-label="نظر"></textarea><button type="button" class="wf-btn primary" id="rvSend">ثبت نظر</button></div></div>';

        // Feedback list
        var list = (v.feedback || []).slice().sort(function (a, b) { return (a.timecode || 0) - (b.timecode || 0); });
        html += "<h4 style='margin:14px 0 6px'>نظرات این نسخه (" + window.fa(list.length) + ")</h4>" + (list.length ? list.map(function (x) {
          var pinNo = pins.indexOf(x);
          return '<div class="wf-msg ' + (x.author_type === "client" ? "client" : "") + '"' + (x.resolved ? ' style="opacity:.6"' : "") + '><div class="meta"><b>' + (x.author_type === "client" ? "شما" : "استودیو") + "</b>" +
            (x.timecode !== null && x.timecode !== undefined ? '<button type="button" class="wf-timecode" data-seek="' + x.timecode + '">' + fmt(x.timecode) + "</button>" : "") +
            (pinNo !== -1 ? '<span class="wf-chip purple">📍 ' + window.fa(pinNo + 1) + "</span>" : "") +
            (x.resolved ? '<span class="wf-chip green">اعمال شد</span>' : "") +
            "<span>" + e(window.faDateTime(x.at)) + "</span></div>" + e(x.text) + "</div>";
        }).join("") : '<div class="wf-empty-sm">هنوز نظری ثبت نشده است.</div>');
      }

      // Captions
      var caps = d.platform_captions || {};
      var capKeys = Object.keys(caps);
      if (capKeys.length || d.caption) {
        var ca = d.caption_approval || {};
        html += '<div class="wf-card" style="margin-top:14px"><div class="wf-row between"><h3 style="margin:0">کپشن‌ها</h3>' +
          (ca.status === "approved" ? window.statusChip("کپشن تایید شد", "green") : ca.status === "rejected" ? window.statusChip("درخواست اصلاح کپشن", "red") : window.statusChip("منتظر تایید کپشن", "amber")) + "</div>" +
          (capKeys.length ? capKeys.map(function (k) { return '<div style="margin-top:8px"><b>' + e(k) + '</b><div style="white-space:pre-wrap;font-size:.92rem;line-height:1.8">' + e(caps[k]) + "</div></div>"; }).join("") : '<div style="white-space:pre-wrap;margin-top:8px">' + e(d.caption) + "</div>") +
          (ca.status !== "approved" ? '<div class="wf-actions"><button type="button" class="wf-btn danger" data-cap="reject">اصلاح کپشن</button><button type="button" class="wf-btn success" data-cap="approve">✓ تایید کپشن</button></div>' : "") +
          "</div>";
      }

      // Decision
      html += '<div class="wf-card" style="margin-top:14px">' +
        '<div class="muted" style="font-size:.85rem">دور اصلاح تا کنون: ' + window.fa(d.revision_rounds) + limitNote + "</div>" +
        (awaiting
          ? '<label class="wf-label" style="margin-top:8px">توضیح نهایی (اختیاری)<textarea class="form-control" id="rvDecisionNote" rows="2"></textarea></label><div class="wf-actions"><button type="button" class="wf-btn danger solid" data-decide="reject">↩️ نیاز به اصلاح</button><button type="button" class="wf-btn success" data-decide="approve">✓ تایید نهایی این نسخه</button></div>'
          : '<div class="muted" style="margin-top:6px">این محتوا در حال حاضر منتظر تصمیم شما نیست.</div>') +
        "</div>";
      body.innerHTML = html;
      bind();
    }

    function whereLabel() {
      var p = state.pending;
      if (!p) return "نظر کلی روی این نسخه";
      if (p.timecode !== undefined) return "نظر در ثانیه " + fmt(p.timecode) + ' <button type="button" class="wf-btn sm" id="rvClear">حذف</button>';
      return "نظر روی نقطه انتخاب‌شده از تصویر" + ' <button type="button" class="wf-btn sm" id="rvClear">حذف</button>';
    }

    function bind() {
      body.querySelectorAll("[data-ver]").forEach(function (b) { b.onclick = function () { state.v = Number(b.getAttribute("data-ver")); state.file = 0; state.pending = null; render(); }; });
      body.querySelectorAll("[data-file]").forEach(function (b) { b.onclick = function () { state.file = Number(b.getAttribute("data-file")); state.pending = null; render(); }; });
      var video = body.querySelector("#rvVideo");
      var at = body.querySelector("#rvAtTime");
      if (at && video) at.onclick = function () {
        video.pause();
        state.pending = { timecode: Math.round(video.currentTime * 10) / 10 };
        body.querySelector("#rvWhere").innerHTML = whereLabel();
        bindClear();
        body.querySelector("#rvText").focus();
      };
      body.querySelectorAll("[data-seek]").forEach(function (b) {
        b.onclick = function () { if (video) { video.currentTime = Number(b.getAttribute("data-seek")); video.play(); } };
      });
      var img = body.querySelector("#rvImg");
      if (img) img.onclick = function (ev) {
        var r = img.getBoundingClientRect();
        state.pending = { x: Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10 };
        var text = body.querySelector("#rvText").value;
        render();
        body.querySelector("#rvText").value = text;
        body.querySelector("#rvText").focus();
      };
      bindClear();
      var send = body.querySelector("#rvSend");
      if (send) send.onclick = async function () {
        var text = body.querySelector("#rvText").value.trim();
        if (!text) return window.showToast && window.showToast("متن نظر را بنویسید", "error");
        var p = state.pending || {};
        var r = await window.api("/api/review_feedback", { id: d.id, version: state.v, text: text, file_index: state.file, timecode: p.timecode, x: p.x, y: p.y }, { success: "نظر ثبت شد" });
        if (r) {
          version().feedback = (version().feedback || []).concat([r.feedback]);
          state.pending = null;
          render();
        }
      };
      body.querySelectorAll("[data-cap]").forEach(function (b) {
        b.onclick = async function () {
          var decision = b.getAttribute("data-cap");
          var comment = decision === "reject" ? window.prompt("چه تغییری در کپشن لازم است؟") : "";
          if (comment === null) return;
          var r = await window.api("/api/caption_review", { id: d.id, decision: decision, comment: comment }, { success: "ثبت شد" });
          if (r) { d.caption_approval = { status: decision === "approve" ? "approved" : "rejected", comment: comment }; render(); }
        };
      });
      body.querySelectorAll("[data-decide]").forEach(function (b) {
        b.onclick = async function () {
          var action = b.getAttribute("data-decide");
          var note = body.querySelector("#rvDecisionNote").value.trim();
          var open = (version() && version().feedback || []).filter(function (x) { return x.author_type === "client" && !x.resolved; }).length;
          if (action === "reject" && !note && !open) return window.showToast && window.showToast("لطفاً بنویسید چه چیزی باید اصلاح شود", "error");
          var r = await window.api("/api/client_review", { content_id: d.id, action: action, comment: note }, { raw: true });
          if (r && r.status === "success") {
            window.showToast && window.showToast(action === "approve" ? "محتوا تایید شد" : "درخواست اصلاح برای تیم ارسال شد", "success");
            if (r.over_limit) window.showToast && window.showToast("توجه: تعداد دورهای اصلاح از سقف قرارداد بیشتر شد؛ ممکن است هزینه جداگانه داشته باشد.", "info");
            m.close();
          } else if (r) window.showToast && window.showToast(r.message || "خطا", "error");
        };
      });
    }
    function bindClear() {
      var c = body.querySelector("#rvClear");
      if (c) c.onclick = function () { state.pending = null; var t = body.querySelector("#rvText").value; render(); body.querySelector("#rvText").value = t; };
    }
    render();
  };
})();
