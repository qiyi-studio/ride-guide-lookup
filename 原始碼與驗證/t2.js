/* ==========================================================================
   遊樂園設施快查 — 單一檔案版（第二段：資料、搜尋、解析）
   所有資料只留在這台裝置的瀏覽器（localStorage），不會上傳到任何地方。
   ========================================================================== */
"use strict";

/* ---------- 內建資料（來自「設施说明整理.xlsx」8 個分頁 ＋ 園區服務 設施示例 docx） ---------- */
var BUILTIN = /*__DATA__*/null;

/* ---------- 小工具 ---------- */
var $ = function (s) { return document.querySelector(s); };
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove("on"); }, 2400);
}
function cellClean(s) {
  return String(s == null ? "" : s)
    .replace(/\r\n?/g, "\n").replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function flat(s) { return cellClean(s).replace(/\s+/g, " "); }

/* ---------- 繁 → 簡 折疊（讓打繁體也找得到簡體資料） ---------- */
var T2S_PAIRS = /*__PAIRS__*/"";
var T2S = (function () {
  var m = {}, i;
  for (i = 0; i + 1 < T2S_PAIRS.length; i += 2) {
    if (T2S_PAIRS[i] !== T2S_PAIRS[i + 1]) m[T2S_PAIRS[i]] = T2S_PAIRS[i + 1];
  }
  return m;
})();
function fold(s) {
  s = String(s == null ? "" : s);
  var out = "", i, c, cc;
  for (i = 0; i < s.length; i++) {
    c = s[i]; cc = s.charCodeAt(i);
    if (cc >= 0xFF01 && cc <= 0xFF5E) c = String.fromCharCode(cc - 0xFEE0);
    else if (cc === 0x3000) c = " ";
    else if (T2S[c]) c = T2S[c];
    out += c;
  }
  return out.toLowerCase();
}
var PUNCT = /[\s、，。；：！？…—–\-_/\\|()\[\]{}<>【】「」『』《》〈〉"'“”‘’*#~`^$%@+=,.;:!?※◆◎●▪▫]+/g;
function bare(s) { return fold(s).replace(PUNCT, ""); }

/* ---------- 模糊比對與標亮（沿用系列工具的做法） ---------- */
function fuzzy(hay, q) {
  if (!q) return 0;
  if (!hay) return -1;
  if (hay === q) return 1000;
  if (hay.indexOf(q) === 0) return 900 - Math.min(hay.length, 40);
  var p = hay.indexOf(q);
  if (p > 0) return 800 - p * 2 - Math.min(hay.length, 40) * 0.2;
  var i = 0, j = 0, first = -1, prev = -1, gaps = 0;
  while (i < hay.length && j < q.length) {
    if (hay.charAt(i) === q.charAt(j)) {
      if (first < 0) first = i;
      if (prev >= 0 && i - prev > 1) gaps += (i - prev - 1);
      prev = i; j++;
    }
    i++;
  }
  if (j < q.length) return -1;
  return 500 - gaps * 4 - first * 2 - Math.min(hay.length, 40) * 0.2;
}
function hilite(raw, q) {
  raw = String(raw == null ? "" : raw);
  if (!q || !raw) return esc(raw);
  var i, mark = [], pos = [], b = "";
  for (i = 0; i < raw.length; i++) mark[i] = false;
  for (i = 0; i < raw.length; i++) {
    var f = fold(raw[i]);
    PUNCT.lastIndex = 0;
    if (PUNCT.test(f)) { PUNCT.lastIndex = 0; continue; }
    PUNCT.lastIndex = 0;
    b += f; pos.push(i);
  }
  var at = b.indexOf(q), k;
  if (at >= 0) {
    while (at >= 0) {
      for (k = at; k < at + q.length && k < pos.length; k++) mark[pos[k]] = true;
      at = b.indexOf(q, at + 1);
    }
  } else {
    var j = 0;
    for (i = 0; i < b.length && j < q.length; i++) {
      if (b.charAt(i) === q.charAt(j)) { mark[pos[i]] = true; j++; }
    }
    if (j < q.length) return esc(raw);
  }
  var out = "", on = false;
  for (i = 0; i < raw.length; i++) {
    if (mark[i] && !on) { out += "<mark>"; on = true; }
    if (!mark[i] && on) { out += "</mark>"; on = false; }
    out += esc(raw[i]);
  }
  return out + (on ? "</mark>" : "");
}

/* ==========================================================================
   貼上的表格 → 格子陣列
   從試算表 Ctrl+C 時剪貼簿裡有兩份：純文字與 HTML。
   純文字會掉合併儲存格（只有左上角有值），所以優先解析 HTML（處理 rowspan／colspan）。
   ========================================================================== */
function splitTable(text, delim) {
  var s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var rows = [], row = [], cell = "", i = 0, q = false, c;
  while (i < s.length) {
    c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === "") { q = true; i++; continue; }
    if (c === delim) { row.push(cell); cell = ""; i++; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  row.push(cell); rows.push(row);
  return rows.filter(function (r) {
    return r.some(function (x) { return String(x).trim() !== ""; });
  });
}
function htmlCellText(s) {
  return String(s == null ? "" : s)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
    .replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}
function parseHtmlGrid(html) {
  var tm = /<table[\s\S]*?<\/table>/i.exec(String(html || ""));
  if (!tm) return null;
  var rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, rm, raw = [];
  while ((rm = rowRe.exec(tm[0]))) {
    var cellRe = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi, cm, cells = [];
    while ((cm = cellRe.exec(rm[1]))) {
      var att = cm[1] || "";
      var rs = /rowspan\s*=\s*"?'?(\d+)/i.exec(att);
      var cs = /colspan\s*=\s*"?'?(\d+)/i.exec(att);
      cells.push({
        t: htmlCellText(cm[2]),
        rs: rs ? Math.max(1, parseInt(rs[1], 10)) : 1,
        cs: cs ? Math.max(1, parseInt(cs[1], 10)) : 1
      });
    }
    raw.push(cells);
  }
  if (!raw.length) return null;
  var grid = [], taken = {}, r, k, c, i, j;
  for (r = 0; r < raw.length; r++) if (!grid[r]) grid[r] = [];
  for (r = 0; r < raw.length; r++) {
    c = 0;
    for (k = 0; k < raw[r].length; k++) {
      while (taken[r + "," + c]) c++;
      for (i = 0; i < raw[r][k].rs; i++) {
        for (j = 0; j < raw[r][k].cs; j++) {
          if (!grid[r + i]) grid[r + i] = [];
          grid[r + i][c + j] = raw[r][k].t;
          taken[(r + i) + "," + (c + j)] = 1;
        }
      }
      c += raw[r][k].cs;
    }
  }
  for (r = 0; r < grid.length; r++)
    for (c = 0; c < grid[r].length; c++) if (grid[r][c] === undefined) grid[r][c] = "";
  grid = grid.filter(function (row) {
    return row.some(function (x) { return String(x).trim() !== ""; });
  });
  return grid.length ? grid : null;
}

/* ==========================================================================
   原表格式 → 設施清單

   「設施说明整理.xlsx」每個分頁都是同一種寫法，只差層數：
     4 欄：大類 ║ 分類 ║ 設施 ║ 內容          （極速地帶、海洋館）
     3 欄：分類 ║ 設施 ║ 內容                 （兒童王國、童話森林、水上樂園、冒險世界）
   每個設施佔兩列：第一列是規則、第二列「遊玩範例：…」是範例。
   有些設施沒有分類（整列橫向合併），有些沒有子分類。
   第 5 欄偶爾有備註（極速地帶有 3 筆）。

   ★ 不用「這是幾欄的分頁」去判斷，而是看「這一列實際有幾格」：
     HTML 貼上時，橫向合併的格子會被複製到每一格（尾端連續相同 → 收成一格）；
     純文字貼上時，合併的格子只有第一格有字（尾端空白 → 直接不算）。
     兩條路最後都會變成同樣的格數，所以層級判斷只寫一份：
       5 格 → 大類、分類、設施、內容、備註
       4 格 → 大類、分類、設施、內容
       3 格 → 分類、設施、內容
       2 格 → 設施、內容（沒有分類）
   直向合併在純文字裡是「前面幾格空白」，用上一列補起來。
   ========================================================================== */
function isExample(s) { return /^遊玩(方案|范例|範例|示例|举例|舉例)/.test(String(s || "").trim()); }
function labelClean(s) {
  /* 名稱格偶爾是兩行：「泳裝規定⏎（前三）」接起來；「特殊号半顺⏎杂六」用／隔開 */
  return cellClean(s).replace(/\s*\n\s*([（(])/g, "$1").replace(/\s*\n\s*/g, "／").replace(/\s+/g, " ").trim();
}
function parseRuleGrid(grid) {
  var byKey = {}, order = [], prev = [], r, i, cells, n, nonEmpty, lead;
  var skipped = 0;
  for (r = 0; r < (grid || []).length; r++) {
    cells = (grid[r] || []).map(cellClean);
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    if (!cells.length) continue;
    /* 前段空白 → 直向合併，用上一列的同一格補 */
    i = 0;
    while (i < cells.length && !cells[i]) { cells[i] = prev[i] || ""; i++; }
    /* 中間空格：這一列的資料到這裡就結束（例如純文字貼上的橫向合併） */
    for (i = 0; i < cells.length; i++) if (!cells[i]) { cells = cells.slice(0, i); break; }
    nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length <= 1) { skipped++; continue; }
    if (nonEmpty.every(function (x) { return x === nonEmpty[0]; })) { skipped++; continue; }   /* 標題列 */
    /* 尾端連續相同 → HTML 的橫向合併，收成一格 */
    while (cells.length >= 2 && cells[cells.length - 1] === cells[cells.length - 2]) cells.pop();
    n = cells.length;
    var cat = "", sub = "", name = "", content = "", note = "";
    if (n >= 5) { cat = cells[0]; sub = cells[1]; name = cells[2]; content = cells[3]; note = cells.slice(4).filter(Boolean).join("\n"); lead = 3; }
    else if (n === 4) { cat = cells[0]; sub = cells[1]; name = cells[2]; content = cells[3]; lead = 3; }
    else if (n === 3) { cat = cells[0]; name = cells[1]; content = cells[2]; lead = 2; }
    else { name = cells[0]; content = cells[1]; lead = 1; }
    prev = cells.slice(0, lead);
    cat = labelClean(cat); sub = labelClean(sub); name = labelClean(name);
    if (sub && sub === cat) sub = "";
    if (!name) { skipped++; continue; }
    var key = cat + "" + sub + "" + name;
    var p = byKey[key];
    if (!p) { p = byKey[key] = { cat: cat, sub: sub, name: name, rule: "", ex: "", note: "" }; order.push(p); }
    if (isExample(content)) p.ex = joinPart(p.ex, content);
    else p.rule = joinPart(p.rule, content.replace(/\s*遊玩範例[:：]\s*$/, ""));
    if (note) p.note = joinPart(p.note, note);
  }
  return { plays: order, skipped: skipped };
}
function joinPart(a, b) {
  a = String(a || ""); b = cellClean(b);
  if (!b) return a;
  if (!a) return b;
  if (a === b || a.indexOf(b) >= 0) return a;
  return a + "\n\n" + b;
}

/* ==========================================================================
   標準格式（有標題列）→ 設施清單，可以一次貼多個園區
     園區 ⇥ 設施類型 ⇥ 設施分類 ⇥ 子分類 ⇥ 設施名稱 ⇥ 規則說明 ⇥ 遊玩範例 ⇥ 備註
   「匯出」產生的就是這個格式，所以匯出→改→貼回來一定對得上。
   沒有標題列時照欄數推：5 欄＝園區、分類、設施、規則、範例；
   6 欄多子分類；7 欄多設施類型（在園區後面）；8 欄多備註。
   ========================================================================== */
var STD_COLS = [
  { k: "lot",  re: /[园園][区區]|[设設]施|lottery/i },
  { k: "kind", re: /[类類]型|[类類][别別]|kind/i },
  { k: "sub",  re: /子分[类類]|小[类類]|sub/i },
  { k: "cat",  re: /分[类類]|大[类類]|category/i },
  { k: "name", re: /設施|名[称稱]|name/i },
  { k: "rule", re: /[规規][则則]|[说說]明|rule/i },
  { k: "ex",   re: /[范範]例|[举舉]例|示例|例子|example/i },
  { k: "note", re: /[备備][注註]|注意|note/i }
];
function stdHeaderMap(cells) {
  var map = {}, used = {}, i, j, c;
  for (i = 0; i < cells.length; i++) {
    c = flat(cells[i]); if (!c) continue;
    for (j = 0; j < STD_COLS.length; j++) {
      if (used[STD_COLS[j].k]) continue;
      if (STD_COLS[j].re.test(c)) { map[STD_COLS[j].k] = i; used[STD_COLS[j].k] = 1; break; }
    }
  }
  return map;
}
var STD_POS = {
  5: ["lot", "cat", "name", "rule", "ex"],
  6: ["lot", "cat", "sub", "name", "rule", "ex"],
  7: ["lot", "kind", "cat", "sub", "name", "rule", "ex"],
  8: ["lot", "kind", "cat", "sub", "name", "rule", "ex", "note"]
};
function parseStdGrid(grid) {
  var rows = (grid || []).map(function (r) { return (r || []).map(cellClean); })
    .filter(function (r) { return r.some(Boolean); });
  if (!rows.length) return null;
  var map = stdHeaderMap(rows[0]), header = false, start = 0, width, i, k, cols;
  if (map.lot !== undefined && map.name !== undefined && map.rule !== undefined) { header = true; start = 1; }
  else {
    width = 0;
    rows.forEach(function (r) { var w = r.length; while (w && !r[w - 1]) w--; if (w > width) width = w; });
    cols = STD_POS[Math.min(8, width)];
    if (!cols || width < 5) return null;
    map = {};
    for (i = 0; i < cols.length; i++) map[cols[i]] = i;
  }
  var plays = [], bad = 0;
  for (i = start; i < rows.length; i++) {
    var r = rows[i], p = {};
    for (k in map) p[k] = labelOrText(k, r[map[k]]);
    if (!p.lot || !p.name) { bad++; continue; }
    p.kind = normKind(p.kind);
    plays.push({ lot: p.lot, k: p.kind, cat: p.cat || "", sub: p.sub || "", name: p.name,
                 rule: p.rule || "", ex: p.ex || "", note: p.note || "" });
  }
  if (!plays.length) return null;
  return { plays: plays, header: header, bad: bad };
}
function labelOrText(k, v) {
  return (k === "rule" || k === "ex" || k === "note") ? cellClean(v) : labelClean(v);
}
function normKind(s) {
  s = flat(s);
  if (!s) return "";
  if (/快速通關/.test(s)) return "快速通關";
  if (/官方|一般|正常|general/i.test(s)) return "";
  return s;
}

/* ==========================================================================
   設施清單 → 目錄結構
     lots: [ { n:園區, groups:[ { n:分類, k:設施類型, desc, ex, plays:[ {n, sub, rule, ex, note} ] } ] } ]
   ・沒有分類的設施收在 n==="" 的群組，畫面上直接放在園區底下（排最前面）。
   ・「沒有分類的設施」若跟某個分類同名，那其實是該分類的總說明（例如 水上樂園的泳裝規定
     先有一段總說明、底下再分 第1～5名／第6～10名），就收成該分類的 desc，不佔一筆設施。
   ========================================================================== */
function playKey(lot, k, cat, sub, name) { return [lot, k || "", cat || "", sub || "", name].join(""); }
function buildLots(plays, lotOrder) {
  var lots = [], byLot = {};
  (plays || []).forEach(function (p) {
    if (!p || !p.lot || !p.name) return;
    var lot = byLot[p.lot];
    if (!lot) { lot = byLot[p.lot] = { n: p.lot, groups: [], _g: {} }; lots.push(lot); }
    var gk = (p.k || "") + "" + (p.cat || "");
    var g = lot._g[gk];
    if (!g) { g = lot._g[gk] = { n: p.cat || "", k: p.k || "", plays: [] }; lot.groups.push(g); }
    /* 同一個群組裡同名（同子分類）的設施只留一筆：後面出現的只補上缺的規則／範例，不重複 */
    var dup = null;
    g.plays.forEach(function (o) { if (!dup && o.n === p.name && o.sub === (p.sub || "")) dup = o; });
    if (dup) {
      dup.rule = joinPart(dup.rule, p.rule); dup.ex = joinPart(dup.ex, p.ex); dup.note = joinPart(dup.note, p.note);
      return;
    }
    g.plays.push({ n: p.name, sub: p.sub || "", rule: p.rule || "", ex: p.ex || "", note: p.note || "" });
  });
  lots.forEach(function (lot) {
    delete lot._g;
    /* 沒有分類的群組排最前面（同一種設施類型內） */
    lot.groups.sort(function (a, b) {
      var ka = a.k ? 1 : 0, kb = b.k ? 1 : 0;
      if (ka !== kb) return ka - kb;
      if (!a.n && b.n) return -1;
      if (a.n && !b.n) return 1;
      return 0;
    });
    lot.groups.forEach(function (g) {
      if (g.n) return;
      g.plays = g.plays.filter(function (p) {
        var same = null;
        lot.groups.forEach(function (o) { if (o !== g && o.k === g.k && o.n === p.n && !same) same = o; });
        if (!same) return true;
        same.desc = joinPart(same.desc, p.rule);
        same.ex = joinPart(same.ex, p.ex);
        if (p.note) same.note = joinPart(same.note, p.note);
        return false;
      });
    });
    lot.groups = lot.groups.filter(function (g) { return g.plays.length || g.desc; });
  });
  if (lotOrder && lotOrder.length) {
    var pos = {};
    lotOrder.forEach(function (n, i) { pos[n] = i; });
    lots.sort(function (a, b) {
      var pa = pos[a.n] === undefined ? 999 : pos[a.n], pb = pos[b.n] === undefined ? 999 : pos[b.n];
      return pa - pb;
    });
  }
  return lots;
}
function normalizeData(d) {
  var out = { at: "", lots: [] };
  if (!d || typeof d !== "object") return out;
  out.at = String(d.at || "");
  (Array.isArray(d.lots) ? d.lots : []).forEach(function (l) {
    if (!l || !l.n) return;
    var lot = { n: String(l.n), groups: [] };
    (Array.isArray(l.groups) ? l.groups : []).forEach(function (g) {
      if (!g) return;
      var grp = { n: String(g.n || ""), k: String(g.k || ""), desc: String(g.desc || ""), ex: String(g.ex || ""), note: String(g.note || ""), plays: [] };
      (Array.isArray(g.plays) ? g.plays : []).forEach(function (p) {
        if (!p || !p.n) return;
        grp.plays.push({ n: String(p.n), sub: String(p.sub || ""), rule: String(p.rule || ""), ex: String(p.ex || ""), note: String(p.note || "") });
      });
      if (grp.plays.length || grp.desc) lot.groups.push(grp);
    });
    if (lot.groups.length) out.lots.push(lot);
  });
  return out;
}
function countPlays(d) {
  var n = 0;
  (d && d.lots || []).forEach(function (l) { l.groups.forEach(function (g) { n += g.plays.length; }); });
  return n;
}
/* 把目錄結構攤平成「一筆一個設施」，畫面與匯出都用這份 */
function flatPlays(d) {
  var out = [];
  (d && d.lots || []).forEach(function (l, li) {
    l.groups.forEach(function (g, gi) {
      g.plays.forEach(function (p, pi) {
        out.push({ lot: l.n, k: g.k, cat: g.n, sub: p.sub, name: p.n, rule: p.rule, ex: p.ex, note: p.note,
                   key: playKey(l.n, g.k, g.n, p.sub, p.n), li: li, gi: gi, pi: pi, group: g, play: p });
      });
    });
  });
  return out;
}
function groupKey(lot, g) { return "G" + lot.n + "" + (g.k || "") + "" + (g.n || ""); }

/* ---------- 搜尋 ---------- */
function hayOf(f) {
  if (!f._h) {
    f._nb = bare(f.name);
    f._cb = bare([f.cat, f.sub].join(" "));
    f._h = bare([f.lot, f.cat, f.sub, f.name, f.rule, f.ex, f.note].join(" "));
  }
  return f._h;
}
function scoreOf(f, qb) {
  if (!qb) return 0;
  var h = hayOf(f);
  if (f._nb === qb) return 1000;
  if (f._nb.indexOf(qb) >= 0) return 900 - f._nb.indexOf(qb);
  if (f._cb.indexOf(qb) >= 0) return 700;
  if (bare(f.lot).indexOf(qb) >= 0) return 650;
  var fz = fuzzy(f._nb, qb);
  if (fz > 0) return 400 + Math.min(fz, 500) / 10;
  if (h.indexOf(qb) >= 0) return 300;
  return -1;
}

/* ---------- 複製給遊客的說明文字（只有設施名稱、規則、範例，沒有內部欄位） ---------- */
function memberText(f) {
  var head = [f.lot, f.cat, f.sub].filter(Boolean).join("－");
  var out = ["【" + (head ? head + " " : "") + f.name + "】"];
  if (f.rule) out.push("遊玩規則：", f.rule);
  if (f.ex) out.push("遊玩範例：", f.ex);
  if (f.note) out.push("注意事項：", f.note);
  return out.join("\n");
}

/* ---------- 匯出（Tab 分隔，標題列＝標準格式） ---------- */
var EXP_HEAD = ["園區", "設施類型", "設施分類", "子分類", "設施名稱", "規則說明", "遊玩範例", "備註"];
function tsvCell(v) {
  var s = String(v == null ? "" : v);
  return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportTsv(d) {
  var rows = [EXP_HEAD.join("\t")], n = 0, nd = 0;
  (d && d.lots || []).forEach(function (l) {
    (l.groups || []).forEach(function (g) {
      /* 分類的總說明（例如 水上樂園的「泳裝規定」）寫成「沒有分類、名稱＝分類名」那一列，
         貼回來時 buildLots 會自動把它變回總說明——跟原表本來的寫法一致。
         不這樣寫，匯出→改→貼回一圈下來總說明就沒了。 */
      if (g.n && (g.desc || g.ex || g.note)) {
        rows.push([l.n, g.k ? "快速通關" : "", "", "", g.n, g.desc, g.ex, g.note].map(tsvCell).join("\t"));
        nd++;
      }
      g.plays.forEach(function (p) {
        rows.push([l.n, g.k ? "快速通關" : "", g.n, p.sub, p.n, p.rule, p.ex, p.note].map(tsvCell).join("\t"));
        n++;
      });
    });
  });
  return { text: rows.join("\n"), n: n, desc: nd };
}
