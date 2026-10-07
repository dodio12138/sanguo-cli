import fs from "node:fs";

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),"utf8"));
const write=(path,value)=>fs.writeFileSync(new URL(path,import.meta.url),`${JSON.stringify(value,null,2)}\n`);
const roster={
  "刘璋":{force:"liu_zhang",city:"chengdu",loyalty:100},"张任":{force:"liu_zhang",city:"zitong"},"严颜":{force:"liu_zhang",city:"jiangzhou"},"黄权":{force:"liu_zhang",city:"chengdu"},"法正":{force:"liu_zhang",city:"chengdu"},"庞羲":{force:"liu_zhang",city:"yongan"},"吴懿":{force:"liu_zhang",city:"chengdu"},
  "张鲁":{force:"zhang_lu",city:"hanzhong",loyalty:100},"杨任":{force:"zhang_lu",city:"yangping"},"杨昂":{force:"zhang_lu",city:"hanzhong"},"阎圃":{force:"zhang_lu",city:"hanzhong"},
  "马腾":{force:"ma_teng",city:"tianshui",loyalty:100},"马超":{force:"ma_teng",city:"tianshui"},"马岱":{force:"ma_teng",city:"xiliang"},"庞德":{force:"ma_teng",city:"xiliang"},"成公英":{force:"ma_teng",city:"tianshui"},
  "韩遂":{force:"han_sui",city:"anding",loyalty:100},"阎行":{force:"han_sui",city:"anding"},
  "公孙度":{force:"gongsun_du",city:"xiangping",loyalty:100},"公孙康":{force:"gongsun_du",city:"xiangping"}
};
const file="../game/data/history/officers/200_guandu.json",reference=read("../game/data/reference/officers-san11.json"),data=read(file),byName=new Map(reference.officers.map(officer=>[officer.name,officer])),existing=new Set(data.officers.map(officer=>officer.name)),missing=Object.keys(roster).filter(name=>!byName.has(name));
if(missing.length)throw new Error(`参考人物资料缺失：${missing.join("、")}`);
for(const [name,assignment] of Object.entries(roster)){
  if(existing.has(name))continue;
  const officer=structuredClone(byName.get(name));Object.assign(officer,assignment,{status:"serving",merit:0,office:"无",officeRank:0,stamina:100,experience:0});data.officers.push(officer);
}
data.schema_version=4;data.source="koei-san11-reference + curated historical affiliation";data.historical_scope="人物能力参考三国志11公开资料集；势力归属与驻地按官渡风云开局约定，地图据点为战略抽象，并非精确郡界。";
write(file,data);
console.log(`官渡剧本人物补全：新增 ${Object.keys(roster).filter(name=>!existing.has(name)).length} 人，当前 ${data.officers.length} 人`);
