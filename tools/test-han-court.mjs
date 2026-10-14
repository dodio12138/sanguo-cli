// 汉庭 P0：六剧本朝廷初值、名录与人物匹配、每月重算有界、存档往返与旧档补建、出缺与袭爵。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
assert(sandbox.window.SANGUO_DATA.hanCourt?.offices?.length,"离线镜像含汉庭数据");
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();

const expected={"190_coalition":["dong","luoyang"],"194_puyang":["li_jue","changan"],"200_guandu":["cao","xuchang"],"208_red_cliffs":["cao","xuchang"],"211_tongguan":["cao","xuchang"],"219_xiangyang":["cao","xuchang"]};
const holds=(game,name,officeId)=>{const officer=game.data.officers.find(o=>o.name===name&&o.status==="serving");return game.court.offices.find(item=>item.officerId===officer?.id&&item.office===officeId)};
for(const [id,[controller,capital]] of Object.entries(expected)){
  const data=await loader.loadScenario(id),game=new GameState(structuredClone(data),{playerForceId:data.scenario.default_player_force}),court=game.court;
  assert(court,`${id} 建立朝廷`);assert.equal(court.controller,controller,`${id} 挟天子者`);assert.equal(court.capital,capital,`${id} 都城`);assert.equal(court.emperor.name,"刘协");
  assert(game.data.cities.some(city=>city.id===court.capital),`${id} 都城据点存在`);
  assert.deepEqual(court.skipped,[],`${id} 名录人物均在任：${court.skipped.join("、")}`);
  for(const force of game.data.forces.filter(f=>f.id!=="neutral")){const stance=court.stances[force.id];assert(stance,`${id} ${force.id} 有立场`);for(const key of ["hanLoyalty","obedience"])assert(stance[key]>=0&&stance[key]<=100,`${id} ${force.id} ${key} 越界`)}
  assert.equal(court.stances[controller].obedience,100,"挟天子者服从恒为 100");assert.equal(game.engine.courtBand(game,controller),"直辖");
  for(const item of court.offices){const office=game.engine.courtOffice(item.office);assert(office,`未知官职 ${item.office}`);const divisions=game.engine.courtDivisions();if(office.scope==="province")assert(divisions.has(item.seat),`${id} 州名 ${item.seat}`);if(office.scope==="commandery")assert([...divisions.values()].some(list=>list.includes(item.seat)),`${id} 郡名 ${item.seat}`)}
  // 每月重算：推进到月末，数值仍在界内，服从向目标靠拢
  const before=structuredClone(court.stances);before.__promotion={...(game.engine.courtPromotionStep?(court.promotion||{}):{})};for(const id of Object.keys(court.stances))if(before.__promotion[id]==null&&game.engine.courtPromotionStep)before.__promotion[id]=game.engine.courtPromotionStep(game,id);for(let i=0;i<40&&game.date.month===Number(data.scenario.start_date.split("-")[1]);i++)game.endTurn();
  const promoted=new Set(Object.keys(game.court.promotion||{}).filter(id=>game.court.promotion[id]>(before.__promotion?.[id]??-1)));
  // 挟天子者 AI 按月有概率晋位（耗忠汉），晋位者不计
  for(const [forceId,stance] of Object.entries(game.court.stances)){assert(stance.obedience>=0&&stance.obedience<=100);if(!promoted.has(forceId))assert.equal(stance.hanLoyalty,before[forceId].hanLoyalty,"忠汉不因月度重算改变")}
  // 存档往返
  const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(data));restored.applySave(restored.migrateSave(save));assert.deepEqual(restored.court,game.court,`${id} 朝廷随存档往返`);
  // 旧档无朝廷：按剧本初值补建
  const legacy=JSON.parse(JSON.stringify(game.serialize()));delete legacy.court;const migrated=new GameState(structuredClone(data));migrated.applySave(migrated.migrateSave(legacy));assert.equal(migrated.court?.controller,controller,`${id} 旧档补建朝廷`);
  console.log(`${id}: ${court.emperor.temple}·${court.emperor.era} / 都${game.data.cities.find(c=>c.id===capital).name} / 挟天子者 ${controller} / 官职 ${court.offices.length} 爵位 ${court.titles.length}`);
}

// 官渡：名录要点、名分与分档
{const data=await loader.loadScenario("200_guandu"),game=new GameState(structuredClone(data),{playerForceId:"cao"}),e=game.engine;
  assert(holds(game,"袁绍","dajiangjun")&&holds(game,"袁绍","zhoumu")?.seat==="冀州","袁绍大将军、冀州牧");assert(holds(game,"曹操","sikong"),"曹操司空");
  assert.equal(e.courtHoldingLabel(game.court.titles.find(t=>t.officerId===game.data.officers.find(o=>o.name==="刘备").id)),"宜城亭侯");
  assert(game.court.stances.yuan.legitimacy>game.court.stances.zhang_lu.legitimacy,"大将军冀州牧名分高于镇民中郎将");
  const self=game.court.offices.find(item=>item.self);assert(self,"有自领官职");
  assert.equal(e.courtNominal(game,"yuan"),"奉汉");game.court.usurpers.push("yuan");e.recomputeCourt(game);assert.equal(e.courtBand(game,"yuan"),"逆贼");assert.equal(game.court.stances.yuan.obedience<100,true);
  // 出缺：任官者去世，月末出缺
  // 君主去世（继承先于每月名录维护）：官职出缺，世袭爵位由继位君主承袭
  const yuanShao=game.data.officers.find(o=>o.name==="袁绍"),title=game.court.titles.find(t=>t.forceId==="yuan"),heir=game.data.officers.find(o=>o.force==="yuan"&&o.status==="serving"&&o.name!=="袁绍");assert(title,"袁绍有爵");
  yuanShao.status="dead";Object.assign(game.data.forces.find(f=>f.id==="yuan"),{ruler:heir.name,formerRuler:"袁绍"});const events=[];e.syncCourtHoldings(game,events);
  assert(!game.court.offices.some(item=>item.officerId===yuanShao.id),"去世者官职出缺");assert(events.some(ev=>ev.text.includes("出缺")));assert.equal(title.officerId,heir.id,"县侯由继位者承袭");assert(events.some(ev=>ev.text.includes("袭")));
  // 臣下身死：爵位不传君主而除国；负伤者仍在任；被俘者爵位暂存
  const vassal=game.court.titles.find(t=>t.forceId!=="yuan"&&game.data.officers.find(o=>o.id===t.officerId)?.name!==game.data.forces.find(f=>f.id===t.forceId)?.name);if(vassal){const holder=game.data.officers.find(o=>o.id===vassal.officerId);holder.status="dead";e.syncCourtHoldings(game,[]);assert(!game.court.titles.includes(vassal),`${holder.name}之爵不传其主`)}
  const office=game.court.offices.find(item=>item.forceId==="cao"),official=game.data.officers.find(o=>o.id===office.officerId);official.status="injured";e.syncCourtHoldings(game,[]);assert(game.court.offices.includes(office),"负伤者不失官");official.status="serving";
  // 挟天子者覆灭：天子流离
  for(const city of game.data.cities)if(city.force==="cao")city.force="neutral";e.recomputeCourt(game);assert.equal(game.court.controller,null);assert.equal(game.court.emperor.status,"wandering");
  console.log("官渡要点通过：袁绍大将军冀州牧 / 宜城亭侯 / 名分排序 / 逆贼分档 / 出缺 / 袭爵 / 天子流离");
}
// P1：汉庭窗口四页与官制图（纯字符串渲染）、两张舆图与城市官署三栏的接线
await import(pathToFileURL(path.join(root,"js/ui/court-ui.js")));
{const data=await loader.loadScenario("200_guandu"),game=new GameState(structuredClone(data),{playerForceId:"liu"});
  const overview=CourtUI.render(game,"overview");assert.match(overview,/献帝 刘协/);assert.match(overview,/挟天子者/);assert.match(overview,/不奉挟天子者的诏令|观望|奉诏/);assert(!/马腾/.test(overview.split("在朝重臣")[1]?.split("朝局动向")[0]||""),"在朝重臣只列挟天子者朝中之人");
  assert.match(CourtUI.render(game,"offices"),/大将军[\s\S]*袁绍/);assert.match(CourtUI.render(game,"offices"),/世家/);
  const lords=CourtUI.render(game,"lords");assert.match(lords,/<td>.*曹操.*直辖/s);assert((lords.match(/<tr/g)||[]).length>8);
  assert.match(CourtUI.render(game,"edicts"),/上表朝贡/);
  const chart=CourtUI.chart(game,new Set(["冀州"]));assert.match(chart,/chart-node is-root/);assert.match(chart,/中央/);assert.match(chart,/地方/);assert.match(chart,/data-chart-province="冀州"/);assert.match(chart,/县令长 · 世家选拔/,"展开州后列诸郡与县（世家）");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8"),app=appSource(),view=fs.readFileSync(path.join(root,"js/ui/map-view.js"),"utf8");
  for(const id of ["courtDialog","courtChartDialog","courtButton","courtChartButton"])assert(html.includes(`id="${id}"`),id);assert.match(html,/data-layer="courtNominal"/);assert.match(html,/data-layer="courtActual"/);
  assert.match(view,/DYNAMIC_LAYERS=new Set\(\[[^\]]*"courtNominal","courtActual"\]\)/);assert.match(view,/drawCourtOverlay\(c,m,visibleCells\)/);
  assert.match(app,/州治 · \$\{esc\(city\.province/);assert.match(app,/郡治 · \$\{esc\(city\.commandery/);assert.match(app,/<h4>县治<\/h4>/);assert.match(app,/data-bureau-tab="\$\{id\}"/,"官署三页切换");assert.match(app,/data-bureau-panel="county"/);
  // 地方官制补全：边郡列入州下、郡长官称谓、朝廷所授与实际管辖并列
  const e=game.engine,divisions=e.courtDivisions();assert(divisions.get("幽州").includes("乐浪郡")&&divisions.get("凉州").includes("敦煌郡"),"边郡按城池归州");
  assert.equal(e.courtSeatTitle("taishou","北海国"),"北海国相");assert.equal(e.courtSeatTitle("taishou","河南尹"),"河南尹");assert.equal(e.courtSeatTitle("taishou","张掖属国"),"张掖属国都尉");assert.equal(e.courtSeatTitle("taishou","东郡"),"东郡太守");
  const dong=game.court.offices.find(item=>item.office==="taishou"&&item.seat==="东郡");assert.equal(game.data.officers.find(o=>o.id===dong?.officerId)?.name,"刘延","东郡太守刘延");assert(!dong.self,"挟天子者所署为朝廷所授");
  assert(game.court.offices.find(item=>item.office==="cishi"&&item.seat==="青州"&&item.self),"袁谭青州刺史为自领");
  const ctl=e.commanderyControl("东郡");assert.equal(ctl.forceId,"cao");assert(ctl.total>=1);assert.equal(e.provinceControl("冀州")[0][0],"yuan","冀州实控袁绍");
  const local=CourtUI.chart(game,new Set(["兖州","幽州"]));for(const token of ["东郡太守","实控","court-force-tag","乐浪郡太守"])assert(local.includes(token),token);
  console.log("汉庭 P1 通过：窗口四页 / 官制图中央地方与州郡县 / 名义实控图层 / 城市官署三栏 / 地方官补全与实际管辖");
}
console.log("汉庭 P0 通过");
