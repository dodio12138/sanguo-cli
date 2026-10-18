import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
if(typeof CustomEvent==='undefined')globalThis.CustomEvent=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
await import('../js/data/offline-data.generated.js');
for(const file of ['data-loader','map-grid','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${file}.js`);
const base=await new DataLoader(SANGUO_DATA).load({useSavedMap:false});
function setup(){const state=new GameState(structuredClone(base),{playerForceId:'cao'}),e=state.engine;state.turn=101;state.date={year:200,month:2,day:1,xun:0};state.diplomacy.wars=['yuan'];e.playerForceId='cao';state.data.armies=[];
 const city=state.data.cities.find(c=>c.force==='yuan'&&(state.data.rules.city_graph[c.id]||[]).length),camp=state.data.cities.find(c=>c.id===state.data.rules.city_graph[city.id][0]);camp.force='cao';city.garrison=3000;city.localFood=0;city.localGold=1000;city.localSilk=100;city.siegeMorale=80;city.defenseDamage=0;
 const attacker={id:'siege-test-a',name:'围军',force:'cao',city:camp.id,siegeTarget:city.id,siegeMethod:'blockade',soldiers:20000,units:{infantry:20000,cavalry:0,archers:0},morale:90,training:70,supply:100,stores:{gold:0,food:100000,silk:0},commander:'无名将'},defender={id:'siege-test-d',name:'守军',force:'yuan',city:city.id,soldiers:2000,units:{infantry:2000,cavalry:0,archers:0},morale:80,training:60,supply:100,stores:{gold:100,food:0,silk:30},commander:'无名将',wounded:123,stragglers:17};
 for(const a of [attacker,defender]){state.hydrateArmy(a);state.data.armies.push(a)}return {state,e,city,camp,attacker,defender}}
// 非旬末也推进，实耗与断粮每天反映；同日重入与读档不重复结算。
{
 const {state,e,city,defender}=setup(),events=[],morale=city.siegeMorale,defMorale=defender.morale;e.consumeLocalSupplies(state,events);e.resolveSieges(state,events,{daily:true});
 assert.equal(city.siegeTurns,.1);assert(city.siegeMorale<morale&&defender.morale<defMorale);assert.equal(city.localFood,0,'没有无来源偷运补粮');assert(city.defenseDamage>0);
 const snapshot=JSON.stringify({city,defender});e.resolveSieges(state,[],{daily:true});assert.equal(JSON.stringify({city,defender}),snapshot,'同日不重复结算');
 const save=JSON.parse(JSON.stringify(state.serialize())),restored=new GameState(structuredClone(base),{initializeGrain:false});restored.applySave(restored.migrateSave(save));const back=restored.data.cities.find(c=>c.id===city.id),damage=back.defenseDamage;restored.engine.resolveSieges(restored,[],{daily:true});assert.equal(back.defenseDamage,damage,'读档后同日不重复伤害');
 state.turn++;state.date.day++;e.consumeLocalSupplies(state,[]);e.resolveSieges(state,events,{daily:true});assert.equal(city.siegeTurns,.2);assert(city.siegeMorale<morale-1);
}
// 完整日模拟在非旬末也触发围城，不能只让直接调用通过。
{
 const {state,city}=setup();const morale=city.siegeMorale;state.endTurn();assert.equal(city.siegeTurns,.1);assert(city.siegeMorale<morale);assert.equal(state.date.day,2);
}
// 工期按日积累，不能因改每日调用十倍加速筹备。
{
 const {state,e,city,attacker}=setup();city.garrison=100000;city.localFood=1000000;attacker.siegeMethod='assault';
 for(let day=1;day<=10;day++){state.turn=100+day;e.resolveSieges(state,[],{daily:true})}
 assert.equal(city.siegeWorks,1);assert.equal(city.force,'yuan');state.turn++;e.resolveSieges(state,[],{daily:true});assert.equal(city.siegeWorks,1.1);
}
// 投降：原守军全部进入战俘池，驻防来自攻军实际拨出；县仓只损耗与移交，不复制进中央。
{
 const {state,e,city,attacker,defender}=setup();city.localFood=1000;const enemyTotal=city.garrison+defender.soldiers+defender.wounded+defender.stragglers,start=attacker.soldiers,central=state.resources.food,events=[];
 e.completeSiegeCapture(city,[attacker],[defender],'cao',state,events,'test',true);
 assert.equal(city.prisoners.yuan,enemyTotal);assert.equal(attacker.soldiers+city.garrison,start,'新驻防不凭空生成');assert.equal(city.garrison,1000);assert(!state.data.armies.includes(defender));assert.equal(attacker.stores.gold,100);assert.equal(attacker.stores.silk,30);assert.equal(state.resources.food,central,'县仓不重复计入中央');assert.equal(city.localFood,900);assert.equal(city.localGold,950);assert.equal(city.localSilk,95);assert(events.some(v=>v.resourceLosses));
 assert.equal(city.fiscal.pendingRemittance.food,0,'不继承旧主未缴欠额');
}
// 破城有路：原守军形成真实退军，伤员与溃散仍有去向；无路则俘虏，不硬塞200守军。
for(const escape of [true,false]){
 const {state,e,city,camp,attacker,defender}=setup();state.data.rules.city_graph[city.id]=[camp.id];
 if(escape){const back=state.data.cities.find(c=>c.id!==city.id&&c.id!==camp.id);back.force='yuan';state.data.rules.city_graph[city.id].push(back.id)}
 const own=attacker.soldiers,enemy=city.garrison+defender.soldiers+defender.wounded+defender.stragglers,events=[];
 e.completeSiegeCapture(city,[attacker],[defender],'cao',state,events,'storm',false);
 const lost=events.find(v=>v.casualties)?.casualties.defender;
 assert.equal(attacker.soldiers+city.garrison,own,'占领驻军从攻方扣出');
 const survivors=state.data.armies.filter(a=>a.force==='yuan').reduce((n,a)=>n+a.soldiers+(a.wounded||0)+(a.stragglers||0),0);
 assert.equal(survivors+(city.prisoners.yuan||0)+lost.killed+(escape?0:lost.scattered),enemy,'守方健卒、伤员、溃散、俘虏和阵亡守恒');
 if(escape){assert(defender.retreat);assert.equal(defender.city,city.id,'败退不瞬移');assert(state.data.armies.some(a=>a.name.includes('败退守军')))}else assert(city.prisoners.yuan>0);
}
// 失效围城不能永久挂起；旧同城营地能校正，远离目标则解除。
{
 const {state,e,city,camp,attacker}=setup();attacker.city=city.id;e.auditSieges(state,[]);assert.equal(attacker.city,camp.id);assert(attacker.siegeTarget);
 attacker.city=state.data.cities.find(c=>c.id!==city.id&&!(state.data.rules.city_graph[c.id]||[]).includes(city.id)).id;const events=[];e.auditSieges(state,events);assert(!attacker.siegeTarget);assert(events.some(v=>v.text.includes('失效围城')));
}
// 自动修城要有粮有钱，费用与修复点数对应；断粮、没钱或被围不免费涨城防。
{
 const {state,e,city,camp,attacker}=setup();state.data.armies=[];city.force='cao';e.initializeAdministration();city.defenseDamage=20;city.localGold=10000;city.localFood=10000;city.administration.recruitmentTarget=city.garrison;city.administration.progress.defense=1;const before=city.localGold;
 e.administerCities(state,[city],new Set());const repaired=20-city.defenseDamage;assert(repaired>0);assert.equal(before-city.localGold,Math.ceil(repaired*e.defenseRepairCost(city)));
 for(const resource of ['localGold','localFood']){city[resource]=0;city.administration.progress.defense=1;const damage=city.defenseDamage;e.administerCities(state,[city],new Set());assert.equal(city.defenseDamage,damage);city[resource]=10000}
 attacker.force='yuan';attacker.city=camp.id;attacker.siegeTarget=city.id;state.data.armies.push(attacker);const damage=city.defenseDamage;e.administerCities(state,[city],new Set());assert.equal(city.defenseDamage,damage);
}
console.log('围城每日推进、断粮、工期、重入与存档、守军及资源守恒、退路、失效营地与付费修城通过');

// 材料从实际军资／营地库扣除；无钱停工、资金恢复后续建，营造工作计人日。
{
 const {state,e,city,camp,attacker}=setup();city.garrison=100000;city.localFood=1000000;attacker.siegeMethod='assault';camp.localGold=0;attacker.stores.gold=0;
 const central=state.resources.gold;e.resolveSieges(state,[],{daily:true});assert.equal(city.siegeWorks||0,0);assert.match(city.siegeEngineering.blocked,/经费/);assert.equal(city.siegeEngineering.gold,0);
 state.turn++;attacker.stores.gold=100;e.resolveSieges(state,[],{daily:true});assert.equal(city.siegeWorks,.1);assert.equal(attacker.stores.gold,94);assert.equal(city.siegeEngineering.gold,6);assert.equal(city.siegeEngineering.laborDays,500);assert(!city.siegeEngineering.blocked);assert.equal(state.resources.gold,central,'不远程调用中央钱币');
 state.turn++;attacker.stores.gold=0;camp.localGold=100;e.resolveSieges(state,[],{daily:true});assert.equal(camp.localGold,94);assert.equal(city.siegeEngineering.gold,12);
 const save=JSON.parse(JSON.stringify(state.serialize())),restored=new GameState(structuredClone(base),{initializeGrain:false});restored.applySave(restored.migrateSave(save));assert.deepEqual(restored.data.cities.find(c=>c.id===city.id).siegeEngineering,city.siegeEngineering);
}
// 已在路上的驻地锚点军团、溃军不重复参与守城或被破城结算吞掉。
{
 const {state,e,city,camp,attacker,defender}=setup();const neighbor=state.data.cities.find(c=>c.id===(state.data.rules.city_graph[city.id]||[]).find(id=>id!==camp.id));if(neighbor)neighbor.force=city.force;
 const moving=structuredClone(defender);moving.id='already-departed';moving.route=[neighbor?.id||camp.id];moving.legElapsed=1;moving.legDays=10;
 const retreating=structuredClone(defender);retreating.id='already-retreating';retreating.retreat={startedTurn:state.turn-1,routed:true};retreating.route=[neighbor?.id||camp.id];state.data.armies.push(moving,retreating);
 assert.deepEqual(e.cityDefendingArmies(city).map(a=>a.id),[defender.id]);const soldiers=[moving.soldiers,retreating.soldiers];e.completeSiegeCapture(city,[attacker],[defender,moving,retreating],'cao',state,[],'departure',true);assert(state.data.armies.includes(moving)&&state.data.armies.includes(retreating));assert.deepEqual([moving.soldiers,retreating.soldiers],soldiers);
}
