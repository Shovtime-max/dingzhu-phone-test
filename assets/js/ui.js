/* ==========================================================================
   鼎筑 — 通用 UI 工具（图标 / 格式化 / 弹层 / Toast）
   纯内联 SVG，不依赖任何图标字体或 CDN，断网可用
   ========================================================================== */
(function (w) {
  "use strict";

  var P = {
    roof: '<path d="M2 11l10-7 10 7"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-5.5h5V20"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    calendarDays: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    route: '<circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="5" r="2.4"/><path d="M8.4 19h5.2a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h5.6"/>',
    plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8.5v7M8.5 12h7"/>',
    receipt: '<path d="M4.5 2.5h15v19l-2.5-1.8-2.5 1.8-2.5-1.8-2.5 1.8-2.5-1.8-2.5 1.8z"/><path d="M8.5 7.5h7M8.5 11.5h7M8.5 15.5h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
    chart: '<path d="M3 20.5h18"/><path d="M6.5 20.5V13M12 20.5V6M17.5 20.5v-9"/>',
    bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z"/><path d="M13.8 20.5a2 2 0 0 1-3.6 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    chevronRight: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="M11.5 18.5L5 12l6.5-6.5"/>',
    arrowUpRight: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
    phone: '<path d="M21.5 16.9v2.8a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.3 19.3 0 0 1-6-6 19.6 19.6 0 0 1-3-8.6A2 2 0 0 1 3.8 2h2.8a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.6 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1z"/>',
    chat: '<path d="M20.5 11.6a8.3 8.3 0 0 1-8.9 8.3 9 9 0 0 1-3.8-.9L3 20.5l1.6-4.6a8.3 8.3 0 0 1-.9-3.9A8.3 8.3 0 0 1 12 3.4a8.3 8.3 0 0 1 8.5 8.2z"/>',
    camera: '<path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3.4l1.9-2.8h5.4L16.6 6.5H20a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    check: '<path d="M20 6.5L9.2 17.3 4 12.1"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.2 12.2l2.7 2.7 4.9-5.4"/>',
    alert: '<path d="M10.3 3.9L1.9 18.1a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.2M12 17.4h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5v-4.8M12 8h.01"/>',
    pin: '<path d="M20.5 10.3c0 6.5-8.5 12.2-8.5 12.2s-8.5-5.7-8.5-12.2a8.5 8.5 0 0 1 17 0z"/><circle cx="12" cy="10.2" r="3"/>',
    home: '<path d="M3.5 10L12 3.2 20.5 10v9.3a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M9.5 21.3v-6.6h5v6.6"/>',
    wrench: '<path d="M14.5 2.2a5.6 5.6 0 0 0 5.6 5.6l-9.6 9.6a2.9 2.9 0 1 1-4.1-4.1z"/><path d="M5 19l-.8.8"/>',
    layers: '<path d="M12 2.5l9 4.7-9 4.7-9-4.7z"/><path d="M3 12.2l9 4.7 9-4.7"/><path d="M3 16.9l9 4.7 9-4.7"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    edit: '<path d="M12 20.5h9"/><path d="M16.6 3.7a2.1 2.1 0 0 1 3 3L7.4 18.9 3 20l1.1-4.4z"/>',
    sliders: '<path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3"/><path d="M1.5 15h5M9.5 8h5M17.5 17h5"/>',
    trending: '<path d="M22 6.5l-8.5 8.5-4-4L2 18.5"/><path d="M16 6.5h6v6"/>',
    users: '<path d="M16.5 21.5v-2a4 4 0 0 0-4-4H5.5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7.5" r="3.8"/><path d="M22.5 21.5v-2a4 4 0 0 0-3-3.8"/><path d="M16 3.9a3.8 3.8 0 0 1 0 7.4"/>',
    flame: '<path d="M12 2.5c2.2 4.2 5.2 5.6 5.2 9.2A5.2 5.2 0 0 1 12 17a5.2 5.2 0 0 1-5.2-5.3c0-1.5.5-2.6 1.2-3.2 0 1.6 1 2.2 1.6 2.2C10 7.6 11 5.2 12 2.5z"/><path d="M12 21.5v-2"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 1.8v2.4M12 19.8v2.4M4.2 12H1.8M22.2 12h-2.4M6.3 6.3L4.6 4.6M19.4 19.4l-1.7-1.7M6.3 17.7l-1.7 1.7M19.4 4.6l-1.7 1.7"/>',
    cloud: '<path d="M17.5 18.5H7a4.5 4.5 0 1 1 .6-8.96A6 6 0 0 1 19 11.2a3.65 3.65 0 0 1-1.5 7.3z"/>',
    filter: '<path d="M21.5 3.5h-19l7.6 9v7.2l3.8 1.9v-9.1z"/>',
    wallet: '<path d="M20 11.5V7.5H5.5a2 2 0 0 1 0-4H18v4"/><path d="M3.5 5.5v13a2 2 0 0 0 2 2H20v-4"/><path d="M17.5 11.5h5v4h-5a2 2 0 0 1 0-4z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15.5l-4.6-4.6L7 20.5"/>',
    video: '<rect x="2.5" y="6" width="14" height="12" rx="2.6"/><path d="M16.5 10.6l5-2.8v8.4l-5-2.8z"/>',
    sparkles: '<path d="M12 2.8l1.9 4.7 4.7 1.9-4.7 1.9L12 16.1l-1.9-4.8L5.4 9.4l4.7-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    zap: '<path d="M13.2 2L3.5 14h7.3l-1 8 9.7-12h-7.3z"/>',
    clipboard: '<path d="M15.5 4H18a2 2 0 0 1 2 2v13.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2.5"/><rect x="8.5" y="2" width="7" height="4" rx="1.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M20 21.5v-1.8a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v1.8"/>',
    refresh: '<path d="M21 3.5v6h-6"/><path d="M3 20.5v-6h6"/><path d="M3.6 9.2a9 9 0 0 1 14.7-3.4L21 9.5"/><path d="M20.4 14.8a9 9 0 0 1-14.7 3.4L3 14.5"/>',
    trash: '<path d="M4 6.6h16"/><path d="M9.5 6.6V4.4h5v2.2"/><path d="M6.4 6.6l.9 12.6A1.9 1.9 0 0 0 9.2 21h5.6a1.9 1.9 0 0 0 1.9-1.8l.9-12.6"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    inbox: '<path d="M21 12.5h-5l-2 3h-4l-2-3H3"/><path d="M5.9 4.5h12.2a2 2 0 0 1 1.9 1.4l1.9 6.6v5.5a2 2 0 0 1-2 2H4.1a2 2 0 0 1-2-2v-5.5l1.9-6.6A2 2 0 0 1 5.9 4.5z"/>',
    ruler: '<path d="M15.6 2.4L21.6 8.4a1.6 1.6 0 0 1 0 2.3L10.7 21.6a1.6 1.6 0 0 1-2.3 0L2.4 15.6a1.6 1.6 0 0 1 0-2.3L13.3 2.4a1.6 1.6 0 0 1 2.3 0z"/><path d="M6.8 10.2l1.9 1.9M10 8l1.9 1.9M13.2 4.8l1.9 1.9"/>',
    gear: '<circle cx="12" cy="12" r="3.4"/><path d="M19.3 14.9a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1.1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1.1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    star: '<path d="M12 3.4l2.72 5.5 6.08.89-4.4 4.29 1.04 6.05L12 17.27l-5.44 2.86 1.04-6.05-4.4-4.29 6.08-.89z"/>',
    undo: '<path d="M9.2 14.2L4.6 9.6l4.6-4.6"/><path d="M4.6 9.6h8.6a6.2 6.2 0 0 1 0 12.4h-4.4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.6 6h.01M3.6 12h.01M3.6 18h.01"/>'
  };

  function icon(name, size, extra) {
    var p = P[name] || P.info;
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (extra ? ' style="' + extra + '"' : "") + '>' + p + "</svg>";
  }

  var SB = {
    signal: '<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.6" y="5.6" width="3" height="6.4" rx="1"/><rect x="9.2" y="3.2" width="3" height="8.8" rx="1"/><rect x="13.8" y="0.8" width="3" height="11.2" rx="1"/></svg>',
    wifi: '<svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M1 4.2a10 10 0 0 1 14 0"/><path d="M3.6 7a6.4 6.4 0 0 1 8.8 0"/><path d="M6.2 9.6a2.8 2.8 0 0 1 3.6 0"/></svg>',
    battery: '<svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.6" y="0.6" width="21" height="10.8" rx="3.2" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.1"/><rect x="2.2" y="2.2" width="15.5" height="7.6" rx="2" fill="currentColor"/><path d="M23.2 4.2v3.6a2 2 0 0 0 0-3.6z" fill="currentColor" fill-opacity="0.5"/></svg>'
  };

  /* ---------- 格式化 ---------- */
  function n(n) {
    if (n === null || n === undefined || isNaN(n)) return "0";
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function yuan(n, withCur) {
    return (withCur === false ? "" : "¥") + n2(n);
  }
  function n2(v) { return n(v); }
  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- 状态元信息 ---------- */
  var STATUS = {
    settled: { cls: "green", text: "已结清" },
    /* 完工之后要人再确认一次结清，所以这里不是「待收款」而是「待结清」 */
    done: { cls: "amber", text: "待结清" },
    doing: { cls: "brand", text: "施工中" },
    planned: { cls: "line", text: "待开工" },
    pending: { cls: "line", text: "待定" }
  };
  function statusPill(st, small) {
    var m = STATUS[st] || { cls: "line", text: st };
    return '<span class="pill ' + m.cls + (small ? " xs" : "") + '">' + m.text + "</span>";
  }

  /* ---------- Toast ---------- */
  function toast(msg) {
    var shell = document.querySelector(".shell");
    if (!shell) return;
    var old = shell.querySelector(".toast-wrap");
    if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.innerHTML = '<div class="toast">' + icon("checkCircle", 15) + "<span>" + esc(msg) + "</span></div>";
    shell.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.remove(); }, 2000);
  }

  /* ---------- 底部抽屉 ---------- */
  function sheet(html) {
    closeSheet();
    var shell = document.querySelector(".shell");
    var mask = document.createElement("div");
    mask.className = "sheet-mask";
    mask.id = "sheetMask";
    mask.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div>' + html + "</div>";
    mask.addEventListener("click", function (e) { if (e.target === mask) closeSheet(); });
    shell.appendChild(mask);
    return mask;
  }
  function closeSheet() {
    var m = document.getElementById("sheetMask");
    if (m) m.remove();
  }

  /* ---------- 左滑露出操作（列表卡片通用，零依赖） ----------
     opt: { item: ".swipe", act: ".swipe-acts", onAct(动作名, 卡片元素) }
     · 横向位移超过 10px 且明显大于纵向才接管，纵向滚动照旧
     · 同一时刻只展开一张，点别处/滑别张自动收回
     · 滑完会吃掉浏览器补的那一下 click，否则订单卡会直接跳详情
  */
  function bindSwipe(root, opt) {
    if (!root) return null;
    var itemSel = opt.item || ".swipe";
    var actsSel = opt.act || ".swipe-acts";
    var OPEN = null, drag = null, swallowUntil = 0;

    function innerOf(el) { return el ? el.querySelector(".swipe-inner") : null; }
    function actsW(el) {
      var a = el ? el.querySelector(actsSel) : null;
      return a ? a.offsetWidth : 0;
    }
    function setX(el, x, animate) {
      var i = innerOf(el); if (!i) return;
      var a = el.querySelector(actsSel);
      var t = animate ? "transform .32s cubic-bezier(.32,1.22,.56,1)" : "none";
      i.style.transition = t;
      i.style.transform = x ? "translateX(" + Math.round(x) + "px)" : "";
      /* 动作按钮跟着卡片一起走：平时在右边界之外，滑多少露多少，
         所以不会铺在卡片底下透色（半透明卡片会把橙红模糊晕开） */
      if (a) {
        a.style.transition = t;
        a.style.transform = "translateX(" + Math.round(Math.min(0, x)) + "px)";
      }
      el.classList.toggle("swiped", !!x);
    }
    function close(el) {
      if (!el) return;
      setX(el, 0, true);
      if (OPEN === el) OPEN = null;
    }
    function open(el) {
      if (OPEN && OPEN !== el) close(OPEN);
      setX(el, -actsW(el), true);
      OPEN = el;
    }
    function closeAll() { if (OPEN) close(OPEN); }

    root.addEventListener("pointerdown", function (e) {
      var el = e.target.closest(itemSel);
      if (!el || (e.button != null && e.button !== 0)) return;
      if (e.target.closest(actsSel)) return;      /* 点在操作按钮上，不算拖 */
      drag = {
        el: el, id: e.pointerId, x0: e.clientX, y0: e.clientY,
        base: el.classList.contains("swiped") ? -actsW(el) : 0,
        active: false, dx: 0, lastX: e.clientX, lastT: Date.now(), v: 0
      };
    });

    root.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.active) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
        drag.active = true;
        try { drag.el.setPointerCapture(e.pointerId); } catch (err) {}
        if (OPEN && OPEN !== drag.el) close(OPEN);
      }
      if (e.cancelable !== false) e.preventDefault();
      var now = Date.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
      var w = actsW(drag.el), nx = drag.base + dx;
      if (nx > 0) nx *= 0.25;                              /* 往右拖给阻尼，不真的开花 */
      if (nx < -w - 24) nx = -w - 24 + (nx + w + 24) * 0.25;
      drag.dx = nx;
      setX(drag.el, nx, false);
    });

    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (!d.active) return;
      var w = actsW(d.el);
      if (Math.abs(d.dx) > w / 2 || d.v < -0.35) open(d.el); else close(d.el);
      swallowUntil = Date.now() + 350;
    }
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);

    /* 桌面触控板：两指左右滑出的是 wheel（deltaX），根本不会产生 pointermove。
       少了这段，Mac 上「滑一下」什么都不会发生 —— 看着就像功能没了。
       只在横向分量明显大于纵向时才接管，竖向滚动照旧。 */
    var wheelEnd = null;
    root.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;
      var el = e.target.closest(itemSel);
      if (!el || e.target.closest(actsSel)) return;
      var w = actsW(el);
      if (!w) return;
      e.preventDefault();
      if (OPEN && OPEN !== el) close(OPEN);
      if (el.__sx == null) el.__sx = el.classList.contains("swiped") ? -w : 0;
      var nx = el.__sx - e.deltaX;
      if (nx > 0) nx *= 0.25;
      if (nx < -w - 24) nx = -w - 24 + (nx + w + 24) * 0.25;
      el.__sx = nx;
      setX(el, nx, false);
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(function () {
        var last = el.__sx; el.__sx = null;
        if (last != null && last < -w / 2) open(el); else close(el);
      }, 150);
    }, { passive: false });

    function stop(e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }

    /* 捕获阶段：抢在卡片链接的默认跳转之前处理 */
    root.addEventListener("click", function (e) {
      if (Date.now() < swallowUntil) {
        stop(e); swallowUntil = 0; return;
      }
      var btn = e.target.closest(actsSel + " [data-swipe]");
      if (btn) {
        stop(e);
        var host = btn.closest(itemSel);
        close(host);
        if (opt.onAct) opt.onAct(btn.getAttribute("data-swipe"), host, btn);
        return;
      }
      var card = e.target.closest(itemSel);
      if (OPEN && card) {
        /* 展开状态下：点卡片里的按钮 → 先收起，但让按钮照常执行；
           点卡片空白处 → 只收起，不跳详情 */
        if (card === OPEN) {
          var btnInside = e.target.closest("button");
          close(card);
          if (!btnInside) stop(e);
          return;
        }
        closeAll();
      }
    }, true);

    return { closeAll: closeAll };
  }

  w.UI = {
    icon: icon, SB: SB, n: n, yuan: yuan, pct: pct, esc: esc,
    statusPill: statusPill, toast: toast, sheet: sheet, closeSheet: closeSheet, STATUS: STATUS,
    bindSwipe: bindSwipe
  };
})(window);
