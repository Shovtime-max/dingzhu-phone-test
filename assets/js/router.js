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

  /* ------------------------------------------------------------------
     导航栈：二级页面（工单详情 / 记一单 / 队伍配置 / 回收站）的返回键
     一律回到真实的上一页，不再硬编码跳订单或分析。
     栈存 sessionStorage —— iPhone 从后台重载后返回依然准确。
     ------------------------------------------------------------------ */
  var navStack = [];
  try {
    var savedStack = JSON.parse(w.sessionStorage.getItem("dingzhu.navStack") || "[]");
    if (Object.prototype.toString.call(savedStack) === "[object Array]") {
      navStack = savedStack.filter(function (h) { return typeof h === "string" && h.indexOf("#/") === 0; }).slice(-30);
    }
  } catch (e) { navStack = []; }

  function saveStack() {
    try { w.sessionStorage.setItem("dingzhu.navStack", JSON.stringify(navStack)); } catch (e) {}
  }

  /* 方向判定：给每条历史记录打一个递增序号，序号变小就是后退。
     不能靠监听 popstate —— 自己触发的 history.back() 是异步的，
     可能在下一次导航之后才到达，把方向判断污染掉（实测踩过）。
     · 点链接改 hash 会新建一条（state 为空）→ 打序号，算前进
     · 弹层 pushState 会复制当前序号，收弹层后退回来时序号不变，不算后退 */
  var navSeq = null;
  function stepDirection() {
    var st = null;
    try { st = w.history.state; } catch (e) {}
    if (st && typeof st.dzSeq === "number") {
      var back = navSeq !== null && st.dzSeq < navSeq;
      navSeq = st.dzSeq;
      return back ? "back" : "forward";
    }
    navSeq = (navSeq === null ? 0 : navSeq) + 1;
    try { w.history.replaceState({ dzSeq: navSeq }, ""); } catch (e) {}
    return "forward";
  }

  function trackNav(prev, next, dir) {
    if (!next) return;
    if (!navStack.length) { navStack.push(next); saveStack(); return; }
    var last = navStack[navStack.length - 1];
    if (last === next) return;
    /* 只有真的后退才弹栈，一步一条，栈始终与浏览器历史同构。
       其余都按「新进入」压栈：重新访问以前来过的页面也压，
       不能按「曾经出现过」截断，否则会把中间页丢掉，返回就跳到上上页。 */
    if (dir === "back" && navStack.length >= 2) { navStack.pop(); saveStack(); return; }
    if (prev && prev !== next && last !== prev) navStack.push(prev);
    navStack.push(next);
    if (navStack.length > 30) navStack.splice(0, navStack.length - 30);
    saveStack();
  }

  /* ------------------------------------------------------------------
     从弹层跳进页面（设置 → 队伍配置 / 回收站）之后，返回要回到「设置」这一层。
     以前只按页面历史退，弹层不在页面栈里，一按返回就越过设置退回上上页。
     现在进页面时把弹层链的可重建标识存下来（sheetReturn），
     返回时先把页面退回去，再照标识把设置（含下面的资料层）原样重新打开。
     ------------------------------------------------------------------ */
  var REBUILD_SHEET = {
    profile: function () { if (w.PROFILE) w.PROFILE.sheet({ onMore: settingsSheet }); },
    settings: function () { settingsSheet(); }
  };
  var sheetReturn = null, pendingSheetKeys = null;

  function saveSheetReturn() {
    try {
      if (sheetReturn) w.sessionStorage.setItem("dingzhu.sheetReturn", JSON.stringify(sheetReturn));
      else w.sessionStorage.removeItem("dingzhu.sheetReturn");
    } catch (e) {}
  }
  try {
    var savedSheetReturn = JSON.parse(w.sessionStorage.getItem("dingzhu.sheetReturn") || "null");
    if (savedSheetReturn && typeof savedSheetReturn.page === "string" &&
        savedSheetReturn.page.indexOf("#/") === 0 &&
        Object.prototype.toString.call(savedSheetReturn.keys) === "[object Array]" &&
        savedSheetReturn.keys.length) sheetReturn = savedSheetReturn;
  } catch (e) {}

  /* 上一页：栈顶往下找第一个不同于当前页的地址 */
  function backHref(fallback) {
    for (var i = navStack.length - 2; i >= 0; i--) {
      var h = navStack[i];
      if (h && h !== activeHash) return h;
    }
    return fallback || "#/schedule";
  }

  /* 返回：栈顶就是当前页、且栈里的上一页能对上浏览器历史的上一页，
     才走原生回退（不堆历史）；对不上就直接改地址，宁可多一条历史也不退错页 */
  function goBack(fallback) {
    var target = backHref(fallback);
    if (!target || target === activeHash) return false;
    /* 这一页是「从设置里跳进来」的：先把弹层链记下来，渲染完再重新打开 */
    if (sheetReturn && sheetReturn.page === activeHash && sheetReturn.keys.length) {
      pendingSheetKeys = sheetReturn.keys.slice();
      sheetReturn = null; saveSheetReturn();
    }
    var n = navStack.length;
    var inSync = n >= 1 && navStack[n - 1] === activeHash;
    var prev = n >= 2 ? navStack[n - 2] : "";
    if (inSync && prev === target) { w.history.back(); return true; }
    w.location.hash = target;
    return true;
  }

  /* 所有带 data-back 的返回键走统一逻辑 */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-back]");
    if (!b) return;
    e.preventDefault();
    var fallback = b.getAttribute("data-back") || b.getAttribute("href") || "";
    goBack(fallback);
  });

  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    var href = a && a.getAttribute("href"), screen = document.getElementById("screen");
    if (screen && href && href.indexOf("#/") === 0 && href !== activeHash) departure = {hash: activeHash, top: screen.scrollTop};
  }, true);
  function render() {
    w.DATA.refreshToday();
    var hash = w.location.hash || "#/schedule", currentScreen = document.getElementById("screen");
    if (/^#\/create(?:\?|$)/.test(activeHash) && !/^#\/create(?:\?|$)/.test(hash)) w.APP.createSlot = null;
    var leavingOrder = /^#\/order\//.test(activeHash), enteringOrder = /^#\/order\//.test(hash);
    if (activeHash && currentScreen) positions[activeHash] = departure && departure.hash === activeHash ? departure.top : currentScreen.scrollTop;
    departure = null;
    if (hash !== activeHash) { if (U.dropSheet) U.dropSheet(); else if (U.closeSheet) U.closeSheet(); }
    /* 这次切换是前进还是后退（hash 没变时不参与方向判断） */
    var dir = hash !== activeHash ? stepDirection() : "forward";
    /* 系统返回 / 侧滑返回同样要回到设置那一层：方向和地址都对上就认 */
    if (sheetReturn && hash !== activeHash) {
      if (dir === "back" && sheetReturn.page === activeHash && sheetReturn.backTo === hash) {
        if (!pendingSheetKeys) pendingSheetKeys = sheetReturn.keys.slice();
        sheetReturn = null; saveSheetReturn();
      } else if (hash !== sheetReturn.page) {
        sheetReturn = null; saveSheetReturn();
      }
    }
    trackNav(activeHash, hash, dir);
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
    /* 从队伍配置 / 回收站返回：把设置（以及下面的资料层）重新打开 */
    if (pendingSheetKeys && pendingSheetKeys.length) {
      var keys = pendingSheetKeys;
      pendingSheetKeys = null;
      keys.forEach(function (k) {
        var fn = REBUILD_SHEET[k];
        if (!fn) return;
        try { fn(); } catch (err) { if (w.console) console.error(err); }
      });
    }
  }

  function settingsSheet() {
    var D = w.DATA;
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
      '<div class="set-row" id="baseRow" role="button" tabindex="0">' +
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
      '<button type="button" class="btn ghost mt14" data-sheet-back>返回</button>',
      "settings"   /* 可重建标识：跳进队伍配置 / 回收站后，返回回到设置这一层 */
    );
    mask.addEventListener("click", function (e) {
      /* 页面型选项：收弹层 + 复用这条历史改成目标地址。
         同时记住「这一页是从设置里进来的」，
         返回时按标识把设置重新打开，回到上一层的设置，而不是跳回上上页 */
      var go = e.target.closest("[data-go]");
      if (go) {
        e.preventDefault();
        var href = go.getAttribute("href"), from = activeHash, keys = null;
        if (U.navigateFromSheet && U.navigateFromSheet(href)) {
          keys = U.takeSheetKeys ? U.takeSheetKeys() : null;
        } else w.location.hash = href;
        render();
        if (keys && keys.length) {
          sheetReturn = { page: w.location.hash, backTo: from, keys: keys };
          saveSheetReturn();
        }
        return;
      }
      if (e.target.closest("#processRow")) { U.processPresetSheet(); return; }
      if (e.target.closest("#geoRow")) { keySheet(); return; }
      if (e.target.closest("#backupRow")) { w.BACKUP.sheet(); return; }
      if (e.target.closest("#baseRow")) { baseSheet(); return; }
    });
    mask.addEventListener("keydown", function (e) { if (e.target.closest("#baseRow") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); baseSheet(); } });

    w.GEO.health(true).then(function (h) {
      var el = document.getElementById("geoMode");
      if (!el) return;
      if (h.online && h.key) el.innerHTML = '<i class="dot on"></i>高德已接通 · 地名搜索 + 真实车程';
      else if (w.GEO.directKey && w.GEO.directKey()) el.innerHTML = '<i class="dot on"></i>直连高德 · Key 只在这台设备上 · 点此更换';
      else if (h.online) el.innerHTML = '<i class="dot off"></i>未配高德 Key · 当前用 OSM 搜索 · 点此配置';
      else el.innerHTML = '<i class="dot off"></i>未配 Key · 只有本地村镇库 · 点此配置';
    });
  }

  function baseSheet() {
    var GEO = w.GEO, selected = null, items = [], seq = 0, timer;
    var mask = U.sheet('<h3>队伍出发地</h3><div class="sub">搜索并选择地图结果，保存后用于天气和出发车程估算。</div>' +
      '<label class="field" for="baseSearch">搜索地点</label><input class="field-box" id="baseSearch" type="search" placeholder="输入村镇、地址或地点名称">' +
      '<button type="button" class="btn ghost mt10" id="baseSearchGo">搜索地图</button><div id="baseResults" class="mt12" role="status" aria-live="polite"></div>' +
      '<div class="sub mt12" id="baseSelected">当前：' + U.esc((GEO.baseGeo() || {}).full || (GEO.baseGeo() || {}).name || "未设置") + '</div><button type="button" class="btn primary mt14" id="baseSave" disabled>保存出发地</button>' +
      '<button type="button" class="btn ghost mt10" data-sheet-back>返回</button>');
    var input = document.getElementById("baseSearch"), results = document.getElementById("baseResults"), save = document.getElementById("baseSave");
    function search() {
      var q = input.value.trim(), mine = ++seq; selected = null; save.disabled = true;
      if (!q) { results.textContent = "请输入地点名称"; return Promise.resolve(); }
      results.textContent = "正在搜索地图…";
      return GEO.searchPoi(q).then(function (r) {
        if (mine !== seq || document.getElementById("baseSearch") !== input) return;
        items = (r.items || []).filter(function (it) { return Number.isFinite(it.lat) && Number.isFinite(it.lng); });
        results.innerHTML = items.length ? items.map(function (it, i) {
          return '<button type="button" class="gs-i" data-base="' + i + '"><span class="gs-main"><span class="gs-n">' + U.esc(it.name) + '</span><span class="gs-sub">' + U.esc(it.addr || it.full || "") + '</span></span></button>';
        }).join("") : '<div class="sub">没有找到地点，请补充城市或村镇名称后重试。</div>';
      }).catch(function (err) { if (mine === seq && document.getElementById("baseSearch") === input) results.textContent = err.message || "搜索失败，请检查地图配置和网络"; });
    }
    input.addEventListener("input", function () { seq++; selected = null; save.disabled = true; clearTimeout(timer); timer = setTimeout(search, 320); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); search(); } });
    document.getElementById("baseSearchGo").addEventListener("click", function () { clearTimeout(timer); return search(); });
    results.addEventListener("click", function (e) {
      var b = e.target.closest("[data-base]"); if (!b) return;
      selected = items[Number(b.getAttribute("data-base"))]; if (!selected) return;
      document.getElementById("baseSelected").textContent = "已选择：" + selected.name + " · " + (selected.addr || ""); save.disabled = false;
    });
    save.addEventListener("click", function () {
      if (save.disabled || !selected) return; save.disabled = true;
      return w.DATA.saveBase(selected).then(function (base) {
        GEO.setNear(base.lat, base.lng); U.closeSheet(); U.toast("队伍出发地已保存"); w.APP.render();
      }).catch(function (err) { save.disabled = false; U.toast(err.message); });
    });
    return mask;
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
      '<button class="btn ghost sm mt10" id="btnClearKey" style="width:100%">清除 Key（回到本地村镇库）</button>' +
      '<button class="btn ghost mt10" data-sheet-back>返回</button>'
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

  w.APP = { render: render, TABS: TABS, backHref: backHref, goBack: goBack,
    orderBackHref: function () { return backHref(orderReturn); }, openOrder: function (id) {
    var screen = document.getElementById("screen");
    if (screen) departure = {hash: activeHash, top: screen.scrollTop};
    w.location.hash = "#/order/" + encodeURIComponent(id);
  } };

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
