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
  // 分遣小队须由随军人物带队：每支军团配三名不领兵的部将。
  army.lieutenants=[1,2,3].map(n=>{const officer={id:`lt_${id}_${n}`,name:`${id}部将${n}`,force,city:'home',status:'serving',command:60,war:60,intelligence:50,politics:40,charm:40,loyalty:80};g.hydrateOfficer(officer);g.data.officers.push(officer);return {officerId:officer.id,units:{infantry:0,cavalry:0,archers:0}}});return army};
 const field=(army,mission='block',x=5,y=3)=>{army.fieldPosition={x,y};army.fieldOrder={mission,path:[],target:{x,y},credit:0,originCityId:'home'};army.stance=e.fieldMissionName(mission);return army};
 return {g,e,make,field};
}
// 拆兵、老兵、兵种、军仓各自守恒；路线逐格，并无隐式官路要求。
{const {g,e,make}=fresh(),parent=make('本军',10000),before=structuredClone(parent),beforeCityFood=g.data.cities[0].localFood,events=[],out=e.resolveFieldOrder(g,{armyIds:[parent.id],options:{mission:'harass',target:{x:5,y:5},detachSoldiers:2000}},events,'cao');
 assert(out.ok);const child=out.army;assert.equal(child.soldiers+parent.soldiers,before.soldiers);assert.equal(child.veterans+parent.veterans,before.veterans);
 for(const k of ['infantry','cavalry','archers'])assert.equal(child.units[k]+parent.units[k],before.units[k]||0);
 for(const k of ['gold','silk'])assert.equal(child.stores[k]+parent.stores[k],before.stores[k]);assert.equal(child.stores.food+parent.stores.food+g.data.cities[0].localFood,before.stores.food+beforeCityFood,'出发领粮只在城仓与军仓之间转移');
 let at=child.fieldPosition;for(const [x,y]of child.fieldOrder.path){assert.equal(Math.abs(x-at.x)+Math.abs(y-at.y),1);at={x,y}}
 assert(child.fieldOrder.path.some(p=>p[1]!==2),'离开官道行军');assert(child.raiding,'袭扰任务可截粮');assert.equal(child.detachedFrom,parent.id);
 const terrain=JSON.stringify(g.data.map),initial=structuredClone(child.fieldPosition);e.advanceFieldArmies(g,[]);assert(Math.hypot(child.fieldPosition.x-initial.x,child.fieldPosition.y-initial.y)<=1,'首日不瞬移到终点');assert.equal(JSON.stringify(g.data.map),terrain,'行军不修改地形或道路');
}
// 无效命令不先拆兵、扣粮，不能操作敌军或直接让大军逐格穿行。
{const {g,e,make}=fresh(),army=make('本军',10000),enemy=make('敌军',2000,'yuan');{const terrain=Array(160).fill('plains');terrain[5*16+5]='ocean';g.data.map.terrain=MapGrid.encode(terrain)}const before=JSON.stringify(g.data.armies);
 for(const [id,opts]of [[army.id,{mission:'strike',target:{x:5,y:5},detachSoldiers:1000}],[army.id,{mission:'strike',target:{x:4,y:4}}],[enemy.id,{mission:'block',target:{x:4,y:4}}]])assert.equal(e.resolveFieldOrder(g,{armyIds:[id],options:opts},[],'cao').ok,false);
 assert.equal(JSON.stringify(g.data.armies),before);assert.equal(e.fieldRoute(army,{x:99,y:99}).ok,false);
}
// 只有军仓供粮；不因后方锚点仍为 home 而吃远处城仓、驻城疗伤或参与守城。
{const {g,e,make,field}=fresh(),army=field(make('小队',1500),'hold',6,6),city=g.data.cities[0],stock=city.localFood,carried=army.stores.food,defence=e.siegeDefence(city);
 assert.equal(FiscalSystem.stationedCity(g,army),null);assert.equal(e.isStationed(army),false);FiscalSystem.consumeArmy(g,army,[]);assert.equal(city.localFood,stock);assert(army.stores.food<carried);
 g.data.armies=[];assert.equal(e.siegeDefence(city),defence,'野外小队不以锚点参与守城');
}
// 阻击命中途中路段，无需主力先到城；损失守恒并确实减速、降低组织，冷却防止单日重复刷伤害。
{const {g,e,make,field}=fresh(),raider=field(make('阻击队',2000)),target=make('行军主力',8000,'yuan',{route:['enemy'],legFrom:'home',legTo:'enemy',legElapsed:4,legDays:11}),before=target.soldiers,speed=e.armyDailyMarch(g,target),events=[];
 e.advanceFieldArmies(g,events);const ev=events.find(v=>v.skirmish);assert(ev);assert.equal(before-target.soldiers,ev.casualties.defender.total);assert.equal(ev.casualties.defender.killed+ev.casualties.defender.wounded,ev.casualties.defender.total);assert.equal(target.wounded,ev.casualties.defender.wounded);
 assert(target.cohesion<100);assert(e.armyDailyMarch(g,target)<speed);assert.equal(target.city,'home');assert.deepEqual(target.route,['enemy']);assert.equal(g.data.cities[1].force,'yuan');
 const n=events.length;e.advanceFieldArmies(g,events);assert.equal(events.length,n,'本日重复调用不能重复接敌');g.turn++;e.advanceFieldArmies(g,events);assert.equal(events.length,n,'次日仍在接战冷却中');
}
// 只有战争双方接战；地图预览不掷骰、不扣兵粮。
{const {g,e,make,field}=fresh(),army=field(make('小队',2000)),enemy=make('行军主力',8000,'yuan',{route:['enemy'],legElapsed:4,legDays:11});g.diplomacy.wars=[];const before=JSON.stringify({armies:g.data.armies,rng:g.rngState});for(let i=0;i<3;i++)e.fieldRoute(army,{x:6,y:6});assert.equal(JSON.stringify({armies:g.data.armies,rng:g.rngState}),before);const events=[];e.advanceFieldArmies(g,events);assert(!events.some(v=>v.skirmish));assert.equal(enemy.cohesion,100)}
// 突击后沿地形撤回，不瞬移；敌兵力越悬殊，小队会主动脱离。
{const {g,e,make,field}=fresh(),army=field(make('突击队',1000),'strike'),target=make('主力',15000,'yuan',{route:['enemy'],legElapsed:4,legDays:11}),events=[];e.advanceFieldArmies(g,events);assert(events.some(v=>v.skirmish));assert.equal(army.fieldOrder.mission,'withdraw');assert(army.fieldPosition.x>1);assert(army.fieldOrder.path.length);
 for(let i=0;i<40&&army.fieldPosition;i++){g.turn++;e.advanceFieldArmies(g,events)}assert(!army.fieldPosition);assert.equal(army.city,'home');assert.equal(army.stance,'驻扎');
}
// 组织度驻城/扎营恢复；急行军下降更快；旧军团默认完整组织。
{const {g,e,make,field}=fresh(),rest=make('驻军',2000,'cao',{cohesion:40});rest.force='cao';const road=make('行军',2000,'cao',{cohesion:80,route:['enemy']}),forced=make('急行',2000,'cao',{cohesion:80,route:['enemy'],movementMode:'forced_march'}),camp=field(make('休整',1000,'cao',{cohesion:40}),'hold',6,6);e.resolveArmyCohesion(g);assert(rest.cohesion>40&&camp.cohesion>40);assert(forced.cohesion<road.cohesion);assert.equal(e.armyOrganization(g,rest),Math.round(rest.cohesion));assert.equal(make('旧军',1000).cohesion,100)}
// 部队条与说明使用同一读数：敌方情报不足不泄露精确兵力和组织。
{const {g,e,make,field}=fresh(),enemy=field(make('秘密小队',1337,'yuan',{cohesion:63}),'harass',8,6),view=Object.create(MapView.prototype);Object.assign(view,{state:g,intelLevel:()=>0});g.intelligence.armies[enemy.id]=1;let info=view.militaryArmyReadout(enemy);assert.equal(info.organization,null);assert.equal(info.name,'未明部队');assert(!view.armyTooltip(enemy).includes('1337'));g.intelligence.armies[enemy.id]=2;info=view.militaryArmyReadout(enemy);assert.equal(info.organization,60);g.intelligence.armies[enemy.id]=3;assert.equal(view.militaryArmyReadout(enemy).organization,63);assert.equal(view.militaryArmyReadout(enemy).strength,'1,337');assert.equal(view.armyPosition(enemy).x,8)}
// 保存往返保留逐格位置、下一格、任务与组织度，旧档无字段仍能加载。
{const {g,e,make}=fresh(),army=make('小队',1000),terrain=Array(160).fill('plains');for(let y=0;y<10;y++)terrain[y*16+8]='ocean';g.data.map.terrain=MapGrid.encode(terrain);assert.equal(e.fieldRoute(army,{x:12,y:5}).ok,false,'海域完全隔开时不能穿海绕过');}
// AI 同样通过分兵与路径验证；部曲和粮食来自实际原军/城仓。
{const {g,e,make}=fresh(),parent=make('敌方主力',6000,'yuan',{city:'enemy'}),target=make('我方在途',8000,'cao',{route:['enemy'],legElapsed:8,legDays:11});g.data.rules.balance.skirmish={...e.skirmishRules(),ai_chance:1};e.runFieldAI(g,[]);const detachment=g.data.armies.find(a=>a.detachedFrom===parent.id);assert(detachment&&detachment.force==='yuan');assert.equal(detachment.soldiers+parent.soldiers,6000);assert.equal(detachment.fieldOrder.mission,'block');assert.equal(target.soldiers,8000,'分兵规划不直接攻击隔空目标');}
// 地图变更后，已排路线下一格成为海面时原地停止，不改回地图。
{const {g,e,make}=fresh(),army=make('小队',1000);assert(e.resolveFieldOrder(g,{armyIds:[army.id],options:{mission:'block',target:{x:4,y:4}}},[],'cao').ok);const at={...army.fieldPosition},next=army.fieldOrder.path[0],terrain=Array(160).fill('plains');terrain[next[1]*16+next[0]]='ocean';g.data.map={...g.data.map,terrain:MapGrid.encode(terrain)};army.fieldOrder.credit=10;e.advanceFieldArmies(g,[]);assert.deepEqual(army.fieldPosition,at);assert.equal(army.stance,'道路受阻');assert.equal(e.fieldTerrain({x:next[0],y:next[1]}),'ocean');}
{const data=await loader.loadScenario('200_guandu',{useSavedMap:false}),g=new GameState(structuredClone(data)),army=g.data.armies[0];army.fieldPosition={x:10,y:10};army.fieldOrder={mission:'block',target:{x:12,y:10},path:[[11,10],[12,10]],credit:.4};army.cohesion=42;const save=JSON.parse(JSON.stringify(g.serialize())),back=new GameState(structuredClone(data));back.applySave(back.migrateSave(save));const restored=back.data.armies.find(a=>a.id===army.id);assert.deepEqual(restored.fieldPosition,army.fieldPosition);assert.deepEqual(restored.fieldOrder,army.fieldOrder);assert.equal(restored.cohesion,42);delete save.world.armies[0].cohesion;back.applySave(back.migrateSave(save));assert.equal(back.data.armies[0].cohesion,100)}
console.log('小队突击/阻击/袭扰通过：逐格陆路 / 分兵守恒 / 跨海及越权拦截 / 在途接敌 / 迟滞与组织 / 冷却与战争条件 / 实际撤回 / 野外粮耗与驻城隔离 / 迷雾 / 存档兼容');

// 骑射混编且无步兵，分遣尾数不能从零步兵扣成负数。
{const {g,e,make}=fresh(),parent=make('混编',1000,'cao',{units:{infantry:0,cavalry:500,archers:500}}),out=e.resolveFieldOrder(g,{armyIds:[parent.id],options:{mission:'block',target:{x:4,y:4},detachSoldiers:101}},[],'cao');assert(out.ok);for(const k of ['infantry','cavalry','archers']){assert(parent.units[k]>=0&&out.army.units[k]>=0,'分遣不能生成负兵种');assert.equal(parent.units[k]+out.army.units[k],k==='infantry'?0:500)}}
// 撤回目的地失守后应重新找安全归路，不永久停留在失守节点。
{const {g,e,make,field}=fresh(),army=field(make('撤回队',1000),'withdraw',1,2);army.fieldOrder.target={x:1,y:2};g.data.cities[0].force='yuan';g.data.cities[1].force='cao';e.advanceFieldArmies(g,[]);assert(army.fieldOrder.path.length>0||army.fieldOrder.mission==='hold','失守目的地必须重选归路或明确就地收拢');}
// 同日撤编再分遣不复用旧军编号，避免粮队与返军引用指到另一支小队。
{const {g,e,make}=fresh(),parent=make('本军',5000),first=e.resolveFieldOrder(g,{armyIds:[parent.id],options:{mission:'hold',target:{x:2,y:3},detachSoldiers:101}},[],'cao').army;g.data.armies=g.data.armies.filter(a=>a!==first);const second=e.resolveFieldOrder(g,{armyIds:[parent.id],options:{mission:'hold',target:{x:2,y:3},detachSoldiers:101}},[],'cao').army;assert.notEqual(second.id,first.id);}
