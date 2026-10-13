import {execFileSync} from "node:child_process";
import path from "node:path";
// 缓存版本须与文件内容哈希一致：改动脚本、样式、字体后运行 node tools/sync-asset-versions.mjs。
const root=path.resolve(new URL("..",import.meta.url).pathname);
try{execFileSync(process.execPath,[path.join(root,"tools/sync-asset-versions.mjs"),"--check"],{cwd:root,stdio:"pipe"})}
catch(error){console.error(String(error.stdout||"")+String(error.stderr||""));process.exit(1)}
console.log("缓存版本检查通过：index.html 与样式表引用的本地资源均按内容哈希标注版本");
