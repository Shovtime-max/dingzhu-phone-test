/* ==========================================================================
   路由 + 应用外壳
   ========================================================================== */
(function (w) {
  "use strict";
  var U = w.UI;

  /* 顺序对应业务动线：先看空档 → 再看线索池 → 登记 → 成单 → 复盘 */
  var TABS = [
    { k: "schedule", t: "档期", ic: "calendarDays", href: "#/schedule" },
    { k: "pending", t: "待定", ic: "clock", href: "#/pending", dot: true },
    { k: "create", t: "", ic: "plus", href: "#/create", fab: true },
    { k: "orders", t: "订单", ic: "receipt", href: "#/orders" },
    { k: "analytics", t: "分析", ic: "chart", href: "#/analytics" }
  ];

  var TITLES = {
    schedule: "档期", create: "记一单", orders: "订单",
    pending: "待定池", analytics: "分析", order: "工单详情", teams: "队伍配置",
    trash: "回收站"
  };

  function parse() {
    var h = (w.location.hash || "").replace(/^#\/?/, "").split("?")[0];
    if (!h) return { name: "schedule", params: {} };
    var parts = h.split("/");
    return { name: parts[0] || "schedule", params: { id: parts[1] || "" } };
  }

  function buildTabbar(active) {
    return TABS.map(function (t) {
      if (t.fab) {
        return '<a class="tab fab' + (t.k === active ? " on" : "") + '" href="' + t.href +
          '" data-tab="' + t.k + '" aria-label="记一单">' + U.icon("plus", 26) + "</a>";
      }
      return '<a class="tab' + (t.k === active ? " on" : "") + '" href="' + t.href + '" data-tab="' + t.k + '">' +
        (t.dot ? '<span class="dot"></span>' : "") +
        U.icon(t.ic, 21) + "<span>" + t.t + "</span></a>";
    }).join("");
  }

  var activeHash = "", positions = {}, departure = null, orderReturn = "#/orders";
  try { var savedReturn = w.sessionStorage.getItem("dingzhu.orderReturn"); if (/^#\/(schedule|orders|pending|analytics)(\?|$)/.test(savedReturn || "")) orderReturn = savedReturn; } catch (e) {}
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    var href = a && a.getAttribute("href"), screen = document.getElementById("screen");
    if (screen && href && href.indexOf("#/") === 0 && href !== activeHash) departure = {hash: activeHash, top: screen.scrollTop};
  }, true);
  function render() {
    w.DATA.refreshToday();
    var hash = w.location.hash || "#/schedule", currentScreen = document.getElementById("screen");
    var leavingOrder = /^#\/order\//.test(activeHash), enteringOrder = /^#\/order\//.test(hash);
    if (activeHash && currentScreen) positions[activeHash] = departure && departure.hash === activeHash ? departure.top : currentScreen.scrollTop;
    departure = null;
    if (enteringOrder && !leavingOrder && activeHash && /^#\/(schedule|orders|pending|analytics)(\?|$)/.test(activeHash)) {
      orderReturn = activeHash;
      try { w.sessionStorage.setItem("dingzhu.orderReturn", orderReturn); } catch (e) {}
    }
    var restore = positions[hash] !== undefined && (leavingOrder || activeHash === hash);
    var restoreTop = restore ? positions[hash] : 0;
    var r = parse();
    r.params.restoreScroll = restore;
    activeHash = hash;
    var view = w.VIEWS[r.name] || w.VIEWS.schedule;
    var out;

    try {
      out = view(r.params);
    } catch (err) {
      if (w.console) console.error(err);
      out = {
        bar: '<div class="appbar-row"><div class="appbar-title">出了点问题</div></div>',
        body: '<div class="empty"><h4>页面渲染失败</h4><p>' + U.esc(err && err.message ? err.message : "") + "</p></div>",
        mount: null, tab: ""
      };
    }

    document.getElementById("appbar").innerHTML = out.bar;

    /* 换一个干净的滚动容器，避免上一页的事件监听累积 */
    var old = document.getElementById("screen");
    var fresh = old.cloneNode(false);
    old.parentNode.replaceChild(fresh, old);
    fresh.innerHTML = out.body;
    fresh.scrollTop = 0;

    document.getElementById("tabbar").innerHTML = buildTabbar(out.tab);
    document.title = "鼎筑 · " + (TITLES[r.name] || "首页");

    if (out.mount) out.mount();
    if (restore) {
      fresh.scrollTop = restoreTop;
      w.requestAnimationFrame(function () { if (document.getElementById("screen") === fresh) fresh.scrollTop = restoreTop; });
    }
  }

  function settingsSheet() {
    var D = w.DATA;
    var n = D.addedCount();
    var mask = U.sheet(
      "<h3>设置</h3>" +
      '<div class="sub">王队 · ' + D.TODAY.label + "</div>" +
      '<a class="set-row" href="#/teams" data-go="1">' +
        '<span class="si">' + U.icon("users", 18) + "</span>" +
        "<div><b>队伍配置</b><span>一队 / 二队的人员组成</span></div>" +
        '<span class="go">' + U.icon("chevronRight", 16) + "</span>" +
      "</a>" +
      '<button class="set-row" id="processRow" type="button" style="width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line-soft);font:inherit">' +
        '<span class="si">' + U.icon("clipboard", 18) + '</span><div><b>工序预设</b><span>维护录单时可多选的常用工序</span></div><span class="go">' + U.icon("chevronRight", 16) + '</span></button>' +
      /* 回收站：待定池 / 订单里左滑删掉的记录都在这 */
      '<a class="set-row" href="#/trash" data-go="1">' +
        '<span class="si">' + U.icon("trash", 18) + "</span>" +
        "<div><b>回收站</b><span>" +
          (D.trashList().length ? D.trashList().length + " 条已删除 · 可还原" : "暂无已删除的记录") +
        "</span></div>" +
        '<span class="go">' + U.icon("chevronRight", 16) + "</span>" +
      "</a>" +
      /* 队伍出发地：顺路判定里「从家出发」的那一端 */
      '<div class="set-row" id="baseRow">' +
        '<span class="si">' + U.icon("home", 18) + "</span>" +
        '<div><b>队伍出发地</b><span id="baseTxt">' +
          U.esc((w.GEO.baseGeo() || {}).full || "未设置") + "</span></div>" +
      "</div>" +
      /* 地理服务：没配 Key 也能用（OSM），点进去可以现场贴高德 Key */
      '<div class="set-row" id="geoRow" role="button" tabindex="0">' +
        '<span class="si">' + U.icon("route", 18) + "</span>" +
        '<div><b>地图与地名搜索</b><span id="geoMode">正在检测…</span></div>' +
        '<span class="go">' + U.icon("chevronRight", 16) + "</span>" +
      "</div>" +
      '<button class="set-row" id="backupRow" type="button" style="width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line-soft);font:inherit">' +
        '<span class="si">' + U.icon("clipboard", 18) + '</span>' +
        '<div><b>备份与恢复</b><span>保存完整备份文件 · 换设备可恢复</span></div>' +
        '<span class="go">' + U.icon("chevronRight", 16) + '</span>' +
      '</button>' +
      /* 录单/排期新增的都存本地，这里给一个回到原始演示数据的出口 */
      '<div class="set-row" id="resetRow" role="button" tabindex="0"' +
        (n ? "" : ' style="opacity:.45"') + ">" +
        '<span class="si">' + U.icon("trash", 18) + "</span>" +
        '<div><b>清空演示改动</b><span id="resetTxt">' +
          (n ? "已有 " + n + " 处新增 / 改动 · 点此恢复原始 18 单 5 线索" : "暂无改动 · 当前就是原始演示数据") +
        "</span></div>" +
      "</div>"
    );
    mask.addEventListener("click", function (e) {
      if (e.target.closest("[data-go]")) { U.closeSheet(); return; }
      if (e.target.closest("#processRow")) { U.closeSheet(); U.processPresetSheet(); return; }
      if (e.target.closest("#geoRow")) { U.closeSheet(); keySheet(); return; }
      if (e.target.closest("#backupRow")) { U.closeSheet(); w.BACKUP.sheet(); return; }
      if (e.target.closest("#resetRow")) {
        if (!w.DATA.addedCount()) { U.toast("当前就是原始演示数据"); return; }
        return w.DATA.resetAdds().then(function () {
          U.closeSheet(); U.toast("已清空改动 · 刷新后回到原始演示数据");
          setTimeout(function () { w.location.reload(); }, 700);
        }).catch(function (err) { U.toast(err.message); });
      }
    });

    w.GEO.health(true).then(function (h) {
      var el = document.getElementById("geoMode");
      if (!el) return;
      if (h.online && h.key) el.innerHTML = '<i class="dot on"></i>高德已接通 · 地名搜索 + 真实车程';
      else if (w.GEO.directKey && w.GEO.directKey()) el.innerHTML = '<i class="dot on"></i>直连高德 · Key 只在这台设备上 · 点此更换';
      else if (h.online) el.innerHTML = '<i class="dot off"></i>未配高德 Key · 当前用 OSM 搜索 · 点此配置';
      else el.innerHTML = '<i class="dot off"></i>未配 Key · 只有本地村镇库 · 点此配置';
    });
  }

  /* 现场贴高德 Key：代理写入并立即生效，前端不留 Key */
  function keySheet() {
    var st = w.GEO.status() || {};
    var hasProxy = !!st.online;
    var saved = "";
    var mask = U.sheet(
      "<h3>配置高德地图 Key</h3>" +
      '<div class="sub">' + (hasProxy
        ? "Key 只写进本机代理，不会出现在前端代码里"
        : "手机直接联网查询高德，无需云代理。Key 保存在本机，使用者可读取；换手机或清除网站数据后需重新填写") + "</div>" +
      '<input class="inline-input" id="inKey" type="password" autocomplete="off" ' +
        'value="' + U.esc(saved) + '" ' +
        'placeholder="粘贴 32 位 Web服务 Key" style="width:100%;margin-top:6px">' +
      '<div class="key-help">' +
        "<b>如何获取 Key（配额与授权以高德为准）</b>" +
        "<span>1. 打开 console.amap.com 注册并完成实名认证</span>" +
        "<span>2. 应用管理 → 新建应用 → 添加 Key</span>" +
        "<span>3. <b class=\"kh-key\">服务平台必须选「Web服务」</b></span>" +
        "<span>4. 复制 Key 贴到上面，保存即生效</span>" +
      '</div>' +
      '<div class="key-warn">' +
        U.icon("alert", 12) +
        "<span>如果它让你填 <b>Bundle ID</b>（iOS）、<b>包名/SHA1</b>（Android）或<b>域名白名单</b>（Web端JS API），" +
        "说明平台选错了，退回上一步改成「Web服务」，这些框会自动消失。</span>" +
        "<span style=\"margin-top:5px\">注意：<b>Key 的平台创建后不能改</b>，选错了只能删掉重建。" +
        "判断方法——到控制台 Key 列表看「服务平台」这一列，必须是「Web服务」。</span>" +
      "</div>" +
      '<button class="btn primary mt14" id="btnSaveKey">保存并测试</button>' +
      '<button class="btn ghost sm mt10" id="btnClearKey" style="width:100%">清除 Key（回到本地村镇库）</button>'
    );

    mask.addEventListener("click", function (e) {
      var save = e.target.closest("#btnSaveKey");
      var clear = e.target.closest("#btnClearKey");
      if (!save && !clear) return;

      var btn = save || clear;
      var old = btn.textContent;
      btn.disabled = true;
      btn.textContent = save ? "正在验证…" : "正在清除…";

      w.GEO.setKey(save ? document.getElementById("inKey").value.trim() : "")
        .then(function (r) {
          btn.disabled = false;
          btn.textContent = old;
          if (!r || !r.ok) {
            U.toast((r && r.hint) || "配置失败");
            return;
          }
          w.GEO.health(true);
          U.closeSheet();
          U.toast(r.key
            ? (r.mode === "direct" ? "已保存 · 直连高德（只在这台设备）" : "高德已接通 · 地名搜索与车程全部切到高德")
            : "已清除 · 回到本地村镇库");
          w.APP.render();
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = old;
          U.toast((err && err.message) || "保存失败，检查 Key 是否正确");
        });
    });
  }

  w.APP = { render: render, TABS: TABS, orderBackHref: function () { return orderReturn; } };

  w.addEventListener("hashchange", render);

  document.addEventListener("DOMContentLoaded", function () {
    if (!w.location.hash) {
      try { w.history.replaceState(null, "", "#/schedule"); } catch (e) { w.location.hash = "#/schedule"; }
    }
    render();
    if (w.DATA.storageError()) U.toast(w.DATA.storageError());

    /* 全局拨号反馈（只挂一次） */
    document.addEventListener("click", function (e) {
      var c = e.target.closest("[data-call]");
      if (!c) return;
      var phone = String(c.getAttribute("data-call") || "").replace(/[^0-9+]/g, "");
      if (!phone) { U.toast("没有联系电话"); return; }
      w.location.href = "tel:" + phone;
    });

    /* 点头像 → 设置抽屉（队伍配置等不常用的入口） */
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".avatar")) return;
      /* 点头像改资料；设置（队伍 / 待办 / 回收站 / 出发地 / 地图）从资料里进 */
      if (w.PROFILE) w.PROFILE.sheet({ onMore: settingsSheet });
      else settingsSheet();
    });

  });
})(window);
