const fs = require("fs");
const path = require("path");
const SP = __dirname;
const OUT = "../index.html";

const p1 = fs.readFileSync(path.join(SP, "t1.html"), "utf8");
let p2 = fs.readFileSync(path.join(SP, "t2.js"), "utf8");
const p3 = fs.readFileSync(path.join(SP, "t3.js"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(SP, "demo-data.json"), "utf8"));

/* 繁簡對照表與APP／平台差異／服務商三支共用同一份（pairs.txt 是唯一來源） */
const toks = fs.readFileSync(path.join(SP, "pairs.txt"), "utf8").split(/\s+/).filter(x => x.length === 2);
const m = new Map();
toks.forEach(t => { if (t[0] !== t[1] && !m.has(t[0])) m.set(t[0], t[1]); });
const pairs = [...m.entries()].map(([a, b]) => a + b).join("");
const lines = [];
for (let i = 0; i < pairs.length; i += 64) lines.push('  "' + pairs.slice(i, i + 64) + '"');
const pairBlock = "\n" + lines.join(" +\n");

if (p2.indexOf('/*__PAIRS__*/""') < 0) throw new Error("找不到繁簡表佔位符");
p2 = p2.replace('/*__PAIRS__*/""', pairBlock);

const json = JSON.stringify(data);
if (/<\/script/i.test(json)) throw new Error("資料裡含有會提前關閉 script 的字串");
if (p2.indexOf("/*__DATA__*/null") < 0) throw new Error("找不到資料佔位符");
p2 = p2.replace("/*__DATA__*/null", json);

const html = p1 + p2 + "\n" + p3 + "\n</script>\n</body>\n</html>\n";
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, "utf8");

let plays = 0;
data.lots.forEach(l => l.groups.forEach(g => { plays += g.plays.length; }));

console.log("寫入:", OUT);
console.log("大小:", Buffer.byteLength(html, "utf8"), "bytes");
console.log("園區:", data.lots.length, " 設施:", plays, " 繁簡對照:", m.size, "組");
console.log("「PAD」出現次數:", (html.match(/PAD/g) || []).length);
