globalThis.window=globalThis;
if(typeof globalThis.CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const fallback=/未通过规则路由|尚在规划/;

function fixture(){
  const state=new GameState(structuredClone(globalThis.SANGUO_DATA),{playerForceId:"cao",difficulty:"normal"});
  state.resources={gold:10_000_000,food:10_000_000,prestige:10_000};
  state.technology.points=10_000;
  state.technology.levels={agriculture:0,military:0,logistics:0,administration:0};
  const ownCities=state.data.cities.filter(city=>city.force===state.playerForceId),ownCity=ownCities.find(city=>(city.type||"city")==="city")||ownCities[0],ownCity2=ownCities.find(city=>city.id!==ownCity.id)||ownCity;
  for(const city of ownCities){city.localGold=50_000;city.localFood=50_000;city.storage=100_000;city.garrison=Math.max(city.garrison||0,12_000);city.level=Math.min(city.level||1,4);city.buildings=[];city.defenseDamage=50}
  const ownArmy=state.data.armies.find(army=>army.force===state.playerForceId);ownArmy.city=ownCity.id;ownArmy.soldiers=Math.max(ownArmy.soldiers,5_000);ownArmy.units={infantry:ownArmy.soldiers,cavalry:0,archers:0};ownArmy.supply=100;ownArmy.morale=90;ownArmy.training=80;delete ownArmy.route;delete ownArmy.siegeTarget;
  const ownOfficers=state.data.officers.filter(officer=>officer.force===state.playerForceId&&officer.status==="serving");for(const officer of ownOfficers){officer.city=ownCity.id;officer.stamina=100;officer.loyalty=80}
  const enemyForce=state.data.forces.find(force=>![state.playerForceId,"neutral"].includes(force.id)),neighborId=(state.data.rules.city_graph[ownCity.id]||[])[0],enemyCity=state.data.cities.find(city=>city.id===neighborId)||state.data.cities.find(city=>city.force===enemyForce.id);enemyCity.force=enemyForce.id;enemyCity.localGold=50_000;enemyCity.localFood=50_000;
  const enemyCity2=state.data.cities.find(city=>city.force===enemyForce.id&&city.id!==enemyCity.id)||enemyCity;
  const enemyArmy=state.data.armies.find(army=>army.force!==state.playerForceId)||structuredClone(ownArmy);enemyArmy.force=enemyForce.id;enemyArmy.city=enemyCity.id;
  const enemyOfficers=state.data.officers.filter(officer=>officer.force!==state.playerForceId&&officer.status==="serving"),enemyOfficer=enemyOfficers[0];
  const talent=enemyOfficers[1]||state.data.officers.find(officer=>officer.id!==enemyOfficer?.id);talent.force="neutral";talent.status="discovered";talent.city=ownCity.id;
  const prisoner=enemyOfficers[2]||state.data.officers.find(officer=>![enemyOfficer?.id,talent.id].includes(officer.id));prisoner.originalForce=prisoner.force;prisoner.status="prisoner";prisoner.capturedBy=state.playerForceId;prisoner.city=ownCity.id;
  const secondEnemyForce=state.data.forces.find(force=>![state.playerForceId,"neutral",enemyForce.id].includes(force.id))||enemyForce;
  state.relations[enemyForce.id]=80;state.relations[secondEnemyForce.id]=80;state.diplomacy.wars=[enemyForce.id];
  state.corps=[{id:"qa_corps",name:"第1军团",leaderId:ownOfficers[0]?.id,armyIds:[ownArmy.id],cityIds:[ownCity.id]}];
  const relationKey=[ownOfficers[0]?.id,ownOfficers[1]?.id].sort().join(":");state.personalRelations[relationKey]=60;
  state.data.items??=[];if(!state.data.items.length)state.data.items.push({id:"qa_item_free",name:"QA宝物",owner:null});
  const freeItem=state.data.items.find(item=>!item.owner)||state.data.items[0];freeItem.owner=null;
  const ownedItem=state.data.items.find(item=>item.id!==freeItem.id)||{id:"qa_item_owned",name:"QA印绶",owner:ownOfficers[0]?.id};if(!state.data.items.includes(ownedItem))state.data.items.push(ownedItem);ownedItem.owner=ownOfficers[0]?.id;
  state.engine.playerForceId=state.playerForceId;
  return {state,ownCity,ownCity2,ownArmy,ownOfficers,enemyCity,enemyCity2,enemyArmy,enemyOfficer,talent,prisoner,enemyForce,secondEnemyForce,freeItem,ownedItem};
}

function payloadFor(command,ctx){
  const {state,ownCity,ownCity2,ownArmy,ownOfficers,enemyCity,enemyCity2,enemyArmy,enemyOfficer,talent,prisoner,enemyForce,secondEnemyForce,freeItem,ownedItem}=ctx;
  const payload={text:`${command.categoryName}/${command.name}`,targetIds:[],cityIds:[],armyIds:[],officerIds:[],forceIds:[],itemIds:[],amount:1000,options:{}};
  const city=id=>{payload.cityIds.push(id);payload.targetIds.push(id)};
  const army=id=>{payload.armyIds.push(id);payload.targetIds.push(id)};
  const officer=id=>{payload.officerIds.push(id);payload.targetIds.push(id)};
  const force=id=>{payload.forceIds.push(id);payload.targetIds.push(id)};
  const item=id=>{payload.itemIds.push(id);payload.targetIds.push(id)};
  const ownOfficerCommands=new Set(["transfer_officer","recall_officer","exile_officer","reward_officer","punish_officer","appoint_office","dismiss_office","promote_office","demote_office","designate_heir","set_advisor","study","personal_training","rest"]);
  const armyCommands=new Set(["train_troops","disband_army","reinforce","return_garrison","camp","ambush","explore"]);
  const ownCityCommands=new Set(["search_talent","agriculture","commerce","public_order","population","city_defense","recruit_troops","collect_tax","construct_building","repair","build_warehouse","fortify","waterworks","set_storage","requisition_labor","promote_technology"]);
  if(ownCityCommands.has(command.id))city(ownCity.id);
  if(armyCommands.has(command.id))army(ownArmy.id);
  if(ownOfficerCommands.has(command.id))officer(command.id==="exile_officer"?(ownOfficers.find(item=>item.name!==state.data.forces.find(force=>force.id===state.playerForceId)?.name)||ownOfficers[0]).id:ownOfficers[0].id);
  if(command.id==="recruit_officer")officer(talent.id);
  if(command.id==="release_prisoner")officer(prisoner.id);
  if(["poach_officer","sow_discord","bribe","instigate_defection","investigate_person"].includes(command.id))officer(enemyOfficer.id);
  if(command.id==="grant_item"){officer(ownOfficers[0].id);item(freeItem.id)}
  if(command.id==="confiscate_item"){officer(ownOfficers[0].id);item(ownedItem.id)}
  if(command.id==="create_corps"){officer(ownOfficers[0].id);army(ownArmy.id);city(ownCity.id)}
  if(["disband_corps","adjust_jurisdiction","set_leader"].includes(command.id)){payload.text+=` 第1军团`;payload.options.corpsIds=["qa_corps"];if(command.id==="adjust_jurisdiction")city(ownCity2.id);if(command.id==="set_leader")officer(ownOfficers[1]?.id||ownOfficers[0].id)}
  if(["build_road","transfer_gold","transfer_food","transport","establish_supply_route"].includes(command.id)){city(ownCity.id);city(ownCity2.id)}
  if(command.id==="form_army"){city(ownCity.id);officer(ownOfficers[0].id);payload.amount=3000;payload.options={name:"QA新军",units:{infantry:2000,cavalry:500,archers:500}}}
  if(command.id==="reorganize_army"){army(ownArmy.id);payload.options={name:ownArmy.name,units:structuredClone(ownArmy.units),formation:"balanced",tactic:"balanced"}}
  if(["redeploy","assemble","move","forced_march","retreat"].includes(command.id)){army(ownArmy.id);city(ownCity2.id)}
  if(command.id==="raid"){army(ownArmy.id);city(enemyCity.id)}
  if(["scout_city","investigate_route","investigate_terrain","incite","establish_inside_contact","sabotage","spread_rumor","set_military_goal"].includes(command.id))city(enemyCity.id);
  if(command.id==="scout_army")army(enemyArmy.id);
  if(command.id==="counterintelligence")city(ownCity.id);
  if(command.categoryId==="diplomacy"){force(enemyForce.id);if(["coalition","request_war_entry"].includes(command.id))force(secondEnemyForce.id)}
  if(command.id==="request_reinforcements")city(ownCity.id);
  if(command.id==="exchange_land"){city(ownCity.id);city(enemyCity2.id)}
  if(command.id==="construct_building")payload.options.building=Object.keys(state.data.rules.buildings||{})[0]||"market";
  if(command.id==="set_development_policy")payload.text+=" 农业优先";
  if(command.id==="set_diplomatic_policy")payload.text+=" 强硬";
  if(command.id==="set_fiscal_policy")payload.text+=" 扩张";
  if(command.id==="set_authority")payload.text+=" 自动执行";
  if(["research","reform"].includes(command.id))payload.text+=" 农政";
  if(command.categoryId==="relationship"){
    payload.officerIds=[];payload.targetIds=[];officer(ownOfficers[0].id);officer(command.id==="recommend"?talent.id:(ownOfficers[1]?.id||ownOfficers[0].id));
  }
  if(command.id==="travel"){officer(ownOfficers[0].id);city(ownCity2.id)}
  if(command.id==="personal_investigation"){officer(ownOfficers[0].id);city(enemyCity.id)}
  if(["buy_food","sell_food","set_tax_rate","set_storage"].includes(command.id))payload.amount=command.id==="set_tax_rate"?15:command.id==="set_storage"?40:1000;
  return payload;
}

const catalog=globalThis.SANGUO_DATA.commandCatalog.commands,results=[],failures=[];
for(const command of catalog){
  const ctx=fixture(),payload=payloadFor(command,ctx),order=ctx.state.addStructuredOrder(command.id,payload),events=[];
  try{
    if(!order)throw new Error("命令未能加入空队列");
    ctx.state.engine.resolveOrder(ctx.state,order,events);
    if(!events.length)throw new Error("规则层没有生成结果事件");
    if(events.some(event=>fallback.test(String(event.text||event))))throw new Error(events.map(event=>event.text).join("；"));
    const rejected=events.some(event=>/失败|中止|不足|无效|未指定|没有|并未交战|找不到/.test(String(event.text||event)));
    results.push({id:command.id,name:command.name,status:rejected?"explicit-rejection":"executed",event:events.at(-1).text});
  }catch(error){failures.push({id:command.id,name:command.name,error:error.message})}
}

if(results.length+failures.length!==catalog.length)throw new Error("命令覆盖计数不一致");
if(failures.length){console.error(JSON.stringify({covered:catalog.length,failures},null,2));process.exit(1)}
const executed=results.filter(result=>result.status==="executed").length,rejected=results.length-executed;
if(process.argv.includes("--verbose"))for(const result of results)console.log(`${result.status==="executed"?"PASS":"RULE"} ${result.id}｜${result.event}`);
console.log(`105 条命令规则覆盖通过：${executed} 条成功执行 / ${rejected} 条明确前置条件拒绝 / 0 条遗漏路由`);
