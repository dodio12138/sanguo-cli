import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
globalThis.fetch=async url=>{try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+String(url).replace(/^\//,''),import.meta.url),'utf8'))}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==='undefined')globalThis.CustomEvent=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
for(const file of ['map-grid','data-loader','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${file}.js`);
await import('../js/ui/map-view.js');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../js/data/offline-data.generated.js',import.meta.url),'utf8'),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA),base=await loader.load({useSavedMap:false});
function fresh(){
 const g=new GameState(structuredClone(base),{playerForceId:'cao'}),e=g.engine;
 g.data.map={width:16,height:10,terrain:MapGrid.encode(Array(160).fill('plains')),rivers:[],roads:[{from:'home',to:'enemy',points:[[1,2],[12,2]]}],landmarks:[]};
 const template=g.data.cities[0];g.data.cities=[{...structuredClone(template),id:'home',name:'后方',x:1,y:2,force:'cao',localFood:90000},{...structuredClone(template),id:'enemy',name:'敌城',x:12,y:2,force:'yuan',localFood:90000}];
 g.data.rules.city_graph={home:['enemy'],enemy:['home']};g.data.routeNetwork={li_per_cell:48,kinds:{road:{name:'官道',speed_li:48,mode:'land',capacity:1,frontage:4}},routes:[{a:'home',b:'enemy',kind:'road'}]};
 g.data.armies=[];g.diplomacy.wars=['yuan'];g.diplomacy.worldWars=[];g.turn=10;
 const make=(id,soldiers,force='cao',extra={})=>{const army={id,name:id,force,city:'home',commander:'普通将领',soldiers,units:{infantry:soldiers,cavalry:0,archers:0},morale:80,training:60,supply:100,cohesion:100,veterans:Math.floor(soldiers*.4),stores:{gold:100,food:5000,silk:100},stance:'驻扎',...extra};g.hydrateArmy(army);g.data.armies.push(army);
  // 分遣小队须由随军人物带队：每支军团配两名不领兵的部将。
  army.lieutenants=[1,2].map(n=>{const officer={id:`lt_${id}_${n}`,name:`${id}部将${n}`,force,city:'home',status:'serving',command:60,war:60,intelligence:50,politics:40,charm:40,loyalty:80};g.hydrateOfficer(officer);g.data.officers.push(officer);return {officerId:officer.id,units:{infantry:0,cavalry:0,archers:0}}});return army};
 const field=(army,mission='block',x=5,y=3)=>{army.fieldPosition={x,y};army.fieldOrder={mission,path:[],target:{x,y},credit:0,originCityId:'home'};army.stance=e.fieldMissionName(mission);return army};
 return {g,e,make,field};
}

// 手动合队的兵员、军资、随军人员守恒；失败不能先扣兵。
{
 const {g,e,make}=fresh(),parent=make('本军',8000),child=make('别部',1000);
 child.force='cao';child.detachedFrom=parent.id;child.wounded=123;child.stragglers=45;child.prisoners={yuan:234};const officer=g.data.officers.find(o=>o.force==='cao'&&o.status==='serving');officer.city='home';child.commanderOfficerId=officer.id;child.commander=officer.name;
 const stock=parent.stores.food+child.stores.food,vets=parent.veterans+child.veterans;
 assert(e.mergeArmies(g,child,parent,[]).ok);assert.equal(parent.soldiers,9000);assert.equal(parent.units.infantry,9000);assert.equal(parent.stores.food,stock);assert.equal(parent.veterans,vets);assert.equal(parent.wounded,123);assert.equal(parent.stragglers,45);assert.equal(parent.prisoners.yuan,234);assert(parent.lieutenants.some(row=>row.officerId===officer.id),"别部主将并回后转为部将");assert(!g.data.armies.includes(child));assert(!parent.detachedFrom);
 const far=make('远军',1000);far.fieldPosition={x:7,y:7};const before=JSON.stringify(g.data.armies);assert(!e.mergeArmies(g,far,parent,[]).ok);assert.equal(JSON.stringify(g.data.armies),before);far.fieldPosition={x:1,y:2};far.engagementId='test';assert(!e.mergeArmies(g,far,parent,[]).ok);
}
// 下令时指定返军合并：期限从到位后计算，实际逐格返回后才并入。
for(const afterMission of ['merge','independent']){
 const {g,e,make}=fresh(),parent=make('本军',6000),out=e.resolveFieldOrder(g,{armyIds:[parent.id],options:{mission:'block',target:{x:3,y:3},detachSoldiers:1000,afterMission,missionDays:3}},[],'cao');assert(out.ok);const child=out.army,events=[];
 for(let i=0;i<90&&g.data.armies.includes(child)&&(!(!child.fieldPosition&&afterMission==='independent'));i++){g.turn++;e.advanceFieldArmies(g,events)}
 assert(events.some(v=>v.text.includes('任务结束')),'任务到期结束');
 if(afterMission==='merge'){assert(!g.data.armies.includes(child));assert.equal(parent.soldiers,6000,'自动合并兵员守恒')}else {assert(g.data.armies.includes(child)&&!child.fieldPosition,'独立队返回据点保留编制');assert.equal(parent.soldiers,5000)}
}
// 原军消失时归还安全县城；原军行军时不隔空合队；返回状态可读档。
{
 const {g,e,make,field}=fresh(),parent=make('本军',5000),child=field(make('别部',1000),'block',3,3);child.detachedFrom=parent.id;child.fieldOrder.afterMission='merge';e.completeFieldMission(g,child,[]);assert.equal(child.fieldOrder.mission,'merge');
 const save=JSON.parse(JSON.stringify(g.serialize())),restored=new GameState(structuredClone(base));restored.applySave(restored.migrateSave(save));assert.equal(restored.data.armies.find(a=>a.id===child.id).fieldOrder.targetArmyId,parent.id);
 g.data.armies=g.data.armies.filter(a=>a!==parent);g.turn++;e.advanceFieldArmies(g,[]);assert.equal(child.fieldOrder.mission,'withdraw');assert.equal(child.fieldOrder.afterMission,'independent');
}
// 阻击影响延续三日，冷却期间仍能迟滞；时间结束后恢复速度。
{
 const {g,e,make,field}=fresh(),raider=field(make('阻击队',2000)),target=make('敌军',5000,'yuan',{route:['enemy'],legFrom:'home',legTo:'enemy',legElapsed:4,legDays:11});const speed=e.armyDailyMarch(g,target);e.resolveSkirmish(g,raider,target,[]);assert.equal(target.fieldDisruption.untilTurn,g.turn+2);g.turn+=2;assert(e.armyDailyMarch(g,target)<speed);g.turn++;assert.equal(e.armyDailyMarch(g,target),speed);
}
console.log('小队任务期限、自动返军合并、独立留队、手动合队守恒、失败无副作用、存档和持续阻击通过');
