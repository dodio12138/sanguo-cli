// 多种兵力、兵种、士气、组织和固定种子的战斗不变量；独立内存战局，不访问用户存档。
import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
if(typeof CustomEvent==='undefined')globalThis.CustomEvent=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
await import('../js/data/offline-data.generated.js');
for(const name of ['data-loader','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${name}.js`);
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});const scenario=await loader.loadScenario('200_guandu',{useSavedMap:false});
function check(state,label){const ids=new Set,active=new Set(state.data.armies.map(a=>a.engagement?.id).filter(Boolean));
 for(const a of state.data.armies){assert(!ids.has(a.id),`${label}: 重复军团编号`);ids.add(a.id);for(const key of ['soldiers','wounded','stragglers','veterans']){const n=a[key]??0;assert(Number.isInteger(n)&&n>=0,`${label}: ${a.id}.${key}=${n}`)}assert(a.veterans<=a.soldiers,`${label}: 老兵超过健卒`);let total=0;for(const n of Object.values(a.units||{})){assert(Number.isInteger(n)&&n>=0,`${label}: 非法兵种人数`);total+=n}assert.equal(total,a.soldiers,`${label}: 兵种合计不符`);for(const key of ['morale','supply','cohesion'])assert(Number.isFinite(a[key])&&a[key]>=0&&a[key]<=100,`${label}: ${key} 越界`);for(const n of Object.values(a.prisoners||{}))assert(Number.isInteger(n)&&n>=0,`${label}: 非法战俘人数`);for(const key of ['gold','food','silk'])assert(Number.isFinite(a.stores?.[key]??0)&&(a.stores?.[key]??0)>=0,`${label}: 军资异常`);if(a.engagementId)assert(active.has(a.engagementId),`${label}: 悬空战局引用`)}
 for(const c of state.data.cities){assert(Number.isInteger(c.garrison)&&c.garrison>=0,`${label}: 守军异常`);assert(Number.isFinite(c.defenseDamage)&&c.defenseDamage>=0&&c.defenseDamage<=100,`${label}: 城防异常`)}
}
let days=0,battles=0;
for(let seed=1;seed<=12;seed++){
 const state=new GameState(structuredClone(scenario),{playerForceId:'cao'}),e=state.engine;state.rngState=seed*100019;state.diplomacy.wars=['yuan'];e.playerForceId='cao';state.data.armies=[];
 const site=state.data.cities.find(c=>(state.data.rules.city_graph[c.id]||[]).length>=2),[from,haven]=state.data.rules.city_graph[site.id].slice(0,2).map(id=>state.data.cities.find(c=>c.id===id));site.force='cao';from.force='yuan';haven.force='cao';
 const make=(id,force,city,soldiers,extra={})=>{const cavalry=seed%2?Math.floor(soldiers/2):0,army={id,name:id,force,city:city.id,soldiers,units:{infantry:seed%2?0:soldiers,cavalry,archers:seed%2?soldiers-cavalry:0},commander:'无名将',morale:70,supply:100,training:60,cohesion:100,stores:{gold:100,food:10000,silk:10},...extra};state.hydrateArmy(army);state.data.armies.push(army);return army};
 const attacker=make('A','yuan',site,seed%3===0?100:500+seed*1600,{morale:seed%4===0?10:80,cohesion:seed%5===0?5:100}),defender=make('D','cao',site,1000+seed*700,{wounded:seed*7,prisoners:{liu:seed}});
 const events=[];e.startFieldBattle(attacker,[defender],from,site,'road',state,events);check(state,`野战 ${seed}/首日`);
 let day=0;while(state.data.armies.some(a=>a.engagement)&&day++<120){state.turn++;e.advanceFieldBattles(state,events);check(state,`野战 ${seed}/${day}`);days++}assert(day<120,'持续野战应按组织或士气脱离');battles++;
 // 同一固定种子再覆盖四种围法、缺粮和优势／劣势攻城。
 state.data.armies=[];site.force='cao';site.garrison=1000+seed*500;site.localFood=seed%2?0:1000000;site.siegeMorale=70;site.defenseDamage=0;from.force='yuan';from.localGold=100000;delete site.siegeResolvedTurn;
 const method=['blockade','assault','tunnel','flood'][(seed-1)%4];e.cityRiverside=()=>true;make('S','yuan',from,1000+seed*2000,{siegeTarget:site.id,siegeMethod:method,stores:{gold:100000,food:1000000,silk:0}});make('G','cao',site,1000,{wounded:17});
 for(let n=0;n<60&&e.isCityBesieged(site);n++){state.turn++;e.consumeLocalSupplies(state,events);e.resolveSieges(state,events,{daily:true});e.resolveArmyMedical(state,events);check(state,`围城 ${seed}/${n}`);days++}battles++;
}
console.log(`战斗不变量通过：12 种固定种子、${battles} 场野战／围城、${days} 个战斗日；兵种合计、伤员、老兵、资源、重复编号及战局引用合法`);
