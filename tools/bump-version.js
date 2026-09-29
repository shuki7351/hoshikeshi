/*
 * 公開前に実行する: index.html と css/style.css の中の css・js・img への参照に
 * ?v=<版> を付け直す（無ければ付ける）。
 *
 * GitHub Pages はファイルを10分間キャッシュさせる設定で配信するため、
 * 版を変えないと、更新してもしばらく古い見た目のまま表示される。
 *
 *   node tools/bump-version.js          → 版は現在時刻（YYYYMMDDHHmm）
 *   node tools/bump-version.js 2026a    → 版を指定
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const version = process.argv[2] ||
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;

// css/ js/ img/ 配下のファイルへの参照（既存の ?v=... は置き換える）
const pattern = /((?:\.\.\/)?(?:css|js|img)\/[\w.\-]+\.(?:css|js|svg|png))(\?v=[\w]+)?/g;

let total = 0;
for (const file of ['index.html', 'css/style.css']) {
  const p = path.join(root, file);
  const src = fs.readFileSync(p, 'utf8');
  let count = 0;
  const out = src.replace(pattern, (m, ref) => { count++; return `${ref}?v=${version}`; });
  fs.writeFileSync(p, out);
  console.log(`${file}: ${count} 件`);
  total += count;
}
console.log(`版 ${version} に更新しました（合計 ${total} 件）`);
