/* ==========================================================================
   我的资料 —— 昵称 + 头像
   · 只存在这台设备（localStorage: dingzhu.profile.v1），不上传任何地方
   · 头像图片在浏览器里居中裁成方图、压到 128×128 JPEG，约 8–12KB
   · 没有图片时用昵称前两字当头像，和原来「王队」的观感一致
   ========================================================================== */
(function (w) {
  "use strict";

  var KEY = "dingzhu.profile.v1";
  var DEFAULT = { name: "我的", avatar: "" };
  var MAX_NAME = 8;
  var MAX_DATAURL = 260 * 1024;   /* 压缩后正常在 15KB 内，超过说明不对，直接不收 */

  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function esc(s) { return w.UI ? w.UI.esc(s) : String(s); }

  function cleanName(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  }
  /* 只接受自己压出来的 dataURL；别的一律当作没有，避免把奇怪的东西塞进存储 */
  function cleanAvatar(v) {
    var s = String(v || "");
    if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return "";
    return s.length > MAX_DATAURL ? "" : s;
  }

  function get() {
    var restored = w.DATA && w.DATA.storedProfile && w.DATA.storedProfile();
    if (restored) return {name:cleanName(restored.name) || DEFAULT.name, avatar:cleanAvatar(restored.avatar)};
    var raw = null;
    try { raw = w.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return copy(DEFAULT);
    try {
      var o = JSON.parse(raw);
      return {
        name: cleanName(o && o.name) || DEFAULT.name,
        avatar: cleanAvatar(o && o.avatar)
      };
    } catch (e) { return copy(DEFAULT); }
  }

  function save(input) {
    var next = {
      name: cleanName(input && input.name) || DEFAULT.name,
      avatar: cleanAvatar(input && input.avatar)
    };
    if (w.DATA && w.DATA.saveProfile) return w.DATA.saveProfile(next);
    try {
      w.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      return Promise.reject(new Error("保存失败：本地存储不可用或空间不足"));
    }
    return Promise.resolve(next);
  }

  function reset() {
    if (w.DATA && w.DATA.saveProfile) return w.DATA.saveProfile(copy(DEFAULT));
    try { w.localStorage.removeItem(KEY); } catch (e) {}
    return Promise.resolve(copy(DEFAULT));
  }

  /* 头像 HTML：四处（档期 / 待定 / 订单 / 分析）共用同一个出口 */
  function html(size) {
    var p = get();
    var st = size ? ' style="width:' + size + 'px;height:' + size + 'px"' : "";
    if (p.avatar) {
      return '<div class="avatar has-img"' + st + '><img src="' + p.avatar + '" alt="' + esc(p.name) + '"></div>';
    }
    var short = p.name.slice(0, 2);
    return '<div class="avatar' + (short.length > 2 ? " long" : "") + '"' + st + '>' + esc(short) + "</div>";
  }

  /* 选一张图 → 居中裁方 → 128×128 JPEG */
  function pickImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || "")) return reject(new Error("请选择图片文件"));
      if (file.size > 8 * 1024 * 1024) return reject(new Error("图片太大，请选 8MB 以内的"));
      var fr = new w.FileReader();
      fr.onerror = function () { reject(new Error("读取图片失败")); };
      fr.onload = function () {
        var img = new w.Image();
        img.onerror = function () { reject(new Error("这张图片无法解析")); };
        img.onload = function () {
          try {
            var S = 128, c = w.document.createElement("canvas");
            c.width = S; c.height = S;
            var ctx = c.getContext("2d");
            var side = Math.min(img.width || S, img.height || S);
            var sx = ((img.width || S) - side) / 2, sy = ((img.height || S) - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
            resolve(c.toDataURL("image/jpeg", 0.82));
          } catch (e) { reject(new Error("处理图片失败")); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- 我的资料弹层 ----------
     精简版：只留头像（展示）+ 昵称 + 保存；队伍 / 回收站 / 地图 等收进右上角齿轮 */
  function sheet(opt) {
    opt = opt || {};
    var U = w.UI;
    var draft = get();

    function avaHtml() {
      if (draft.avatar) return '<div class="pf-ava has-img"><img src="' + draft.avatar + '" alt=""></div>';
      return '<div class="pf-ava">' + esc(draft.name.slice(0, 2)) + "</div>";
    }
    /* 头像 + 右下角相机角标：点角标换头像（不再占一整块版面） */
    function avaBox() {
      return '<div class="pf-avatarbox" id="pfAvaBox" role="button" tabindex="0" aria-label="更换头像">' +
        avaHtml() + '<span class="cam" id="pfCam">' + U.icon("camera", 13) + "</span></div>";
    }

    var mask = U.sheet(
      '<div class="pf-top">' +
        "<h3>我的资料</h3>" +
        '<button class="pf-gear" id="pfGear" type="button" aria-label="设置">' + U.icon("gear", 18) + "</button>" +
      "</div>" +
      '<div class="pf-ava-wrap">' + avaBox() + "</div>" +
      '<div class="field">' +
        '<label>昵称</label>' +
        '<input class="field-box" id="pfName" type="text" maxlength="' + MAX_NAME + '" ' +
          'value="' + esc(draft.name) + '" autocomplete="off">' +
      "</div>" +
      '<button class="btn primary mt14" id="pfSave">保存</button>' +
      '<input type="file" id="pfFile" accept="image/*" style="display:none">'
    );

    var fileEl = document.getElementById("pfFile");

    document.getElementById("pfAvaBox").addEventListener("click", function () { fileEl.click(); });

    fileEl.addEventListener("change", function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      pickImage(f).then(function (url) {
        draft.avatar = url;
        document.getElementById("pfAvaBox").innerHTML =
          avaHtml() + '<span class="cam" id="pfCam">' + U.icon("camera", 13) + "</span>";
        U.toast("头像已就绪，点保存生效");
      }).catch(function (err) { U.toast(err.message); });
    });

    document.getElementById("pfSave").addEventListener("click", function () {
      var nameEl = document.getElementById("pfName");
      draft.name = nameEl ? nameEl.value : draft.name;
      if (!cleanName(draft.name)) { U.toast("昵称不能为空"); return; }
      return save(draft).then(function (saved) {
        U.closeSheet();
        if (w.APP && w.APP.render) w.APP.render();
        U.toast("已保存 · " + saved.name);
      }).catch(function (err) { U.toast(err.message); });
    });

    document.getElementById("pfGear").addEventListener("click", function () {
      if (!opt.onMore) return;
      U.closeSheet();
      opt.onMore();
    });

    return mask;
  }

  w.PROFILE = {
    get: get,
    save: save,
    reset: reset,
    html: html,
    pickImage: pickImage,
    sheet: sheet,
    MAX_NAME: MAX_NAME,
    DEFAULT: DEFAULT
  };
})(window);
