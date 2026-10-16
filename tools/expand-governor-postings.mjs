// 各剧本史载郡守：把 roster-governors-data.mjs 的底稿写入任官表（officer_postings.json）。
// 本批行带 expansionBatch，重复运行先剥离再插入原手排行之后、其他扩充批次之前；--check 只核对同步。
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {batch,governors,sources} from "./roster-governors-data.mjs";

const root=fileURLToPath(new URL("..",import.meta.url)),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const postingsPath="game/data/history/officer_postings.json",table=read(postingsPath),original=JSON.stringify(table);
const cities=read("game/data/history/cities/200_guandu.json").cities,errors=[];
for(const [scenarioId,text] of Object.entries(governors)){
  const rows=[];
  for(const line of text.trim().split("\n").filter(Boolean)){
    const match=line.match(/^([^=]+)=([^|]+)\|\s*(\w+)\s*\|\s*(.+)$/u);if(!match){errors.push(`${scenarioId} 无效底稿：${line}`);continue}
    const [,place,name,key,basis]=match.map(s=>s.trim()),candidates=cities.filter(c=>c.name===place&&c.commanderySeatNode),source=sources[key];
    if(candidates.length!==1){errors.push(`${scenarioId} 不是郡治节点或不唯一：${place}`);continue}
    if(!source){errors.push(`${scenarioId} 无效出处：${key}`);continue}
    rows.push({city:candidates[0].id,governor:name,staff:[],basisType:"history",basis,source:source.title,sourceUrl:source.url,expansionBatch:batch});
  }
  const list=(table.scenarios[scenarioId]||[]).filter(p=>p.expansionBatch!==batch),at=list.findIndex(p=>p.expansionBatch);
  table.scenarios[scenarioId]=at<0?[...list,...rows]:[...list.slice(0,at),...rows,...list.slice(at)];
}
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
const out=JSON.stringify(table,null,1)+"\n";
if(process.argv.includes("--check")){if(JSON.stringify(JSON.parse(out))!==original)throw new Error("史载郡守底稿与任官表未同步；请运行 node tools/expand-governor-postings.mjs");console.log("史载郡守已同步")}
else{fs.writeFileSync(path.join(root,postingsPath),out);console.log(`已写入史载郡守 ${Object.values(governors).reduce((n,t)=>n+t.trim().split("\n").length,0)} 条`)}
