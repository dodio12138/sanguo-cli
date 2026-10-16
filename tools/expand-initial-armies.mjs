// 只调整六剧本的军队数据；不生成地图、不改城防或人口。默认预览，--write 写入。
import fs from "node:fs";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";

export const batch="initial-retinues-2026-10-15";
// 将领名录只用于开局分编，必须再通过本剧本实际在任、同势力、己方驻地校验。
const commanders=`关羽 张飞 赵云 夏侯渊 曹仁 曹洪 于禁 乐进 李典 张辽 徐晃 张郃 许褚 典韦 李通 臧霸 文丑 高览 张燕 麴义 鞠义 淳于琼 蒋义渠 吕旷 吕翔 袁谭 袁熙 高干 韩猛 韩荀 蒋奇 高顺 魏续 宋宪 侯成 张绣 胡车儿 樊稠 李傕 郭汜 张济 徐荣 李蒙 王方 段煨 胡轸 牛辅 董旻 关靖 田楷 严纲 单经 田豫 田畴 公孙范 公孙越 赵融 鲍忠 程普 黄盖 韩当 祖茂 孙贲 孙辅 孙河 孙静 孙瑜 孙皎 孙翊 太史慈 周瑜 吕蒙 甘宁 凌统 凌操 周泰 蒋钦 徐盛 丁奉 董袭 陈武 潘璋 贺齐 朱桓 全琮 吕范 朱治 黄祖 苏飞 刘磐 黄忠 魏延 刘琦 王威 蔡瑁 张允 文聘 刘封 孟达 吴懿 吴班 雷铜 吴兰 严颜 李严 刘璝 泠苞 邓贤 杨怀 高沛 黄权 李恢 费观 张任 张卫 杨任 杨昂 杨柏 庞德 马岱 马休 马铁 马玩 梁兴 成宜 程银 李堪 张横 侯选 杨秋 阎行 韩德 赵昂 姜叙 尹奉 姚琼 柳毅 阳仪 公孙恭 公孙康 士壹 士䵋 士武 邢道荣 刘贤 陈应 鲍隆 巩志 杨龄 笮融 张英 樊能 于糜 陈横 许昭 周昕 周昂 周喁 桥蕤 雷薄 陈兰 张勋 纪灵 俞涉 李丰 乐就 梁纲 刘勋 刘偕 潘凤 穆顺 方悦 武安国 王门 眭固 杨丑 韩暹 杨奉 徐荣 段煨`.split(/\s+/u);
const priority=new Map(commanders.map((name,index)=>[name,index]));
export function originalArmies(armies){
  return structuredClone(armies.filter(a=>a.initialDeployment?.batch!==batch||!a.initialDeployment.splitFrom)).map(a=>{
    if(a.initialDeployment?.batch===batch){a.soldiers=a.initialDeployment.originalSoldiers;a.units=a.initialDeployment.originalUnits;delete a.initialDeployment}
    return a;
  });
}
export function expandArmies(data){
  const armies=originalArmies(data.armies),original=structuredClone(armies),claimed=new Set();
  for(const a of armies){if(a.commander)claimed.add(a.commander);for(const id of [...(a.deputyOfficerIds||[]),a.staffOfficerId].filter(Boolean)){const o=data.officers.find(o=>o.id===id);if(o)claimed.add(o.name)}}
  for(const force of data.forces.filter(f=>f.id!=="neutral")){
    const parents=armies.filter(a=>a.force===force.id),total=parents.reduce((n,a)=>n+a.soldiers,0);
    if(!parents.length||parents.length>=3||total<12000)continue;
    const limit=1,size=Math.floor(Math.min(total*.25,5000)/100)*100;
    const candidates=data.officers.filter(o=>priority.has(o.name)&&!claimed.has(o.name)&&o.force===force.id&&o.status==="serving"&&data.cities.some(c=>c.id===o.city&&c.force===force.id)).sort((a,b)=>priority.get(a.name)-priority.get(b.name)||a.id.localeCompare(b.id)).slice(0,limit);
    for(const o of candidates){
      const parent=parents.filter(a=>a.soldiers-size>=Math.ceil((a.initialDeployment?.originalSoldiers??a.soldiers)*.6)).sort((a,b)=>(b.city===o.city)-(a.city===o.city)||b.soldiers-a.soldiers||a.id.localeCompare(b.id))[0];
      if(!parent)continue;
      parent.initialDeployment??={batch,originalSoldiers:parent.soldiers,originalUnits:structuredClone(parent.units)};
      assert.equal(Object.values(parent.units).reduce((n,v)=>n+v,0),parent.soldiers,parent.id);
      const portions=Object.entries(parent.units).map(([type,n])=>({type,exact:n*size/parent.soldiers,count:Math.floor(n*size/parent.soldiers)}));
      let remainder=size-portions.reduce((n,p)=>n+p.count,0);
      for(const p of [...portions].sort((a,b)=>(b.exact-b.count)-(a.exact-a.count)))if(remainder-->0)p.count++;
      const units=Object.fromEntries(portions.map(p=>[p.type,p.count]));
      for(const p of portions)parent.units[p.type]-=p.count;
      parent.soldiers-=size;
      armies.push({id:`${data.scenario.id}_retinue_${o.id}`,name:`${o.name}部`,force:force.id,city:o.city,commander:o.name,commanderOfficerId:o.id,soldiers:size,units,morale:parent.morale,training:parent.training,supply:parent.supply??100,stance:"驻扎",deputyOfficerIds:[],staffOfficerId:null,formation:(units.cavalry||0)>size*.5?"wedge":(units.archers||0)>size*.5?"crane_wing":"balanced",tactic:(o.war||0)>(o.intelligence||0)+15?"aggressive":(o.intelligence||0)>(o.war||0)+15?"cautious":"balanced",initialDeployment:{batch,splitFrom:parent.id,basis:"inferred",note:"依据本剧本人物隶属与驻地推定分编；兵数及兵种为游戏估计，从原主力扣除，不代表史载独立建制。",stationBasis:o.stationBasis||null,stationSource:o.stationSource||null,stationSourceUrl:o.stationSourceUrl||o.sourceUrl||null}});
      claimed.add(o.name);
    }
  }
  return {armies,original};
}

async function main(){
  globalThis.window=globalThis;globalThis.location={protocol:"http:"};
  const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
  globalThis.fetch=async url=>{try{return {ok:true,json:async()=>read(String(url))}}catch{return {ok:false,status:404}}};
  await import("../js/core/data-loader.js");await import("../js/data/offline-data.generated.js");
  const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});
  for(const entry of read("game/data/history/scenarios/index.json").scenarios){
    const data=await loader.loadScenario(entry.id,{useSavedMap:false}),{armies,original}=expandArmies(data),definitionPath=`game/data/history/scenarios/${entry.definition}`,definition=read(definitionPath),target=definition.patch?definitionPath:definition.data_files.armies,payload=definition.patch?definition:read(target);
    if(definition.patch)payload.patch.armies=armies;else payload.armies=armies;
    console.log(`${entry.id}: ${original.length} → ${armies.length}，新增 ${armies.length-original.length} 部`);
    if(process.argv.includes("--write"))fs.writeFileSync(target,JSON.stringify(payload,null,2)+"\n");
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
