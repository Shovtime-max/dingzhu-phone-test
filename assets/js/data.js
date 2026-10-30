/* ==========================================================================
   鼎筑 — 模拟数据层
   口径说明：
   · 单位「间」= 主房 + 偏房
   · 模式「大包」= 包工包料（含彩钢/脊瓦/防水件）；「人工」= 纯工费
   · 本月 18 单 / 78 间 / 报价合计 58,600 / 已收 46,200 / 待收 12,400
     （达成率 78.8% 与完工率 83% 均由本数据实时计算，不接受手改）
   ========================================================================== */
(function (w) {
  "use strict";

  /* ---------- 队伍配置（一次设好，长期使用） ---------- */
  var TEAMS = [
    {
      id: "t1", name: "一队", alias: "老高班", leader: "高建国", color: "#0066FF",
      members: [
        { name: "高建国", phone: "13700000011", role: "队长" },
        { name: "高建军", phone: "13700000012", role: "大工" },
        { name: "王德水", phone: "13700000013", role: "大工" },
        { name: "李老四", phone: "13700000014", role: "小工" }
      ]
    },
    {
      id: "t2", name: "二队", alias: "小鲁班", leader: "鲁志强", color: "#7C5CFF",
      members: [
        { name: "鲁志强", phone: "13700000021", role: "队长" },
        { name: "鲁志刚", phone: "13700000022", role: "大工" },
        { name: "孙德福", phone: "13700000023", role: "小工" }
      ]
    }
  ];

  /* 内置两支队伍留一份基线：本地改过名/删过队后，每次载入先复位再叠改动，
     这样「清空演示改动」能真的回到出厂状态 */
  var BASE_TEAMS = JSON.parse(JSON.stringify(TEAMS));

  /* 新队伍可选的队色（班组对垒条与队徽都用它） */
  var TEAM_COLORS = ["#0066FF", "#7C5CFF", "#00A06A", "#D97A06", "#0EA5B7", "#D4372F"];

  function teamById(id) {
    for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].id === id) return TEAMS[i];
    return null;
  }
  /* 排程条目上的短标："一队" / "二队" / "两队" */
  function teamShort(ids) {
    if (!ids || !ids.length) return "未分配";
    if (ids.length === 1) {
      var t = teamById(ids[0]);
      return t ? t.name : "未分配";
    }
    return ids.length === 2 ? "两队" : ids.length + " 队";
  }
  /* 详情页里的全称："一队·二队" */
  function teamNames(ids) {
    if (!ids || !ids.length) return "未分配";
    var out = [];
    ids.forEach(function (id) { var t = teamById(id); if (t) out.push(t.name); });
    return out.length ? out.join(" · ") : "未分配";
  }

  /* ---------- 队伍出发地（每天早上从这里出发） ----------
     高德定位结果：山东省潍坊市诸城市密州街道大高疃村
     注意：当地人习惯叫「林家村镇大高疃村」，高德数据归在密州街道（区划调整过），
     坐标按村名精确匹配取，比按镇名去查更准。
  */
  var BASE = {
    name: "大高疃村",
    full: "山东省潍坊市诸城市密州街道大高疃村",
    lat: 35.9807,
    lng: 119.5633,
    note: "队伍每天早上从这里出发"
  };

  /* 状态全部由人工动作时间戳推导，不看日期 */
  function state(o) {
    /* 结清是独立动作，必须人工确认；「收满款」不能自动等同于结清 */
    if (o.settledAt || o.settledOn) return "settled";
    if (o.doneAt) return "done";
    if (o.startedAt) return "doing";
    if (o.scheduledAt) return "planned";
    return "pending";
  }

  /* ---------- 今天：跟系统日期走，别写死 ----------
     原型早期把基准日钉在 2026-10-23，跨天打开就出现「今天」在三天前。
     现在只保留一处定义，档期表头 / 空档选项 / 欠款账龄全部读它。
  */
  var NOW = new Date();
  function p2(n) { return n < 10 ? "0" + n : "" + n; }
  var TODAY = {
    y: NOW.getFullYear(),
    m: NOW.getMonth() + 1,
    d: NOW.getDate()
  };
  TODAY.key = TODAY.y + "-" + p2(TODAY.m);
  TODAY.md = p2(TODAY.m) + "-" + p2(TODAY.d);
  TODAY.iso = TODAY.y + "-" + TODAY.md;
  TODAY.label = TODAY.y + "年 " + TODAY.m + "月";
  function refreshToday() {
    var now = new Date();
    TODAY.y = now.getFullYear(); TODAY.m = now.getMonth() + 1; TODAY.d = now.getDate();
    TODAY.key = TODAY.y + "-" + p2(TODAY.m); TODAY.md = p2(TODAY.m) + "-" + p2(TODAY.d);
    TODAY.iso = TODAY.y + "-" + TODAY.md; TODAY.label = TODAY.y + "年 " + TODAY.m + "月";
    if (typeof MONTHS !== "undefined" && MONTHS) {
      [-1, 0, 1].forEach(function (offset) {
        var p = ymShift(TODAY.y, TODAY.m + offset), key = mkey(p[0], p[1]);
        if (!MONTHS[key]) MONTHS[key] = {y:p[0], m:p[1], label:p[0] + "年 " + p[1] + "月", days:buildMonth(p[0], p[1], null)};
      });
    }
  }
  function isTodayDay(y, m, d) { return y === TODAY.y && m === TODAY.m && d === TODAY.d; }

  var ORDERS = [
    /* ---------- 一队 · 老高班 · 10 单 42 间 ---------- */
    {
      id: "DW20261026-01", owner: "孙老汉", title: "孙老汉",
      town: "富官庄镇", village: "孙家沟村", addr: "村东头 3 排 12 号",
      phone: "13800000001", main: 3, wing: 1, mode: "大包",
      quote: 3600, paid: 0, status: "已完工", teams: ["t1"],
      start: "10-02", startedAt: "10-02 08:30", scheduledAt: "10-02 上午", done: "10-04", doneAt: "10-04 17:00", tags: ["换瓦", "脊瓦加固"],
      note: "4 间大包 · 完工于 10-04 · 约 3 日结尾款",
      flows: [{ date: "10-04", type: "现金", amount: 0, text: "约定三日结尾款" }]
    },
    {
      id: "DW20261026-02", owner: "赵家养殖场", title: "赵家养殖场",
      town: "许孟镇", village: "赵家洼村", addr: "养殖区北排 4 栋",
      phone: "13800000002", main: 6, wing: 2, mode: "大包",
      quote: 12000, paid: 6800, status: "已完工", teams: ["t1"],
      start: "10-03", startedAt: "10-03 08:30", scheduledAt: "10-03 上午", done: "10-07", doneAt: "10-07 17:00", tags: ["换瓦", "防水卷材", "大跨度"],
      note: "8 间全包 · 完工于 10-07 · 余款未结清",
      flows: [{ date: "10-07", type: "微信", amount: 6800, text: "完工当日微信转账" }]
    },
    {
      id: "DW20261026-03", owner: "李德生", title: "李德生",
      town: "棋山镇", village: "棋山南村", addr: "南村 2 巷 7 号",
      phone: "13800000003", main: 3, wing: 0, mode: "人工",
      quote: 1800, paid: 0, status: "已完工", teams: ["t1"],
      start: "10-09", startedAt: "10-09 08:30", scheduledAt: "10-09 上午", done: "10-11", doneAt: "10-11 17:00", tags: ["纯换瓦"],
      note: "3 间纯换瓦 · 等麦收补贴款到账",
      flows: [{ date: "10-11", type: "口头", amount: 0, text: "业主承诺补贴到账即结" }]
    },
    {
      id: "DW20261026-04", owner: "王秀兰", title: "王秀兰",
      town: "龙山镇", village: "龙山东村", addr: "东村 5 排 3 号",
      phone: "13800000004", main: 3, wing: 0, mode: "大包",
      quote: 2400, paid: 1200, status: "已完工", teams: ["t1"],
      start: "10-07", startedAt: "10-07 08:30", scheduledAt: "10-07 上午", done: "10-09", doneAt: "10-09 17:00", tags: ["换瓦", "脊瓦加固"],
      note: "3 间大包 · 完工于 10-09 · 尾款待结",
      flows: [{ date: "10-07", type: "微信", amount: 1200, text: "开工前微信定金" }]
    },
    {
      id: "DW20261026-05", owner: "赵家老板", title: "赵家老板",
      town: "许孟镇", village: "赵家洼村", addr: "赵家洼东区 2 号",
      phone: "13800000005", main: 5, wing: 0, mode: "大包",
      quote: 3400, paid: 3400, status: "施工中", teams: ["t1"],
      start: "10-21", startedAt: "10-21 08:30", scheduledAt: "10-21 上午", done: "", doneAt: null, tags: ["换瓦", "红瓦换新"],
      note: "5 间大包 · 已预付全款 · 10-21 上房施工",
      flows: [{ date: "10-20", type: "微信", amount: 3400, text: "预付全款自动核销" }]
    },
    {
      id: "DW20261026-06", owner: "刘振海", title: "刘振海",
      town: "富官庄镇", village: "前吉庄村", addr: "前吉庄 1 巷 18 号",
      phone: "13800000006", main: 6, wing: 0, mode: "大包",
      quote: 4800, paid: 4800, status: "已结清", teams: ["t1"],
      start: "09-28", startedAt: "09-28 08:30", scheduledAt: "09-28 上午", done: "10-02", doneAt: "10-02 17:00", tags: ["换瓦", "脊瓦加固", "天沟"],
      note: "6 间大包 · 已结清",
      flows: [{ date: "10-02", type: "银行", amount: 4800, text: "完工当日转账结清" }]
    },
    {
      id: "DW20261026-07", owner: "孙德胜", title: "孙德胜",
      town: "棋山镇", village: "西河村", addr: "西河村 4 排 9 号",
      phone: "13800000007", main: 5, wing: 0, mode: "大包",
      quote: 4000, paid: 4000, status: "已结清", teams: ["t1"],
      start: "10-01", startedAt: "10-01 08:30", scheduledAt: "10-01 上午", done: "10-05", doneAt: "10-05 17:00", tags: ["换瓦", "防水卷材"],
      note: "5 间大包 · 已结清",
      flows: [{ date: "10-05", type: "现金", amount: 4000, text: "现场现金结清" }]
    },
    {
      id: "DW20261026-08", owner: "李长江", title: "李长江",
      town: "富官庄镇", village: "富官庄村", addr: "富官庄中心街 26 号",
      phone: "13800000008", main: 3, wing: 0, mode: "人工",
      quote: 1200, paid: 1200, status: "已结清", teams: ["t1"],
      start: "10-04", startedAt: "10-04 08:30", scheduledAt: "10-04 上午", done: "10-06", doneAt: "10-06 17:00", tags: ["纯换瓦"],
      note: "3 间纯人工 · 已结清",
      flows: [{ date: "10-06", type: "微信", amount: 1200, text: "完工微信结清" }]
    },
    {
      id: "DW20261026-09", owner: "王学堂", title: "王学堂",
      town: "石桥镇", village: "石桥村", addr: "石桥村 6 巷 2 号",
      phone: "13800000009", main: 2, wing: 0, mode: "人工",
      quote: 700, paid: 700, status: "已结清", teams: ["t1"],
      start: "10-06", startedAt: "10-06 08:30", scheduledAt: "10-06 上午", done: "10-08", doneAt: "10-08 17:00", tags: ["纯换瓦", "小型修补"],
      note: "2 间纯人工 · 已结清",
      flows: [{ date: "10-08", type: "现金", amount: 700, text: "现场结清" }]
    },
    {
      id: "DW20261026-10", owner: "张建国", title: "张建国",
      town: "富官庄镇", village: "张家坡村", addr: "张家坡 2 排 5 号",
      phone: "13800000010", main: 3, wing: 0, mode: "大包",
      quote: 2400, paid: 2400, status: "已结清", teams: ["t1"],
      start: "10-08", startedAt: "10-08 08:30", scheduledAt: "10-08 上午", done: "10-10", doneAt: "10-10 17:00", tags: ["换瓦"],
      note: "3 间大包 · 已结清",
      flows: [{ date: "10-10", type: "微信", amount: 2400, text: "完工微信结清" }]
    },

    /* ---------- 二队 · 小鲁班 · 8 单 36 间 ---------- */
    {
      id: "DW20261026-11", owner: "刘桂芳", title: "刘桂芳",
      town: "富官庄镇", village: "刘家岭村", addr: "刘家岭 3 排 11 号",
      phone: "13800000011", main: 5, wing: 1, mode: "大包",
      quote: 4200, paid: 3600, status: "已完工", teams: ["t2"],
      start: "10-09", startedAt: "10-09 08:30", scheduledAt: "10-09 上午", done: "10-12", doneAt: "10-12 17:00", tags: ["换瓦", "脊瓦加固"],
      note: "6 间大包 · 完工于 10-12 · 尾款 600 待结",
      flows: [{ date: "10-09", type: "微信", amount: 3600, text: "开工前微信转账" }]
    },
    {
      id: "DW20261026-12", owner: "王德福", title: "王德福",
      town: "棋山镇", village: "北沟村", addr: "北沟村 1 排 4 号",
      phone: "13800000012", main: 5, wing: 0, mode: "大包",
      quote: 3600, paid: 3600, status: "已结清", teams: ["t2"],
      start: "10-10", startedAt: "10-10 08:30", scheduledAt: "10-10 上午", done: "10-13", doneAt: "10-13 17:00", tags: ["换瓦"],
      note: "5 间大包 · 已结清",
      flows: [{ date: "10-13", type: "银行", amount: 3600, text: "完工转账结清" }]
    },
    {
      id: "DW20261026-13", owner: "孙建军", title: "孙建军",
      town: "许孟镇", village: "孙家楼村", addr: "孙家楼 2 巷 8 号",
      phone: "13800000013", main: 4, wing: 0, mode: "大包",
      quote: 2800, paid: 2800, status: "已结清", teams: ["t2"],
      start: "10-11", startedAt: "10-11 08:30", scheduledAt: "10-11 上午", done: "10-14", doneAt: "10-14 17:00", tags: ["换瓦", "天沟"],
      note: "4 间大包 · 已结清",
      flows: [{ date: "10-14", type: "微信", amount: 2800, text: "完工微信结清" }]
    },
    {
      id: "DW20261026-14", owner: "张桂兰", title: "张桂兰",
      town: "富官庄镇", village: "桂花园村", addr: "桂花园南区 7 号",
      phone: "13800000014", main: 5, wing: 0, mode: "大包",
      quote: 3500, paid: 3500, status: "已结清", teams: ["t2"],
      start: "10-12", startedAt: "10-12 08:30", scheduledAt: "10-12 上午", done: "10-15", doneAt: "10-15 17:00", tags: ["换瓦", "脊瓦加固"],
      note: "5 间大包 · 已结清",
      flows: [{ date: "10-15", type: "现金", amount: 3500, text: "现场现金结清" }]
    },
    {
      id: "DW20261026-15", owner: "李方田", title: "李方田",
      town: "龙山镇", village: "李家庄村", addr: "李家庄 5 排 2 号",
      phone: "13800000015", main: 4, wing: 0, mode: "人工",
      quote: 1600, paid: 1600, status: "已结清", teams: ["t2"],
      start: "10-13", startedAt: "10-13 08:30", scheduledAt: "10-13 上午", done: "10-16", doneAt: "10-16 17:00", tags: ["纯换瓦"],
      note: "4 间纯人工 · 已结清",
      flows: [{ date: "10-16", type: "微信", amount: 1600, text: "完工微信结清" }]
    },
    {
      id: "DW20261026-16", owner: "王美玲", title: "王美玲",
      town: "石桥镇", village: "王家沟村", addr: "王家沟 3 巷 5 号",
      phone: "13800000016", main: 3, wing: 0, mode: "大包",
      quote: 2100, paid: 2100, status: "已结清", teams: ["t2"],
      start: "10-15", startedAt: "10-15 08:30", scheduledAt: "10-15 上午", done: "10-17", doneAt: "10-17 17:00", tags: ["换瓦", "防水卷材"],
      note: "3 间大包 · 已结清",
      flows: [{ date: "10-17", type: "微信", amount: 2100, text: "完工微信结清" }]
    },
    {
      id: "DW20261026-17", owner: "赵洪福", title: "赵洪福",
      town: "许孟镇", village: "赵家岭村", addr: "赵家岭 4 排 6 号",
      phone: "13800000017", main: 5, wing: 0, mode: "大包",
      quote: 3500, paid: 3500, status: "待排期", teams: ["t2"],
      start: "", startedAt: null, scheduledAt: "10-22 下午", done: "", doneAt: null, tags: ["换瓦", "红瓦换新"],
      note: "已预付全款 · 等二队 10-24 空档",
      flows: [{ date: "10-19", type: "微信", amount: 3500, text: "预付全款" }]
    },
    {
      id: "DW20261026-18", owner: "刘家旺", title: "刘家旺",
      town: "富官庄镇", village: "刘家沟村", addr: "刘家沟 1 排 9 号",
      phone: "13800000018", main: 4, wing: 0, mode: "人工",
      quote: 1000, paid: 1000, status: "待排期", teams: ["t2"],
      start: "", startedAt: null, scheduledAt: "10-24 下午", done: "", doneAt: null, tags: ["纯换瓦"],
      note: "已预付 · 待与业主确认上房时间",
      flows: [{ date: "10-19", type: "现金", amount: 1000, text: "预付工费" }]
    }
  ];

  /* ---------- 待定池（尚未进本月档期的线索） ---------- */
  var PENDING = [
    {
      id: "PD-01", orderId: null, owner: "张建国", title: "保利香槟国际 · 8 栋顶楼露台",
      town: "城区", village: "保利香槟国际", addr: "8 栋 1202 顶楼露台",
      phone: "13900000001", rooms: 6, budget: 8500, stage: "待量尺",
      days: 2, blocker: "露台异形，需现场复核排水坡度后才能出量",
      actions: ["约量尺", "先出预估"]
    },
    {
      id: "PD-02", orderId: null, owner: "林女士", title: "中海锦城 · 叠拼别墅",
      town: "城区", village: "中海锦城", addr: "叠拼 12-2 三层屋面",
      phone: "13900000002", rooms: 10, budget: 12600, stage: "待量尺",
      days: 5, blocker: "昨天 15:30 现场量尺结束，业主要方案初稿与工期报价",
      actions: ["转施工单", "一键回访"]
    },
    {
      id: "PD-03", orderId: null, owner: "陈先生", title: "万科城 · 4 栋 501",
      town: "城区", village: "万科城", addr: "4 栋 501 顶层",
      phone: "13900000003", rooms: 5, budget: 6200, stage: "待定口径",
      days: 4, blocker: "业主对主材自采还是包料仍摇摆，需尽快定夺辅材与人工进场口径",
      actions: ["定大包", "定纯人工"]
    },
    {
      id: "PD-04", orderId: null, owner: "孙宝民", title: "孙宝民 · 自建房",
      town: "富官庄镇", village: "孙家沟村", addr: "村西 2 排 14 号",
      phone: "13900000004", rooms: 4, budget: 3200, stage: "待定口径",
      days: 8, blocker: "屋面含旧石棉瓦需先拆除清运，拆除费是否计入包料未谈定",
      actions: ["定大包", "定纯人工"]
    },
    {
      id: "PD-05", orderId: null, owner: "王秀英", title: "王秀英 · 老宅翻新",
      town: "石桥镇", village: "王家沟村", addr: "王家沟 2 巷 6 号",
      phone: "13900000005", rooms: 3, budget: 2100, stage: "待排期",
      days: 1, blocker: "口径已定大包，等一队 10-25 空档插入",
      actions: ["排档期", "转施工单"]
    }
  ];

  /* ---------- 档期：按月生成，2026-10 有手写的详细排程 ---------- */
  var WEEKS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  /* 天气不再在这里编：真实预报由代理的 /weather 取（高德区县预报，只覆盖未来几天），
     拿不到的日期界面就不显示天气 */

  /* 把订单直接变成一条排程条目，地址/业主/工序与详情页完全一致 */
  function job(oid) {
    var o = null;
    for (var i = 0; i < ORDERS.length; i++) if (ORDERS[i].id === oid) o = ORDERS[i];
    if (!o) return null;
    return {
      oid: o.id,
      title: o.addr,
      desc: o.owner + " · " + (o.main + o.wing) + " 间" + o.mode,
      team: teamShort(o.teams)
    };
  }

  function dm(amOid, pmOid) {
    var am = amOid ? job(amOid) : null;
    var pm = pmOid ? job(pmOid) : null;
    return { slots: [
      am ? { ampm: "上午", tag: am.team, items: [am] }
         : { ampm: "上午", items: [], free: "上午空档 · 可排单" },
      pm ? { ampm: "下午", tag: pm.team, items: [pm] }
         : { ampm: "下午", items: [], free: "下午空档 · 可排单" }
    ] };
  }

  function day(amOid, pmOid, i0, i1) {
    var d = dm(amOid, pmOid);
    if (i0) d.slots[0].items = i0;
    if (i1) d.slots[1].items = i1;
    return d;
  }

  /* 只有需要特殊写法的日期手写，其余用 dm() 从订单生成 */
  var DETAIL_10 = {
    2: dm("DW20261026-06"),
    4: dm("DW20261026-01"),
    5: dm(null, "DW20261026-07"),
    6: dm("DW20261026-08"),
    7: dm("DW20261026-02"),
    8: dm(null, "DW20261026-09"),
    9: dm("DW20261026-04"),
    10: dm("DW20261026-10"),
    11: dm(null, "DW20261026-03"),
    12: dm("DW20261026-11"),
    13: dm("DW20261026-12"),
    14: dm(null, "DW20261026-13"),
    15: dm("DW20261026-14"),
    16: dm("DW20261026-15"),
    17: dm(null, "DW20261026-16"),

    21: { slots: [
      { ampm: "上午", items: [job("DW20261026-05")] },
      { ampm: "下午", items: [], free: "下午空档 · 可排单" }
    ] },
    22: { full: true, slots: [
      { ampm: "上午", items: [job("DW20261026-05")] },
      { ampm: "下午", items: [job("DW20261026-17")] }
    ] },
    23: { slots: [
      { ampm: "上午", items: [job("DW20261026-05")] },
      { ampm: "下午", items: [], free: "下午空档 · 可接小型修补" }
    ] },
    24: { full: true, slots: [
      { ampm: "上午", items: [job("DW20261026-17")] },
      { ampm: "下午", items: [job("DW20261026-18")] }
    ] },
    25: { slots: [
      { ampm: "上午", items: [job("DW20261026-17")] },
      { ampm: "下午", items: [], free: "下午空档 · 可排单" }
    ] },
    26: { slots: [
      { ampm: "上午", items: [], free: "上午空档可插单" },
      { ampm: "下午", items: [job("DW20261026-18")] }
    ] }
  };

  /* ---------- 农历：交给浏览器内置的 Chinese calendar 换算 ----------
     原来 10.21–10.26 那 6 天是手写的（初二、初三、初五…），既不连续也不对：
     2026-10-21 实际是九月十二。改成换算后整月都有，且列表与月历同一口径。
     浏览器没有这套日历数据时返回空字符串，页面就不显示，绝不编造。 */
  var LUNAR_FMT = null;
  try {
    LUNAR_FMT = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "long", day: "numeric" });
  } catch (e) { LUNAR_FMT = null; }
  var LUNAR_DAY = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
  var lunarCache = {};
  function lunarOf(y, m, d) {
    var key = y + "-" + m + "-" + d;
    if (lunarCache[key] !== undefined) return lunarCache[key];
    var out = "";
    if (LUNAR_FMT) {
      try {
        var parts = LUNAR_FMT.formatToParts(new Date(y, m - 1, d));
        var mon = "", dd = 0;
        parts.forEach(function (p) {
          if (p.type === "month") mon = p.value;
          if (p.type === "day") dd = parseInt(p.value, 10) || 0;
        });
        /* 初一显示月份（九月 / 闰六月），其余显示日子 */
        out = dd === 1 ? mon : (LUNAR_DAY[dd] || "");
      } catch (e) { out = ""; }
    }
    lunarCache[key] = out;
    return out;
  }

  function buildMonth(y, m, detail) {
    var total = new Date(y, m, 0).getDate();
    var out = [];
    for (var i = 1; i <= total; i++) {
      var dt = new Date(y, m - 1, i);
      var dd = detail && detail[i];
      var slots = dd && dd.slots && dd.slots.length
        ? dd.slots
        : [{ ampm: "上午", items: [] }, { ampm: "下午", items: [] }];
      var n = slots.reduce(function (a, s) { return a + (s.items ? s.items.length : 0); }, 0);
      var isToday = isTodayDay(y, m, i);
      out.push({
        y: y,
        m: m,
        date: p2(m) + "." + p2(i),
        day: i,
        week: WEEKS[dt.getDay()],
        lunar: lunarOf(y, m, i),
        /* 天气不挂在「这一天」上：每条活按自己的施工地点各显示各的 */
        /* 排满由人手工标，不按活儿数量自动推断 */
        full: dd ? !!dd.full : false,
        status: isToday ? "today" : n === 0 ? "free" : "partial",
        slots: slots
      });
    }
    return out;
  }

  /* 月份列表围绕「今天」生成：上月 / 本月 / 下月，跨年也自动顺延 */
  function ymShift(y, m) {
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    return [y, m];
  }
  function mkey(y, m) { return y + "-" + p2(m); }

  var MONTHS = {};
  [-1, 0, 1].forEach(function (off) {
    var p = ymShift(TODAY.y, TODAY.m + off);
    MONTHS[mkey(p[0], p[1])] = {
      y: p[0],
      m: p[1],
      label: p[0] + "年 " + p[1] + "月",
      /* 只有 2026-10 有手写的详细排程，其它月份用空档生成 */
      days: buildMonth(p[0], p[1], (p[0] === 2026 && p[1] === 10) ? DETAIL_10 : null)
    };
  });

  /* ==========================================================================
     写入层 —— 录单 / 待定 / 排档期 三条路径共用一套落库
     · 演示基线（18 单 / 5 线索 / 档期）永远不动，只把「新增」叠上去
     · 新增存 localStorage，刷新后还在；「清空新增」可回到原始演示状态
     ========================================================================== */
  var BACKUP_BASELINE = JSON.stringify({orders:ORDERS, pending:PENDING, teams:BASE_TEAMS, schedule:DETAIL_10, base:BASE});
  var DEFAULT_PROCESSES = ["换瓦", "脊瓦加固", "红瓦换新", "防水卷材", "天沟检修", "拆除清运"];
  var LS_KEY = "dingzhu.adds.v1";
  var ADDED = emptyAdds(), lastRaw = null, storageError = "";
  // Legacy files in this snapshot belong to 2026; never reinterpret them using the opening year.
  var LEGACY_YEAR = 2026;
  var PERSIST_FIELDS = [
    "owner", "title", "town", "village", "addr", "phone", "main", "wing", "mode",
    "quote", "paid", "teams", "scheduledAt", "startedAt", "doneAt", "start", "done",
    "scheduledOn", "startedOn", "doneOn", "createdOn", "geo", "tags", "note", "flows",
    "settledAt", "settledOn", "starred"
  ];
  /* trash 是删除记录的墓碑：种子的 18 单 / 5 线索写死在代码里，
     只在内存里删掉、刷新就会回来，所以必须留一条持久记录，载入时按它剔除。 */
  function emptyAdds() {
    return {
      orders: [], pending: [], slots: {}, moved: {}, patches: {}, orderPatches: {}, trash: [],
      /* 队伍：新增的整条记录 / 对内置队的改动 / 被删掉的内置队 id */
      teams: [], teamPatches: {}, teamDeleted: [], processPresets: null, base: null,
      revision: 0
    };
  }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function object(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function validId(x) { return typeof x === "string" && /^[A-Za-z0-9-]+$/.test(x); }
  function safeMap(map) {
    return object(map) && Object.keys(map).every(function (k) {
      return k !== "__proto__" && k !== "constructor" && k !== "prototype";
    });
  }
  function validateAdds(a) {
    if (!object(a)) throw new Error("本地数据格式异常，已停止写入；请先备份现有数据");
    if (a.base != null && (!object(a.base) || !Number.isFinite(a.base.lat) || !Number.isFinite(a.base.lng) || Math.abs(a.base.lat) > 90 || Math.abs(a.base.lng) > 180 || typeof a.base.name !== "string" || !a.base.name.trim() || a.base.name.length > 200 || typeof a.base.full !== "string" || a.base.full.length > 1000)) throw new Error("队伍出发地格式不正确，已停止写入");
    ["orders", "pending"].forEach(function (k) {
      if (a[k] === undefined) a[k] = [];
      if (!Array.isArray(a[k]) || !a[k].every(function (x) { return object(x) && validId(x.id); }))
        throw new Error("本地记录格式异常，已停止写入；请先备份现有数据");
    });
    ["slots", "moved", "patches", "orderPatches"].forEach(function (k) {
      if (a[k] === undefined) a[k] = {};
      if (!safeMap(a[k])) throw new Error("本地补丁格式异常，已停止写入");
    });
    if (a.processPresets !== undefined && a.processPresets !== null &&
        (!Array.isArray(a.processPresets) || a.processPresets.length > 30 || !a.processPresets.every(function (x) { return typeof x === "string" && x.trim() && x.length <= 20; })))
      throw new Error("工序预设格式不正确，已停止写入");
    /* 队伍：新增记录必须自带 id/name/members；改动与删除只校验形状 */
    if (a.teams === undefined) a.teams = [];
    if (!Array.isArray(a.teams) || !a.teams.every(function (t) {
      return object(t) && validId(t.id) && typeof t.name === "string" &&
        Array.isArray(t.members) && t.members.every(function (m) {
          return object(m) && typeof m.name === "string";
        });
    })) throw new Error("本地队伍记录异常，已停止写入；请先备份现有数据");
    if (a.teamPatches === undefined) a.teamPatches = {};
    if (!safeMap(a.teamPatches)) throw new Error("本地队伍修改记录异常，已停止写入");
    a.teamDeleted = a.teamDeleted || [];
    if (!Array.isArray(a.teamDeleted) || !a.teamDeleted.every(validId))
      throw new Error("本地队伍删除记录异常，已停止写入");

    /* 回收站：kind + id + 删除时间 + 删除前的完整快照（payload）*/
    if (a.trash === undefined) a.trash = [];
    if (!Array.isArray(a.trash) || !a.trash.every(function (t) {
      return object(t) && (t.kind === "order" || t.kind === "pending") &&
        validId(t.id) && object(t.payload);
    })) throw new Error("本地回收站记录异常，已停止写入；请先备份现有数据");
    Object.keys(a.slots).forEach(function (k) {
      if (!Array.isArray(a.slots[k]) || !a.slots[k].every(validId)) throw new Error("本地排程格式异常，已停止写入");
    });
    /* moved 记的是「这一单被移出过的档位」，每项形如 2026-10-30|下午 */
    Object.keys(a.moved).forEach(function (k) {
      if (!validId(k) || !Array.isArray(a.moved[k]) || !a.moved[k].every(function (v) {
        return typeof v === "string" && /^\d{4}-\d{2}-\d{2}\|[上下]午$/.test(v);
      })) throw new Error("本地改期记录异常，已停止写入");
    });
    [a.patches, a.orderPatches].forEach(function (map) {
      Object.keys(map).forEach(function (k) { if (!validId(k) || !safeMap(map[k])) throw new Error("本地补丁格式异常，已停止写入"); });
    });
    function checkFields(x) {
      ["quote", "paid", "budget", "main", "wing", "rooms"].forEach(function (k) {
        if (x[k] !== undefined && (!Number.isSafeInteger(x[k]) || x[k] < 0)) throw new Error("本地金额或间数异常，已停止写入");
      });
      ["tags", "teams"].forEach(function (k) {
        if (x[k] !== undefined && (!Array.isArray(x[k]) || !x[k].every(function (v) { return typeof v === "string"; })))
          throw new Error("本地订单字段异常，已停止写入");
      });
      if (x.flows !== undefined && (!Array.isArray(x.flows) || !x.flows.every(function (f) {
        return object(f) && Number.isSafeInteger(f.amount) && f.amount >= 0;
      }))) throw new Error("本地流水异常，已停止写入；请保留原始记录以便核对");
    }
    a.orders.concat(a.pending).forEach(checkFields);
    a.trash.forEach(function (t) { checkFields(t.payload); });
    a.orders.forEach(function (o) {
      if (!Array.isArray(o.tags) || !Array.isArray(o.teams) || typeof o.note !== "string" ||
          typeof o.owner !== "string" || typeof o.addr !== "string" || typeof o.town !== "string" ||
          typeof o.village !== "string" || !Number.isSafeInteger(o.quote) || !Number.isSafeInteger(o.paid))
        throw new Error("本地订单缺少必要字段，已停止写入");
    });
    Object.keys(a.orderPatches).forEach(function (id) { checkFields(a.orderPatches[id]); });
    Object.keys(a.patches).forEach(function (id) { checkFields(a.patches[id]); });
    return a;
  }
  function parseMoney(value, positive) {
    var text = String(value == null ? "" : value).trim();
    if (!/^\d+$/.test(text)) throw new Error("金额请填写非负整数（元）");
    var n = Number(text);
    if (!Number.isSafeInteger(n) || (positive && n <= 0)) throw new Error("收款金额须为有效正整数");
    return n;
  }
  function validateMoney(o) {
    var quote = parseMoney(o.quote), paid = parseMoney(o.paid);
    if (paid > quote) throw new Error("已收金额不能超过报价，请先核对报价或定金");
  }
  function dateISO(text, year) {
    var t = String(text || "").split(" ")[0].replace(/\./g, "-");
    if (/^\d{2}-\d{2}$/.test(t)) t = (year || LEGACY_YEAR) + "-" + t;
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[3] ? t : "";
  }
  function monthOfDate(text) {
    var iso = dateISO(text, TODAY.y), monthKey;
    // Short dates in the current three-month window can cross December/January.
    if (!/^\d{4}[-.]/.test(String(text))) {
      var md = String(text || "").replace(/\./g, "-");
      Object.keys(MONTHS).some(function (key) {
        if (MONTHS[key].days.some(function (d) { return d.date.replace(/\./g, "-") === md; })) {
          iso = key.slice(0, 4) + "-" + md; return true;
        }
        return false;
      });
    }
    if (!iso) return null;
    monthKey = iso.slice(0, 7);
    if (!MONTHS[monthKey]) {
      var y = +iso.slice(0, 4), m = +iso.slice(5, 7);
      MONTHS[monthKey] = {y:y, m:m, label:y + "年 " + m + "月", days:buildMonth(y, m, null)};
    }
    return MONTHS[monthKey];
  }
  function fullSlotDate(text) {
    var month = monthOfDate(text);
    return month ? dateISO(text, month.y) : "";
  }
  function slotOf(text, ampm) {
    var month = monthOfDate(text), iso = fullSlotDate(text);
    if (!month || !iso) return null;
    var day = month.days.filter(function (d) { return d.day === +iso.slice(8); })[0];
    return day ? day.slots.filter(function (s) { return s.ampm === ampm; })[0] || null : null;
  }
  function recalcStatus() {
    Object.keys(MONTHS).forEach(function (k) {
      var m = MONTHS[k];
      m.days.forEach(function (d) {
        var n = d.slots.reduce(function (sum, sl) { return sum + (sl.items || []).length; }, 0);
        d.status = isTodayDay(m.y, m.m, d.day) ? "today" : n ? "partial" : "free";
      });
    });
  }
  /* 单号：DW + 日期 + 全局连续序号（删除不补号、跨天不中断）。
     序号是全局单调计数器，存进 ADDED.idSeq；种子 18 单占 1~18，新单从 19 起。 */
  var SEED_SEQ = 18;
  function todayYmd() { return "" + TODAY.y + p2(TODAY.m) + p2(TODAY.d); }
  function dwSeq(orders) {
    var max = 0;
    (orders || []).forEach(function (o) {
      var m = String(o.id || "").match(/^DW\d{8}-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
  }
  function idSeq() {
    return Math.max(SEED_SEQ, Number(ADDED.idSeq) || 0, dwSeq(ORDERS));
  }
  function nextOrderId() {
    return "DW" + todayYmd() + "-" + p2(idSeq() + 1);
  }

  /* 存量旧单号（WD2410-xx 等）在载入时统一迁到 DW：
     种子号 WD2410-1~18 → DW20261026-01~18；其余旧号按全局序号继续往下排。 */
  function migrateOrderIds(a) {
    var seq = Math.max(SEED_SEQ, Number(a.idSeq) || 0);
    var map = {};
    function remap(id) {
      if (!id) return id;
      if (map[id]) return map[id];
      var s = String(id).match(/^WD\d{4}-(\d+)$/);
      if (s) {
        var nn = parseInt(s[1], 10);
        map[id] = nn <= SEED_SEQ ? ("DW20261026-" + p2(nn)) : ("DW20261026-" + p2(++seq));
        return map[id];
      }
      if (/^DW\d{8}-\d+$/.test(String(id))) { map[id] = id; return id; }
      map[id] = "DW20261026-" + p2(++seq);
      return map[id];
    }
    a.orders.forEach(function (o) { o.id = remap(o.id); });
    Object.keys(a.slots).forEach(function (k) {
      a.slots[k] = (a.slots[k] || []).map(remap);
    });
    Object.keys(a.patches).forEach(function (k) {
      var p = a.patches[k]; if (p && p.orderId) p.orderId = remap(p.orderId);
    });
    var newPatches = {};
    Object.keys(a.orderPatches).forEach(function (k) { newPatches[remap(k)] = a.orderPatches[k]; });
    a.orderPatches = newPatches;
    a.idSeq = seq;
    return a;
  }

  /* 线索号不复用：回收站里删掉的号也算占用，否则还原时会同号撞车 */
  function nextPendingId() {
    var max = 0;
    function scan(id) {
      var m = String(id).match(/^PD-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    PENDING.forEach(function (p) { scan(p.id); });
    ((ADDED && ADDED.trash) || []).forEach(function (t) { if (t.kind === "pending") scan(t.id); });
    var n = max + 1;
    return "PD-" + (n < 10 ? "0" + n : n);
  }

  /* 把订单压成一条排程条目（与手写排程字段一致） */
  function itemOf(o) {
    return {
      oid: o.id,
      title: o.addr,
      desc: o.owner + " · " + rooms(o) + " 间" + o.mode,
      team: teamShort(o.teams)
    };
  }

  function syncScheduleItem(o) {
    var it = itemOf(o);
    Object.keys(MONTHS).forEach(function (mk) {
      MONTHS[mk].days.forEach(function (d) {
        d.slots.forEach(function (s) {
          (s.items || []).forEach(function (x) {
            if (x.oid !== o.id) return;
            x.title = it.title;
            x.desc = it.desc;
            x.team = it.team;
          });
        });
      });
    });
  }


  function pendingById(id) { return PENDING.filter(function (p) { return p.id === id; })[0] || null; }

  /* 把一个订单从某个档位上摘掉（改期时清旧位置用）。
     key 形如 2026-10-30|下午；种子排程是写死在月份里的，只能从这里删。 */
  function dropSlotItem(oid, key) {
    var parts = String(key || "").split("|");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return;
    var sl = slotOf(parts[0], parts[1]);
    if (!sl || !sl.items || !sl.items.length) return;
    var left = sl.items.filter(function (it) { return it.oid !== oid; });
    if (left.length !== sl.items.length) sl.items = left;
  }

  /* 这一单当前占着的所有档位（可能跨天，例如连做三天） */
  function slotKeysOf(oid) {
    var out = [];
    Object.keys(MONTHS).forEach(function (mk) {
      MONTHS[mk].days.forEach(function (d) {
        d.slots.forEach(function (s) {
          if (!s.items || !s.items.length) return;
          if (!s.items.some(function (it) { return it.oid === oid; })) return;
          out.push(mk + "-" + p2(d.day) + "|" + s.ampm);
        });
      });
    });
    return out;
  }

  function applyAdds(a) {
    ADDED = a;

    /* 队伍：先回到内置基线，再按「删除 → 改动 → 新增」叠加 */
    TEAMS.length = 0;
    BASE_TEAMS.forEach(function (t) { TEAMS.push(copy(t)); });
    (a.teamDeleted || []).forEach(function (id) {
      for (var i = TEAMS.length - 1; i >= 0; i--) if (TEAMS[i].id === id) TEAMS.splice(i, 1);
    });
    Object.keys(a.teamPatches || {}).forEach(function (id) {
      var t = teamById(id); if (!t) return;
      var p = a.teamPatches[id] || {};
      ["name", "alias", "color", "leader", "members"].forEach(function (k) {
        if (p[k] !== undefined) t[k] = copy(p[k]);
      });
    });
    (a.teams || []).forEach(function (t) { if (!teamById(t.id)) TEAMS.push(copy(t)); });

    a.orders.forEach(function (o) { if (!byId(o.id)) ORDERS.push(copy(o)); });
    a.pending.forEach(function (p) { if (!pendingById(p.id)) PENDING.push(copy(p)); });
    /* 回收站里的记录一律不出现：种子单只从内存 splice 掉、刷新就会复活，
       必须每次载入都按墓碑再剔一遍，连它占的档位一起清掉 */
    (a.trash || []).forEach(function (t) {
      var i;
      if (t.kind === "order") {
        for (i = ORDERS.length - 1; i >= 0; i--) if (ORDERS[i].id === t.id) ORDERS.splice(i, 1);
        (t.slots || []).forEach(function (key) { dropSlotItem(t.id, key); });
      } else {
        for (i = PENDING.length - 1; i >= 0; i--) if (PENDING[i].id === t.id) PENDING.splice(i, 1);
      }
    });
    /* 先按改期记录清掉旧档位，再往下叠新位置，否则种子排程会把单留在原地 */
    Object.keys(a.moved || {}).forEach(function (oid) {
      (a.moved[oid] || []).forEach(function (key) { dropSlotItem(oid, key); });
    });
    Object.keys(a.orderPatches).forEach(function (id) {
      var o = byId(id); if (!o) return;
      PERSIST_FIELDS.forEach(function (k) { if (a.orderPatches[id][k] !== undefined) o[k] = copy(a.orderPatches[id][k]); });
      syncScheduleItem(o);
    });
    Object.keys(a.patches).forEach(function (id) {
      var p = pendingById(id); if (!p) return;
      ["stage", "days", "blocker", "orderId", "mode", "starred", "teams"].forEach(function (k) {
        if (a.patches[id][k] !== undefined) p[k] = copy(a.patches[id][k]);
      });
    });
    Object.keys(a.slots).forEach(function (key) {
      var parts = key.split("|"), date = parts[0];
      // Legacy persisted slot keys are from the original 2026 snapshot.
      if (!/^\d{4}-/.test(date)) date = dateISO(date, LEGACY_YEAR);
      var slot = slotOf(date, parts[1]); if (!slot) return;
      a.slots[key].forEach(function (id) {
        var o = byId(id); if (!o) return;
        slot.items = slot.items || [];
        if (!slot.items.some(function (it) { return it.oid === id; })) slot.items.push(itemOf(o));
        delete slot.free;
      });
    });
    recalcStatus();
  }
  function commit(change) {
    refreshToday();
    if (storageError) return Promise.reject(new Error(storageError));
    return withStorageLock(function () {
      assertFresh();
      var next = copy(ADDED), result = change(next);
      validateAdds(next);
      next.revision = (Number(ADDED.revision) || 0) + 1;
      var encoded = JSON.stringify(next);
      try { w.localStorage.setItem(LS_KEY, encoded); } catch (e) { throw new Error("保存失败：本地存储不可用或空间不足，数据尚未保存"); }
      lastRaw = encoded;
      applyAdds(next);
      return result;
    });
  }
  /* Business data, media mutations and backup all use this same cross-tab lock. */
  function withStorageLock(task) {
    if (!w.navigator || !w.navigator.locks) return Promise.reject(new Error("当前浏览器不支持安全保存，请用新版浏览器通过本地服务打开"));
    return w.navigator.locks.request("dingzhu-write-v1", task);
  }
  function assertFresh() {
    if (storageError) throw new Error(storageError);
    var raw = w.localStorage.getItem(LS_KEY);
    if (raw !== lastRaw) throw new Error("数据已由另一个页面更新，请刷新后重试；本页未覆盖其他记录");
  }
  function backupSnapshot() {
    assertFresh();
    var snap = copy(ADDED);
    snap.profile = w.PROFILE.get();
    // Earlier versions could copy temporary object URLs into deleted orders.
    // Actual photos are backed up separately from IndexedDB.
    snap.orders.concat(snap.trash.map(function (t) { return t.payload; }), Object.keys(snap.orderPatches).map(function (id) { return snap.orderPatches[id]; })).forEach(function (o) { delete o.media; delete o.sample; });
    return snap;
  }
  function backupOrders(a) {
    var base = JSON.parse(BACKUP_BASELINE), map = {};
    base.orders.concat(a.orders).forEach(function (o) { map[o.id] = copy(o); });
    Object.keys(a.orderPatches).forEach(function (id) { if (map[id]) Object.assign(map[id], a.orderPatches[id]); });
    return map;
  }
  function checkBackupState(input) {
    var a = validateAdds(copy(input));
    function walk(x) {
      if (!x || typeof x !== "object") return;
      Object.keys(x).forEach(function (k) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") throw new Error("备份包含无效字段");
        walk(x[k]);
      });
    }
    walk(a);
    if (a.profile !== undefined && (!object(a.profile) || typeof a.profile.name !== "string" || !a.profile.name.trim() || a.profile.name.length > 8 || typeof a.profile.avatar !== "string" ||
        (a.profile.avatar && (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(a.profile.avatar) || a.profile.avatar.length > 260 * 1024)))) throw new Error("备份中的资料格式不正确");
    if (a.mediaSet !== undefined && !validId(a.mediaSet)) throw new Error("备份中的留档编号不正确");
    ["revision", "idSeq"].forEach(function (k) { if (a[k] !== undefined && (!Number.isSafeInteger(a[k]) || a[k] < 0)) throw new Error("备份中的流水号不正确"); });
    function unique(rows) {
      var seen = new Set(); rows.forEach(function (r) { if (seen.has(r.id)) throw new Error("备份包含重复记录"); seen.add(r.id); });
    }
    unique(a.orders); unique(a.pending); unique(a.teams);
    function fields(o) {
      if (o.media !== undefined) throw new Error("备份中不能包含临时留档链接");
      ["owner", "title", "town", "village", "addr", "phone", "note", "blocker"].forEach(function (k) {
        if (o[k] !== undefined && typeof o[k] !== "string") throw new Error("备份中的文字字段不正确");
      });
      if (o.stage !== undefined && (typeof o.stage !== "string" || !/^[\u4e00-\u9fff]{1,20}$/.test(o.stage))) throw new Error("备份中的线索阶段不正确");
      if (o.days !== undefined && (!Number.isSafeInteger(o.days) || o.days < 0)) throw new Error("备份中的停留天数不正确");
      if (o.mode !== undefined && ["待定", "大包", "人工", "双包", "清工"].indexOf(o.mode) < 0) throw new Error("备份中的用料模式不正确");
      ["start", "done", "settledAt", "scheduledAt", "startedAt", "doneAt"].forEach(function (k) {
        if (o[k] != null && !/^[0-9 .:上下午夜至-]*$/.test(o[k])) throw new Error("备份中的施工时间不正确");
      });
      ["scheduledOn", "startedOn", "doneOn", "settledOn", "createdOn"].forEach(function (k) {
        if (o[k] && dateISO(o[k]) !== o[k]) throw new Error("备份中的日期不正确");
      });
      (o.flows || []).forEach(function (f) {
        if (typeof f.date !== "string" || !/^[0-9./ -]+$/.test(f.date) || typeof f.type !== "string" || !/^[\u4e00-\u9fffA-Za-z0-9 /-]{0,20}$/.test(f.type)) throw new Error("备份中的收款流水不正确");
      });
      if (o.quote !== undefined && o.paid !== undefined) validateMoney(o);
    }
    a.orders.concat(a.pending, a.trash.map(function (t) { return t.payload; }), Object.keys(a.orderPatches).map(function (id) { return a.orderPatches[id]; }), Object.keys(a.patches).map(function (id) { return a.patches[id]; })).forEach(fields);
    a.teams.concat(Object.keys(a.teamPatches).map(function (id) { return a.teamPatches[id]; })).forEach(function (t) {
      if (t.color !== undefined && !/^#[0-9a-f]{6}$/i.test(t.color)) throw new Error("备份中的队伍颜色不正确");
      if (t.members !== undefined && (!Array.isArray(t.members) || t.members.some(function (m) { return !object(m) || typeof m.name !== "string"; }))) throw new Error("备份中的队员格式不正确");
    });
    var orders = backupOrders(a), pendingIds = new Set(JSON.parse(BACKUP_BASELINE).pending.concat(a.pending).map(function (p) { return p.id; }));
    Object.keys(orders).forEach(function (id) { fields(orders[id]); });
    Object.keys(a.orderPatches).forEach(function (id) { if (!orders[id] && !a.trash.some(function (t) { return t.kind === "order" && t.id === id; })) throw new Error("备份中的订单关联不完整"); });
    Object.keys(a.patches).forEach(function (id) { if (!pendingIds.has(id) && !a.trash.some(function (t) { return t.kind === "pending" && t.id === id; })) throw new Error("备份中的线索关联不完整"); });
    Object.keys(a.slots).forEach(function (key) {
      var parts = key.split("|"), date = parts[0];
      if (parts.length !== 2 || !dateISO(date) || ["上午", "下午"].indexOf(parts[1]) < 0) throw new Error("备份中的档期不正确");
      if (new Set(a.slots[key]).size !== a.slots[key].length || a.slots[key].some(function (id) { return !orders[id]; })) throw new Error("备份中的档期关联不完整");
    });
    return a;
  }
  function backupOrderIds(a) {
    var map = backupOrders(a);
    a.trash.forEach(function (t) { if (t.kind === "order") { if (t.purged) delete map[t.id]; else map[t.id] = t.payload; } });
    return Object.keys(map);
  }
  function backupSummary(a) {
    var base = JSON.parse(BACKUP_BASELINE), orders = backupOrders(a), pending = {};
    base.pending.concat(a.pending).forEach(function (p) { pending[p.id] = copy(p); });
    Object.keys(a.patches).forEach(function (id) { if (pending[id]) Object.assign(pending[id], a.patches[id]); });
    a.trash.forEach(function (t) { delete (t.kind === "order" ? orders : pending)[t.id]; });
    var rows = Object.keys(orders).map(function (id) { return orders[id]; });
    return {orders:rows.length, pending:Object.keys(pending).filter(function (id) { return !pending[id].orderId; }).length,
      trash:a.trash.filter(function (t) { return !t.purged; }).length,
      teams:base.teams.filter(function (t) { return a.teamDeleted.indexOf(t.id) < 0; }).length + a.teams.length,
      quote:rows.reduce(function (n, o) { return n + o.quote; }, 0), paid:rows.reduce(function (n, o) { return n + o.paid; }, 0)};
  }
  /* Caller holds withStorageLock. A single localStorage write switches business data,
     profile and the media generation together; staged files never replace current files. */
  function installBackupState(input) {
    assertFresh();
    var next = checkBackupState(input);
    next.revision = Math.max(Number(ADDED.revision) || 0, Number(next.revision) || 0) + 1;
    next.idSeq = Math.max(idSeq(), Number(next.idSeq) || 0);
    w.localStorage.setItem(LS_KEY, JSON.stringify(next));
    storageError = "数据已恢复，请重新打开页面后继续";
  }
  function saveProfile(profile) {
    return commit(function (next) { next.profile = copy(profile); return profile; });
  }
  /* allowStack=true：允许同一个上/下午叠不止一单（改期拖拽用，两个队本来就能同时上） */
  function stageSlot(next, text, ampm, o, allowStack) {
    var sl = slotOf(text, ampm), iso = fullSlotDate(text);
    if (!sl || !iso) throw new Error("没有找到有效档期，请重新选择");
    if (!allowStack && (sl.items || []).some(function (it) { return it.oid !== o.id; })) throw new Error("这个档期已有订单，请重新选择空档");
    var key = iso + "|" + ampm;
    next.slots[key] = next.slots[key] || [];
    if (next.slots[key].indexOf(o.id) < 0) next.slots[key].push(o.id);
    o.scheduledOn = iso;
    return true;
  }
  function createOrder(input, date, ampm, pendingId, customProcesses) {
    return commit(function (next) {
      var p = pendingId ? pendingById(pendingId) : null;
      if (pendingId && !p) throw new Error("这条线索不存在，请刷新后重试");
      if (p && p.orderId) {
        if (byId(p.orderId)) return p.orderId;
        throw new Error("线索关联订单缺失，请先核对原始记录");
      }
      var o = copy(input); validateMoney(o);
      if (date && o.quote <= 0) throw new Error("施工单请先填写正数报价；报价未定时可存入待定池");
      if (!o.id) {
        var seq = Math.max(SEED_SEQ, Number(next.idSeq) || 0, dwSeq(next.orders)) + 1;
        o.id = "DW" + todayYmd() + "-" + p2(seq);
        next.idSeq = seq;
      }
      if (!validId(o.id) || byId(o.id)) throw new Error("订单号重复或无效，请重新提交");
      o.createdOn = TODAY.iso;
      if (date) stageSlot(next, date, ampm, o);
      mergeCustomProcesses(next, customProcesses);
      next.orders.push(o);
      if (p) next.patches[p.id] = Object.assign({}, next.patches[p.id], {
        orderId:o.id, stage:"待排期", days:0,
        /* 从待定池补信息时是先建档、后挑档期，这时还没有日期 */
        blocker: date
          ? ("已排入 " + date + " " + ampm + "，等开工")
          : "信息已补全，等排档期落位"
      });
      return o.id;
    }).then(function (id) { return byId(id); });
  }
  function addOrder(o) { return createOrder(o); }
  function putIntoSlot(date, ampm, o) {
    return commit(function (next) {
      if (!byId(o.id)) throw new Error("订单不存在");
      var snap = orderSnapshot(o); snap.id = o.id; stageSlot(next, date, ampm, snap);
      next.orderPatches[o.id] = snap;
      return true;
    });
  }
  /* 把一张已建档、还没档期的施工单排进具体空档（「排档期」后到排期页再选） */
  function scheduleOrder(id, date, ampm) {
    return commit(function (next) {
      var o = byId(id); if (!o) throw new Error("订单不存在");
      var snap = orderSnapshot(o); snap.id = o.id;
      snap.scheduledAt = date.slice(5) + " " + ampm;
      stageSlot(next, date, ampm, snap);
      next.orderPatches[id] = snap;
      return id;
    }).then(byId);
  }
  /* 已排期的单在档期里换位置：清旧档位 + 写新档位，一次提交，冲突全回滚。
     目标上/下午已经有活也照样能落——两个队同时上、或者半天加一单小的，都是真事。 */
  function moveOrder(id, date, ampm) {
    var before = byId(id);
    if (!before) return Promise.reject(new Error("订单不存在"));
    if (!before.scheduledAt) return Promise.reject(new Error("这张单还没排期，请先排档期"));
    if (state(before) === "done" || state(before) === "settled") {
      return Promise.reject(new Error("已完工或已结清的历史单不能改期，只在记录里保留原档期"));
    }
    if (before.scheduledOn === date && String(before.scheduledAt).split(" ")[1] === ampm) {
      return Promise.resolve(before);          /* 拖回原位，什么都不用写 */
    }
    return commit(function (next) {
      var o = byId(id); if (!o) throw new Error("订单不存在");
      var snap = orderSnapshot(o); snap.id = id;
      snap.scheduledAt = date.slice(5) + " " + ampm;
      stageSlot(next, date, ampm, snap, true);  /* 允许叠单，不再挑空档 */
      var target = date + "|" + ampm;
      var moved = next.moved || (next.moved = {});
      var list = moved[id] || (moved[id] = []);
      slotKeysOf(id).forEach(function (k) {
        if (k !== target && list.indexOf(k) < 0) list.push(k);
      });
      Object.keys(next.slots).forEach(function (k) {
        if (k === target || !next.slots[k] || next.slots[k].indexOf(id) < 0) return;
        next.slots[k] = next.slots[k].filter(function (x) { return x !== id; });
        if (!next.slots[k].length) delete next.slots[k];
      });
      next.orderPatches[id] = snap;
      return id;
    }).then(function (rid) {
      recalcStatus();
      return byId(rid);
    });
  }
  /* 排期页点「取消」：这单已建档但没排上，退回待定池，别让订单凭空消失 */
  function toPending(id) {
    return commit(function (next) {
      var o = byId(id); if (!o) throw new Error("订单不存在");
      if (o.scheduledAt) throw new Error("已排期，不能退回待定池");
      var p = {
        id: nextPendingId(),
        orderId: null,
        owner: o.owner, title: o.owner,
        town: o.town, village: o.village, addr: o.addr,
        phone: o.phone, rooms: o.main + o.wing,
        budget: o.quote, paid: o.paid || 0, flows: (o.flows || []).slice(),
        main: o.main, wing: o.wing, mode: o.mode, tags: (o.tags || []).slice(),
        teams: (o.teams || []).slice(), geo: o.geo || null,
        note: o.note || "", stage: "待量尺", days: 0,
        blocker: "从排档期退回 · 待与业主确认上工日子"
      };
      next.orders = next.orders.filter(function (x) { return x.id !== id; });
      next.pending.push(p);
      return p.id;
    }).then(function (pid) {
      for (var i = 0; i < ORDERS.length; i++) if (ORDERS[i].id === id) { ORDERS.splice(i, 1); break; }
      return pendingById(pid);
    });
  }
  /* 排期页「待排任务」托盘：已建档未排期的订单 + 待定池里「待排期」的线索 */
  function unscheduled() {
    var out = [];
    ORDERS.forEach(function (o) {
      if (o.scheduledAt) return;
      if (state(o) !== "pending") return;
      out.push({
        kind: "order", id: o.id, title: o.owner, addr: o.addr,
        rooms: o.main + o.wing, quote: o.quote
      });
    });
    PENDING.forEach(function (p) {
      if (p.orderId || p.stage !== "待排期") return;
      out.push({
        kind: "pending", id: p.id, title: p.owner, addr: p.addr,
        rooms: p.rooms, quote: p.budget
      });
    });
    return out;
  }

  /* 拖到档期：订单直接排期；线索先成单再排期（复用同一套原子写入） */
  function placeJob(kind, id, date, ampm) {
    if (kind === "order") return scheduleOrder(id, date, ampm);
    var p = pendingById(id);
    if (!p) return Promise.reject(new Error("线索不存在"));
    if (p.orderId) return Promise.reject(new Error("这条线索已经成单，不能重复排期"));
    var draft = {
      owner: p.owner, title: p.owner, town: p.town, village: p.village, addr: p.addr, phone: p.phone,
      main: p.main == null ? p.rooms : p.main, wing: p.wing || 0,
      mode: p.mode || "待定", quote: p.budget, paid: p.paid || 0,
      teams: (p.teams && p.teams.length) ? p.teams.slice() : ["t1"],
      geo: p.geo || null, tags: (p.tags || []).slice(),
      note: "由待定池 " + p.id + " 拖入档期", flows: (p.flows || []).slice(),
      startedAt: null, doneAt: null, start: "", done: ""
    };
    return createOrder(draft, date, ampm, p.id);
  }

  /* ==========================================================================
     删除 / 回收站 / 重点标记
     · 删除是软删除：整条记录连它占的档位一起进 ADDED.trash，列表里立即消失
     · 已收款或已结清的单不让删 —— 账目对不上，回收站也补不回已经发生的钱
     · 还原：payload 原样写回；原档位也一并挂回去（已被别的单占了就同档并存）
     · 彻底删除：只把 purged 置真，墓碑留着防复活，回收站里不再显示
     ========================================================================== */
  function nowStamp() {
    var d = new Date();
    return TODAY.md + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function findPendingByOrder(oid) {
    for (var i = 0; i < PENDING.length; i++) if (PENDING[i].orderId === oid) return PENDING[i];
    return null;
  }
  function trashItem(kind, id) {
    var list = ADDED.trash || [];
    for (var i = 0; i < list.length; i++) if (list[i].kind === kind && list[i].id === id) return list[i];
    return null;
  }
  function removeItem(kind, id) {
    return commit(function (next) {
      if (kind === "order") {
        var o = byId(id); if (!o) throw new Error("订单不存在");
        if (Number(o.paid) > 0) throw new Error("这单已收 ¥" + o.paid + "，有收款记录，不能删除；请先核对账目");
        if (state(o) === "settled") throw new Error("已结清的单不能删除，账目要留档");
        var link = findPendingByOrder(id);
        next.trash.push({
          kind: "order", id: id, at: nowStamp(), on: TODAY.iso,
          payload: Object.assign({id:id}, orderSnapshot(o)), slots: slotKeysOf(id), link: link ? link.id : null
        });
        next.orders = next.orders.filter(function (x) { return x.id !== id; });
        Object.keys(next.slots).forEach(function (k) {
          if (!next.slots[k] || next.slots[k].indexOf(id) < 0) return;
          next.slots[k] = next.slots[k].filter(function (x) { return x !== id; });
          if (!next.slots[k].length) delete next.slots[k];
        });
        /* 订单删了，线索要断开关联，回到「可补充信息」的状态，不能留个死指针 */
        if (link) next.patches[link.id] = Object.assign({}, next.patches[link.id], {
          orderId: null, stage: "待量尺", blocker: "原订单已删除，待重新补齐信息"
        });
        return id;
      }
      var p = pendingById(id); if (!p) throw new Error("线索不存在");
      next.trash.push({
        kind: "pending", id: id, at: nowStamp(), on: TODAY.iso,
        payload: copy(p), slots: [], link: p.orderId || null
      });
      next.pending = next.pending.filter(function (x) { return x.id !== id; });
      return id;
    }).then(function (rid) {
      recalcStatus();
      return rid;
    });
  }
  function restoreItem(kind, id) {
    return commit(function (next) {
      var t = null;
      for (var i = 0; i < next.trash.length; i++) {
        if (next.trash[i].kind === kind && next.trash[i].id === id) { t = next.trash[i]; break; }
      }
      if (!t) throw new Error("回收站里找不到这条记录");
      if (kind === "order") {
        if (byId(id)) throw new Error("这张单已经在订单里了，无需还原");
        var body = copy(t.payload);
        next.orders.push(body);
        next.orderPatches[id] = orderSnapshot(body);
        var back = 0;
        (t.slots || []).forEach(function (key) {
          var parts = String(key).split("|");
          if (parts.length !== 2) return;
          try { stageSlot(next, parts[0], parts[1], { id: id }, true); back++; } catch (e) {}
        });
        if (t.link) {
          var p0 = pendingById(t.link);
          if (p0) next.patches[p0.id] = Object.assign({}, next.patches[p0.id], {
            orderId: id, stage: "待排期",
            blocker: back ? "已还原，原档期一并恢复" : "已还原，等排档期落位"
          });
        }
      } else {
        if (pendingById(id)) throw new Error("这条线索已经在待定池里了，无需还原");
        var pl = copy(t.payload);
        if (pl.orderId && !byId(pl.orderId)) pl.orderId = null;
        next.pending.push(pl);
      }
      next.trash = next.trash.filter(function (x) { return !(x.kind === kind && x.id === id); });
      return id;
    }).then(function (rid) {
      recalcStatus();
      return rid;
    });
  }
  function purgeItem(kind, id) {
    return commit(function (next) {
      var hit = false;
      next.trash.forEach(function (t) {
        if (t.kind === kind && t.id === id) { t.purged = true; hit = true; }
      });
      if (!hit) throw new Error("回收站里找不到这条记录");
      return id;
    });
  }
  function trashList() {
    return (ADDED.trash || []).filter(function (t) { return !t.purged; })
      .slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  function setStar(kind, id, on) {
    return commit(function (next) {
      if (kind === "order") {
        var o = byId(id); if (!o) throw new Error("订单不存在");
        var snap = orderSnapshot(o); snap.id = id; snap.starred = !!on;
        next.orderPatches[id] = snap;
        return id;
      }
      if (!pendingById(id)) throw new Error("线索不存在");
      next.patches[id] = Object.assign({}, next.patches[id], { starred: !!on });
      return id;
    }).then(function (rid) {
      return kind === "order" ? byId(rid) : pendingById(rid);
    });
  }

  /* ---------- 队伍增改删（持久化，刷新后还在） ---------- */
  var CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  /* 下一支队的默认名：一队/二队…里第一个没用掉的；十队之后用「N队」 */
  function nextTeamName(list) {
    var used = (list || TEAMS).map(function (t) { return t.name; });
    for (var i = 0; i < CN_NUM.length; i++) {
      if (used.indexOf(CN_NUM[i] + "队") < 0) return CN_NUM[i] + "队";
    }
    return (used.length + 1) + "队";
  }
  function nextTeamId(list) {
    var n = 1, id;
    do { id = "t" + n; n++; } while (teamById(id) || (list || []).some(function (t) { return t.id === id; }));
    return id;
  }
  /* 这一队被多少单引用（删除前要拦） */
  function teamUsage(id) {
    return ORDERS.filter(function (o) { return (o.teams || []).indexOf(id) >= 0; }).length +
      PENDING.filter(function (p) { return !p.orderId && (p.teams || []).indexOf(id) >= 0; }).length;
  }
  function cleanMembers(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (m) {
      return { name: String(m.name || "").trim(), phone: String(m.phone || "").trim() || "—", role: String(m.role || "大工") };
    }).filter(function (m) { return m.name; });
  }
  function checkTeamName(name, exceptId) {
    var n = String(name || "").trim();
    if (!n) throw new Error("队名不能为空");
    if (n.length > 8) throw new Error("队名最多 8 个字");
    var dup = TEAMS.some(function (t) { return t.name === n && t.id !== exceptId; });
    if (dup) throw new Error("已经有「" + n + "」了，换个名字");
    return n;
  }

  function addTeam(input) {
    input = input || {};
    return commit(function (next) {
      var name = checkTeamName(input.name || nextTeamName(TEAMS.concat(next.teams)));
      var t = {
        id: nextTeamId(next.teams),
        name: name,
        alias: String(input.alias || "").trim() || "新班组",
        leader: "",
        color: input.color || TEAM_COLORS[0],
        members: cleanMembers(input.members)
      };
      next.teams.push(t);
      return t.id;
    }).then(function (id) { return teamById(id); });
  }

  function updateTeam(id, patch) {
    patch = patch || {};
    return commit(function (next) {
      if (!teamById(id)) throw new Error("这支队伍不存在，请刷新后重试");
      var clean = {};
      if (patch.name !== undefined) clean.name = checkTeamName(patch.name, id);
      if (patch.alias !== undefined) clean.alias = String(patch.alias).trim() || "新班组";
      if (patch.color !== undefined) clean.color = String(patch.color);
      if (patch.members !== undefined) clean.members = cleanMembers(patch.members);

      var added = next.teams.filter(function (t) { return t.id === id; })[0];
      if (added) { Object.assign(added, clean); return id; }
      next.teamPatches[id] = Object.assign({}, next.teamPatches[id], clean);
      return id;
    }).then(function (rid) { return teamById(rid); });
  }

  function removeTeam(id) {
    return commit(function (next) {
      var t = teamById(id);
      if (!t) throw new Error("这支队伍不存在");
      var total = TEAMS.length + next.teams.filter(function (x) { return !teamById(x.id); }).length;
      if (total <= 1) throw new Error("至少要留一支队伍，不能删最后一支");
      var used = teamUsage(id);
      if (used) throw new Error("还有 " + used + " 单挂在「" + t.name + "」上，先把这些单改到别的队");
      var i = next.teams.map(function (x) { return x.id; }).indexOf(id);
      if (i >= 0) next.teams.splice(i, 1);
      else {
        if (next.teamDeleted.indexOf(id) < 0) next.teamDeleted.push(id);
        delete next.teamPatches[id];
      }
      return id;
    });
  }

  function addPending(input, customProcesses) {
    return commit(function (next) {
      var p = copy(input); p.id = p.id || nextPendingId();
      if (pendingById(p.id)) throw new Error("线索号重复");
      validateMoney({quote:p.budget, paid:p.paid || 0});
      p.orderId = p.orderId || null; p.createdOn = TODAY.iso;
      mergeCustomProcesses(next, customProcesses);
      next.pending.push(p); return p.id;
    }).then(pendingById);
  }
  function patchPending(p) {
    return commit(function (next) {
      if (!pendingById(p.id)) throw new Error("线索不存在");
      var patch = Object.assign({}, next.patches[p.id]);
      ["stage", "days", "blocker", "orderId", "mode", "starred", "teams"].forEach(function (k) { if (p[k] !== undefined) patch[k] = p[k]; });
      next.patches[p.id] = patch; return p.id;
    }).then(pendingById);
  }
  function processPresets() { return (ADDED.processPresets || DEFAULT_PROCESSES).slice(); }
  function mergeCustomProcesses(next, list) {
    if (!list || !list.length) return;
    var all = (next.processPresets || DEFAULT_PROCESSES).concat(list.map(function (s) { return String(s).trim(); })).filter(Boolean);
    all = all.filter(function (s, i) { return all.indexOf(s) === i; });
    if (all.length > 30 || all.some(function (s) { return s.length > 20; })) throw new Error("工序最多 30 项，每项不超过 20 字，请先整理工序预设");
    next.processPresets = all;
  }
  function removeProcessPreset(name) {
    return commit(function (next) { next.processPresets = (next.processPresets || DEFAULT_PROCESSES).filter(function (s) { return s !== name; }); });
  }
  function getBase() { return copy(ADDED.base || BASE); }
  function saveBase(place) {
    return commit(function (next) {
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) throw new Error("请先选择有效的地图搜索结果");
      next.base = {name:String(place.name || "").trim(), full:String(place.full || [place.addr, place.name].filter(Boolean).join(" · ")), lat:place.lat, lng:place.lng};
      return copy(next.base);
    });
  }
  function saveProcessPresets(list) {
    return commit(function (next) {
      if (!Array.isArray(list)) throw new Error("请填写工序名称");
      var clean = list.map(function (x) { return String(x).trim(); }).filter(Boolean);
      clean = clean.filter(function (x, i) { return clean.indexOf(x) === i; });
      if (clean.length > 30 || clean.some(function (x) { return x.length > 20; })) throw new Error("最多设置 30 项工序，每项不超过 20 字");
      next.processPresets = clean;
      return clean.slice();
    });
  }
  function checkedTeams(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.some(function (id) { return !teamById(id); })) throw new Error("请至少选择一支有效队伍");
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  }
  function setTeams(kind, id, ids) {
    return commit(function (next) {
      var selected = checkedTeams(ids);
      if (kind === "order") {
        var o = byId(id); if (!o) throw new Error("订单不存在");
        next.orderPatches[id] = Object.assign(orderSnapshot(o), {teams: selected});
      } else if (kind === "pending") {
        var p = pendingById(id); if (!p) throw new Error("线索不存在");
        next.patches[id] = Object.assign({}, next.patches[id], {teams: selected});
        if (p.orderId && byId(p.orderId)) next.orderPatches[p.orderId] = Object.assign(orderSnapshot(byId(p.orderId)), {teams: selected.slice()});
      } else throw new Error("无效的记录类型");
      return selected;
    });
  }
  function orderSnapshot(o) {
    var out = {};
    PERSIST_FIELDS.forEach(function (k) { if (o[k] !== undefined) out[k] = o[k]; });
    return copy(out);
  }
  function saveOrder(o, patch) {
    return commit(function (next) {
      var current = byId(o.id); if (!current) throw new Error("订单不存在");
      var snap = orderSnapshot(Object.assign({}, current, patch || orderSnapshot(o)));
      if (state(current) === "settled" && snap.quote !== current.quote) throw new Error("已结清订单不能修改报价");
      validateMoney(snap); next.orderPatches[o.id] = snap; return o.id;
    }).then(byId);
  }
  function recordPayment(id, amount, channel) {
    return commit(function (next) {
      var o = byId(id); if (!o) throw new Error("订单不存在");
      amount = parseMoney(amount, true); validateMoney(o);
      if (o.quote <= 0) throw new Error("请先确认正数报价，再登记收款或结清");
      if (amount > due(o)) throw new Error("收款超过剩余应收，请核对金额");
      var snap = orderSnapshot(o); snap.paid += amount;
      snap.flows = (snap.flows || []).concat([{date:TODAY.md, on:TODAY.iso, type:channel, amount:amount, text:"现场收款登记"}]);
      next.orderPatches[id] = snap; return id;
    }).then(byId);
  }
  function transitionOrder(id, action) {
    return commit(function (next) {
      var o = byId(id); if (!o) throw new Error("订单不存在");
      var snap = orderSnapshot(o), st = state(o);
      if (action === "start") {
        if (st !== "planned") throw new Error("当前状态不能重复开工");
        snap.startedAt = nowStamp(); snap.start = TODAY.md; snap.startedOn = TODAY.iso;
      } else if (action === "finish") {
        if (st !== "doing") throw new Error("请先开工，不能重复完工");
        snap.doneAt = nowStamp(); snap.done = TODAY.md; snap.doneOn = TODAY.iso;
      } else if (action === "settle") {
        if (st !== "done") throw new Error("请先完工，再确认结清");
        snap.settledAt = TODAY.md; snap.settledOn = TODAY.iso;
      } else throw new Error("无效的订单动作");
      validateMoney(snap); next.orderPatches[id] = snap; return id;
    }).then(byId);
  }
  /* 完工 → 结清 是两步：这单收满款也要人再点一次「确认结清」 */
  function settleOrder(id, channel) {
    if (!channel) return transitionOrder(id, "settle");
    return commit(function (next) {
      var o = byId(id); if (!o || state(o) !== "done") throw new Error("请先完工，再确认结清");
      var snap = orderSnapshot(o), rest = due(o);
      if (snap.quote <= 0 || rest <= 0 || ["微信", "现金", "银行"].indexOf(channel) < 0) throw new Error("请核对收款金额和方式");
      snap.paid += rest;
      snap.flows = (snap.flows || []).concat([{date:TODAY.md, on:TODAY.iso, type:channel, amount:rest, text:"现场收款登记"}]);
      snap.settledAt = TODAY.md; snap.settledOn = TODAY.iso;
      validateMoney(snap); next.orderPatches[id] = snap; return id;
    }).then(byId);
  }
  function addedCount() {
    return ADDED.orders.length + ADDED.pending.length + (ADDED.trash || []).length +
      Object.keys(ADDED.orderPatches).filter(function (id) {
        return !ADDED.orders.some(function (o) { return o.id === id; });
      }).length + Object.keys(ADDED.patches).length;
  }
  function resetAdds() {
    // Commit an empty snapshot first. The only UI caller reloads immediately after success.
    return commit(function (next) {
      var clean = emptyAdds(), profile = next.profile, mediaSet = next.mediaSet, presets = next.processPresets, seq = idSeq();
      Object.keys(clean).forEach(function (k) { next[k] = clean[k]; });
      next.idSeq = seq;
      next.processPresets = presets;
      if (profile) next.profile = profile;
      if (mediaSet) next.mediaSet = mediaSet;
      return 0;
    }).then(function () { storageError = "改动已清空，请刷新后继续"; return 0; });
  }
  try {
    lastRaw = w.localStorage.getItem(LS_KEY);
    if (lastRaw !== null) applyAdds(validateAdds(migrateOrderIds(JSON.parse(lastRaw))));
  } catch (e) { storageError = "本地数据无法读取，已停止写入；请先备份并检查存储"; }

  /* 老数据（含演示种子）的「已结清」只写在 status 文案里，现在结清是独立标记。
     这里补一次，免得历史单全退回「待收款」；新单没有 status 字段，不受影响。 */
  ORDERS.forEach(function (o) {
    if (o.settledAt || o.settledOn || !o.doneAt) return;
    if (o.status !== "已结清") return;
    o.settledOn = o.doneOn || "";
    o.settledAt = o.doneOn || o.doneAt || "";
  });

  w.addEventListener("storage", function (e) {
    if (e.key === LS_KEY || e.key === null) {
      storageError = "数据已由另一个页面更新，请刷新后重试";
      if (w.UI) w.UI.toast(storageError);
    }
  });

  /* ==========================================================================
     完工留档（照片 / 视频）
     · 文件本身只在内存里（objectURL），刷新即失效——原型不落二进制
     · 要长期留存得接后端或 IndexedDB，见 HANDOFF「还没做」第 2 条
     · 演示数据里已完工/已结清的单给两张「样例」位，让卡片不空，但明确标「样例」
     ========================================================================== */
  var MEDIA_SEQ = 0;

  function addMedia(o, item) {
    if (!o) return null;
    o.media = o.media || [];
    item.id = "m" + (++MEDIA_SEQ) + "-" + Date.now().toString(36);
    o.media.push(item);
    return item;
  }

  function removeMedia(o, id) {
    if (!o || !o.media) return false;
    for (var i = 0; i < o.media.length; i++) {
      if (o.media[i].id !== id) continue;
      try { if (o.media[i].url) w.URL.revokeObjectURL(o.media[i].url); } catch (e) {}
      o.media.splice(i, 1);
      return true;
    }
    return false;
  }

  function mediaStat(o) {
    var list = (o && o.media) || [];
    var img = 0, vid = 0;
    list.forEach(function (m) { if (m.kind === "video") vid++; else img++; });
    return { count: list.length, img: img, vid: vid, has: list.length > 0, sample: (o && o.sample) || 0 };
  }

  /* 已完工/已结清的演示单挂两张样例位（真实留档从 0 开始）；
     用户自己录的单不挂样例——那是真单据，不该有假图。
     被人工推进过状态（有补丁）的单也不挂：刚完工却没拍照的单，
     挂两张「样例」会让人误以为已经留过档。 */
  ORDERS.forEach(function (o) {
    var mine = ADDED.orders.some(function (x) { return x.id === o.id; });
    if (mine || ADDED.orderPatches[o.id]) return;
    var s = state(o);
    if ((s === "done" || s === "settled") && o.media == null && !o.sample) o.sample = 2;
  });

  /* ---------- 派生计算 ---------- */
  function rooms(o) { return (o.main || 0) + (o.wing || 0); }
  function due(o) { return Math.max(0, o.quote - o.paid); }

  /* ---------- 跨月区间：把订单归到「业务月份」，再按区间筛 ---------- */
  /* 月份口径：优先开工日 scheduledOn / startedOn，其次完工日 doneOn，
     老数据只有 "10-02" 这种 MM-DD，用今天所属年份补全 */
  function orderMonth(o) {
    var iso = o.scheduledOn || o.startedOn || o.doneOn || "";
    if (/^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7);
    var md = String(o.start || o.done || "");
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(md.trim());
    if (m) return TODAY.y + "-" + ("0" + m[1]).slice(-2);
    return "";
  }

  function ordersInRange(from, to) {
    var a = from || "0000-00", b = to || "9999-99";
    if (a > b) { var tmp = a; a = b; b = tmp; }   /* 传反了也照常工作 */
    return ORDERS.filter(function (o) {
      var k = orderMonth(o);
      return !!k && k >= a && k <= b;
    });
  }

  /* 可选月份：订单里真实出现过的月份 ∪ 今天所在月，倒序 */
  function monthChoices() {
    var set = {}, out = [];
    ORDERS.forEach(function (o) { var k = orderMonth(o); if (k) set[k] = 1; });
    set[TODAY.y + "-" + ("0" + TODAY.m).slice(-2)] = 1;
    Object.keys(set).sort().reverse().forEach(function (k) {
      var p = k.split("-");
      out.push({ key: k, y: Number(p[0]), m: Number(p[1]), label: p[0] + "年 " + Number(p[1]) + "月" });
    });
    return out;
  }

  function stats(list) {
    var arr = list || ORDERS;
    var s = {
      count: arr.length, rooms: 0, quote: 0, paid: 0, due: 0,
      doneCount: 0, doneRooms: 0, dueCount: 0,
      teams: {}
    };
    arr.forEach(function (o) {
      s.rooms += rooms(o);
      s.quote += o.quote;
      s.paid += o.paid;
      s.due += due(o);
      var st = state(o);
      if (st === "done" || st === "settled") {
        s.doneCount++;
        s.doneRooms += rooms(o);
      }
      if (due(o) > 0) s.dueCount++;
      (o.teams || []).forEach(function (tid) {
        s.teams[tid] = s.teams[tid] || { rooms: 0, count: 0, quote: 0, paid: 0 };
        s.teams[tid].rooms += rooms(o);
        s.teams[tid].count += 1;
        s.teams[tid].quote += o.quote;
        s.teams[tid].paid += o.paid;
      });
    });
    s.rate = s.quote ? s.paid / s.quote : 0;
    s.doneRate = s.count ? s.doneCount / s.count : 0;

    /* 分口径均价（按间）：口径未定的单（mode=待定）不计入，否则会污染人工均价 */
    var bag = { rooms: 0, money: 0 }, lab = { rooms: 0, money: 0 };
    arr.forEach(function (o) {
      var b = o.mode === "大包" ? bag : o.mode === "人工" ? lab : null;
      if (!b) return;
      b.rooms += rooms(o);
      b.money += o.quote;
    });
    s.avgBag = bag.rooms ? Math.round(bag.money / bag.rooms) : 0;
    s.avgLabor = lab.rooms ? Math.round(lab.money / lab.rooms) : 0;
    s.bagRooms = bag.rooms;
    s.laborRooms = lab.rooms;
    return s;
  }

  function byId(id) {
    for (var i = 0; i < ORDERS.length; i++) if (ORDERS[i].id === id) return ORDERS[i];
    return null;
  }

  /* 欠款账龄：按完工日与今天（跟随系统日期）差额 */
  function overdueDays(o) {
    var iso = o.doneOn || dateISO(o.done, LEGACY_YEAR);
    if (!iso) return 0;
    var parts = iso.split("-"), d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return Math.max(0, Math.round((new Date(TODAY.y, TODAY.m - 1, TODAY.d) - d) / 86400000));
  }

  function dueOrders() {
    return ORDERS.filter(function (o) { return due(o) > 0; })
      .sort(function (a, b) { return overdueDays(b) - overdueDays(a); });
  }

  /* 热门乡镇榜 */
  function townRank(list) {
    var map = {};
    (list || ORDERS).forEach(function (o) {
      var k = o.town;
      map[k] = map[k] || { town: k, count: 0, rooms: 0, money: 0 };
      map[k].count++;
      map[k].rooms += rooms(o);
      map[k].money += o.quote;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  w.DATA = {
    processPresets: processPresets,
    removeProcessPreset: removeProcessPreset,
    getBase: getBase, saveBase: saveBase,
    saveProcessPresets: saveProcessPresets,
    setTeams: setTeams,
    BASE: BASE,
    TEAMS: TEAMS,
    teamById: teamById,
    teamShort: teamShort,
    teamNames: teamNames,
    state: state,
    ORDERS: ORDERS,
    PENDING: PENDING,
    SCHEDULE: MONTHS[TODAY.key].days,
    MONTHS: MONTHS,
    ensureMonth: function (key) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(key)) || Number(String(key).slice(0, 4)) < 1900 || Number(String(key).slice(0, 4)) > 9998) throw new Error("月份超出支持范围");
      return monthOfDate(key + "-01");
    },
    rooms: rooms,
    due: due,
    stats: stats,
    orderMonth: orderMonth,
    ordersInRange: ordersInRange,
    monthChoices: monthChoices,
    byId: byId,
    overdueDays: overdueDays,
    dueOrders: dueOrders,
    townRank: townRank,
    /* 写入层 */
    itemOf: itemOf,
    nextOrderId: nextOrderId,
    addOrder: addOrder,
    createOrder: createOrder,
    recordPayment: recordPayment,
    transitionOrder: transitionOrder,
    settleOrder: settleOrder,
    parseMoney: parseMoney,
    fullSlotDate: fullSlotDate,
    storageError: function () { return storageError; },
    putIntoSlot: putIntoSlot,
    scheduleOrder: scheduleOrder,
    toPending: toPending,
    unscheduled: unscheduled,
    placeJob: placeJob,
    moveOrder: moveOrder,
    TEAM_COLORS: TEAM_COLORS,
    nextTeamName: nextTeamName,
    addTeam: addTeam,
    updateTeam: updateTeam,
    removeTeam: removeTeam,
    teamUsage: teamUsage,
    addPending: addPending,
    patchPending: patchPending,
    removeItem: removeItem,
    restoreItem: restoreItem,
    purgeItem: purgeItem,
    trashList: trashList,
    trashItem: trashItem,
    setStar: setStar,
    findPendingByOrder: findPendingByOrder,
    saveOrder: saveOrder,
    resetAdds: resetAdds,
    addMedia: addMedia,
    removeMedia: removeMedia,
    mediaStat: mediaStat,
    addedCount: addedCount,
    monthOfDate: monthOfDate,
    refreshToday: refreshToday,
    withStorageLock: withStorageLock,
    assertFresh: assertFresh,
    backupSnapshot: backupSnapshot,
    backupBaseline: function () { return BACKUP_BASELINE; },
    checkBackupState: checkBackupState,
    backupOrderIds: backupOrderIds,
    backupSummary: backupSummary,
    installBackupState: installBackupState,
    mediaSet: function () { return ADDED.mediaSet || "legacy"; },
    storedProfile: function () { return ADDED.profile ? copy(ADDED.profile) : null; },
    saveProfile: saveProfile,
    TODAY: TODAY
  };
})(window);
