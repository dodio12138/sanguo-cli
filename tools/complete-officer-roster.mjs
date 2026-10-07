import fs from "node:fs";

const read=path=>JSON.parse(fs.readFileSync(path,"utf8")),write=(path,value)=>fs.writeFileSync(path,`${JSON.stringify(value,null,2)}\n`),file="game/data/history/officers/200_guandu.json",data=read(file),reference=read("game/data/reference/officers-san11.json").officers,cities=read("game/data/history/cities/200_guandu.json").cities,admin=read("game/data/history/administrative_divisions.json"),year=200;
const cityByName=new Map(cities.flatMap(city=>[[city.name,city.id],[city.name.replace(/[郡城关津口]$/u,""),city.id]])),countyByName=new Map((admin.county_seats||[]).map(county=>[county.name.replace(/[县縣]$/u,""),county.jurisdictionCityId])),aliases={雒阳:"luoyang",洛阳:"luoyang",许县:"xuchang",邺县:"ye",土垠:"beiping",姑臧:"xiliang",临泾:"anding",冀县:"tianshui",宛县:"wan",谯县:"qiao",南郑:"hanzhong",雒县:"zitong",成都县:"chengdu",江州县:"jiangzhou",秣陵:"jianye",寿春县:"shouchun",舒县:"lujiang",吴县:"wu",蓟县:"ji",相县:"xiaopei",郯县:"langya",彭城县:"pengcheng",平舆:"runan",番禺县:"panyu"};
const resolveCity=(officer,index)=>{const raw=String(officer.discoverPlace||"").replace(/[（(][^）)]*[）)]/gu,"").split(/[;；、/]/u).map(value=>value.trim()).filter(Boolean);for(const place of raw){const normalized=place.replace(/[縣县郡城]$/u,"");const id=aliases[place]||aliases[normalized]||cityByName.get(place)||cityByName.get(normalized)||countyByName.get(normalized);if(id)return id}return cities[(Number(officer.sourceId)||index)%cities.length].id};
const existingById=new Map(data.officers.map(officer=>[officer.id,officer])),officers=[];
for(const [index,source] of reference.entries()){
  const existing=existingById.get(source.id);if(existing){officers.push(existing);continue}
  if(source.deathYear&&source.deathYear<year)continue;
  const availableYear=source.debutYear||source.birthYear&&source.birthYear+15||year,status=availableYear>year?"not_appeared":"hidden";
  officers.push({...structuredClone(source),force:"neutral",city:resolveCity(source,index),status,loyalty:0,merit:0,office:"无",officeRank:0,stamina:100,experience:0,skills:source.skill?[source.skill]:[]});
}
for(const existing of data.officers)if(!officers.some(officer=>officer.id===existing.id))officers.push(existing);
officers.sort((a,b)=>({serving:0,injured:1,free:2,discovered:3,hidden:4,not_appeared:5,dead:6}[a.status]??7)-({serving:0,injured:1,free:2,discovered:3,hidden:4,not_appeared:5,dead:6}[b.status]??7)||(a.debutYear||9999)-(b.debutYear||9999)||(a.sourceId||0)-(b.sourceId||0));
data.schema_version=5;data.source="koei-san11-reference + curated historical affiliation + complete living/future roster";data.historical_scope="公元200年仍在世或此后可登场的参考人物均进入战局；已考订人物保留势力与驻地，其余作为未发现或未登场人物置于参考探索地点。地图据点为战略抽象。";data.officers=officers;write(file,data);
console.log(`官渡完整人物名册：${officers.length} 人（仕官 ${officers.filter(o=>o.status==="serving").length} / 未发现 ${officers.filter(o=>o.status==="hidden").length} / 未登场 ${officers.filter(o=>o.status==="not_appeared").length}）`);
