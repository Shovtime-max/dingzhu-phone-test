/* ==========================================================================
   订单列表（新增页 · C 阶段补齐）
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  /* stackOpen：已结清单是否展开（筛选切换会重建列表，靠它记住） */
  var state = { filter: "全部", q: "", sort: "amount", stackOpen: false };

  var FILTERS = [
    { key: "全部", label: "全部" },
    { key: "planned", label: "待开工" },
    { key: "doing", label: "施工中" },
    { key: "done", label: "待结清" },
    { key: "settled", label: "已结清" }
  ];

  function match(o) {
    if (state.filter !== "全部" && D.state(o) !== state.filter) return false;
    if (state.q) {
      var k = state.q.toLowerCase();
      var hay = (o.owner + o.town + o.village + o.id + o.addr).toLowerCase();
      if (hay.indexOf(k) < 0) return false;
    }
    return true;
  }

  function filtered() {
    var arr = D.ORDERS.filter(match);
    if (state.sort === "amount") {
      arr.sort(function (a, b) { return D.due(b) - D.due(a) || b.quote - a.quote; });
    } else {
      arr.sort(function (a, b) { return (b.done || b.start || "").localeCompare(a.done || a.start || ""); });
    }
    /* 标注重点的单永远排最前，其余保持上面的排序 */
    return arr.sort(function (a, b) {
      if (!!a.starred === !!b.starred) return 0;
      return a.starred ? -1 : 1;
    });
  }

  function countOf(key) {
    if (key === "全部") return D.ORDERS.length;
    return D.ORDERS.filter(function (o) { return D.state(o) === key; }).length;
  }

  function card(o) {
    var st = D.state(o);
    var stCls = st === "done" ? "st-due" : st === "doing" ? "st-ing" : st === "planned" ? "st-wait" : "";
    var dues = D.due(o);
    var prog = o.quote ? Math.round((o.paid / o.quote) * 100) : 0;
    var moneySub, foot, footWarn;
    if (st === "settled") {
      moneySub = '<span class="green-t">已收清</span>';
      foot = (o.doneAt ? "完工 " + (o.done || String(o.doneAt).split(" ")[0]) + " · " : "") + "已结清";
    } else if (st === "done") {
      /* 完工之后要人再确认结清：收满款也不能显示「待收 ¥0」 */
      moneySub = dues > 0
        ? '<span class="orange-t">待收 ¥' + U.n(dues) + "</span>"
        : '<span class="green-t">已收满 · 待确认结清</span>';
      var od = D.overdueDays(o);
      foot = "完工 " + (o.done || String(o.doneAt).split(" ")[0]) + (od > 0 ? " · 超 " + od + " 天" : "");
      footWarn = od > 0;
    } else if (st === "doing") {
      moneySub = '<span class="mut">已预付</span>';
      foot = o.startedAt + " 开工 · 施工中";
    } else {
      moneySub = '<span class="mut">已预付</span>';
      foot = (o.scheduledAt || "待排档期") + " · " + D.teamShort(o.teams) + "接单";
    }

    return (
      '<a class="order-card ' + stCls + (o.starred ? " starred" : "") + '" href="#/order/' + o.id + '" draggable="false">' +
        '<div class="oc-head">' +
          '<div class="col">' +
            '<div class="oc-name">' +
              (o.starred ? '<span class="star-mark">' + U.icon("star", 10) + "重点</span>" : "") +
              U.esc(o.owner) + U.statusPill(st, true) + "</div>" +
            '<div class="oc-addr">' + U.icon("pin", 11) + U.esc(o.town + " · " + o.village) + "</div>" +
          "</div>" +
          '<div class="oc-money">' +
            '<div class="oc-quote">¥' + U.n(o.quote) + "</div>" +
            '<div class="oc-sub">' + moneySub + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="oc-tags">' +
          '<span class="pd-tag">' + D.rooms(o) + " 间</span>" +
          '<span class="pd-tag">' + o.mode + "</span>" +
          '<span class="pd-tag">' + D.teamShort(o.teams) + "</span>" +
          o.tags.slice(0, 1).map(function (t) { return '<span class="pd-tag">' + U.esc(t) + "</span>"; }).join("") +
        "</div>" +
        '<div class="oc-foot">' +
          '<div class="bar thin"><i class="' + (prog === 100 ? "green" : prog === 0 ? "orange" : "") + '" style="width:' + prog + '%"></i></div>' +
          '<span class="ft' + (footWarn ? " warn" : "") + '">' + U.esc(foot) + "</span>" +
        "</div>" +
      "</a>"
    );
  }

  /* 卡片包一层滑动容器：左滑露出「标注重点 / 删除」 */
  function wrapCard(o) {
    var starLabel = o.starred ? "取消重点" : "标注重点";
    return (
      '<div class="swipe" data-id="' + o.id + '">' +
        '<div class="swipe-acts">' +
          '<button class="swipe-btn star" data-swipe="star" aria-label="' + starLabel + '">' +
            U.icon("star", 17) + "<span>" + starLabel + "</span></button>" +
          '<button class="swipe-btn del" data-swipe="del" aria-label="删除">' +
            U.icon("trash", 17) + "<span>删除</span></button>" +
        "</div>" +
        '<div class="swipe-inner">' + card(o) + "</div>" +
      "</div>"
    );
  }

  /* 已结清的单：真实卡片互相叠压成一摞（卡片堆卡片），点整摞展开、再点收起。
     明确筛「已结清」时不折叠 —— 那时用户就是要逐张看这堆历史单。 */
  function stackHtml(settled) {
    if (!settled.length) return "";
    var s = D.stats(settled);
    var open = !!state.stackOpen;
    return (
      '<section class="stack" id="settleStack" data-open="' + (open ? 1 : 0) + '" data-settled="1">' +
        '<div class="stack-list" id="stackList" style="--n:' + settled.length + '">' +
          settled.map(function (o, i) {
            return '<div class="stack-item" style="--i:' + i + '">' + wrapCard(o) + "</div>";
          }).join("") +
        "</div>" +
        '<button class="stack-note" type="button" id="stackToggle" aria-expanded="' + (open ? "true" : "false") + '">' +
          '<span class="sn-a">共 ' + settled.length + " 单 · ¥" + U.n(s.paid) + " 已收清 · 点卡片展开</span>" +
          '<span class="sn-b">收起这 ' + settled.length + " 单</span>" +
        "</button>" +
      "</section>"
    );
  }

  /* 叠态高度 = 一张卡 + 3 条露出来的边，所以要先量出卡片真实高度 */
  function measureStack() {
    var list = document.getElementById("stackList");
    if (!list || !list.querySelector) return;
    var first = list.querySelector(".stack-item");
    if (!first || typeof first.getBoundingClientRect !== "function") return;
    var h = Math.round(first.getBoundingClientRect().height);
    if (h > 0 && list.style && list.style.setProperty) list.style.setProperty("--h", h + "px");
  }

  /* 展开／叠回：全程 absolute + top/height 过渡，两个方向都能被打断 */
  function toggleStack() {
    var box = document.getElementById("settleStack");
    if (!box) return;
    var open = box.getAttribute("data-open") === "1";
    var items = [].slice.call(box.querySelectorAll(".stack-item"));
    var reduce = !!(w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches);
    /* 展开按顺序错峰 45ms；收起逆序 35ms（收起比展开快一点） */
    var order = open ? items.slice().reverse() : items;
    var step = open ? 35 : 45;
    order.forEach(function (el, i) {
      el.style.transitionDelay = (reduce ? 0 : i * step) + "ms";
      /* 只在动的这段时间提升为合成层，动画结束撤掉（规格要求别常驻 will-change） */
      el.style.willChange = "transform";
    });
    var settle = reduce ? 0 : (order.length - 1) * step + 720;
    setTimeout(function () {
      items.forEach(function (el) { el.style.willChange = ""; });
      /* 动画走完再放开裁切：最下层的圆角与投影才不会被容器切出直边 */
      box.setAttribute("data-settled", "1");
    }, settle);
    box.setAttribute("data-settled", "0");
    box.setAttribute("data-open", open ? "0" : "1");
    document.getElementById("stackToggle").setAttribute("aria-expanded", open ? "false" : "true");
    state.stackOpen = !open;
  }

  function listHtml() {
    var arr = filtered();
    if (!arr.length) {
      return (
        '<div class="empty"><div class="art">' + U.icon("inbox", 28) + "</div>" +
        "<h4>没有符合条件的单</h4><p>换个筛选条件，或去「记一单」新建一张施工单</p>" +
        '<div class="mt16"><a class="btn ghost sm" href="#/create">记一单</a></div></div>'
      );
    }
    if (state.filter === "settled") return arr.map(wrapCard).join("");

    var live = [], settled = [];
    arr.forEach(function (o) {
      (D.state(o) === "settled" ? settled : live).push(o);
    });
    return live.map(wrapCard).join("") + stackHtml(settled);
  }

  function sumHtml() {
    var arr = filtered();
    var s = D.stats(arr);
    return (
      '<div class="card sum-card">' +
        '<div class="sum-line">' +
          '<span class="lbl">当前筛选 · ' + arr.length + " 单 / " + s.rooms + " 间</span>" +
          '<span class="t-xs b7 mut">达成 ' + U.pct(s.rate) + "</span>" +
        "</div>" +
        '<div class="statline">' +
          '<div class="st"><div class="k">报价合计</div><div class="v">¥' + U.n(s.quote) + "</div></div>" +
          '<div class="st"><div class="k">已收</div><div class="v green-t">¥' + U.n(s.paid) + "</div></div>" +
          '<div class="st"><div class="k">待收</div><div class="v orange-t">¥' + U.n(s.due) + "</div></div>" +
        "</div>" +
        '<div class="bar thin mt12"><i class="green" style="width:' + (s.rate * 100).toFixed(1) + '%"></i></div>' +
      "</div>"
    );
  }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.orders = function () {
    state.filter = "全部";
    state.q = "";

    var bar =
      '<div class="appbar-row">' +
        '<div class="appbar-logo">' + U.icon("receipt", 20) + "</div>" +
        '<div class="col"><div class="appbar-title">订单</div></div>' +
        '<div class="appbar-actions">' +
          '<button class="icon-btn" id="btnSort" aria-label="切换排序">' + U.icon("sliders", 18) + "</button>" +
          (w.PROFILE ? w.PROFILE.html() : '<div class="avatar">王队</div>') +
        "</div>" +
      "</div>";

    var chips =
      '<div class="chiprow" id="filterRow">' +
      FILTERS.map(function (f) {
        return '<button class="chip' + (f.key === state.filter ? " on" : "") + '" data-f="' + f.key + '">' +
          f.label + '<span class="n">' + countOf(f.key) + "</span></button>";
      }).join("") + "</div>";

    var body =
      '<div class="searchbar">' + U.icon("search", 18) +
        '<input id="q" type="text" placeholder="搜业主、村镇或单号…" autocomplete="off">' +
      "</div>" +
      '<div class="mt12">' + chips + "</div>" +
      '<div class="mt12" id="sumWrap">' + sumHtml() + "</div>" +
      '<div class="section-label"><span>工单明细</span><em id="sortHint">按待收金额</em></div>' +
      '<div id="listWrap">' + listHtml() + "</div>";

    function refresh() {
      document.getElementById("sumWrap").innerHTML = sumHtml();
      var lw = document.getElementById("listWrap");
      lw.innerHTML = listHtml();
      measureStack();
    }

    function askDelete(o) {
      var paid = Number(o.paid) || 0;
      /* 有收款记录的单不给删：账目对不上，回收站也补不回已经发生的钱 */
      if (paid > 0) { U.toast("这单已收 ¥" + U.n(paid) + "，有收款记录，不能删除"); return; }
      if (D.state(o) === "settled") { U.toast("已结清的单不能删除，账目要留档"); return; }
      var link = D.findPendingByOrder(o.id);
      var mask = U.sheet(
        "<h3>删除这张单？</h3>" +
        '<div class="sub">' + U.esc(o.id) + " · " + U.esc(o.owner) + " · ¥" + U.n(o.quote) + "</div>" +
        '<div class="rowline"><span class="k">施工位置</span><span class="v">' + U.esc(o.addr) + "</span></div>" +
        (o.scheduledAt
          ? '<div class="rowline"><span class="k">原档期</span><span class="v">' + U.esc(o.scheduledAt) + "（会一并清空）</span></div>"
          : "") +
        (link
          ? '<div class="rowline"><span class="k">待定线索</span><span class="v">' + U.esc(link.id) + "（保留，回到待补信息）</span></div>"
          : "") +
        '<div class="rowline"><span class="k">去向</span><span class="v">进回收站，随时可还原</span></div>' +
        '<div class="btn-row mt14"><button class="btn ghost" id="delNo">取消</button>' +
        '<button class="btn danger" id="delYes">确认删除</button></div>'
      );
      mask.addEventListener("click", function (e) {
        if (e.target.closest("#delNo")) { U.closeSheet(); return; }
        var yes = e.target.closest("#delYes");
        if (!yes || yes.disabled) return;
        yes.disabled = true;
        return D.removeItem("order", o.id).then(function () {
          U.closeSheet();
          refresh();
          U.toast("已删除 · 回收站里可还原");
        }).catch(function (err) {
          yes.disabled = false;
          U.toast(err.message);
        });
      });
    }

    function swipeAct(act, el) {
      var id = el.getAttribute("data-id");
      var o = D.byId(id);
      if (!o) return;
      if (act === "star") {
        var on = !o.starred;
        return D.setStar("order", id, on).then(function () {
          o.starred = on;
          refresh();
          U.toast(on ? "已标注重点 · 置顶显示" : "已取消重点");
        }).catch(function (err) { U.toast(err.message); });
      }
      if (act === "del") return askDelete(o);
    }

    function mount() {
      var lw = document.getElementById("listWrap");
      U.bindSwipe(lw, { onAct: swipeAct });

      /* 已结清那一摞：叠态点卡片 → 展开（不跳详情）；展开态点卡片 → 正常进详情。
         绑在 #screen 上：它在每次 render 时都是新元素，所以不会累积监听器。 */
      var scr = document.getElementById("screen");
      scr.addEventListener("click", function (e) {
        if (!e.target.closest) return;
        var box = e.target.closest("#settleStack");
        if (!box) return;
        if (e.target.closest("#stackToggle")) { toggleStack(); return; }
        if (box.getAttribute("data-open") === "1") return;
        if (e.target.closest(".order-card")) {
          e.preventDefault();
          toggleStack();
        }
      });

      /* 屏幕宽度变，卡片换行后高度会变 → 重新量一次 */
      measureStack();
      if (w.addEventListener) w.addEventListener("resize", measureStack);

      var row = document.getElementById("filterRow");
      row.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        state.filter = b.getAttribute("data-f");
        [].forEach.call(row.children, function (c) { c.classList.toggle("on", c === b); });
        refresh();
      });

      var q = document.getElementById("q");
      q.addEventListener("input", function () {
        state.q = q.value.trim();
        refresh();
      });

      document.getElementById("btnSort").addEventListener("click", function () {
        state.sort = state.sort === "amount" ? "recent" : "amount";
        document.getElementById("sortHint").textContent = state.sort === "amount" ? "按待收金额" : "按最近完工";
        U.toast(state.sort === "amount" ? "已按待收金额排序" : "已按最近完工排序");
        refresh();
      });
    }

    return { bar: bar, body: body, mount: mount, tab: "orders" };
  };
})(window);
