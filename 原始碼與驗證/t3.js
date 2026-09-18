
/* ==========================================================================
   狀態與儲存
   ・DATA：目錄結構（園區 → 分類 → 設施），normalizeData 過的
   ・SEL ：目前選到哪一筆 {t:"play"|"group", li, gi, pi}；**不進 localStorage**，
           所以每次打開右邊都是待命畫面（2026-09-10 團隊要求：一打開不列結果）
   ・OPEN：目錄哪幾層是展開的，用名稱當 key（換資料後還對得上）
   ★ 畫面上的 data-* 一律放「索引」而不是 key ——
     t2.js 的 key 用  當分隔字元，塞進 HTML 屬性不保險。
   ========================================================================== */
var K_DATA = "rulesq.data.v1", K_UI = "rulesq.ui.v1";
var DATA = null, Q = "", QB = "", SEL = null, OPEN = {};
var FLAT = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

function lotKey(lot) { return "L" + lot.n; }
function reindex() { FLAT = flatPlays(DATA); }
function allPlays() { if (!FLAT) reindex(); return FLAT; }

/* 索引 → 那一筆設施（形狀跟 flatPlays 出來的一樣） */
function fAt(li, gi, pi) {
  var l = DATA.lots[li]; if (!l) return null;
  var g = l.groups[gi]; if (!g) return null;
  var p = g.plays[pi]; if (!p) return null;
  return { lot: l.n, k: g.k, cat: g.n, sub: p.sub, name: p.n,
           rule: p.rule, ex: p.ex, note: p.note,
           li: li, gi: gi, pi: pi, group: g, play: p };
}
function gAt(li, gi) {
  var l = DATA.lots[li]; if (!l) return null;
  var g = l.groups[gi]; if (!g) return null;
  return { lot: l, g: g };
}
function selFAt() { return SEL && SEL.t === "play" ? fAt(SEL.li, SEL.gi, SEL.pi) : null; }
function selGAt() { return SEL && SEL.t === "group" ? gAt(SEL.li, SEL.gi) : null; }
function isSelPlay(li, gi, pi) {
  return !!SEL && SEL.t === "play" && SEL.li === li && SEL.gi === gi && SEL.pi === pi;
}
function isSelGroup(li, gi) {
  return !!SEL && SEL.t === "group" && SEL.li === li && SEL.gi === gi;
}

function loadAll() {
  var raw = lsGet(K_DATA), d = null;
  if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } }
  var src = "builtin";
  if (d && d.lots && d.lots.length) src = d.src || "paste";
  else d = BUILTIN || {};
  DATA = normalizeData(d);
  DATA.src = src;
  try {
    var u = JSON.parse(lsGet(K_UI) || "{}");
    OPEN = (u && u.open && typeof u.open === "object") ? u.open : {};
  } catch (e) { OPEN = {}; }
  SEL = null;
  reindex();
}
function saveUI() { lsSet(K_UI, JSON.stringify({ open: OPEN })); }
function saveData() {
  if (!lsSet(K_DATA, JSON.stringify({ at: DATA.at, src: DATA.src, lots: DATA.lots })))
    toast("瀏覽器儲存空間不足，這份資料只在這個分頁有效");
}

/* ==========================================================================
   搜尋
   ========================================================================== */
function results() {
  if (!QB) return [];
  var out = [];
  allPlays().forEach(function (f) {
    var s = scoreOf(f, QB);
    if (s >= 0) out.push({ f: f, s: s });
  });
  out.sort(function (a, b) {
    return b.s - a.s || a.f.li - b.f.li || a.f.gi - b.f.gi || a.f.pi - b.f.pi;
  });
  return out;
}

/* ==========================================================================
   左側目錄
   ========================================================================== */
function tocTreeHtml() {
  var h = "";
  DATA.lots.forEach(function (lot, li) {
    var lk = lotKey(lot), on = !!OPEN[lk], n = 0;
    lot.groups.forEach(function (g) { n += g.plays.length; });
    h += '<div class="lot">';
    h += '<button class="lotHd" data-lot="' + li + '"><span class="tw">' + (on ? "▾" : "▸") +
         '</span><span class="nm">' + esc(lot.n) + '</span><span class="ct">' + n + "</span></button>";
    if (on) {
      lot.groups.forEach(function (g, gi) {
        if (!g.n) { h += playsHtml(li, gi, g, true); return; }
        var gon = !!OPEN[groupKey(lot, g)];
        h += '<button class="grpHd' + (isSelGroup(li, gi) ? " on" : "") + '" data-grp="' + li + "." + gi +
             '"><span class="tw">' + (gon ? "▾" : "▸") + '</span><span class="nm">' + esc(g.n) + "</span>" +
             (g.k ? '<span class="kk">' + esc(g.k) + "</span>" : "") +
             '<span class="ct">' + g.plays.length + "</span></button>";
        if (gon) h += playsHtml(li, gi, g, false);
      });
    }
    h += "</div>";
  });
  return h;
}
function playsHtml(li, gi, g, noSub) {
  var h = "", lastSub = null;
  g.plays.forEach(function (p, pi) {
    if (!noSub && p.sub && p.sub !== lastSub) h += '<div class="subHd">' + esc(p.sub) + "</div>";
    if (!noSub) lastSub = p.sub;
    h += '<button class="play' + (isSelPlay(li, gi, pi) ? " on" : "") +
         '" data-play="' + li + "." + gi + "." + pi + '"><span class="nm">' + esc(p.n) + "</span>" +
         (noSub && g.k ? '<span class="kk">' + esc(g.k) + "</span>" : "") + "</button>";
  });
  return h;
}
function tocSearchHtml(list) {
  if (!list.length) {
    return '<div class="tocMsg">找不到「<b>' + esc(Q) + "</b>」。<br>" +
           "換個詞試試，打繁體也找得到簡體資料。<br>規則內文裡的字也搜得到，例如「身高限制」。</div>";
  }
  var h = "", lastLot = null;
  list.forEach(function (x) {
    var f = x.f;
    if (f.lot !== lastLot) { h += '<div class="resHd">' + esc(f.lot) + "</div>"; lastLot = f.lot; }
    var sub = [f.cat, f.sub].filter(Boolean).join(" › ");
    h += '<button class="res' + (isSelPlay(f.li, f.gi, f.pi) ? " on" : "") +
         '" data-play="' + f.li + "." + f.gi + "." + f.pi + '"><span class="nm">' + hilite(f.name, QB) + "</span>" +
         (f.k ? '<span class="kk">' + esc(f.k) + "</span>" : "") +
         (sub ? '<span class="pt">' + hilite(sub, QB) + "</span>" : "") + "</button>";
  });
  return h;
}
function renderToc() {
  $("#tree").innerHTML = QB ? tocSearchHtml(results()) : tocTreeHtml();
  renderFoot();
}
function renderFoot() {
  /* 團隊 2026-09-11：底下那幾行說明文字拿掉，只留兩顆按鈕 */
  $("#foot").innerHTML =
    '<div class="fb"><button id="btnReset">↩ 回復成內建資料</button>' +
    '<button id="btnWipe">🧹 清除這台裝置存的資料</button></div>';
}

/* ==========================================================================
   右側內文
   ========================================================================== */
function secHtml(title, text, cls, none) {
  if (!text && !none) return "";
  return '<section class="sec"><h2>' + esc(title) + "</h2>" +
         '<div class="tx ' + (text ? cls : "none") + '">' +
         (text ? hilite(text, QB) : esc(none)) + "</div></section>";
}
function detailPlayHtml(f) {
  var g = f.group;
  var crumb = [f.lot, f.cat, f.sub].filter(Boolean)
    .map(function (x) { return esc(x); }).join("<i>›</i>");
  var h = '<article class="doc">';
  h += '<div class="crumb">' + crumb + "</div>";
  if (f.k) h += '<div class="dTop"><span class="dk">' + esc(f.k) + "設施</span></div>";
  h += '<h1 class="dt">' + hilite(f.name, QB) + '</h1><div class="rule"></div>';
  if (g && g.desc) h += secHtml("分類總說明", g.desc, "desc", "");
  h += secHtml("遊玩規則", f.rule, "", "原表在這一筆沒有寫規則說明。");
  h += secHtml("遊玩範例", f.ex || (!f.rule && g ? g.ex : ""), "ex", "原表在這一筆沒有附遊玩範例。");
  h += secHtml("注意事項", f.note || (g ? g.note : ""), "note", "");
  h += '<div class="acts"><button class="btn pri" id="btnCopy">📋 複製說明文字</button>' +
       '<button class="btn" id="btnCopyRule">只複製遊玩規則</button></div>';
  return h + "</article>";
}
function detailGroupHtml(li, gi, lot, g) {
  var h = '<article class="doc">';
  h += '<div class="crumb">' + esc(lot.n) + "</div>";
  if (g.k) h += '<div class="dTop"><span class="dk">' + esc(g.k) + "設施</span></div>";
  h += '<h1 class="dt">' + hilite(g.n, QB) + '</h1><div class="rule"></div>';
  h += secHtml("總說明", g.desc, "desc", "這個分類沒有共用的總說明，直接看底下的設施。");
  h += secHtml("遊玩範例", g.ex, "ex", "");
  h += secHtml("注意事項", g.note, "note", "");
  if (g.plays.length) {
    h += '<section class="sec"><h2>底下的設施</h2><div class="ent">';
    g.plays.forEach(function (p, pi) {
      h += '<button data-play="' + li + "." + gi + "." + pi + '"><span class="en">' + esc(p.n) + "</span>" +
           (p.sub ? '<span class="ec">' + esc(p.sub) + "</span>" : "") + "</button>";
    });
    h += "</div></section>";
  }
  h += '<div class="acts"><button class="btn pri" id="btnCopy">📋 複製說明文字</button></div>';
  return h + "</article>";
}
function idleHtml() {
  var h = '<div class="idle">';
  if (QB) {
    h += "<h1>找到 " + results().length + " 筆</h1>" +
         '<div class="lead">左邊是「<b>' + esc(Q) + "</b>」的搜尋結果，點一筆看遊玩規則與遊玩範例。</div>";
  } else {
    h += "<h1>選一個園區，或直接搜設施名稱</h1>" +
         '<div class="lead">左邊是目錄：<b>園區 → 分類 → 設施</b>，一層一層點開。' +
         "急的話直接在上面的搜尋框打設施名稱，<b>打繁體也找得到簡體資料</b>。</div>";
  }
  h += '<div class="rule"></div><div class="ent">';
  DATA.lots.forEach(function (lot, li) {
    var c = 0, gs = 0;
    lot.groups.forEach(function (g) { c += g.plays.length; if (g.n) gs++; });
    h += '<button data-lotgo="' + li + '"><span class="en">' + esc(lot.n) + "</span>" +
         '<span class="ec">' + c + " 種設施" + (gs ? "・" + gs + " 個分類" : "") + "</span></button>";
  });
  h += "</div>";
  h += '<div class="tip"><b>怎麼用</b>：點到設施後，右邊會列出<b>遊玩規則</b>與<b>遊玩範例</b>，' +
       '按「📋 複製說明文字」就能整段貼給遊客（只有設施名稱、規則、範例，沒有內部欄位）。<br>' +
       "<b>有新的設施</b>：按右上角「➕ 新增」手動輸入。目前收錄 <code>" +
       countPlays(DATA) + "</code> 筆設施、<code>" + DATA.lots.length + "</code> 個園區。</div>";
  return h + "</div>";
}
function renderDetail() {
  var h = '<button class="back" id="back">‹ 目錄</button>', f = selFAt(), o = selGAt();
  if (f) h += detailPlayHtml(f);
  else if (o) h += detailGroupHtml(SEL.li, SEL.gi, o.lot, o.g);
  else h += idleHtml();
  $("#detail").innerHTML = h;
  var d = $("#detail");
  if (d && typeof d.scrollTop === "number") d.scrollTop = 0;
}
function showDetail(on) {
  try {
    if (on) document.body.classList.add("dv");
    else document.body.classList.remove("dv");
  } catch (e) {}
}

/* ---------- 選取 ---------- */
function parseIdx(s) {
  return String(s || "").split(".").map(function (x) { return parseInt(x, 10); });
}
function selectPlay(li, gi, pi) {
  var f = fAt(li, gi, pi);
  if (!f) return;
  SEL = { t: "play", li: li, gi: gi, pi: pi };
  OPEN[lotKey(DATA.lots[li])] = true;
  if (f.cat) OPEN[groupKey(DATA.lots[li], f.group)] = true;
  saveUI();
  renderToc(); renderDetail(); showDetail(true);
}
function selectGroup(li, gi) {
  var o = gAt(li, gi);
  if (!o) return;
  SEL = { t: "group", li: li, gi: gi };
  var gk = groupKey(o.lot, o.g);
  OPEN[gk] = !OPEN[gk];
  OPEN[lotKey(o.lot)] = true;
  saveUI();
  renderToc(); renderDetail(); showDetail(true);
}
function toggleLot(li) {
  var lot = DATA.lots[li];
  if (!lot) return;
  var lk = lotKey(lot);
  OPEN[lk] = !OPEN[lk];
  saveUI(); renderToc();
}

/* ==========================================================================
   複製給遊客
   ========================================================================== */
function copyText(txt, okMsg) {
  function fallback() {
    var ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toast(ok ? okMsg : "這個瀏覽器不給自動複製，請手動選取");
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () { toast(okMsg); }, fallback);
  } else fallback();
}
/* 這一筆自己沒寫規則時，用所屬分類的總說明補上，免得複製出去只剩一個標題 */
function copyTarget() {
  var f = selFAt(), o = selGAt();
  if (f) {
    var g = f.group;
    return { lot: f.lot, cat: f.cat, sub: f.sub, name: f.name,
             rule: f.rule || (g ? g.desc : ""),
             ex: f.ex || (!f.rule && g ? g.ex : ""),
             note: f.note || (g ? g.note : "") };
  }
  if (o) {
    return { lot: o.lot.n, cat: "", sub: "", name: o.g.n,
             rule: o.g.desc || "", ex: o.g.ex || "", note: o.g.note || "" };
  }
  return null;
}

/* ==========================================================================
   彈窗
   ========================================================================== */
function closeModal() { $("#modal").innerHTML = ""; }
function openModal(title, body, foot) {
  $("#modal").innerHTML =
    '<div class="mask" id="mask"><div class="modal">' +
    '<div class="mHd"><h2>' + title + '</h2><button class="x" id="mx">×</button></div>' +
    '<div class="mBd">' + body + "</div>" +
    (foot ? '<div class="mFt">' + foot + "</div>" : "") +
    "</div></div>";
  $("#mx").onclick = closeModal;
  $("#mask").onclick = function (e) { if (e.target.id === "mask") closeModal(); };
}

/* ---------- 匯出 ---------- */
function openExport() {
  var opts = '<option value="*">全部園區</option>';
  DATA.lots.forEach(function (l) { opts += '<option value="' + esc(l.n) + '">' + esc(l.n) + "</option>"; });
  var body =
    '<div class="hint"><p>產生 Tab 分隔的文字，複製後在試算表點第一格 <code>Ctrl+V</code> 就會落到各欄。' +
    "第一列是標題（園區／設施類型／設施分類／子分類／設施名稱／規則說明／遊玩範例／備註），" +
    "拿去<b>備份</b>或<b>給團隊更新原表</b>都可以。</p></div>" +
    '<div class="rowLabel">要匯出哪些</div><select class="sel" id="xLot">' + opts + "</select>" +
    '<textarea class="big2" id="xOut" readonly style="margin-top:10px;min-height:210px"></textarea>' +
    '<div class="prev" id="xInfo"></div>';
  openModal("⬇ 匯出 Tab 文字", body,
    '<button class="btn" id="xClose">關閉</button><button class="btn pri" id="xCopy">複製全部</button>');
  $("#xClose").onclick = closeModal;
  function refresh() {
    var v = $("#xLot").value, d = DATA;
    if (v && v !== "*") d = { at: DATA.at, lots: DATA.lots.filter(function (l) { return l.n === v; }) };
    var r = exportTsv(d);
    $("#xOut").value = r.text;
    $("#xInfo").textContent = "共 " + r.n + " 筆設施" +
      (v === "*" ? "、" + DATA.lots.length + " 個園區" : "") + "。" +
      (r.desc ? "另有 " + r.desc + " 列是分類的總說明（分類欄留空、名稱欄寫分類名）。" : "");
  }
  $("#xLot").onchange = refresh;
  refresh();
  $("#xCopy").onclick = function () { copyText($("#xOut").value, "已複製，可以貼進試算表了"); };
}

/* ---------- 新增設施（手動輸入）----------
   團隊 2026-09-11：「貼上／更新資料」整個移除，之後有新設施用這個表單手動輸入。
   （t2.js 裡的表格解析函式沒動——建置端 tbuild.js 還借用 parseRuleGrid 讀原始 Excel。） */
function stamp() {
  var p = function (n) { return (n < 10 ? "0" : "") + n; }, d = new Date();
  return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " +
         p(d.getHours()) + ":" + p(d.getMinutes());
}
/* 找（或建）園區 → 找（或建）同類型＋同分類的群組 → 放進去。
   同群組已有同名＋同子分類的 → 問過才蓋掉。回傳新設施的位置讓畫面跳過去。 */
function addPlay(p) {
  var lot = null;
  DATA.lots.forEach(function (l) { if (l.n === p.lot) lot = l; });
  if (!lot) { lot = { n: p.lot, groups: [] }; DATA.lots.push(lot); }
  var g = null;
  lot.groups.forEach(function (x) { if (!g && x.n === (p.cat || "") && x.k === (p.k || "")) g = x; });
  if (!g) {
    g = { n: p.cat || "", k: p.k || "", desc: "", ex: "", note: "", plays: [] };
    /* 一般設施的群組插在快速通關前面，跟內建資料的排法一致 */
    var at = lot.groups.length, i;
    if (!g.k) { for (i = 0; i < lot.groups.length; i++) { if (lot.groups[i].k) { at = i; break; } } }
    lot.groups.splice(at, 0, g);
  }
  var dup = null;
  g.plays.forEach(function (o) { if (!dup && o.n === p.name && o.sub === (p.sub || "")) dup = o; });
  if (dup) {
    if (!confirm("已經有「" + p.name + "」這筆設施了，要蓋掉原本的內容嗎？")) return null;
    dup.rule = p.rule || ""; dup.ex = p.ex || ""; dup.note = p.note || "";
  } else {
    g.plays.push({ n: p.name, sub: p.sub || "", rule: p.rule || "", ex: p.ex || "", note: p.note || "" });
  }
  DATA.at = stamp() + " 新增";
  DATA.src = "edited";
  reindex();
  saveData();
  var li = DATA.lots.indexOf(lot), gi = lot.groups.indexOf(g), pi = -1;
  g.plays.forEach(function (o, i2) { if (pi < 0 && o.n === p.name && o.sub === (p.sub || "")) pi = i2; });
  return { li: li, gi: gi, pi: pi };
}
function openAdd() {
  var opts = "";
  DATA.lots.forEach(function (l) { opts += '<option value="' + esc(l.n) + '">' + esc(l.n) + "</option>"; });
  opts += '<option value="__new">＋ 新增一個園區…</option>';
  var body =
    '<div class="hint">填好按「儲存」就會加進左邊的目錄，資料只存在這台裝置的瀏覽器。' +
    "名稱跟現有設施一樣時會先問你要不要蓋掉（＝可以拿來改內容）。</div>" +
    '<div class="rowLabel">園區（必填）</div>' +
    '<select class="sel" id="aLot">' + opts + "</select>" +
    '<input id="aLotNew" class="sel" style="display:none;margin-top:8px" placeholder="新園區的名稱">' +
    '<div class="rowLabel">設施類型</div>' +
    '<select class="sel" id="aKind"><option value="">一般設施</option><option value="快速通關">快速通關</option></select>' +
    '<div class="rowLabel">設施分類（可留空，例如：雲霄飛車、旋轉類）</div>' +
    '<input id="aCat" class="sel" style="width:100%">' +
    '<div class="rowLabel">子分類（可留空，例如：室內雲霄飛車）</div>' +
    '<input id="aSub" class="sel" style="width:100%">' +
    '<div class="rowLabel">設施名稱（必填）</div>' +
    '<input id="aName" class="sel" style="width:100%">' +
    '<div class="rowLabel">遊玩規則（必填）</div>' +
    '<textarea class="big2" id="aRule" style="min-height:110px"></textarea>' +
    '<div class="rowLabel">遊玩範例（可留空）</div>' +
    '<textarea class="big2" id="aEx" style="min-height:70px" placeholder="遊玩範例：…"></textarea>' +
    '<div class="rowLabel">注意事項（可留空）</div>' +
    '<textarea class="big2" id="aNote" style="min-height:54px"></textarea>';
  openModal("➕ 新增設施", body,
    '<button class="btn" id="aCancel">取消</button><button class="btn pri" id="aOk">儲存</button>');
  $("#aLot").onchange = function () { $("#aLotNew").style.display = this.value === "__new" ? "" : "none"; };
  $("#aCancel").onclick = closeModal;
  $("#aOk").onclick = function () {
    var lotName = $("#aLot").value === "__new" ? labelClean($("#aLotNew").value) : $("#aLot").value;
    var name = labelClean($("#aName").value);
    var rule = cellClean($("#aRule").value);
    if (!lotName) { toast("請選（或輸入）園區"); return; }
    if (!name) { toast("請輸入設施名稱"); return; }
    if (!rule) { toast("請輸入遊玩規則"); return; }
    var res = addPlay({ lot: lotName, k: $("#aKind").value, cat: labelClean($("#aCat").value),
                        sub: labelClean($("#aSub").value), name: name, rule: rule,
                        ex: cellClean($("#aEx").value), note: cellClean($("#aNote").value) });
    if (!res) return;
    closeModal();
    Q = ""; QB = "";
    var qi = $("#q"); if (qi) qi.value = "";
    $("#qClr").style.display = "none";
    selectPlay(res.li, res.gi, res.pi);
    toast("已新增「" + name + "」");
  };
}

/* ---------- 使用說明 ---------- */
function openHelp() {
  var body =
    '<div class="hint">' +
    "<p><b>怎麼查</b><br>左邊目錄是<b>園區 → 分類 → 設施</b>三層，一層一層點開；" +
    "急的話直接在上面搜尋框打設施名稱。<b>打繁體找得到簡體資料</b>（打「室內」找得到「室內」），" +
    "規則內文裡的字也搜得到。鍵盤按 <code>/</code> 可以直接跳到搜尋框。</p>" +
    "<p><b>點分類標題會怎樣</b><br>有些分類本身有一段總說明（例如 水上樂園的「泳裝規定」先講一次規則，" +
    "底下再分第1～5名／第6～10名）。點分類標題就會在右邊顯示那段總說明。</p>" +
    "<p><b>複製說明文字</b><br>輸出格式是這樣，可以直接貼給遊客：</p>" +
    '<table class="doc2"><tr><td><b>【園區－分類 設施名稱】</b><br>遊玩規則：…<br>遊玩範例：…<br>注意事項：…</td></tr></table>' +
    "<p>只有設施名稱、規則、範例、注意事項，<b>沒有任何內部欄位</b>。" +
    "如果那一筆自己沒寫規則，會自動補上所屬分類的總說明，不會複製出一個空標題。</p>" +
    "<p><b>「快速通關」標籤</b><br>原表的快速通關本來是另一個分頁，這裡併在同一個園區底下，" +
    "用金色的「快速通關」標籤區分，別跟一般設施搞混。</p>" +
    "<p><b>新增設施</b><br>按右上角「➕ 新增」：選園區（或建新園區）、填設施名稱與遊玩規則，" +
    "分類／子分類／範例／注意可以留空，儲存後馬上出現在目錄裡。" +
    "<b>名稱跟現有設施一樣時會先問你要不要蓋掉</b>，所以要改某一筆的內容，" +
    "就用一樣的園區＋分類＋名稱再存一次即可。</p>" +
    "<p><b>要回到原本的資料</b><br>左邊目錄最下面按「↩ 回復成內建資料」，自己新增的會清掉、回到內建那份。</p>" +
    "<p><b>隱私</b><br>整個工具就是一個 HTML 檔，沒有連任何網路服務、沒有外部套件。" +
    "資料只寫在這台裝置瀏覽器的 localStorage，關掉網頁不會消失，也不會上傳到任何地方。</p>" +
    "</div>";
  openModal("❓ 使用說明", body, '<button class="btn pri" id="hOk">知道了</button>');
  $("#hOk").onclick = closeModal;
}

/* ==========================================================================
   事件
   ========================================================================== */
function bind() {
  var q = $("#q"), tmr = null;
  q.addEventListener("input", function () {
    clearTimeout(tmr);
    tmr = setTimeout(function () {
      Q = q.value; QB = bare(Q);
      $("#qClr").style.display = Q ? "" : "none";
      renderToc(); renderDetail(); showDetail(false);
    }, 130);
  });
  $("#qClr").onclick = function () {
    q.value = ""; Q = ""; QB = ""; this.style.display = "none";
    renderToc(); renderDetail(); showDetail(false); q.focus();
  };

  $("#toc").addEventListener("click", function (e) {
    var b = e.target.closest("[data-play]");
    if (b) { var a = parseIdx(b.getAttribute("data-play")); selectPlay(a[0], a[1], a[2]); return; }
    b = e.target.closest("[data-grp]");
    if (b) { var c = parseIdx(b.getAttribute("data-grp")); selectGroup(c[0], c[1]); return; }
    b = e.target.closest("[data-lot]");
    if (b) { toggleLot(parseIdx(b.getAttribute("data-lot"))[0]); return; }
    if (e.target.id === "btnReset") {
      if (!confirm("要把資料回復成內建的那一份嗎？\n（你貼上的那份會被清掉）")) return;
      lsDel(K_DATA); loadAll();
      renderToc(); renderDetail(); showDetail(false); toast("已回復成內建資料");
      return;
    }
    if (e.target.id === "btnWipe") {
      if (!confirm("要清掉這台裝置存的所有資料與設定嗎？\n（下次打開會回到內建資料）")) return;
      lsDel(K_DATA); lsDel(K_UI);
      OPEN = {}; Q = ""; QB = "";
      $("#q").value = ""; $("#qClr").style.display = "none";
      loadAll();
      renderToc(); renderDetail(); showDetail(false); toast("已清除");
    }
  });

  $("#detail").addEventListener("click", function (e) {
    if (e.target.closest("#back")) { showDetail(false); return; }
    var b = e.target.closest("[data-play]");
    if (b) { var a = parseIdx(b.getAttribute("data-play")); selectPlay(a[0], a[1], a[2]); return; }
    b = e.target.closest("[data-lotgo]");
    if (b) {
      var li = parseIdx(b.getAttribute("data-lotgo"))[0];
      if (DATA.lots[li]) { OPEN[lotKey(DATA.lots[li])] = true; saveUI(); renderToc(); showDetail(false); }
      return;
    }
    if (e.target.closest("#btnCopy")) {
      var t = copyTarget();
      if (t) copyText(memberText(t), "已複製，可以貼給遊客了");
      return;
    }
    if (e.target.closest("#btnCopyRule")) {
      var t2 = copyTarget();
      if (t2 && t2.rule) copyText(t2.rule, "已複製遊玩規則");
      else toast("這一筆沒有規則說明可以複製");
    }
  });

  $("#btnAdd").onclick = openAdd;
  $("#btnExport").onclick = openExport;
  $("#btnHelp").onclick = openHelp;

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if ($("#mask")) closeModal(); else showDetail(false); }
    if (e.key === "/" && document.activeElement !== q && !$("#mask")) { e.preventDefault(); q.focus(); }
  });
}

/* ---------- 啟動 ---------- */
loadAll();
renderToc();
renderDetail();
bind();
