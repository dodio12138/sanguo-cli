// 溃退须逐日行军；同路追上、迎面截击和保存往返保留实际位置。
import assert from "node:assert/strict";
import fs from "node:fs";
globalThis.window=globalThis;globalThis.location={protocol:"http:"};globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(String(url),"utf8"))});
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const name of ["data-loader","map-grid","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${name}.js`);
await import("../js/data/offline-data.generated.js");await import("../js/ui/map-view.js");
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});const source=await loader.loadScenario("200_guandu",{useSavedMap:false});
function fresh(){const g=new GameState(structuredClone(source),{playerForceId:"cao"}),e=g.engine;g.diplomacy.wars=["yuan"];e.playerForceId="cao";g.data.armies=[];
  const site=g.data.cities.find(c=>c.force==="cao"&&g.data.rules.city_graph[c.id]?.length>=2),[from,back]=g.data.rules.city_graph[site.id].slice(0,2).map(id=>g.data.cities.find(c=>c.id===id));from.force="cao";back.force="yuan";g.data.routeNetwork=null;e.legCache=new Map();
  const make=(id,force,city,soldiers=8000,extra={})=>{const a={id,name:id,force,city:city.id,commander:"无名将",soldiers,units:{infantry:soldiers,cavalry:0,archers:0},morale:80,training:70,supply:100,stance:"驻扎",stores:{gold:0,food:2000,silk:0},...extra};g.hydrateArmy(a);g.data.armies.push(a);return a};
  return {g,e,site,from,back,make};}
function position(g,a){const view=Object.create(MapView.prototype);view.state=g;view.legPoints=(from,to)=>[g.data.cities.find(c=>c.id===from),g.data.cities.find(c=>c.id===to)].map(c=>[c.x,c.y]);return view.armyPosition(a)}
// 野战后的败军仍在战场，次日起按日移动，不在友城提前疗养。
{const {g,e,site,from,back,make}=fresh(),attacker=make("追兵","cao",site,24000),defender=make("败军","yuan",site,8000,{retreatLine:0}),events=[];
 assert(e.resolveFieldBattle(attacker,[defender],from,site,"road",g,events,{retreatTo:new Map([[defender,back]])}));assert.equal(defender.city,site.id);assert.deepEqual(defender.route,[back.id]);assert(defender.retreat.routed);assert.equal(position(g,defender).x,site.x);
 // 刚战败的守方不因在数组后面而同日获得额外撤退距离。
 e.advanceArmies(g,[]);assert.equal(defender.legElapsed,0);g.turn++;e.advanceArmies(g,[]);assert.equal(defender.city,site.id);assert(defender.legElapsed>0&&defender.legElapsed<defender.legDays);assert(position(g,defender).moving);
 const save=JSON.parse(JSON.stringify(g.serialize())),restored=new GameState(structuredClone(source),{playerForceId:"cao"});restored.applySave(restored.migrateSave(save));const a=restored.data.armies.find(a=>a.id===defender.id);assert.deepEqual(a.retreat,defender.retreat);assert.equal(a.legElapsed,defender.legElapsed);assert.deepEqual(a.route,defender.route);
 for(let day=0;day<30&&defender.route?.length;day++){g.turn++;e.advanceArmies(g,[])}assert.equal(defender.city,back.id);assert(!defender.retreat);assert.equal(defender.stance,"败退");}
// 同路追击：较快追兵追上溃军，途中再次战败不会跳回起点。
for(const reverse of [false,true]){const {g,e,site,back,make}=fresh(),runner=make("溃军","yuan",site,5000,{morale:10,retreatLine:0}),pursuer=make("追军","cao",site,18000);e.beginRetreat(g,runner,site,back);runner.legElapsed=1;pursuer.route=[back.id];pursuer.destination=back.id;pursuer.movementMode="forced_march";pursuer.legElapsed=0;g.turn++;
 if(reverse)g.data.armies.reverse();const events=[];for(let day=0;day<3&&!events.some(ev=>ev.rounds);day++){e.advanceArmies(g,events);g.turn++}assert(events.some(ev=>ev.text.includes("追上")),"追兵必须在路上接战");assert(events.some(ev=>ev.phase==="野战"&&ev.rounds));assert(runner.legElapsed>1,"再次败退保留接战位置");assert.equal(runner.city,site.id);assert(pursuer.defeatedThisTurn);}
// 追不上时不隔空伤敌；未交战的势力不触发截击。
{const {g,e,site,back,make}=fresh(),runner=make("溃军","yuan",site),pursuer=make("追军","cao",site);e.beginRetreat(g,runner,site,back);runner.legElapsed=5;pursuer.route=[back.id];g.turn++;const events=[];e.advanceArmies(g,events);assert(!events.some(ev=>ev.rounds));assert(runner.legElapsed>5);g.diplomacy.wars=[];runner.legElapsed=1;pursuer.legElapsed=1;pursuer.movementMode="forced_march";e.resolveRoadPursuits(g,events);assert(!events.some(ev=>ev.rounds));}
// 迎面截击与原地折返：路上败方不凭空回到任一端点。
{const {g,e,site,back,make}=fresh(),runner=make("溃军","yuan",site,5000,{morale:10,retreatLine:0}),blocker=make("截军","cao",back,18000);e.beginRetreat(g,runner,site,back);runner.legElapsed=5;blocker.route=[site.id];blocker.legElapsed=4.5;g.turn++;const events=[];e.advanceArmies(g,events);assert(events.some(ev=>ev.text.includes("截住")));assert(runner.legElapsed>5);assert.equal(runner.city,site.id);
 const before=position(g,runner),fraction=runner.legElapsed/runner.legDays;e.beginRetreat(g,runner,site,site,{position:{from:site.id,to:back.id,fraction}});const after=position(g,runner);assert(Math.abs(before.x-after.x)<1e-8&&Math.abs(before.y-after.y)<1e-8,"折返不能跳回端点");}
// 破城守军同样留下真实撤退路线；仍在撤退的军队不计入城防。
{const {g,e,site,from,back,make}=fresh();site.force="yuan";const attacker=make("攻军","cao",from,24000),defender=make("守军","yuan",site,8000);e.completeSiegeCapture(site,[attacker],[defender],"cao",g,[],"test");assert.equal(defender.city,site.id);assert(defender.route?.length);assert(defender.retreat);const destination=g.data.cities.find(c=>c.id===defender.destination);assert.equal(destination.force,"yuan");assert.equal(e.siegeDefence(destination),destination.garrison*e.cityFortification(destination));}
console.log("撤退追击通过：野战及破城不瞬移 / 逐日退却 / 同日不多走 / 同向追上 / 迎面截击 / 不隔空追击 / 未宣战不截击 / 推进顺序一致 / 再战和折返位置连续 / 保存往返 / 抵达后整备");
