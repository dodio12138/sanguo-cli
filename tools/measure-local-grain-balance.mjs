// 固定驻军与人口的经济隔离对照：仅运行财政、军粮和粮队，不运行战争／扩军 AI，不访问用户存档。
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
globalThis.fetch=async url=>{try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+String(url).replace(/^\//,''),import.meta.url),'utf8'))}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==='undefined')globalThis.CustomEvent=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
await import('../js/data/offline-data.generated.js');
for(const name of ['data-loader','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${name}.js`);
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),results=[];
// 显式基线选项仅在内存载入本轮修改前的财政实现，不改工作区或地图。
if(args.baseline==='true')vm.runInThisContext(execFileSync('git',['show','81b095d:js/core/fiscal-system.js'],{encoding:'utf8'}));
for(const id of (args.scenarios||'200_guandu,263_jiange').split(',')){
 const data=await loader.loadScenario(id,{useSavedMap:false});if(args.baseline==='true')data.rules.balance.food.garrison_stationed_factor=.1;if(args.factor)data.rules.balance.food.garrison_stationed_factor=Number(args.factor);if(args.target)data.rules.balance.grain.relief_target_days=Number(args.target);if(args.batch)data.rules.balance.grain.relief_batch=Number(args.batch);
 const state=new GameState(structuredClone(data),{playerForceId:data.scenario.default_player_force||data.scenario.player_force||'cao'}),force=state.playerForceId,cities=state.data.cities.filter(c=>c.force===force);let dispatches=0,relief=0,remitted=0,loss=0,hungryArmyDays=0,shortCityDays=0,recirculated=0;
 const perCity=new Map(cities.map(c=>[c.id,{id:c.id,name:c.name,type:c.type||'city',rank:c.commanderySeatNode?'commandery':'county',population:c.population,localFood:c.localFood,dispatches:0,relief:0,shortDays:0,emptyDays:0,minFood:c.localFood,maxAdministrativeDaily:0}]));
 const shipped=new Set,original=FiscalSystem.enqueue;FiscalSystem.enqueue=function(s,options){const cargo=original.call(this,s,options);if(cargo&&options.forceId===force&&options.resource==='food'){if(options.purpose==='中央济粮'){dispatches++;relief+=cargo.amount;const row=perCity.get(options.targetCityId);if(row){row.dispatches++;row.relief+=cargo.amount;}if(shipped.has(options.targetCityId))recirculated++}else if(options.targetKind!=='army'&&options.purpose!=='补给'){remitted+=cargo.amount;shipped.add(options.sourceCityId)}loss+=cargo.transportLoss||0}return cargo};
 for(let day=0;day<Number(args.days||730);day++){
  FiscalSystem.settle(state,[],{rolling:true});state.engine.consumeLocalSupplies(state,[]);state.engine.advanceConvoys(state,[]);
  for(const c of cities){const row=perCity.get(c.id),usage=c.fiscal.localConsumption;row.minFood=Math.min(row.minFood,c.localFood||0);row.maxAdministrativeDaily=Math.max(row.maxAdministrativeDaily,usage?.foodNeed||0);if(!(c.localFood>0))row.emptyDays++;if((usage?.foodNeed||0)>(usage?.food||0)){shortCityDays++;row.shortDays++;}}
  for(const a of state.data.armies)if(a.force===force&&a.stores?.lastConsumption?.short>0)hungryArmyDays++;
  state.turn++;state.date=GameClock.next(state.date);
 }
 FiscalSystem.enqueue=original;results.push({scenario:id,force,days:Number(args.days||730),cities:cities.length,dispatches,relief,remitted,transportLoss:loss,reliefAfterRemit:recirculated,shortCityDays,hungryArmyDays,centralFood:Math.floor(state.resources.food),places:[...perCity.values()].sort((a,b)=>b.population-a.population)});
}
console.log(JSON.stringify(results,null,2));if(args.output)fs.writeFileSync(args.output,JSON.stringify(results,null,2)+'\n');
