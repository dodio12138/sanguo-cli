import fs from "node:fs";
import path from "node:path";

const source=process.argv[2];
const output=process.argv[3]||"game/data/reference";
if(!source)throw new Error("用法：node tools/import-koei-san11.mjs <san11目录> [输出目录]");
const read=name=>{let text=fs.readFileSync(path.join(source,name),"utf8").replace(/^\uFEFF/,"").trim();if(!text.startsWith("["))text=`[${text}`;return JSON.parse(text)};
const generals=read("general.json"),tricks=read("trick.json"),trickById=new Map(tricks.map(item=>[item.id,item]));
const officers=generals.map(item=>({
  id:`koei11_${item.id}`,sourceId:item.id,name:item.name,powerId:item.powerId,skill:trickById.get(item.trickId)?.name||null,
  command:item.command,war:item.mforce,intelligence:item.intelligence,politics:item.politics,charm:item.charm,
  aptitude:{spear:item.gun,halberd:item.halberd,crossbow:item.crossbow,cavalry:item.ride,siege:item.weapons,navy:item.water}
}));
const biographies=Object.fromEntries(generals.filter(item=>item.biography).map(item=>[`koei11_${item.id}`,item.biography]));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,"officers-san11.json"),JSON.stringify({schema_version:1,source:"renmu123/koei_san_data san11/general.json",count:officers.length,officers}));
fs.writeFileSync(path.join(output,"officer-biographies-san11.json"),JSON.stringify({schema_version:1,source:"renmu123/koei_san_data san11/general.json",biographies}));
console.log(`已转换 ${officers.length} 名人物；轻量索引与列传已分离。`);
