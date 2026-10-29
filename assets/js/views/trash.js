/* ==========================================================================
   回收站
   · 待定池 / 订单里左滑删掉的记录都进这里，原样保留（含档期、金额、收款流水）
   · 还原后回到原来的位置；彻底删除只置墓碑，避免刷新又从演示数据里复活
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  var state = { list: [] };

  function slotsText(t) {
    return (t.slots || []).map(function (k) { return String(k).replace("|", " "); }).join(" / ");
  }

  function row(t) {
    var p = t.payload || {};
    var isOrder = t.kind === "order";
    var title = isOrder ? (p.owner || p.title || t.id) : (p.title || p.owner || t.id);
    var money = isOrder ? (Number(p.quote) || 0) : (Number(p.budget) || 0);
    var paid = Number(p.paid) || 0;
    var slots = slotsText(t);

    return (
      '<article class="trash-card" data-id="' + U.esc(t.id) + '" data-kind="' + t.kind + '">' +
        '<div class="tc-head">' +
          '<span class="pill xs ' + (isOrder ? "brand" : "line") + '">' + (isOrder ? "订单" : "线索") + "</span>" +
          '<span class="tc-id">' + U.esc(t.id) + "</span>" +
          '<span class="tc-at">' + U.esc(t.at || t.on || "") + "</span>" +
        "</div>" +
        '<div class="tc-title">' + U.esc(title) + "</div>" +
        '<div class="tc-sub">' +
          U.esc(((p.town || "") + " " + (p.village || "")).trim()) +
          (p.addr ? " · " + U.esc(p.addr) : "") +
        "</div>" +
        '<div class="tc-meta">' +
          "<span>" + (isOrder ? "报价" : "预算") + " ¥" + U.n(money) + "</span>" +
          (paid ? '<span class="orange-t">已收 ¥' + U.n(paid) + "</span>" : "") +
          (slots ? "<span>原档期 " + U.esc(slots) + "</span>" : "") +
          (t.link ? "<span>关联 " + U.esc(t.link) + "</span>" : "") +
        "</div>" +
        '<div class="tc-acts">' +
          '<button class="btn ghost sm" data-act="restore">' + U.icon("undo", 14) + "还原</button>" +
          '<button class="btn danger sm" data-act="purge">' + U.icon("trash", 14) + "彻底删除</button>" +
        "</div>" +
      "</article>"
    );
  }

  function listHtml() {
    if (!state.list.length) {
      return (
        '<div class="empty"><div class="art">' + U.icon("trash", 28) + "</div>" +
        "<h4>回收站是空的</h4><p>在待定池或订单里左滑卡片，可以删除并临时放到这里</p></div>"
      );
    }
    return state.list.map(row).join("");
  }

  function subText() { return state.list.length + " 条已删除 · 可还原"; }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.trash = function () {
    state.list = D.trashList();

    var bar =
      '<div class="navline">' +
        '<a class="back" href="#/orders" aria-label="返回">' + U.icon("arrowLeft", 18) + "</a>" +
        '<div class="col navline-mid"><div class="navline-title">回收站</div>' +
        '<div class="navline-sub" id="trSub">' + subText() + "</div></div>" +
        '<button class="icon-btn bare" aria-label="说明" id="trHelp">' + U.icon("info", 19) + "</button>" +
      "</div>";

    var body = '<div class="mt12" id="trList">' + listHtml() + "</div>" +
      '<div style="height:8px"></div>';

    function refresh() {
      state.list = D.trashList();
      document.getElementById("trList").innerHTML = listHtml();
      document.getElementById("trSub").textContent = subText();
    }

    function askPurge(kind, id) {
      var mask = U.sheet(
        "<h3>彻底删除？</h3>" +
        '<div class="sub">' + U.esc(id) + " · 删除后无法还原</div>" +
        '<div class="rowline"><span class="k">类型</span><span class="v">' +
          (kind === "order" ? "订单" : "线索") + "</span></div>" +
        '<div class="btn-row mt14"><button class="btn ghost" id="pgNo">取消</button>' +
        '<button class="btn danger" id="pgYes">彻底删除</button></div>'
      );
      mask.addEventListener("click", function (e) {
        if (e.target.closest("#pgNo")) { U.closeSheet(); return; }
        var yes = e.target.closest("#pgYes");
        if (!yes || yes.disabled) return;
        yes.disabled = true;
        return D.purgeItem(kind, id).then(function () {
          U.closeSheet(); refresh(); U.toast("已彻底删除");
        }).catch(function (err) {
          yes.disabled = false;
          U.toast(err.message);
        });
      });
    }

    function mount() {
      document.getElementById("trList").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-act]");
        if (!b) return;
        var cardEl = b.closest(".trash-card");
        if (!cardEl) return;
        var id = cardEl.getAttribute("data-id");
        var kind = cardEl.getAttribute("data-kind");

        if (b.getAttribute("data-act") === "restore") {
          if (b.disabled) return;
          b.disabled = true;
          return D.restoreItem(kind, id).then(function () {
            refresh();
            U.toast("已还原 · " + id);
          }).catch(function (err) {
            b.disabled = false;
            U.toast(err.message);
          });
        }
        return askPurge(kind, id);
      });

      document.getElementById("trHelp").addEventListener("click", function () {
        U.sheet("<h3>回收站怎么用</h3>" +
          '<div class="sub">删掉的东西都在这儿，不会立刻消失</div>' +
          '<div class="rowline"><span class="k">怎么删</span><span class="v">待定池 / 订单里往左滑卡片</span></div>' +
          '<div class="rowline"><span class="k">已收款</span><span class="v">有收款记录的单不允许删除</span></div>' +
          '<div class="rowline"><span class="k">还原</span><span class="v">回到列表，原档期一并恢复</span></div>' +
          '<button class="btn primary mt14" onclick="UI.closeSheet()">知道了</button>');
      });
    }

    return { bar: bar, body: body, mount: mount, tab: "orders" };
  };
})(window);
