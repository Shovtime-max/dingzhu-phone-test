/* ==========================================================================
   分析看板（复刻 waymo_1，全部指标由 data.js 实时计算）
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  /* 主卡：一个主角数字 + 一个环形达成率 + 三列金额（v2） */
  function heroCard(s, scope) {
    var pct = Math.max(0, Math.min(1, s.rate || 0));
    return (
      '<section class="card hero">' +
        '<div class="hero-top">' +
          "<div>" +
            '<div class="hero-label">' + scope + "已收进账</div>" +
            '<div class="hero-num"><small>¥</small>' + U.n(s.paid) + "</div>" +
          "</div>" +
          '<div class="ring" style="--p:' + (pct * 100).toFixed(1) + '">' +
            "<b>" + U.pct(s.rate, 0) + "</b></div>" +
        "</div>" +
        '<div class="hero-split">' +
          "<div><em>总报价</em><b>¥" + U.n(s.quote) + "</b></div>" +
          '<div><em>已收</em><b class="g">¥' + U.n(s.paid) + "</b></div>" +
          '<div><em>待收</em><b class="o">¥' + U.n(s.due) + "</b></div>" +
        "</div>" +
        '<div class="hero-foot">' +
          "<span>" + s.count + " 单 · 完工率 " + U.pct(s.doneRate, 0) + "</span>" +
          '<span class="hf-due">' + s.dueCount + " 家待催</span>" +
          '<button class="hero-link" id="btnCollect" type="button">' + U.icon("phone", 12) + "催单表</button>" +
        "</div>" +
      "</section>"
    );
  }

  /* 班组施工效能对比：每队一条横向色条同场对垒
     队数不写死 —— DATA.TEAMS 里加几条就出几行，3 队以上照样按条长比 */
  function teamCard(s, scope) {
    var rows = (D.TEAMS || []).map(function (t) {
      var x = s.teams[t.id] || { rooms: 0, count: 0 };
      return {
        id: t.id, name: t.name || t.id, alias: t.alias || "",
        color: t.color || "#0066FF",
        rooms: x.rooms || 0, count: x.count || 0
      };
    }).sort(function (a, b) { return b.rooms - a.rooms || b.count - a.count; });

    var total = rows.reduce(function (a, r) { return a + r.rooms; }, 0);
    var max = Math.max.apply(null, rows.map(function (r) { return r.rooms; }).concat([0])) || 1;

    var list = rows.map(function (r) {
      var pct = r.rooms ? Math.max(5, Math.round((r.rooms / max) * 100)) : 0;
      return (
        '<div class="tr-row' + (r.rooms > 0 && r.rooms === max ? " lead" : "") + '" style="--tc:' + U.esc(r.color) + '">' +
          '<div class="tr-top">' +
            '<i class="tr-dot" aria-hidden="true"></i>' +
            '<span class="tr-name">' + U.esc(r.name) + "</span>" +
            (r.alias ? '<span class="tr-alias">' + U.esc(r.alias) + "</span>" : "") +
            '<span class="tr-sum"><b>' + r.rooms + "</b> 间 · " + r.count + " 单</span>" +
          "</div>" +
          '<div class="tr-track"><i style="width:' + pct + '%"></i></div>' +
        "</div>"
      );
    }).join("");

    return (
      '<section class="card mt14">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("users", 16) + "</span>班组施工效能对比</div>" +
          '<span class="card-meta">' + scope + " " + total + " 间</span>" +
        "</div>" + list +
      "</section>"
    );
  }

  /* 分口径均价：只留两个口径（包工包料 / 纯人工） */
  function avgCards(s) {
    return (
      '<div class="section-label"><span>分口径均价（按间核算）</span><em>包工包料 vs 纯人工</em></div>' +
      '<div class="avg-grid">' +
        '<div class="avg"><div><div class="ak">包工包料均价</div><div class="av brand-t">¥' + U.n(s.avgBag) + '<small>/间</small></div></div>' +
          '<span class="af green">含彩钢与配件</span></div>' +
        '<div class="avg"><div><div class="ak">只人工纯工费</div><div class="av">¥' + U.n(s.avgLabor) + '<small>/间</small></div></div>' +
          '<span class="af">业主自备瓦料</span></div>' +
      "</div>"
    );
  }

  function townRank(list) {
    var all = D.townRank(list);
    var arr = all.slice(0, 4);
    var max = arr.length ? arr[0].count : 1;
    var rows = arr.map(function (t, i) {
      var w = (t.count / max) * 100;
      var cls = i === 0 ? "top" : "";
      return (
        '<div class="rank-item">' +
          '<div class="rank-h">' +
            '<div class="fx aic g8"><span class="rank-n ' + cls + '">' + (i + 1) + "</span>" +
            '<span class="b8">' + U.esc(t.town) + "</span></div>" +
            '<span class="rank-v"><b>' + t.count + " 单</b>" +
              '<span>' + t.rooms + " 间 · ¥" + U.n(t.money) + "</span></span>" +
          "</div>" +
          '<div class="bar thin"><i style="width:' + w + '%;opacity:' + (1 - i * 0.18) + '"></i></div>' +
        "</div>"
      );
    }).join("");

    return (
      '<section class="card mt14">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("flame", 16) + "</span>热门乡镇施工榜</div>" +
          '<span class="card-meta">覆盖 ' + all.length + " 个乡镇</span>" +
        "</div>" + rows +
      "</section>"
    );
  }

  function collectSheet() {
    var dues = D.dueOrders();
    var rows = dues.map(function (o) {
      var od = D.overdueDays(o);
      return (
        '<div class="fx aic jb" style="padding:11px 12px;border-radius:14px;background:var(--line-soft);margin-bottom:8px">' +
          "<div><div class=\"t-sm b8\">" + U.esc(o.town) + " · " + U.esc(o.owner) + "</div>" +
          '<div class="t-xs ' + (od > 15 ? "orange-t" : "mut") + ' b7 mt2">超 ' + od + " 天 · 欠 ¥" + U.n(D.due(o)) + "</div></div>" +
          '<button class="btn xs" data-call="' + U.esc(o.phone) + '" style="background:var(--brand);color:#fff">' + U.icon("phone", 11) + "催收</button>" +
        "</div>"
      );
    }).join("");

    return (
      "<h3>催收总名单（" + dues.length + " 家）</h3>" +
      '<div class="sub">待回款合计 ¥' + U.n(D.stats().due) + " · 建议午间电话联系</div>" +
      '<div style="max-height:46vh;overflow-y:auto">' + rows + "</div>" +
      '<button class="btn primary mt12" id="btnCopySms">一键复制全员提醒短信</button>'
    );
  }

  w.VIEWS = w.VIEWS || {};
  /* ---------- 统计区间：默认本月，可跨月 ---------- */
  var RANGE_KEY = "dingzhu.analytics.v1";

  function curKey() { return D.TODAY.y + "-" + ("0" + D.TODAY.m).slice(-2); }

  function readRange() {
    var list = D.monthChoices();
    var keys = list.map(function (m) { return m.key; });
    var out = { from: curKey(), to: curKey() };
    var raw = null;
    try { raw = w.localStorage.getItem(RANGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var o = JSON.parse(raw);
        if (o && keys.indexOf(o.from) >= 0 && keys.indexOf(o.to) >= 0) {
          out.from = o.from; out.to = o.to;
        }
      } catch (e) {}
    }
    if (out.from > out.to) { var t = out.from; out.from = out.to; out.to = t; }
    return out;
  }
  function writeRange(r) {
    try { w.localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch (e) {}
  }
  function monthOf(key) {
    var list = D.monthChoices();
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return { key: key, y: 0, m: 0, label: key };
  }
  function rangeLabel(r) {
    var a = monthOf(r.from), b = monthOf(r.to);
    if (r.from === r.to) return a.label;
    if (a.y === b.y) return a.y + "年 " + a.m + "–" + b.m + "月";
    return a.label + " – " + b.label;
  }
  /* 口径文案：本月 / 指定月 / 区间 —— 选 9 月时说“本月已收”会误导 */
  function rangeScope(r) {
    if (r.from !== r.to) return "区间";
    return r.from === curKey() ? "本月" : monthOf(r.from).m + " 月";
  }

  /* 分月对比：区间跨月时才出，直接看每月各干了多少 */
  function monthBreakdown(r) {
    var months = D.monthChoices()
      .filter(function (m) { return m.key >= r.from && m.key <= r.to; })
      .sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    if (months.length < 2) return "";
    var rows = months.map(function (m) {
      var s = D.stats(D.ordersInRange(m.key, m.key));
      var w = Math.round((s.rate || 0) * 100);
      return (
        '<div class="mr-row">' +
          '<div class="mr-top"><b>' + m.m + " 月</b>" +
            '<span class="mut3">' + s.count + " 单 · " + s.rooms + " 间</span>" +
            '<em class="brand-t">' + U.pct(s.rate, 0) + "</em></div>" +
          '<div class="mr-bar"><i style="width:' + w + '%"></i></div>' +
          '<div class="mr-nums"><span>报价 ¥' + U.n(s.quote) + "</span>" +
            '<span class="g">已收 ¥' + U.n(s.paid) + "</span>" +
            '<span class="o">待收 ¥' + U.n(s.due) + "</span></div>" +
        "</div>"
      );
    }).join("");
    return (
      '<section class="card mt14">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("layers", 16) + "</span>分月对比</div>" +
          '<span class="card-meta">' + months.length + " 个月</span>" +
        "</div>" + rows +
      "</section>"
    );
  }

  function rangeSheet(cur, done) {
    var months = D.monthChoices();
    var quick = [
      { k: "m", t: "本月" },
      { k: "q3", t: "近 3 个月" },
      { k: "all", t: "全部" }
    ].map(function (q) {
      return '<button class="rg-q" type="button" data-q="' + q.k + '">' + q.t + "</button>";
    }).join("");
    var opts = function (sel) {
      return months.map(function (m) {
        return '<option value="' + m.key + '"' + (m.key === sel ? " selected" : "") + ">" + m.label + "</option>";
      }).join("");
    };
    var mask = U.sheet(
      "<h3>统计区间</h3>" +
      '<div class="sub">选起止月份，跨月的数据会合并统计</div>' +
      '<div class="rg-quick">' + quick + "</div>" +
      '<div class="rg-pick">' +
        '<label class="rg-f"><span>起始</span><select class="field-box" id="rgFrom">' + opts(cur.from) + "</select></label>" +
        '<label class="rg-f"><span>结束</span><select class="field-box" id="rgTo">' + opts(cur.to) + "</select></label>" +
      "</div>" +
      '<button class="btn primary mt14" id="rgApply">应用</button>'
    );

    function apply(r) {
      writeRange(r);
      U.closeSheet();
      if (done) done(r);
      if (w.APP && w.APP.render) w.APP.render();
    }

    mask.addEventListener("click", function (e) {
      var q = e.target.closest("[data-q]");
      if (q) {
        var k = q.getAttribute("data-q");
        var all = months.map(function (m) { return m.key; }).sort();
        if (k === "m") return apply({ from: curKey(), to: curKey() });
        if (k === "q3") return apply({ from: all.slice(-3)[0] || curKey(), to: curKey() });
        return apply({ from: all[0], to: all[all.length - 1] });
      }
      if (e.target.closest("#rgApply")) {
        var f = document.getElementById("rgFrom").value;
        var t = document.getElementById("rgTo").value;
        if (f > t) { var tmp = f; f = t; t = tmp; }
        apply({ from: f, to: t });
      }
    });
  }

  w.VIEWS.analytics = function () {
    var range = readRange();
    var list = D.ordersInRange(range.from, range.to);
    var s = D.stats(list);
    var scope = rangeScope(range);

    var bar =
      '<div class="appbar-row">' +
        '<div class="appbar-logo">' + U.icon("chart", 20) + "</div>" +
        '<div class="col"><div class="appbar-title">分析</div>' +
        '<div class="appbar-sub">经营效能与营收核算</div></div>' +
        '<div class="appbar-actions">' +
          (w.PROFILE ? w.PROFILE.html() : '<div class="avatar">王队</div>') +
        "</div>" +
      "</div>";

    var body =
      '<div class="an-page">' +
      '<div class="toolrow">' +
        '<div class="left"><button class="month-pill" id="btnRange">' + U.icon("calendar", 16) +
          rangeLabel(range) + U.icon("chevronDown", 15) + "</button></div>" +
        '<span class="live-pill"><i></i>' + (range.from === range.to
          ? (range.from === curKey() ? "已核对至今日" : "历史月份 · " + list.length + " 单")
          : list.length + " 单在区间内") + "</span>" +
      "</div>" +
      heroCard(s, scope) +
      teamCard(s, scope) +
      monthBreakdown(range) +
      avgCards(s) +
      townRank(list) +
      "</div>";

    function mount() {
      var rbtn = document.getElementById("btnRange");
      if (rbtn) rbtn.addEventListener("click", function () { rangeSheet(readRange()); });

      var btn = document.getElementById("btnCollect");
      if (btn) btn.addEventListener("click", function () {
        var m = U.sheet(collectSheet());
        m.addEventListener("click", function (e) {
          if (e.target.closest("[data-call]")) return;
          if (e.target.id === "btnCopySms") {
            var dues = D.dueOrders();
            if (!dues.length) { U.toast("暂无待催订单"); return; }
            var messages = dues.map(function (o) {
              return (o.owner || "您好") + "，您好，" + (o.addr || "施工订单") + "尚有尾款 ¥" + U.n(D.due(o)) + "，麻烦您方便时核对并安排，谢谢。";
            }).join("\n\n");
            if (!w.navigator.clipboard || !w.navigator.clipboard.writeText) { U.toast("当前设备无法自动复制，请手动联系业主"); return; }
            w.navigator.clipboard.writeText(messages).then(function () {
              U.toast("已复制 " + dues.length + " 条催款内容，请自行发送"); U.closeSheet();
            }).catch(function () { U.toast("复制失败，请手动联系业主"); });
          }
        });
      });

    }

    return { bar: bar, body: body, mount: mount, tab: "analytics" };
  };
})(window);
