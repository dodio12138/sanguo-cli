// 人物扩充：仅写补录名册与开局任官表，不运行任何地图/归属生成器。
// --check 验证生成结果已经同步；无参数写入。历史底稿见 roster-expansion-data.mjs。
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {batch, sources, people, placements, freeNames, freeByScenario,clanUpdates,newClans,mapCompatibility} from "./roster-expansion-data.mjs";
import {officeDefinitions,courtAppointments,centralAssignments,extraPosts} from "./roster-government-data.mjs";
import {newRecords,records as literatureRecords,existingNames,exclusions,literatureSources,round as literatureRound} from "./roster-literature-data.mjs";
import {literatureClanUpdates,literatureNewClans} from "./roster-literature-clans.mjs";

const root=fileURLToPath(new URL("..",import.meta.url)),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const supplementPath="game/data/history/officers_supplement.json",postingsPath="game/data/history/officer_postings.json";
const clansPath="game/data/common/clans.json",clans=read(clansPath);
const courtPath="game/data/common/han_court.json",hanCourt=read(courtPath);
const supplement=read(supplementPath),table=read(postingsPath),original={supplement:structuredClone(supplement),table:structuredClone(table),clans:structuredClone(clans),hanCourt:structuredClone(hanCourt)};
const evidence=read("game/data/reference/literature-roster-evidence.json"),evidenceByName=new Map(evidence.records.map(r=>[r.name,r]));
table.mapCompatibility=mapCompatibility;
supplement.officers=supplement.officers.filter(o=>o.expansionBatch!==batch);
for(const id of Object.keys(table.scenarios))table.scenarios[id]=table.scenarios[id].filter(p=>p.expansionBatch!==batch);
for(const forces of Object.values(table.commands||{}))for(const config of Object.values(forces))config.posts=(config.posts||[]).filter(p=>p.expansionBatch!==batch);
for(const definition of officeDefinitions){const old=hanCourt.offices.find(o=>o.id===definition.id);if(old&&old.expansionBatch!==batch)throw new Error(`汉官 ID 冲突：${definition.id}`);if(old)Object.assign(old,definition);else hanCourt.offices.push({...definition,expansionBatch:batch})}
for(const config of Object.values(hanCourt.scenarios)){
  const generated=new Set((config.rosterExpansion?.offices||[]).map(r=>JSON.stringify(r.tuple)));
  config.offices=config.offices.filter(row=>!generated.has(JSON.stringify(row)));delete config.rosterExpansion;
}
for(const {source:key,...seed} of newClans){
  const clan={...seed};
  if(!clan.commandery){const seat=read("game/data/history/cities/200_guandu.json").cities.find(c=>c.name===(clan.seat_place||clan.seat));if(!seat)throw new Error(`世家祖居无节点 ${clan.name} ${clan.seat}`);clan.commandery=seat.commandery}
  const old=clans.clans.findIndex(c=>c.id===clan.id),record={...clan,sources:[sources[key]],expansionBatch:batch,estimateBasis:"地产份额、家财与才俊为游戏估值；族谱只记已知亲属。"};
  if(old>=0){if(clans.clans[old].expansionBatch!==batch)throw new Error(`新世家 ID 冲突：${clan.id}`);clans.clans[old]=record}else clans.clans.push(record);
}
for(const update of clanUpdates){
  const clan=clans.clans.find(c=>c.id===update.id);if(!clan)throw new Error(`世家不存在：${update.id}`);
  clan.members=[...new Set([...clan.members,...update.members])];clan.kin??=[];
  for(const edge of update.kin)if(!clan.kin.some(e=>JSON.stringify(e)===JSON.stringify(edge)))clan.kin.push(edge);
  if(!clan.basis.includes(update.basis))clan.basis+=`；${update.basis}`;
  clan.sources=(clan.sources||[]).filter(Boolean);const source=sources[update.source];if(!source)throw new Error(`世家来源不存在：${update.source}`);if(!clan.sources.some(s=>s.url===source.url))clan.sources.push(source);
}
const reference=read("game/data/reference/officers-san11.json").officers,base=read("game/data/history/officers/200_guandu.json").officers;
const existing=new Set([...reference,...base,...supplement.officers].map(o=>o.name));
const normalize=s=>String(s).replace(/县$/,"");
const aliases={"吴县":"wu","张掖":"commandery_city_074","酒泉":"commandery_city_075","安汉":"langzhong","高密":"beihai","颍川":"commandery_city_008","河东":"commandery_city_003","太原":"jinyang","济阴":"commandery_city_030","东平":"commandery_city_025","江夏":"xiakou"};
const towns=read("game/data/history/cities/200_guandu.json").cities;
const homeOf=place=>towns.find(c=>c.id===(aliases[place]||place))||towns.find(c=>c.name===place)||towns.find(c=>normalize(c.name)===normalize(place));
const literatureByName=new Map(newRecords.map(r=>[r.name,r]));
for(const [index,[name,debutYear,deathYear,discoverPlace,stats,key,basis]] of people.entries()){
  if(existing.has(name))throw new Error(`补录重名：${name}`);
  const source=sources[key];if(!source)throw new Error(`来源不存在：${key}`);
  const [command,war,intelligence,politics,charm]=stats.split(" ").map(Number);
  const aptitude=Object.fromEntries(["spear","halberd","crossbow","cavalry","siege","navy"].map(k=>[k,"C"]));
  if(command>=50)aptitude.spear="B";if(war>=60)aptitude.halberd="B";
  const home=homeOf(discoverPlace);if(!home)throw new Error(`${name} 籍贯/活动地无可用节点：${discoverPlace}`);
  const literature=literatureByName.get(name);
  const witness=literature&&evidenceByName.get(name);if(literature&&(!witness||witness.sourceKey!==literature.sourceKey))throw new Error(`人物缺少同源原文见证：${name}`);
  supplement.officers.push({id:`supp_ext_${String(index+1).padStart(3,"0")}`,name,command,war,intelligence,politics,charm,aptitude,birthYear:null,deathYear,debutYear,discoverPlace,homeCity:home.id,homeBasis:`按籍贯或活动地配置；${discoverPlace}无同名节点时寄于${home.name}。`,affinity:50,skill:null,statsBasis:"inferred",source:source.kind,basis:`${source.title}：${basis}`,sourceUrl:source.url,chronologyBasis:"卒年有明文者记录；生年未详留空；debutYear 为游戏出场参数，非史载确切出仕年。",expansionBatch:batch,...(literature?{expansionRound:literatureRound,identityName:literature.identityName,sourceKey:literature.sourceKey,sourceLayer:witness.layer,evidenceRef:`game/data/reference/literature-roster-evidence.json#${name}`,...(literature.availableUntilYear?{availableUntilYear:literature.availableUntilYear,availabilityBasis:"确切卒年未详，依最后可确认活动期设置保守开局可用上限；此年不是确切卒年。"}:{})}:{})});existing.add(name);
}
// 真实加载器核对六剧本的时点、城镇、势力和同名情况。生成前剥离本批任官，重复运行结果不漂移。
globalThis.window=globalThis;globalThis.location={protocol:"http:"};
globalThis.fetch=async url=>{const p=String(url).replace(/^\//,"");try{return {ok:true,status:200,json:async()=>structuredClone(p===supplementPath?supplement:p===postingsPath?table:p===clansPath?clans:p===courtPath?hanCourt:read(p))}}catch{return {ok:false,status:404}}};
await import("../js/core/data-loader.js");
for(const file of ["game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${file}.js`);
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load({useSavedMap:false});
const catalog=read("game/data/history/scenarios/index.json").scenarios,errors=[],summary=[],report=[];
for(const entry of catalog){
  const year=Number(entry.id.slice(0,3)),data=await loader.loadScenario(entry.id,{useSavedMap:false}),seen=new Set(),rows=[];
  const free=new Set([...freeNames,...String(freeByScenario[year]||"").split(" ")]);
  for(const raw of String(placements[year]||"").trim().split("\n").filter(line=>line.trim())){
    const match=raw.match(/^([^@]+)@([^:]+):\s*(.*?)\s*\|\s*(\w+)\s*\|\s*(.+)$/u);
    if(!match){errors.push(`${entry.id} 无效底稿：${raw}`);continue}
    const [,force,place,names,key,basis]=match,source=sources[key];
    const city=data.cities.find(c=>c.id===(aliases[place]||place))||data.cities.find(c=>c.name===place)||data.cities.find(c=>normalize(c.name)===normalize(place));
    if(!city){errors.push(`${entry.id} 查无城镇 ${place}`);continue}
    for(const name of names.trim().split(/\s+/u)){
      const candidates=data.officers.filter(o=>o.name===name);
      if(!candidates.length){if(existingNames.has(name))continue;errors.push(`${entry.id} 查无人物 ${name}`);continue}
      if(candidates.length>1){errors.push(`${entry.id} 人物重名，须另行辨析 ${name}`);continue}
      const officer=candidates[0];
      if(seen.has(name)){errors.push(`${entry.id} 重复配置 ${name}`);continue}seen.add(name);
      // 现有史载驻防与身份优先；已任职者不被新推定覆盖。
      if(officer.status==="serving")continue;
      if(officer.deathYear&&officer.deathYear<year)continue;
      if((officer.debutYear||0)>year||officer.birthYear&&officer.birthYear+15>year)continue;
      if(!free.has(name)&&city.force!==force){errors.push(`${entry.id} ${name} 所属 ${force} 与 ${city.name} 实控 ${city.force} 不符`);continue}
      if(!source){errors.push(`${entry.id} 无效来源 ${key}`);continue}
      rows.push({city:city.id,governor:null,staff:[name],force,free:free.has(name),basisType:"estimate",basis:`${source.kind}人物；${basis}${place==="安汉"?"（安汉无独立节点，寄于巴西阆中。）":""}`,source:source.title,sourceUrl:source.url,expansionBatch:batch});
    }
  }
  table.scenarios[entry.id].push(...rows);summary.push(`${entry.id}：新增出仕 ${rows.filter(p=>!p.free).length} / 在野定位 ${rows.filter(p=>p.free).length}`);
  const count=d=>({serving:d.officers.filter(o=>o.status==="serving").length,towns:new Set(d.officers.filter(o=>o.status==="serving").map(o=>o.city)).size});
  const before=count(data);data.officerPostings=table;loader.applyOfficerPostings(data);report.push({id:entry.id,name:entry.name,before,after:count(data),rows,data});
}
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
const stable=x=>JSON.stringify(x,null,1)+"\n";
// 汉庭任命：只采用已出仕者；原有官位/郡席优先，不能借扩充覆盖在位者。
const officeLoader=new DataLoader(sandbox.window.SANGUO_DATA);await officeLoader.load({useSavedMap:false});
for(const r of report){const year=Number(r.id.slice(0,3)),data=await officeLoader.loadScenario(r.id,{useSavedMap:false}),config=hanCourt.scenarios[r.id],records=[],deferred=[];
  for(const [office,name,seat,variant,self,key,basis] of courtAppointments[year]||[]){
    const officer=data.officers.find(o=>o.name===name&&o.status==="serving");if(!officer)throw new Error(`${r.id} 汉庭任命人物不在任：${name}`);
    const definition=hanCourt.offices.find(o=>o.id===office),tuple=[office,name,seat,variant,self];if(!definition)throw new Error(`无此官职：${office}`);
    const sameSeat=config.offices.find(row=>row[0]===office&&(seat?row[2]===seat:definition.quota===1));
    if(sameSeat){deferred.push({name,office,seat,basis,reason:`原表已有${sameSeat[1]}，保留原任命`});continue}
    config.offices.push(tuple);records.push({tuple,basis,source:sources[key]});
  }
  config.rosterExpansion={batch,offices:records,deferred};
  for(const raw of String(centralAssignments[year]||"").trim().split("\n").filter(Boolean)){
    const [force,names]=raw.split("@"),config=(table.commands[r.id]??={})[force]??={central:{},posts:[]};config.central??={};config.centralBasis??={};
    names.split("/").map(s=>s.trim()).forEach((name,index)=>{if(name==="-")return;const role=["advisor","chief","marshal"][index],officer=data.officers.find(o=>o.name===name&&o.force===force&&o.status==="serving");if(!officer)throw new Error(`${r.id} 幕府 ${force}·${name} 不在任`);config.central[role]=name;config.centralBasis[role]="按史载所属、谋议、行政或军旅职责映射为游戏军师／长史／司马；不等于同名汉官。"});
  }
}
// 任官与分散驻地只在干净的新开局上结算一次，报告不能用已套任官的对象再次统计。
// 幕府以本次剥离后的任官表开局，不受离线镜像中上轮生成方面的影响，重复运行结果不漂移。
const finalLoader=new DataLoader(sandbox.window.SANGUO_DATA);await finalLoader.load({useSavedMap:false});
// 开局自动补设郡守方面（civilPrefect）晚于本表引入：规划时停用，按任官表原样推演，避免与表内方面互相顶替。
for(const name of ["synchronizePrefectPost","synchronizePrefectPosts","synchronizeProvincePosts"])RuleEngine.prototype[name]=function(){return null};
for(const r of report){
  r.data=await finalLoader.loadScenario(r.id,{useSavedMap:false});r.data.officerPostings={...r.data.officerPostings,commands:table.commands};const game=new GameState(structuredClone(r.data),{playerForceId:r.data.scenario.default_player_force}),e=game.engine;r.governmentDeferred=[];
  if(game.court.skipped.length||game.forceCommandSkipped.length)throw new Error(`${r.id} 原有官制有跳过项：${[...game.court.skipped,...game.forceCommandSkipped].join("；")}`);
  const candidates=(hanCourt.scenarios[r.id].offices||[]).filter(row=>row[0]==="taishou").map(([,name,seat])=>({holder:name,kind:"jun",commanderies:[seat],basis:"汉庭剧本初值列本郡长官；按当前本方实控郡域映射实际郡守，不代管他方城池。"}));
  candidates.push(...(extraPosts[Number(r.id.slice(0,3))]||[]));
  for(const seed of candidates){
    const holder=game.data.officers.find(o=>o.name===seed.holder&&o.status==="serving"),forceId=seed.force||holder?.force;if(!holder||holder.force!==forceId)throw new Error(`${r.id} 方面人物不在任：${seed.holder}`);
    const scope={commanderies:seed.commanderies,provinces:[]},command=e.commandOf(game,forceId),posts=Object.values(command.posts),ruler=e.forceRulerOfficer(forceId),rulerCity=game.data.cities.find(c=>c.id===ruler?.city),area=seed.commanderies[0];
    const defer=reason=>r.governmentDeferred.push({name:holder.name,area,reason});
    if(holder.id===ruler?.id){defer("主公直领，不再自任方面");continue}
    if(rulerCity&&e.scopeContains(scope,rulerCity)){defer("主公驻地直辖，郡官名义保留，不另设方面");continue}
    if(!game.data.cities.some(c=>c.force===forceId&&e.scopeContains(scope,c))){defer("名义官职，辖区无本方城池，不创建实际方面");continue}
    if(posts.some(p=>p.holderId===holder.id)){defer("已任方面，遵从一人一方面");continue}
    if(posts.some(p=>p.kind==="jun"&&p.scope.commanderies.includes(area))){defer("本郡已有实际郡守，保留原指挥链");continue}
    const parent=posts.filter(p=>e.scopeWithin(scope,p.scope)).sort((a,b)=>e.postDepth(game,forceId,b)-e.postDepth(game,forceId,a))[0];
    const result=e.createPost(game,forceId,{kind:seed.kind,holderId:holder.id,scope,parentId:parent?.id||null});if(!result.ok)throw new Error(`${r.id} ${holder.name} 方面配置失败：${result.error}`);
    const record={kind:seed.kind,holder:holder.name,commanderies:seed.commanderies,basis:seed.basis,expansionBatch:batch};if(parent)record.parent=e.postHolder(parent).name;if(seed.title)record.title=seed.title;
    (table.commands[r.id][forceId]??={central:{},posts:[]}).posts.push(record);
  }
  const serving=r.data.officers.filter(o=>o.status==="serving");r.after={serving:serving.length,towns:new Set(serving.map(o=>o.city)).size};
}
if(process.argv.includes("--check")){
  if(stable(supplement)!==stable(original.supplement)||stable(table)!==stable(original.table)||stable(clans)!==stable(original.clans)||stable(hanCourt)!==stable(original.hanCourt))throw new Error("人物扩充底稿与生成数据未同步；请运行 node tools/expand-officer-postings.mjs");
}else{
  fs.writeFileSync(path.join(root,supplementPath),stable(supplement));fs.writeFileSync(path.join(root,postingsPath),stable(table));fs.writeFileSync(path.join(root,clansPath),stable(clans));fs.writeFileSync(path.join(root,courtPath),JSON.stringify(hanCourt,null,2)+"\n");
}
const doc=["# 六剧本人物与世家扩充（2026-10-15）","",`两轮合计新增人物 **${people.length} 人**，新增世家 **${newClans.length} 家**，既有世家的成员或族谱补齐记录 ${clanUpdates.length} 项。本次史籍补遗新增 ${newRecords.length} 人，详见 [本轮记录](LITERATURE_ROSTER_EXPANSION.md)。六剧本中的同一补录人物沿用同一 ID；开局任官表只补尚未出仕者，已有史载驻防优先。`,"",
"人物生年未详留空，能力均标为推定；登场年是游戏可用参数，不能当作精确出仕年份。城镇取史载任职、军旅、流寓或籍贯地域，缺少逐年记载时明确采用推定。地方分驻只表示随驻/任职状态，不自动授予太守。隐士、拒辟者与未出仕青年保留在野/未登场。", "",
"底稿：`tools/roster-expansion-data.mjs`、`tools/roster-government-data.mjs`；执行 `node tools/expand-officer-postings.mjs` 仅更新人物、任官表、汉庭初值与世家，`--check` 核对幂等同步。离线镜像另用 `node tools/build-offline-data.mjs` 生成。既有战局的人物进度、汉庭与幕府任免按存档恢复；下表人数与新配置以新开战局为准。", "",
"## 开局变化","","| 剧本 | 在任（原→现） | 有驻员城镇（原→现） | 在野定位 |","|---|---:|---:|---:|",
...report.map(r=>`| ${r.name} ${r.id.slice(0,3)} | ${r.before.serving} → ${r.after.serving} | ${r.before.towns} → ${r.after.towns} | ${r.rows.filter(p=>p.free).length} |`),"",
"## 新增人物","","| 人物 | 出场参数 | 卒年 | 籍贯/活动地 | 依据 |","|---|---:|---:|---|---|",
...people.map(([name,debut,death,place,,key,basis])=>`| ${name} | ${debut} | ${death??"未详"} | ${place} | [${sources[key].title}](${sources[key].url})：${basis} |`),"",
"## 世家与族谱","",...clanUpdates.map(c=>`- ${clans.clans.find(x=>x.id===c.id).name}：补入${c.members.join("、")}。${c.basis}`),...newClans.map(c=>`- 新增${c.name}：祖居${c.seat}${c.seat_place?`，寄于${c.seat_place}`:""}；成员${c.members.join("、")}。${c.basis}`),"",
"同姓不会自动入族：丁斐不并丁冲一支；吉茂与吉本史载同宗，合族但不杜撰具体辈分；董衡、董超不并董卓一族；夏侯存未考明亲支，暂不并夏侯氏。习祯与习珍之弟习宏为不同人物，未记二人为兄弟。祖先/后代家谱节点不等于当前剧本已有可用人物。", "",
"## 汉庭与幕府配置","",
"两轮新增尚书仆射、尚书、侍中、尚书郎、太医令和执金吾六类汉官，名分效果为游戏估值。汉庭名录只记汉官或明确标记的自署官；魏王国内部职务不冒写成汉廷三公。幕府军师、长史、司马是谋议、行政、军务的游戏分工，只有职司映射，不宣称都曾担任同名史官。未见合适人选的小势力保留空缺。", "",
"已有郡官按实控范围补入幕府指挥链：优先隶属已配置的都督/州级方面；同级不重叠、一人只任一个方面，允许兼一项中枢职司。主公所在郡保留直辖，名义辖区无己城者不创建实际方面，已有太守或方面不被候选配置覆盖。玩家开局军团仍由主公直辖。", "",
...report.flatMap(r=>{
  const config=hanCourt.scenarios[r.id],forces=table.commands[r.id]||{};
  return [`### ${r.name}（${r.id.slice(0,3)}）官制`,"","汉庭新增：",...config.rosterExpansion.offices.map(a=>{const [office,name,seat,variant,self]=a.tuple;return `- ${name}：${seat||""}${variant||hanCourt.offices.find(o=>o.id===office).name}${self?"（自署）":"（汉廷）"}。[${a.source.title}](${a.source.url})；${a.basis}`}),...config.rosterExpansion.deferred.map(a=>`- 候选${a.name}·${a.seat||""}${hanCourt.offices.find(o=>o.id===a.office).name}：${a.reason}。${a.basis}`),"","幕府中枢：","","| 势力 | 军师 | 长史 | 司马 |","|---|---|---|---|",...Object.entries(forces).filter(([,c])=>Object.keys(c.central||{}).length).map(([f,c])=>`| ${r.data.forces.find(x=>x.id===f)?.name||f} | ${c.central.advisor||"空缺"} | ${c.central.chief||"空缺"} | ${c.central.marshal||"空缺"} |`),"","新增实际方面：",...Object.entries(forces).flatMap(([f,c])=>(c.posts||[]).filter(p=>p.expansionBatch===batch).map(p=>`- ${r.data.forces.find(x=>x.id===f)?.name||f}·${p.holder}：${p.title||p.commanderies.join("、")}${p.parent?`，隶${p.parent}`:"，直属主公"}。${p.basis}`)),"","不另设方面的处理：",...r.governmentDeferred.map(d=>`- ${d.name}·${d.area}：${d.reason}。`),""];
}),
...report.flatMap(r=>[ `## ${r.name}（${r.id}）新增配置`,"","全部具体县级驻地均按游戏近似记录；原有配置未在本表重复。","","| 人物 | 身份 | 城镇 | 依据及推定范围 |","|---|---|---|---|",...r.rows.map(p=>`| ${p.staff[0]} | ${p.free?"在野":r.data.forces.find(f=>f.id===p.force)?.name||p.force} | ${r.data.cities.find(c=>c.id===p.city)?.name} | [${p.source}](${p.sourceUrl})：${p.basis} |`),""]),,
"## 第一轮验收记录（本轮验收另见补遗记录）","",
"- 85 项快测、14 项长测分批通过；包括六剧本开局、人物年代与驻地、汉庭诏令及朝局、幕府执行、人口、粮道、存档体积和旧地图保存。",
"- `test-roster-expansion` 额外核对任命真正落地、一人一方面、玩家军团直辖、同姓不误并、族谱辈分、旧档族产不被新族挤占、旧指纹严格兼容和新增人物对旧节点表的适配。",
"- 隔离 Chromium 浏览器验收襄阳刘备：新增来氏祖居与蜀中支脉、族谱及来敏人物跳转，人物详情的来源、开局配置与官爵职司，以及幕府窗口；页面无运行时错误。测试服务存档使用临时文件。",
"- 此轮未改地图源文件、城池坐标/归属文件、道路或河流；上述旧图适配只改变新增人物的寄置。",
""
].join("\n")+"\n";
const reportPath=path.join(root,"docs/OFFICER_EXPANSION.md");
if(process.argv.includes("--check")){if(!fs.existsSync(reportPath)||fs.readFileSync(reportPath,"utf8")!==doc)throw new Error("人物扩充记录未同步")}else fs.writeFileSync(reportPath,doc);
const previousRound={190:{serving:252,towns:73},194:{serving:287,towns:97},200:{serving:325,towns:122},208:{serving:296,towns:99},211:{serving:307,towns:108},219:{serving:285,towns:106}};
const primaryCount=newRecords.filter(r=>!r.sourceKey.startsWith("novel")).length,novelCount=newRecords.length-primaryCount;
const literatureDoc=["# 史籍人物补遗与六剧本配置（第二轮，2026-10-15）","",
`本轮新增 **${newRecords.length} 名独立人物**（史书 ${primaryCount}，演义 ${novelCount}），新建 **${literatureNewClans.length} 家世家/家族档案**，补齐 **${new Set(literatureClanUpdates.map(c=>c.id)).size} 家既有世家**的成员与亲缘。加上上一轮 99 人，两轮累计新增 ${people.length} 人；当前官渡名册共 ${report.find(r=>r.id==="200_guandu").data.officers.length} 人，包含在任、在野及未登场人物。`,"",
"1000–3700 的区间只是检索规模参考，本轮未据此宣称全书穷尽。名录只用于查漏；正文、裴注、后汉书、晋书和演义分开注明，姓名、父系与剧本配置以对应原文核对。晚期子孙收入共享人物库，不能提前在汉末当官；早夭与无法确认独立身份者不计入可用新人物。","",
`原文见证 **${literatureRecords.length} 条**（其中 ${existingNames.size} 名已见于原有剧本专有库，不重复新建），分属 ${Object.keys(literatureSources).length} 卷/回。见证存于 「game/data/reference/literature-roster-evidence.json」，含来源、正文/裴注标记、对应简称、摘录及原始 wikitext SHA-256。底稿 「tools/roster-literature-data.mjs」、「tools/roster-literature-clans.mjs」、「tools/roster-literature-government.mjs」；生成器普通执行与检查均无需联网。`,"",
"## 六剧本实际变化","","| 年份 | 在任（上轮→本轮） | 本轮增加 | 有驻员城镇（上轮→本轮） |","|---|---:|---:|---:|",
...report.map(r=>{const year=Number(r.id.slice(0,3)),p=previousRound[year];if(!p)return `| ${year} | 新剧本 → ${r.after.serving} | — | 新剧本 → ${r.after.towns} |`;return `| ${year} | ${p.serving} → ${r.after.serving} | +${r.after.serving-p.serving} | ${p.towns} → ${r.after.towns} |`}),"",
"同一人在多个剧本重复登场，不重复计算独立人数。城镇按籍贯、军旅、流寓或任职地域配置；无精确县址者明注寄置。隐士、不仕者及部落首领只定位，不因城属某势力就自动成为臣下。能力为保守的角色模板估值，并非史书评分；生年未载不造数，登场年是游戏可用参数。", "",
"卒年未详而史载早卒者，采用与卒年分开的 availableUntilYear，限制新开局的保守可用区间，不把最后可确认活动年写成卒年；已在旧局中的人物仍按存档进度恢复。凌统幼子、孙登及孙霸后辈均不提前出仕。", "",
"## 同名与家谱校勘","",
"- 河内张承、河内张昭与江东同名者分人；吴郡张允为张温之父，与荆州张允分人。",
"- 两位马忠按人物 ID 识别；巴西支只关联蜀将 koei11_515，吴将 koei11_514 不误入。",
"- 孙苗、孙旅为孙邻子；李球为李恢侄；毌丘重为毌丘俭孙、毌丘宗为其子。",
"- 朱治之子万岁保留全名，不拆成万；早夭者仅入族谱。谯周父名𡸫字荣始，按底本保留罕字。",
"- 新家族的财富及有证据地域内的田产为游戏估值；巴西马忠支、张嶷支仅据亲属建谱，不假定为占田大族，开局田产为零，祖居、族谱与人物关联完整保留。", "",
...literatureNewClans.map(c=>`- **${c.name}**：${c.members.join("、")}。${c.basis}${c.landless?"（仅建谱，不估田产。）":""}`),"",
"## 任命与指挥链","",
"本轮新增执金吾职类，补胡母班、宣璠、王盖、脂习、苏固、任岐、赵岐、裴潜及刘备汉中王府赖恭、黄柱、王谋等任命；董卓幕府长史按史载改为刘艾。太守只统本方实际城镇，方面不重叠、服从既有上级；名义郡官不强行创造实际控制。脂习/吉本、王谋/严颜等时点或席位冲突保留原任，候选及理由留档，详见总表。", "",
...report.map(r=>{const offices=hanCourt.scenarios[r.id].rosterExpansion.offices.filter(a=>Object.values(literatureSources).some(s=>s.url===a.source.url)),posts=Object.values(table.commands[r.id]).flatMap(c=>c.posts||[]).filter(p=>p.expansionBatch===batch);return `- ${r.id}：两轮新增汉庭/自署任命 ${hanCourt.scenarios[r.id].rosterExpansion.offices.length} 项，实际方面 ${posts.length} 个。`}),"",
"## 未生成人物的条目","",...Object.entries(exclusions).map(([name,reason])=>`- ${name}：${reason}`),"",
"## 本轮人物与原文","","摘录中的本传简称依姓氏和亲属上下文还原；摘录经过繁简转换、维基标记清理。原文只证明人物和事迹，精确开局年份、能力与驻县另按上述游戏近似处理。","",
"| 人物 | 出场参数 | 卒年 | 活动上限（非卒年） | 籍贯/寄置 | 来源层 | 事迹与配置依据 |","|---|---:|---:|---:|---|---|---|",
...newRecords.map(r=>`| ${r.name} | ${r.debutYear} | ${r.deathYear??"未详"} | ${r.availableUntilYear??"—"} | ${r.place} | ${evidenceByName.get(r.name).layer} | [${sources[r.sourceKey].title}](${sources[r.sourceKey].url})：${r.basis} |`),"",
"## 验证入口","",
"- `node tools/expand-officer-postings.mjs --check`：名册、家族、官制及本记录幂等同步。",
"- `node tools/test-literature-roster.mjs`：六剧本真实加载、原文见证、在任驻地、亲属父系、同名分族、幼年及旧局往返。",
"- `node tools/test-roster-expansion.mjs`：完整人物扩充回归、幕府任命、原有地图/旧指纹严格兼容。",
"- `node tools/run-tests.mjs --quick` 及相关长测：复核官制、家族、人口和存档体积；实际结果记入开发进展。",
"- 地图源文件、陆海、州郡、道路、河流与城池坐标及归属未修改。新旧指纹差异只涉及开局官员字段；兼容表仅接纳已审校的具体旧版基线。",""
].join("\n")+"\n";
const literaturePath=path.join(root,"docs/LITERATURE_ROSTER_EXPANSION.md");
if(process.argv.includes("--check")){if(!fs.existsSync(literaturePath)||fs.readFileSync(literaturePath,"utf8")!==literatureDoc)throw new Error("本轮史籍补遗记录未同步")}else fs.writeFileSync(literaturePath,literatureDoc);
console.log(`新增人物 ${people.length}；${process.argv.includes("--check")?"生成结果已同步":"已写入人物与任官数据"}\n${summary.join("\n")}`);
