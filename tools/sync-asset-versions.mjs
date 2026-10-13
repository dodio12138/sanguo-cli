// 缓存版本：按文件内容哈希生成 index.html 与样式表中本地资源的 ?v= 版本号，改了文件不必再手工递增。
//   node tools/sync-asset-versions.mjs          重写版本号
//   node tools/sync-asset-versions.mjs --check  只检查，版本号过期则以非零退出（供测试与发布前检查）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),check=process.argv.includes("--check"),stale=[];
const hash=file=>crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0,10);
const local=value=>!/^(?:[a-z]+:)?\/\//i.test(value)&&!value.startsWith("data:")&&!value.startsWith("#");
function rewrite(file,pattern,resolveFrom){const original=fs.readFileSync(file,"utf8");const next=original.replace(pattern,(match,prefix,target,version,suffix)=>{if(!local(target))return match;const absolute=path.resolve(resolveFrom,target);if(!absolute.startsWith(root)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())return match;const value=hash(absolute);if(version!==value)stale.push(`${path.relative(root,file)} → ${target}`);return `${prefix}${target}?v=${value}${suffix}`});if(next!==original&&!check)fs.writeFileSync(file,next);return next}
// 先改样式表内引用的字体、图片，再按样式表新内容计算其自身哈希。
const html=path.join(root,"index.html"),styles=[...fs.readFileSync(html,"utf8").matchAll(/href="(css\/[^"?]+\.css)/g)].map(match=>path.join(root,match[1]));
for(const css of styles)rewrite(css,/(url\(["']?)([^"')?]+)(?:\?v=([\w-]+))?(["']?\))/g,path.dirname(css));
rewrite(html,/((?:src|href)=")([^"?]+\.(?:js|css|woff2|png|svg|ico|json))(?:\?v=([\w-]+))?(")/g,root);
if(check&&stale.length){console.error(`缓存版本过期 ${stale.length} 处，请运行 node tools/sync-asset-versions.mjs：\n${stale.slice(0,20).join("\n")}`);process.exit(1)}
console.log(check?"缓存版本与文件内容一致":`缓存版本已按内容哈希更新${stale.length?`：${stale.length} 处`:"（无变化）"}`);
