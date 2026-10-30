/* ==========================================================================
   待定池（新增页 · C 阶段补齐）
   定位：还没有进本月档期的线索池 —— 卡点透明、停留天数可量化、动作直接推进
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  var state = {
    list: null,
    resolved: []
  };

  function fresh() {
    /* 重点线索置顶，其余保持原有顺序（sort 在现代浏览器是稳定排序） */
    return D.PENDING.map(function (p) {
      var c = {};
      for (var k in p) c[k] = p[k];
      return c;
    }).sort(function (a, b) {
      if (!!a.starred === !!b.starred) return 0;
      return a.starred ? -1 : 1;
    });
  }

  function daysClass(d) { return d > 3 ? "warn" : d > 1 ? "mid" : ""; }

  function stageClass(p, ord) {
    if (ord && ord.scheduledAt) return "green";
    if (p.orderId) return "brand";
    return p.stage === "待排期" ? "brand" : p.stage === "待量尺" ? "amber" : "line";
  }
  function modeText(p) {
    if (p.mode === "大包" || p.mode === "双包") return "大包";
    if (p.mode === "人工" || p.mode === "清工") return "清工";
    return "口径未定";
  }

  /* 卡片把顾客信息摊开：一行看清是谁、在哪、花多少、卡在哪 */
  function card(p) {
    var stale = p.days > 3;
    var ord = p.orderId ? D.byId(p.orderId) : null;
    var done = !!p.orderId;
    var scheduled = !!(ord && ord.scheduledAt);
    var tel = String(p.phone || "").replace(/\D/g, "");
    var tags = (p.tags || []).filter(Boolean);
    var paid = Number(p.paid) || 0;

    return (
      '<article class="pd-card' + (stale ? " stale" : "") + (p.starred ? " starred" : "") + '" data-id="' + p.id + '">' +
        '<div class="pd-head">' +
          '<div class="col">' +
            '<div class="pd-title">' +
              (p.starred ? '<span class="star-mark">' + U.icon("star", 10) + "重点</span>" : "") +
              U.esc(p.title) + "</div>" +
            '<div class="pd-sub">' + U.esc(p.owner) + " · " + U.esc(p.town + " " + p.village) + "</div>" +
          "</div>" +
          '<span class="pd-days ' + daysClass(p.days) + '">停留 ' + p.days + " 天</span>" +
        "</div>" +

        (p.addr ? '<div class="pd-addr">' + U.icon("pin", 11) + "<span>" + U.esc(p.addr) + "</span></div>" : "") +

        '<div class="pd-meta">' +
          (tel ? '<a class="pd-tel" data-call="' + U.esc(tel) + '">' + U.icon("phone", 10) + U.esc(p.phone) + "</a>" : "") +
          '<i class="pd-sep">·</i>' +
          "<span>" + p.rooms + " 间</span>" +
          '<i class="pd-sep">·</i>' +
          '<span class="pd-stage ' + stageClass(p, ord) + '">' + (scheduled ? "已排期" : p.stage) + "</span>" +
          '<i class="pd-sep">·</i>' +
          "<span>" + U.esc(modeText(p)) + "</span>" +
          '<span class="pd-budget"><small>预算</small>¥' + U.n(p.budget) + "</span>" +
        "</div>" +

        (paid
          ? '<div class="pd-paidline">已收 ¥' + U.n(paid) + " · 待收 ¥" + U.n(Math.max(0, p.budget - paid)) + "</div>"
          : "") +

        '<div class="pd-tags"><button type="button" class="pill line" data-act="teams" data-id="' + U.esc(p.id) + '">' + U.icon("users", 12) + "队伍 · " + U.esc(D.teamNames(ord ? ord.teams : p.teams) || "选择队伍") + '</button></div>' +
        (tags.length
          ? '<div class="pd-tags">' + tags.map(function (t) {
              return '<span class="pd-tag">' + U.esc(t) + "</span>";
            }).join("") + "</div>"
          : "") +

        (!scheduled && p.blocker ? '<p class="pd-note">' + U.esc(p.blocker) + "</p>" : "") +

        '<div class="pd-acts">' +
          (done
            ? (scheduled
                ? '<button class="btn ghost sm" data-act="view" data-id="' + p.id + '">查看已建订单</button>'
                : '<button class="btn primary sm" data-act="go" data-id="' + p.id + '">去排档期</button>')
            : '<button class="btn soft" data-act="fill" data-id="' + p.id + '">补充信息并推排期</button>') +
        "</div>" +
      "</article>"
    );
  }

  /* 卡片包一层滑动容器：左滑露出「标注重点 / 删除」两个操作 */
  function wrapCard(p) {
    var starLabel = p.starred ? "取消重点" : "标注重点";
    return (
      '<div class="swipe" data-id="' + p.id + '">' +
        '<div class="swipe-acts">' +
          '<button class="swipe-btn star" data-swipe="star" aria-label="' + starLabel + '">' +
            U.icon("star", 17) + "<span>" + starLabel + "</span></button>" +
          '<button class="swipe-btn del" data-swipe="del" aria-label="删除">' +
            U.icon("trash", 17) + "<span>删除</span></button>" +
        "</div>" +
        '<div class="swipe-inner">' + card(p) + "</div>" +
      "</div>"
    );
  }

  function listHtml() {
    var arr = state.list || [];
    if (!arr.length) {
      return (
        '<div class="empty"><div class="art">' + U.icon("checkCircle", 30) + "</div>" +
        "<h4>待定池已清空</h4><p>所有线索都推进到下一步，没有悬置项</p></div>"
      );
    }
    return arr.map(wrapCard).join("");
  }

  function totalBudget() {
    return state.list.reduce(function (a, b) { return a + b.budget; }, 0);
  }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.pending = function () {
    state.list = fresh();

    var bar =
      '<div class="appbar-row">' +
        '<div class="appbar-logo">' + U.icon("clock", 20) + "</div>" +
        '<div class="col"><div class="appbar-title">待定池</div></div>' +
        '<div class="appbar-actions">' +
          '<a class="icon-btn" href="#/create" aria-label="新建线索">' + U.icon("plus", 19) + "</a>" +
          (w.PROFILE ? w.PROFILE.html() : '<div class="avatar">王队</div>') +
        "</div>" +
      "</div>";

    /* 待定池只管线索本身：底部那块「口径已定可直接排档期」提示卡已去掉，
       推进路径只有卡片上的「补充信息并推排期」 */
    var body =
      '<div class="mt12" id="pdList">' + listHtml() + "</div>" +
      '<div style="height:8px"></div>';

    function rerender() {
      document.getElementById("pdList").innerHTML = listHtml();

    }

    function find(id) {
      for (var i = 0; i < state.list.length; i++) if (state.list[i].id === id) return state.list[i];
      return null;
    }

    function askDelete(p) {
      var mask = U.sheet(
        "<h3>删除这条线索？</h3>" +
        '<div class="sub">' + U.esc(p.title) + " · " + U.esc(p.addr || (p.town + " " + p.village)) + "</div>" +
        (p.orderId
          ? '<div class="rowline"><span class="k">关联订单</span><span class="v">' + U.esc(p.orderId) + "（保留，不会被删）</span></div>"
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
        return D.removeItem("pending", p.id).then(function () {
          U.closeSheet();
          state.list = fresh();
          rerender();
          U.toast("已删除 · 回收站里可还原");
        }).catch(function (err) {
          yes.disabled = false;
          U.toast(err.message);
        });
      });
    }

    function swipeAct(act, el) {
      var id = el.getAttribute("data-id");
      var p = find(id);
      if (!p) return;
      if (act === "star") {
        var on = !p.starred;
        return D.setStar("pending", id, on).then(function () {
          p.starred = on;
          state.list = fresh();
          rerender();
          U.toast(on ? "已标注重点 · 置顶显示" : "已取消重点");
        }).catch(function (err) { U.toast(err.message); });
      }
      if (act === "del") return askDelete(p);
    }

    function mount() {
      var list = document.getElementById("pdList");
      U.bindSwipe(list, { onAct: swipeAct });

      list.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-act]");
        if (!b) return;
        var p = find(b.getAttribute("data-id"));
        if (p && b.getAttribute("data-act") === "teams") { var linked = p.orderId ? D.byId(p.orderId) : null; U.teamSheet("pending", p.id, linked ? linked.teams : p.teams, function () { w.APP.render(); }); return; }
        if (!p) return;
        if (p.orderId) {
          var ord = D.byId(p.orderId);
          if (ord && !ord.scheduledAt) { w.location.hash = "#/schedule?order=" + ord.id; return; }
          w.location.hash = "#/order/" + p.orderId; return;
        }
        /* 不管你是跑现场看完，还是电话微信聊完，出口都一样：补齐信息 → 推排期 */
        w.location.hash = "#/create?for=" + p.id;
      });
    }

    return { bar: bar, body: body, mount: mount, tab: "pending" };
  };
})(window);
