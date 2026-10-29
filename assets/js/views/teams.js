/* ==========================================================================
   队伍配置（人员组成 + 建队，设一次长期用）
   · 队伍与成员的增删改都走 D.addTeam / D.updateTeam / D.removeTeam，写本地存储
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  var ROLES = ["队长", "大工", "小工"];

  function memberRow(t, m, i) {
    return (
      '<div class="m-row" data-t="' + t.id + '" data-i="' + i + '">' +
        '<span class="m-name">' + U.esc(m.name) + "</span>" +
        '<span class="m-role' + (m.role === "队长" ? " lead" : "") + '">' + U.esc(m.role) + "</span>" +
        '<span class="m-tel">' + U.esc(m.phone) + "</span>" +
        '<button class="m-del" data-del="' + t.id + '" data-i="' + i + '" aria-label="移除">' +
          U.icon("x", 13) + "</button>" +
      "</div>"
    );
  }

  function teamCard(t) {
    var lead = t.members.filter(function (m) { return m.role === "队长"; })[0];
    var used = D.teamUsage(t.id);
    return (
      '<section class="card team-card mt12">' +
        '<div class="tc-head">' +
          '<div class="tc-badge" style="background:' + U.esc(t.color) + '">' + U.esc(t.name) + "</div>" +
          '<div class="col">' +
            '<div class="tc-name">' + U.esc(t.alias) + "</div>" +
            '<div class="tc-sub">' + (lead ? "队长 " + U.esc(lead.name) : "未指定队长") +
              " · " + t.members.length + " 人" +
              (used ? " · 在 " + used + " 单上" : "") + "</div>" +
          "</div>" +
          '<button class="btn xs tint" data-add="' + t.id + '">' + U.icon("plus", 11) + "成员</button>" +
          '<button class="tc-edit" data-edit="' + t.id + '" aria-label="编辑 ' + U.esc(t.name) + '">' +
            U.icon("edit", 14) + "</button>" +
        "</div>" +
        (t.members.length
          ? '<div class="tc-members">' +
              t.members.map(function (m, i) { return memberRow(t, m, i); }).join("") +
            "</div>"
          : '<div class="tc-members"><div class="tc-empty">还没有成员，点右上「+ 成员」加人</div></div>') +
      "</section>"
    );
  }

  /* 队色选择板 */
  function colorsHtml(cur) {
    var list = (w.DATA.TEAM_COLORS || []).slice();
    if (cur && list.indexOf(cur) < 0) list.push(cur);
    return list.map(function (c) {
      return '<button type="button" class="cp-dot' + (c === cur ? " on" : "") + '"' +
        ' data-c="' + U.esc(c) + '" style="background:' + U.esc(c) + '" aria-label="队色 ' + U.esc(c) + '">' +
        (c === cur ? U.icon("check", 11) : "") + "</button>";
    }).join("");
  }

  function bindColors(mask) {
    mask.addEventListener("click", function (e) {
      var d = e.target.closest("[data-c]");
      if (!d) return;
      var box = d.parentElement;
      [].forEach.call(box.children, function (c) {
        c.classList.toggle("on", c === d);
        c.innerHTML = c === d ? U.icon("check", 11) : "";
      });
    });
  }
  function pickedColor() {
    var on = document.querySelector("#tmColors .cp-dot.on");
    return on ? on.getAttribute("data-c") : (w.DATA.TEAM_COLORS || ["#0066FF"])[0];
  }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.teams = function () {
    var bar =
      '<div class="navline">' +
        '<a class="back" href="#/analytics" aria-label="返回">' + U.icon("arrowLeft", 18) + "</a>" +
        '<div class="col navline-mid"><div class="navline-title">队伍配置</div>' +
        '<div class="navline-sub">建队与人员 · 设一次长期用</div></div>' +
        '<button class="nav-add" id="btnNewTeam" type="button">' + U.icon("plus", 13) + "建队</button>" +
      "</div>";

    var body =
      '<div class="tip-strip mt10">' + U.icon("info", 13) +
        "<span>排期时从这里选队，可选一支，也可两三支一起上；队色会用在班组对垒和队徽上。</span></div>" +
      D.TEAMS.map(teamCard).join("") +
      '<button class="add-team" id="btnNewTeam2" type="button">' + U.icon("plus", 14) + "添加队伍</button>" +
      '<div class="t-xs mut tc mt14" style="line-height:1.6">成员只是名单，不涉及账号权限；删除队伍前会先查有没有单挂在它下面</div>' +
      '<div style="height:10px"></div>';

    /* ---------- 建队 ---------- */
    function newTeamSheet() {
      var mask = U.sheet(
        "<h3>添加队伍</h3>" +
        '<div class="sub">建好就能在排期里选，颜色用于班组对垒条与队徽</div>' +
        '<div class="form-group"><div class="form-label">队名</div>' +
          '<input class="inline-input" id="tmName" maxlength="8" value="' + U.esc(D.nextTeamName()) + '"></div>' +
        '<div class="form-group"><div class="form-label">别称 / 班号<em>选填</em></div>' +
          '<input class="inline-input" id="tmAlias" maxlength="12" placeholder="如 老王班"></div>' +
        '<div class="form-group"><div class="form-label">队色</div>' +
          '<div class="colorpick" id="tmColors">' + colorsHtml((w.DATA.TEAM_COLORS || [])[0]) + "</div></div>" +
        '<div class="form-group"><div class="form-label">队长<em>选填，也可稍后在队里加</em></div>' +
          '<div class="fx g8"><input class="inline-input" id="tmLead" placeholder="姓名" style="flex:1.2">' +
          '<input class="inline-input" id="tmLeadTel" type="tel" placeholder="电话" style="flex:1"></div></div>' +
        '<button class="btn primary mt14" id="tmOk">建队</button>'
      );

      bindColors(mask);
      mask.addEventListener("click", function (e) {
        if (e.target.id !== "tmOk") return;
        var btn = e.target;
        var lead = (document.getElementById("tmLead").value || "").trim();
        var tel = (document.getElementById("tmLeadTel").value || "").trim();
        var members = lead ? [{ name: lead, phone: tel || "—", role: "队长" }] : [];
        btn.disabled = true;
        return D.addTeam({
          name: document.getElementById("tmName").value,
          alias: document.getElementById("tmAlias").value,
          color: pickedColor(),
          members: members
        }).then(function (t) {
          U.closeSheet();
          U.toast("已建「" + t.name + "」" + (t.alias ? " · " + t.alias : ""));
          w.APP.render();
        }).catch(function (err) {
          btn.disabled = false;
          U.toast(err.message);
        });
      });
    }

    /* ---------- 改队 / 删队 ---------- */
    function editTeamSheet(id) {
      var t = D.teamById(id);
      if (!t) { U.toast("这支队伍不存在"); return; }
      var used = D.teamUsage(id);
      var mask = U.sheet(
        "<h3>编辑队伍</h3>" +
        '<div class="sub">' + U.esc(t.name) + (used ? " · 在 " + used + " 单上" : " · 暂无在做的单") + "</div>" +
        '<div class="form-group"><div class="form-label">队名</div>' +
          '<input class="inline-input" id="tmName" maxlength="8" value="' + U.esc(t.name) + '"></div>' +
        '<div class="form-group"><div class="form-label">别称 / 班号</div>' +
          '<input class="inline-input" id="tmAlias" maxlength="12" value="' + U.esc(t.alias) + '"></div>' +
        '<div class="form-group"><div class="form-label">队色</div>' +
          '<div class="colorpick" id="tmColors">' + colorsHtml(t.color) + "</div></div>" +
        '<button class="btn primary mt14" id="tmSave">保存</button>' +
        '<button class="btn danger mt10" id="tmDel">删除这支队伍</button>' +
        (used ? '<div class="t-xs mut tc mt8">这支队伍在 ' + used + " 单上，删之前需要先把这些单改到别的队</div>" : "")
      );

      bindColors(mask);
      var delArmed = false;
      mask.addEventListener("click", function (e) {
        if (e.target.id === "tmSave") {
          var btn = e.target;
          btn.disabled = true;
          return D.updateTeam(id, {
            name: document.getElementById("tmName").value,
            alias: document.getElementById("tmAlias").value,
            color: pickedColor()
          }).then(function (t2) {
            U.closeSheet();
            U.toast("已保存 · " + t2.name);
            w.APP.render();
          }).catch(function (err) {
            btn.disabled = false;
            U.toast(err.message);
          });
        }
        if (e.target.id === "tmDel") {
          /* 删队没有回收站，先让按钮变成确认态，再点一次才真删 */
          if (!delArmed) {
            delArmed = true;
            e.target.textContent = "再点一次，确认删除「" + t.name + "」";
            e.target.classList.add("armed");
            return;
          }
          e.target.disabled = true;
          return D.removeTeam(id).then(function () {
            U.closeSheet();
            U.toast("已删除「" + t.name + "」");
            w.APP.render();
          }).catch(function (err) {
            delArmed = false;
            e.target.disabled = false;
            e.target.textContent = "删除这支队伍";
            e.target.classList.remove("armed");
            U.toast(err.message);
          });
        }
      });
    }

    /* ---------- 加成员 ---------- */
    function memberSheet(teamId) {
      var t = D.teamById(teamId);
      var mask = U.sheet(
        "<h3>添加成员</h3>" +
        '<div class="sub">加入「' + U.esc(t.alias) + "」· " + U.esc(t.name) + "</div>" +
        '<div class="fx g8"><input class="inline-input" id="mName" placeholder="姓名" style="flex:1.2">' +
        '<input class="inline-input" id="mTel" type="tel" placeholder="电话" style="flex:1"></div>' +
        '<div class="tri mt12" id="roleTri">' +
          ROLES.map(function (r, i) {
            return '<button class="' + (i === 1 ? "on" : "") + '" data-r="' + r + '">' + r + "</button>";
          }).join("") +
        "</div>" +
        '<button class="btn primary mt14" id="mOk">确认添加</button>'
      );

      mask.addEventListener("click", function (e) {
        var r = e.target.closest("[data-r]");
        if (r) {
          [].forEach.call(document.getElementById("roleTri").children, function (c) {
            c.classList.toggle("on", c === r);
          });
          return;
        }
        if (e.target.id === "mOk") {
          var btn = e.target;
          var name = document.getElementById("mName").value.trim();
          var tel = document.getElementById("mTel").value.trim();
          if (!name) { U.toast("先填姓名"); return; }
          var role = document.querySelector("#roleTri .on").getAttribute("data-r");
          var cur = D.teamById(teamId);
          /* 一队只能有一个队长：加第二个队长时把原来的降为大工 */
          var list = cur.members.map(function (m) {
            return m.role === "队长" && role === "队长" ? { name: m.name, phone: m.phone, role: "大工" } : m;
          });
          list.push({ name: name, phone: tel || "—", role: role });
          btn.disabled = true;
          return D.updateTeam(teamId, { members: list }).then(function () {
            U.closeSheet();
            U.toast("已加入「" + name + "」");
            w.APP.render();
          }).catch(function (err) {
            btn.disabled = false;
            U.toast(err.message);
          });
        }
      });
    }

    function mount() {
      /* 顶部「建队」在 appbar 里，不在 #screen 的事件范围内，单独绑一次 */
      var topBtn = document.getElementById("btnNewTeam");
      if (topBtn) topBtn.addEventListener("click", newTeamSheet);

      var root = document.getElementById("screen");
      root.addEventListener("click", function (e) {
        if (e.target.closest("#btnNewTeam2")) { newTeamSheet(); return; }
        var add = e.target.closest("[data-add]");
        if (add) { memberSheet(add.getAttribute("data-add")); return; }

        var ed = e.target.closest("[data-edit]");
        if (ed) { editTeamSheet(ed.getAttribute("data-edit")); return; }

        var del = e.target.closest("[data-del]");
        if (del) {
          var t = D.teamById(del.getAttribute("data-del"));
          var i = parseInt(del.getAttribute("data-i"), 10);
          var m = t.members[i];
          if (m.role === "队长") { U.toast("队长不能直接移除，先把别人设为队长"); return; }
          var list = t.members.filter(function (_, k) { return k !== i; });
          return D.updateTeam(t.id, { members: list }).then(function () {
            U.toast("已移除 " + m.name);
            w.APP.render();
          }).catch(function (err) { U.toast(err.message); });
        }
      });
    }

    return { bar: bar, body: body, mount: mount, tab: "" };
  };
})(window);
