// 人口与世家（POP 简易版）：开局与税基、拆分合并、征兵、户口、饥荒依附与流民、户籍清查、世家操作、事件迁入、县报、存档、长推演。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");
const P=RuleEngine.POP,total=P.total;
const fresh=(force="cao")=>{const game=new GameState(structuredClone(scenario),{playerForceId:force});return {game,e:game.engine}};
// 跳到指定月末并结算一次人口
const month=(game,m)=>{game.turn+=30;game.date.month=m;game.date.day=GameClock.daysInMonth(game.date.year,m);game.engine.resolvePopulation(game,[])};
const national=game=>game.engine.popPlaces().reduce((n,p)=>n+(p.population||0),0);
const sumPops=(place,f)=>(place.pops||[]).filter(f).reduce((n,p)=>n+total(p),0);

// 1. 开局：每处都有 POP，真实人口与原数一致；税基折算后全国与原编户量纲持平
{const {game,e}=fresh(),base=structuredClone(scenario);const places=e.popPlaces();assert(places.every(p=>Array.isArray(p.pops)),"每处有 POP");
  const original=[...base.cities,...base.counties].reduce((n,p)=>n+(p.population||0),0);assert.equal(national(game),original,"开局真实人口不变");
  const raw=places.reduce((n,p)=>n+e.taxBase(game,p),0);assert(Math.abs(raw/original-1)<.03,`税基与原人口偏差 ${(raw/original-1)*100}%`);
  assert(places.every(p=>p.pops.length<=8),"每处不超过软上限");assert(Object.keys(game.clans.byId).length>=20,"世家已落地");
  const xun=places.find(p=>p.name==="颍阴"&&p.pops.some(x=>x[P.CLS]===P.DEP&&x[P.CLAN]==="xun"));assert(xun,"荀氏在颍阴有依附户");
  assert(places.every(p=>p.pops.every(x=>x[P.HH]>0||total(x)===0)),"户数独立存在");console.log(`开局：${places.reduce((n,p)=>n+p.pops.length,0)} 个 POP / 税基系数 ${game.popScale}`)}

// 2. 拆分合并：迁入已有同键 POP 不增条数；守恒
{const {game,e}=fresh(),a=e.popPlaces().find(p=>p.pops.some(x=>x[P.CLS]===P.FREE&&x[P.OCC]===P.FARM&&total(x)>20000)),b=e.popPlaces().find(p=>p!==a&&p.pops.some(x=>x[P.CLS]===P.FREE&&x[P.OCC]===P.FARM));
  const from=a.pops.find(x=>x[P.CLS]===P.FREE&&x[P.OCC]===P.FARM),before=a.population+b.population,count=b.pops.length,packet=e.popSplit(from,.05);e.popAdd(b,P.FARM,P.FREE,"",packet.buckets,packet.households,packet.registered,packet.health);e.popSync(a);e.popSync(b);
  assert.equal(b.pops.length,count,"同键合并不增条数");assert.equal(a.population+b.population,before,"迁徙守恒")}

// 3. 征兵：成年男减少等于实征；强征多于常征；徭役遣散归还
{const {game,e}=fresh(),city=game.data.cities.find(c=>c.force==="cao"&&e.countiesForCity(c.id).length>=1),males=()=>e.levySources(city.id).reduce((n,s)=>n+s.pops.reduce((m,p)=>m+p[P.AM],0),0);
  const normal=e.levySources(city.id).reduce((n,s)=>n+e.recruitableAt(game,s),0);e.setLevyMode(game,"cao","forced");const forced=e.levySources(city.id).reduce((n,s)=>n+e.recruitableAt(game,s),0);assert(forced>normal*1.5,`强征 ${forced} 应明显多于常征 ${normal}`);e.setLevyMode(game,"cao","normal");
  const before=males(),pop=national(game),origins=[],taken=e.drawCountyPopulation(city.id,3000,origins,game);assert(taken>0);assert.equal(before-males(),taken,"成年男减少等于实征");assert.equal(pop-national(game),taken,"征发从民间扣除");
  for(const origin of origins)e.returnPeople(game,e.popPlace(origin.countyId||origin.cityId),origin.people);assert.equal(national(game),pop,"徭役遣散归还");
  const huge=e.drawCountyPopulation(city.id,10_000_000,[],game);assert(huge<normal*1.1,"可征有上限，户内留足劳力");console.log(`征兵：常征可征 ${normal}，强征 ${forced}`)}

// 4. 户与口：分别增长；守恒账目
{const {game,e}=fresh(),place=e.popPlaces().find(p=>p.population>50000&&p.pops.length>1),pop0=place.population,hh0=place.households,n0=national(game),stats0={...game.popStats};
  for(let m=1;m<=12;m++)month(game,m);const dp=(place.population-pop0)/pop0,dh=(place.households-hh0)/hh0;assert(place.population!==pop0&&place.households!==hh0);assert(Math.abs(dp-dh)>.001,"户与口增长率不同");
  const s=game.popStats;assert.equal(national(game)-n0,(s.births-stats0.births)-(s.deaths-stats0.deaths)-(s.lost-stats0.lost)-(s.levied-stats0.levied)+(s.returned-stats0.returned),"人口账目守恒");console.log(`一年：口 ${(dp*100).toFixed(2)}% / 户 ${(dh*100).toFixed(2)}%`)}

// 5. 饥荒与战乱：依附增加、流民出现并流向邻近；人口不凭空增加
{const {game,e}=fresh(),place=e.popPlaces().find(p=>p.name==="颍阴"&&!p.jurisdictionCityId)||e.popPlaces().find(p=>p.name==="颍阴"),node=e.popNode(place);const region=()=>[place,...e.popNeighbors(place).map(id=>e.popPlace(id))].filter(Boolean).reduce((n,p)=>n+sumPops(p,x=>x[P.CLS]===P.DRIFT),0),dep0=sumPops(place,x=>x[P.CLS]===P.DEP),drift0=region();node.localFood=0;
  month(game,3);assert(sumPops(place,x=>x[P.CLS]===P.DEP)>dep0,"饥荒时依附世家增加");assert(region()>drift0,"饥荒时出现流民（含流向邻近者）");
  const n0=national(game),stats={...game.popStats};node.lastBattleTurn=game.turn+30;month(game,4);const s=game.popStats;assert.equal(national(game)-n0,(s.births-stats.births)-(s.deaths-stats.deaths)-(s.lost-stats.lost),"流民迁徙守恒")}

// 6. 户籍清查：依附户括出、登记率升、世家记怨、一年一次
{const {game,e}=fresh(),city=game.data.cities.find(c=>c.force==="cao"&&e.countiesForCity(c.id).some(k=>Object.keys(e.clanSharesAt(game,k.id)).length));game.resources.gold=99999;const clanId=Object.keys(e.countiesForCity(city.id).map(k=>e.clanSharesAt(game,k.id)).find(x=>Object.keys(x).length))[0];
  const places=[city,...e.countiesForCity(city.id)],dep=()=>places.reduce((n,p)=>n+sumPops(p,x=>x[P.CLS]===P.DEP),0),reg=()=>places.reduce((n,p)=>n+e.registeredPopulation(p),0),dep0=dep(),reg0=reg(),rel0=e.clanRelation(game,clanId,"cao"),gold0=game.resources.gold;
  const result=e.inspectRegistry(game,city.id);assert(result.ok,result.error);assert(dep()<dep0,"依附户括出");assert(reg()>reg0,"登记人口上升");assert(e.clanRelation(game,clanId,"cao")<rel0,"世家记怨");assert(game.resources.gold<gold0);assert(!e.inspectRegistry(game,city.id).ok,"同处一年一次")}

// 7. 关系经配合度影响可征与税基；结好、征辟、抑制
{const {game,e}=fresh("yuan"),place=e.popPlaces().find(p=>e.popNode(p).force==="yuan"&&Object.keys(e.clanSharesAt(game,p.id)).length);const node=e.popNode(place),clanId=Object.keys(e.clanSharesAt(game,place.id))[0];
  const comply0=e.clanCompliance(game,place,"yuan"),recruit0=e.recruitableAt(game,place);game.clans.byId[clanId].grievance.yuan=60;e.clanChanged();assert(e.clanCompliance(game,place,"yuan")<comply0,"积怨降低配合度");assert(e.recruitableAt(game,place)<recruit0,"配合度低则可征少");
  game.clans.byId[clanId].grievance.yuan=0;e.clanChanged();game.resources.gold=99999;const rel=e.clanRelation(game,clanId,"yuan");assert(e.courtClan(game,clanId).ok);assert(e.clanRelation(game,clanId,"yuan")>rel,"结好提升关系");assert(!e.courtClan(game,clanId).ok,"结好有间隔")}
{const {game,e}=fresh(),clanId="xun",member=e.clanMembers(clanId).find(o=>o.name!=="荀彧");member.force="neutral";member.status="free";member.debutYear=190;game.clans.byId[clanId].favor.cao=30;e.clanChanged();const r=e.summonClanMember(game,clanId);assert(r.ok,r.error);assert.equal(e.data.officers.find(o=>o.id===r.officerId).force,"cao","征辟出仕")}
{const {game,e}=fresh(),clanId="xun",clan=game.clans.byId[clanId],seat=e.popPlace(clan.seatIds[0]),wealth=clan.wealth,share=clan.presence[seat.id],gold=game.resources.gold,dep0=sumPops(seat,x=>x[P.CLS]===P.DEP&&x[P.CLAN]===clanId);const r=e.suppressClan(game,clanId);assert(r.ok,r.error);
  assert(game.resources.gold>gold&&clan.wealth<wealth,"没入家财");assert(clan.presence[seat.id]<share,"地产减半");assert(sumPops(seat,x=>x[P.CLS]===P.DEP&&x[P.CLAN]===clanId)<dep0,"依附户改编户");assert(e.clanRelation(game,clanId,"cao")<40,"积怨极深");assert.equal(e.countyMagistrate(game,seat)?.clanId===clanId&&clan.presence[seat.id]<.15,false)}

// 8. 事件「人口 +N」从邻近迁来，全国不增
{const {game,e}=fresh(),city=game.data.cities.find(c=>c.force==="cao"&&c.pops?.length),n0=national(game),p0=city.population;e.applyEventEffect(game,{city:{population:800}},city.id);assert(city.population>p0,"本地增加");assert.equal(national(game),n0,"全国不凭空增加")}

// 9. 县报：登记数精确，实有人口只给估计；存档往返
{const {game,e}=fresh(),place=e.popPlaces().find(p=>e.popNode(p).force==="cao"&&p.population>30000),r=e.popReport(game,place);assert.equal(r.registered,place.registeredPopulation);assert(Math.abs(r.estimate-place.population)<=place.population*r.error+100,"估计在误差内");assert(r.registered<place.population,"登记少于实有");
  const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(scenario));restored.applySave(restored.migrateSave(save));const back=restored.engine.popPlace(place.id);
  assert.deepEqual(back.pops,place.pops,"POP 往返");assert.equal(restored.popScale,game.popScale);assert.deepEqual(restored.clans.byId.xun.presence,game.clans.byId.xun.presence);assert.equal(back.registeredPopulation,place.registeredPopulation,"读档重算缓存")}

// 10. 界面
{const app=fs.readFileSync(path.join(root,"js/ui/app.js"),"utf8"),ui=fs.readFileSync(path.join(root,"js/ui/population-ui.js"),"utf8"),html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  for(const token of ["PopulationUI.section(state,city)","PopulationUI.bind("])assert(app.includes(token),token);for(const token of ["data-inspect-registry","data-levy-mode","data-clan-action","实有人口","可征丁"])assert(ui.includes(token),token);for(const file of ["engine/population.js","engine/clans.js","ui/population-ui.js"])assert(html.includes(file),file)}

// 11. 两年无头推演：无负数、无 NaN、不碎片化
{const {game,e}=fresh();game.observerMode=true;for(let i=0;i<730;i++)game.endTurn();const places=e.popPlaces();for(const place of places){assert(place.pops.length<=8,`${place.name} POP 过多`);for(const p of place.pops)for(let i=3;i<=7;i++)assert(Number.isFinite(p[i])&&p[i]>=0,`${place.name} 数值非法`)}
  console.log(`两年推演：全国 ${national(game).toLocaleString()} 人 / ${places.reduce((n,p)=>n+p.pops.length,0)} 个 POP / 出生 ${game.popStats.births} 死亡 ${game.popStats.deaths} 征发 ${game.popStats.levied}`)}
console.log("人口与世家通过：开局与税基持平 / 拆分合并 / 征兵守恒与户留劳力 / 户口分离 / 饥荒依附与流民 / 户籍清查 / 世家关系与操作 / 事件不凭空生人 / 县报与存档 / 界面 / 长推演");
