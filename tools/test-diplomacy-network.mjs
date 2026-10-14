import fs from "node:fs/promises";
import {appSource} from "./app-source.mjs";

const [app,css,html]=await Promise.all([
  Promise.resolve(appSource()),
  fs.readFile(new URL("../css/ui-polish.css",import.meta.url),"utf8"),
  fs.readFile(new URL("../index.html",import.meta.url),"utf8")
]);
for(const feature of ["function diplomacyRelation","function diplomacyNetworkHtml","function bindDiplomacyNetwork","data-force-node","data-force-a","data-related-force"])if(!app.includes(feature))throw new Error(`外交关系网缺少 ${feature}`);
for(const style of [".diplomacy-network-map",".diplomacy-edge.relation-war",".diplomacy-node.is-selected",".diplomacy-focus",".relation-chip"])if(!css.includes(style))throw new Error(`外交关系网缺少样式 ${style}`);
if(!app.includes("center=player||null")||!app.includes("ringIndex=center?index-1:index")||!app.includes("ringCount=center?ordered.length-1:ordered.length")||app.includes("center=player||[...forces].sort"))throw new Error("观察模式外交关系图中心未留空或势力未环形排列");
if(!css.includes("max-width: min(900px, 94vw)"))throw new Error("外交关系网宽度未更新");
for(const [asset,minimum] of [["ui-polish.css",11],["app.js",9],["game-state.js",6]]){
  const version=html.match(new RegExp(`${asset.replaceAll(".","\\.")}\\?v=([\\w-]+)`));
  if(!version)throw new Error(`${asset} 缺少缓存版本号`);// 版本号按内容哈希生成，新鲜度由 test-asset-versions 检查
}
console.log("外交关系网通过：势力节点 / 战争盟约连线 / 节点聚焦 / 关系明细");
