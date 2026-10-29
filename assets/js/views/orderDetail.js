/* ==========================================================================
   工单详情（合并 waymo_2 结构 + _1 的「标记完工并开单」口径）
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI, GEO = w.GEO;

  /* 地址下方的定位状态：高德已定位 / 村镇坐标（估算） */
  function geoLine(o) {
    var g = GEO.of(o);
    var tag = !g
      ? ""
      : g.source === "amap"
        ? '<i class="geo-dot amap">高德已定位</i>'
        : g.source === "osm"
          ? '<i class="geo-dot amap">已定位</i>'
          : g.source === "town"
            ? '<i class="geo-dot warn">镇中心 · 待校准</i>'
            : '<i class="geo-dot">村镇坐标</i>';
    return '<div class="mt12 t-xs mut fx g4" style="line-height:1.6">' + U.icon("pin", 12) +
      "<span>" + U.esc(o.town + o.village + " · " + o.addr) + tag + "</span></div>";
  }

  function payKeys(o) {
    var dues = D.due(o);
    var keys = [
      { v: dues, k: "收尾款", primary: true },
      { v: 1000, k: "收定金" },
      { v: 500, k: "零收" },
      { v: 0, k: "自填" }
    ];
    return keys.map(function (x) {
      if (x.v <= 0 && x.k !== "自填") return "";
      return '<button class="pay-key' + (x.primary ? " primary" : "") + '" data-pay="' + x.v + '">' +
        '<div class="k1">' + (x.k === "自填" ? "＋" : "¥" + U.n(x.v)) + "</div>" +
        '<div class="k2">' + x.k + "</div></button>";
    }).join("");
  }

  var STEP_KEYS = ["待开工", "施工中", "待结清", "已结清"];
  var STEP_IDX = { planned: 0, doing: 1, done: 2, settled: 3 };

  function steps(o) {
    var cur = STEP_IDX[D.state(o)];
    if (cur === undefined) cur = 0;
    return (
      '<div class="stline">' +
        STEP_KEYS.map(function (s, i) {
          return '<span class="stp ' + (i < cur ? "done" : i === cur ? "on" : "") + '">' + s + "</span>";
        }).join("") +
      "</div>"
    );
  }

  function flows(o) {
    if (!o.flows || !o.flows.length) {
      return '<div class="t-xs mut tc" style="padding:10px 0">暂无收款流水</div>';
    }
    return o.flows.map(function (f) {
      var zero = !f.amount;
      return (
        '<div class="flow' + (zero ? " zero" : "") + '">' +
          '<div class="fic">' + U.icon(zero ? "clock" : "check", 15) + "</div>" +
          '<div class="col"><div class="ft1">' + f.date + " " + f.type + (f.text ? " · " + U.esc(f.text) : "") + "</div>" +
          '<div class="ft2">' + (zero ? "尚未到账 · 已记录约定" : "已生成电子凭证") + "</div></div>" +
          '<div class="fa ' + (zero ? "mut" : "green-t") + '">' + (zero ? "待收" : "+¥" + U.n(f.amount)) + "</div>" +
        "</div>"
      );
    }).join("");
  }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.order = function (params) {
    var o = D.byId(params.id);
    if (!o) return {
      bar:'<div class="navline"><a class="back" href="#/orders" aria-label="返回">' + U.icon("arrowLeft", 18) + '</a><div class="navline-title">工单详情</div></div>',
      body:'<div class="empty"><h4>订单不存在</h4><p>请返回订单列表核对单号</p></div>', tab:"orders"
    };
    var mediaEntry = w.MEDIA && w.MEDIA.entry(o.id);
    if (mediaEntry && mediaEntry.ready) o.media = mediaEntry.items;
    else if (w.MEDIA && !mediaEntry) {
      w.MEDIA.load(o.id).then(function () {
        if (w.location.hash.split("?")[0] === "#/order/" + o.id) w.APP.render();
      }).catch(function (err) { U.toast(err.message); });
    }
    var dues = D.due(o);
    var prog = o.quote ? Math.round((o.paid / o.quote) * 100) : 0;
    var rooms = D.rooms(o);

    /* 状态全部读人工动作，不看日期 */
    var st = D.state(o);
    var head, amtCls, chip, showAmt;

    if (st === "settled") {
      head = "本单已结清";
      amtCls = "green-t";
      showAmt = o.quote;
      chip = '<span class="pill green">' + U.icon("check", 11) + "已全额结清</span>";
    } else if (st === "done") {
      /* 完工之后、结清之前：即使已经收满款，也要人再确认一次 */
      var owes = dues > 0;
      head = owes ? "待收尾款" : "完工 · 待确认结清";
      amtCls = owes ? "orange-t" : "green-t";
      /* 收满时别把大字写成「¥0」，用整单报价，跟已结清的样子对齐 */
      showAmt = owes ? dues : o.quote;
      chip = '<span class="pill orange">' + U.icon("alert", 11) +
        (owes ? "完工待收 · 急催结清" : "已收满 · 待确认结清") + "</span>";
    } else if (st === "doing") {
      head = o.paid > 0 ? "施工中 · 已预付" : "施工中";
      amtCls = "brand-t";
      showAmt = o.quote;
      chip = '<span class="pill brand">' + U.icon("wrench", 11) + o.startedAt + " 开工</span>";
    } else {
      /* 没收到钱就别写「已预付」——新录的单可能一分钱都还没收 */
      head = o.paid > 0 ? "已收 ¥" + U.n(o.paid) + " · 待开工" : "待开工 · 未收款";
      amtCls = "brand-t";
      showAmt = o.quote;
      chip = '<span class="pill line">' + U.icon("clock", 11) +
        (o.scheduledAt || "待排期") + " · " + D.teamNames(o.teams) + "</span>";
    }

    var bar =
      '<div class="navline">' +
        '<a class="back" href="#/orders" aria-label="返回">' + U.icon("arrowLeft", 18) + "</a>" +
        '<div class="col navline-mid"><div class="navline-title">工单详情</div>' +
        '<div class="navline-sub">' + U.esc(o.id) + " · " + U.esc(o.town + o.village) + "</div></div>" +
        U.statusPill(st) +
        '<button class="icon-btn" id="btnCall" aria-label="打电话">' + U.icon("phone", 17) + "</button>" +
      "</div>";

    var hero =
      '<section class="card detail-hero mt10" style="border-radius:24px">' +
        '<div class="tc">' +
          '<div class="t-xs b8 mut" style="letter-spacing:.06em;text-transform:uppercase">' + head + "</div>" +
          '<div class="d-amount ' + amtCls + ' mt6">' +
            '<span class="cur">¥</span>' + U.n(showAmt) + "</div>" +
          '<div class="mt8">' + chip + "</div>" +
        "</div>" +
        '<div class="hr"></div>' +
        '<div class="fx">' +
          '<div class="col"><div class="t-xs mut b7">整单报价' +
            (o.mode === "大包" || o.mode === "人工" ? "（" + o.mode + "）" : "") + "</div>" +
            '<div class="b8 mt4" style="font-size:16px;letter-spacing:-.03em">¥' + U.n(o.quote) + "</div>" +
            '<div class="t-xs mut mt2">主房 ' + o.main + " 间 · 偏房 " + o.wing + " 间</div></div>" +
          '<div class="col tr"><div class="t-xs mut b7">已收金额' + (o.paid ? '<span class="green-t"> ✓</span>' : "") + "</div>" +
            '<div class="b8 green-t mt4" style="font-size:16px;letter-spacing:-.03em">¥' + U.n(o.paid) + "</div>" +
            '<div class="t-xs mut mt2">' + (o.flows && o.flows[0] ? o.flows[0].date + " " + o.flows[0].type : "—") + "</div></div>" +
        "</div>" +
        '<div class="bar thin mt12"><i class="' + (prog === 100 ? "green" : "") + '" style="width:' + prog + '%"></i></div>' +
        steps(o) +
      "</section>";

    var pay =
      '<section class="card mt12">' +
        '<div class="card-head" style="margin-bottom:11px">' +
          '<div class="card-title" style="font-size:13px">' + U.icon("wallet", 15) + "快速收款登记</div>" +
          '<span class="card-meta">点击立即核销入账</span>' +
        "</div>" +
        '<div class="pay-grid" id="payGrid">' + payKeys(o) + "</div>" +
        '<div class="fx aic jb mt12" style="margin-bottom:2px">' +
          '<span class="t-xs mut b7">收款流水（' + (o.flows ? o.flows.length : 0) + " 笔）</span>" +
          '<span class="pill xs green">' + U.icon("check", 9) + "电子凭证自动生成</span>" +
        "</div>" +
        flows(o) +
      "</section>";

    var spec =
      '<section class="card mt12">' +
        '<div class="card-head" style="margin-bottom:6px">' +
          '<div class="card-title" style="font-size:13px">' + U.icon("layers", 15) + "屋面规格与用料</div>" +
          '<button class="pill xs line" id="btnEditSpec">' + U.icon("edit", 10) + "改</button>" +
        "</div>" +
        '<div class="rowline"><span class="k">房屋结构间数</span>' +
          '<span class="v">主房 ' + o.main + " 间 · 偏房 " + o.wing + " 间（共 " + rooms + " 间）</span></div>" +
        '<div class="rowline"><span class="k">承接用料模式</span>' +
          '<span class="v brand-t">' + o.mode +
            (o.mode === "大包" ? "（包工包料）"
              : o.mode === "人工" ? "（纯人工）"
              : "（待现场量尺确认）") + "</span></div>" +
        '<div class="rowline"><span class="k">施工班组</span><span class="v">' + D.teamNames(o.teams) + "</span></div>" +
        '<div class="rowline"><span class="k">档期</span><span class="v">' +
          (o.doneAt ? "完工 " + (o.done || String(o.doneAt).split(" ")[0])
            : o.startedAt ? "开工 " + (o.start || String(o.startedAt).split(" ")[0])
            : o.scheduledAt ? "计划 " + o.scheduledAt
            : "待排期") + "</span></div>" +
        '<div class="tagrow mt12">' +
          o.tags.map(function (t) { return '<span class="pill brand">' + U.esc(t) + "</span>"; }).join("") +
        "</div>" +
        geoLine(o) +
      "</section>";

    /* ---------- 完工留档：真选文件、可预览、可删 ---------- */
    var ms = D.mediaStat(o);
    var tiles = "";

    /* 样例位：只有真的什么都没留档时才出现，且角上明确标「样例」 */
    if (!ms.has && ms.sample) {
      tiles += '<div class="photo sample"><div class="ph-sky"></div><div class="ph-roof"></div>' +
        '<span class="ph-lbl">全景</span><span class="ph-tag">样例</span></div>';
      tiles += '<div class="photo sample"><div class="ph-sky"></div>' +
        '<div class="ph-roof" style="height:66%;transform:rotate(-4deg)"></div>' +
        '<span class="ph-lbl">防水</span><span class="ph-tag">样例</span></div>';
    }

    (o.media || []).forEach(function (m) {
      var inner = m.kind === "video"
        ? '<video class="ph-v" src="' + U.esc(m.url) + '" muted playsinline preload="metadata"></video>' +
          '<span class="ph-play">' + U.icon("play", 12) + "</span>"
        : '<img class="ph-img" src="' + U.esc(m.url) + '" alt="' + U.esc(m.name || "留档照片") + '">';
      tiles += '<button class="photo real" data-media="' + U.esc(m.id) + '" ' +
        'aria-label="' + U.esc((m.kind === "video" ? "视频" : "照片") + "：" + (m.name || "")) + '">' +
        inner + '<span class="ph-lbl">' + (m.kind === "video" ? "视频" : "照片") + "</span></button>";
    });

    if (ms.count < 9) {
      tiles += '<button class="photo add" id="btnAddPhoto">' + U.icon("camera", 18) + "<span>补充</span></button>";
    }

    var msMeta = !ms.has
      ? (ms.sample ? "未留档 · 样例 " + ms.sample + " 张" : "未留档")
      : ms.count + " 项" + (ms.vid ? " · 含视频" : "");

    var photo =
      '<section class="card mt12" id="photoCard">' +
        '<div class="card-head" style="margin-bottom:11px">' +
          '<div class="card-title" style="font-size:13px">' + U.icon("camera", 15) + "完工留档" +
            (ms.has ? ' <span class="pill xs green">已留档</span>' : "") + "</div>" +
          '<span class="card-meta">' + msMeta + "</span>" +
        "</div>" +
        '<div class="photo-grid">' + tiles + "</div>" +
        '<div class="t-xs mut mt10" style="line-height:1.55">' +
          (ms.has
            ? "点缩略图可放大查看或删除 · 用于自动生成电子质保卡"
            : "建议拍摄全景、正脊瓦、屋檐各一张 · 用于自动生成电子质保卡") +
        "</div>" +
        '<input type="file" id="inPhotoPick" accept="image/*" multiple hidden>' +
        '<input type="file" id="inVideoPick" accept="video/*" hidden>' +
      "</section>";

    var cta;
    if (st === "planned") {
      cta = '<div class="form-foot">' +
        '<button class="btn ghost" id="btnEditSpec2" style="flex:.9">改档期</button>' +
        '<button class="btn primary" id="btnStart">' + U.icon("play", 15) + "开始施工</button>" +
        "</div>";
    } else if (st === "doing") {
      cta = '<div class="form-foot">' +
        '<button class="btn ghost" id="btnEditSpec2" style="flex:.9">改档期</button>' +
        '<button class="btn primary" id="btnDone">' + U.icon("checkCircle", 15) + "标记完工</button>" +
        "</div>";
    } else if (st === "done") {
      cta = '<div class="form-foot">' +
        '<button class="btn ghost" id="btnCallAgain" style="flex:.9">' + U.icon("chat", 15) + "发催款</button>" +
        '<button class="btn primary" id="btnSettle">' + U.icon("check", 15) + "确认结清尾款</button>" +
        "</div>";
    } else {
      cta = '<div class="form-foot"><button class="btn primary" disabled>' +
        U.icon("check", 15) + "本单已结清，无需操作</button></div>";
    }
    cta += '<div style="height:6px"></div>';

    var body = hero + pay + spec + photo + cta;

    function refresh() { w.APP.render(); }

    /* ---------- 完工留档：选文件 → 缩略图 → 预览 / 删除 ---------- */
    function fmtSize(b) {
      if (!b) return "—";
      if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + " KB";
      return (b / 1024 / 1024).toFixed(1) + " MB";
    }

    function ingest(files, kind) {
      var selected = Array.prototype.slice.call(files || []);
      var remaining = 9 - D.mediaStat(o).count;
      if (!selected.length) return;
      if (selected.length > remaining || selected.some(function (f) { return f.size > 120 * 1024 * 1024; })) {
        U.toast("最多 9 项，每个文件不超过 120MB"); return;
      }
      if (!w.MEDIA) { U.toast("留档存储不可用"); return; }
      w.MEDIA.save(o.id, selected, kind).then(function (count) {
        U.toast("已留档 " + count + (kind === "video" ? " 段视频" : " 张照片")); refresh();
      }).catch(function (err) { U.toast(err.message); });
    }

    function addSheet() {
      var mask = U.sheet(
        "<h3>完工留档</h3>" +
        '<div class="sub">照片和短视频都算留档 · 建议全景 + 正脊 + 屋檐各一张</div>' +
        '<div class="set-row" data-pick="image" role="button" tabindex="0">' +
          '<span class="si">' + U.icon("image", 18) + "</span>" +
          "<div><b>拍照 / 选照片</b><span>可一次选多张</span></div>" +
          '<span class="go">' + U.icon("chevronRight", 16) + "</span></div>" +
        '<div class="set-row" data-pick="video" role="button" tabindex="0">' +
          '<span class="si">' + U.icon("video", 18) + "</span>" +
          "<div><b>录一段视频</b><span>最长 1 分钟，能看清整面屋面</span></div>" +
          '<span class="go">' + U.icon("chevronRight", 16) + "</span></div>"
      );
      mask.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pick]");
        if (!b) return;
        var kind = b.getAttribute("data-pick");
        var el = document.getElementById(kind === "video" ? "inVideoPick" : "inPhotoPick");
        /* 必须还在这次点击的手势里调起文件选择，晚一步会被浏览器拦 */
        if (el) el.click();
        U.closeSheet();
      });
    }

    function preview(id) {
      var m = null;
      (o.media || []).forEach(function (x) { if (x.id === id) m = x; });
      if (!m) return;
      var inner = m.kind === "video"
        ? '<video class="pv-media" src="' + U.esc(m.url) + '" controls playsinline></video>'
        : '<img class="pv-media" src="' + U.esc(m.url) + '" alt="留档照片">';
      var mask = U.sheet(
        "<h3>" + (m.kind === "video" ? "留档视频" : "留档照片") + "</h3>" +
        '<div class="sub">' + U.esc(m.name || "未命名") + " · " + fmtSize(m.size) + "</div>" +
        inner +
        '<div class="btn-row mt14">' +
          '<button class="btn ghost" id="pvClose">关闭</button>' +
          '<button class="btn danger" id="pvDel">' + U.icon("trash", 14) + "删除</button>" +
        "</div>"
      );
      mask.addEventListener("click", function (e) {
        if (e.target.closest("#pvClose")) { U.closeSheet(); return; }
        if (!e.target.closest("#pvDel")) return;
        w.MEDIA.remove(o.id, m.id).then(function () {
          U.closeSheet(); U.toast("已删除这条留档"); refresh();
        }).catch(function (err) { U.toast(err.message); });
      });
    }

    var writing = false;
    function writeAction(action, success) {
      if (writing) return;
      writing = true;
      return action().then(function () { success(); refresh(); }).catch(function (err) {
        U.toast(err.message || "保存失败");
      }).then(function () { writing = false; });
    }
    function finishOrder() {
      return writeAction(function () { return D.transitionOrder(o.id, "finish"); }, function () {
        U.toast("已完工 · 留档 " + D.mediaStat(o).count + " 项");
      });
    }

    /* 没留档就完工：提醒，但不拦死 */
    function noMediaSheet() {
      var mask = U.sheet(
        "<h3>这单还没留完工影像</h3>" +
        '<div class="sub">目前 0 项留档。后面要出质保卡、要跟业主对账，有影像好说话。</div>' +
        '<div class="key-warn" style="margin-top:6px">' + U.icon("alert", 12) +
          "<span>先去补拍，或者就这样标记完工 —— <b>不会拦住你</b>。</span></div>" +
        '<div class="btn-row mt14">' +
          '<button class="btn ghost" id="nmLater">去补拍</button>' +
          '<button class="btn primary" id="nmGo">仍然完工</button>' +
        "</div>"
      );
      mask.addEventListener("click", function (e) {
        if (e.target.closest("#nmLater")) {
          U.closeSheet();
          var pc = document.getElementById("photoCard");
          if (pc) pc.scrollIntoView({ block: "center", behavior: "smooth" });
          U.toast("拍完再点「标记完工」");
          return;
        }
        if (e.target.closest("#nmGo")) { U.closeSheet(); return finishOrder(); }
      });
    }

    function doPay(amount, channel) {
      return writeAction(function () { return D.recordPayment(o.id, amount, channel); }, function () {
        U.toast("已核销 ¥" + U.n(amount)); U.closeSheet();
      });
    }

    function mount() {
      document.getElementById("btnCall").addEventListener("click", function () {
        var phone = String(o.phone || "").replace(/[^0-9+]/g, "");
        if (!phone) { U.toast("这单没有联系电话"); return; }
        w.location.href = "tel:" + phone;
      });

      function paymentSheet(amount, settle) {
        U.sheet("<h3>确认收款</h3><div class=\"sub\">请选择实际收款方式 · 剩余 ¥" + U.n(dues) + "</div>" +
          '<div class="price-input"><span class="cur">¥</span><input id="manualAmt" type="tel" inputmode="numeric" placeholder="0" value="' + (amount || '') + '"></div>' +
          '<div class="tagrow mt12" id="chanRow">' + ["微信", "现金", "银行"].map(function (c) {
            return '<button class="tagchip" data-ch="' + c + '">' + c + '</button>';
          }).join('') + '</div><button class="btn primary mt14" id="manualOk">确认入账</button>');
        document.getElementById("chanRow").addEventListener("click", function (ev) {
          var t = ev.target.closest(".tagchip"); if (!t) return;
          [].forEach.call(this.children, function (c) { c.classList.toggle("on", c === t); });
        });
        document.getElementById("manualOk").addEventListener("click", function () {
          var amt, chosen = document.querySelector("#chanRow .tagchip.on");
          try { amt = D.parseMoney(document.getElementById("manualAmt").value, true); }
          catch (err) { U.toast(err.message); return; }
          if (!chosen) { U.toast("请选择实际收款方式"); return; }
          if (settle && amt !== dues) { U.toast("结清金额须等于剩余应收"); return; }
          if (!settle) return doPay(amt, chosen.getAttribute("data-ch"));
          return writeAction(function () { return D.settleOrder(o.id, chosen.getAttribute("data-ch")); },
            function () { U.closeSheet(); U.toast("已核销 ¥" + U.n(amt) + " · 本单结清"); });
        });
      }
      var grid = document.getElementById("payGrid");
      if (grid) grid.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pay]"); if (!b) return;
        var v = parseInt(b.getAttribute("data-pay"), 10);
        if (dues <= 0) { U.toast("本单没有待收款"); return; }
        paymentSheet(v ? Math.min(v, dues) : 0, false);
      });

      var stBtn = document.getElementById("btnStart");
      if (stBtn) stBtn.addEventListener("click", function () {
        return writeAction(function () { return D.transitionOrder(o.id, "start"); }, function () {
          U.toast("已开始施工 · 状态转为施工中");
        });
      });

      var d = document.getElementById("btnDone");
      if (d) d.addEventListener("click", function () {
        if (w.MEDIA && (!w.MEDIA.entry(o.id) || !w.MEDIA.entry(o.id).ready)) { U.toast("留档正在读取，请稍后再试"); return; }
        if (!D.mediaStat(o).has) { noMediaSheet(); return; }
        return finishOrder();
      });

      /* 留档：补充 → 选文件；点缩略图 → 预览 / 删除 */
      var addBtn = document.getElementById("btnAddPhoto");
      if (addBtn) addBtn.addEventListener("click", addSheet);

      var inP = document.getElementById("inPhotoPick");
      if (inP) inP.addEventListener("change", function () {
        ingest(this.files, "image");
        this.value = "";        /* 允许下次再选同一张 */
      });
      var inV = document.getElementById("inVideoPick");
      if (inV) inV.addEventListener("change", function () {
        ingest(this.files, "video");
        this.value = "";
      });

      var photoCard = document.getElementById("photoCard");
      if (photoCard) photoCard.addEventListener("click", function (e) {
        var t = e.target.closest("[data-media]");
        if (t) preview(t.getAttribute("data-media"));
      });

      var settleBtn = document.getElementById("btnSettle");
      if (settleBtn) settleBtn.addEventListener("click", function () {
        if (o.quote <= 0) { U.toast("请先确认正数报价，再登记结清"); return; }
        var rest = D.due(o);
        if (rest > 0) { paymentSheet(rest, true); return; }
        return writeAction(function () { return D.settleOrder(o.id); }, function () { U.toast("已标记结清"); });
      });

      var ca = document.getElementById("btnCallAgain");
      if (ca) ca.addEventListener("click", function () {
        var msg = (o.owner || "您好") + "，您好，" + (o.addr || "施工订单") + "尚有尾款 ¥" + U.n(D.due(o)) + "，麻烦您方便时核对并安排，谢谢。";
        if (!w.navigator.clipboard || !w.navigator.clipboard.writeText) { U.toast("当前设备无法自动复制，请手动联系业主"); return; }
        w.navigator.clipboard.writeText(msg).then(function () { U.toast("催款内容已复制，请自行发送"); }).catch(function () { U.toast("复制失败，请手动联系业主"); });
      });
      var edit = document.getElementById("btnEditSpec");
      if (edit) edit.addEventListener("click", function () {
        U.sheet('<h3>修改规格与报价</h3><div class="sub">已收金额 ¥' + U.n(o.paid) + '，报价不得低于已收金额</div>' +
          '<div class="set-row"><div><b>主房间数</b></div><input class="inline-input" id="editMain" type="number" min="0" value="' + o.main + '"></div>' +
          '<div class="set-row"><div><b>偏房间数</b></div><input class="inline-input" id="editWing" type="number" min="0" value="' + o.wing + '"></div>' +
          '<div class="set-row"><div><b>整单报价</b></div><input class="inline-input" id="editQuote" type="number" min="0" value="' + o.quote + '"></div>' +
          '<button class="btn primary mt14" id="editSave">保存</button>');
        document.getElementById("editSave").addEventListener("click", function () {
          var main, wing, quote;
          try { main = D.parseMoney(document.getElementById("editMain").value); wing = D.parseMoney(document.getElementById("editWing").value); quote = D.parseMoney(document.getElementById("editQuote").value); }
          catch (err) { U.toast(err.message); return; }
          if (main + wing < 1) { U.toast("至少需要一间房"); return; }
          return writeAction(function () { return D.saveOrder(o, {main:main, wing:wing, quote:quote}); }, function () { U.closeSheet(); U.toast("规格已保存"); });
        });
      });
      var changeDate = document.getElementById("btnEditSpec2");
      if (changeDate) changeDate.addEventListener("click", function () { w.location.hash = "#/schedule"; U.toast("长按订单拖到新档期"); });
    }

    return { bar: bar, body: body, mount: mount, tab: "orders" };
  };
})(window);
