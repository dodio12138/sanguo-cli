// RuleEngine 分模块：野战补给（W4、W5）。大军在外不再「瞬移」补粮：随军携粮按天数设定，带得越多组织度越低；
// 军仓见底时由补给来源（前进粮仓优先，其次最近的己方城）派运粮队沿路网实走，途中有损耗、可被截获；轻装小队不设粮道，在敌境就食。
// 袭扰粮道：骑兵为宜的部队守在粮道附近截粮。数值见 game_rules.json 的 balance.field_logistics；企划见 docs/WARFARE_LOGISTICS_PLAN.md 第 4 节。
Object.assign(window.RuleEngine.prototype,{
  fieldLogisticsRules(){return {light_threshold:3000,easy_days_base:30,easy_days_ref:3000,easy_days_min:5,easy_days_max:30,org_min:30,org_power:.15,org_rout:.2,org_march:.5,resupply_days:8,convoy_loss_per_day:.004,convoy_max_hops:14,source_cells:30,escort_ratio:.03,escort_levels:{light:.4,normal:1,heavy:2.5},escort_garrison_share:.15,forage_order:.4,raid_base:.55,passive_base:.35,raid_capture:.5,raid_fail_loss:.04,cut_days:10,cut_morale:5,depot_gold:800,depot_days:20,depot_storage:30000,depot_hop_bonus:3,...(this.data.rules?.balance?.field_logistics||{})}},
  isLightArmy(army){return (army?.soldiers||0)<=this.fieldLogisticsRules().light_threshold},
  // 轻松携带的天数：兵越多辎重越长，可带的天数越少（三千人约三十日、三万人约九日）。
  easyCarryDays(army){const r=this.fieldLogisticsRules();return Math.round(Math.max(r.easy_days_min,Math.min(r.easy_days_max,r.easy_days_base*Math.sqrt(r.easy_days_ref/Math.max(1,army?.soldiers||1))))*(army?this.quartermasterFactor?.(army,"carry")??1:1))},
  armyCarryDays(army){return Math.max(1,Math.min(90,Number.isFinite(army?.carryDays)?army.carryDays:this.easyCarryDays(army)))},
  // 每日口粮（石）：健卒、伤员全份，俘虏半份。
  dailyRation(state,army){const context=state||{data:this.data,engine:this,date:{day:1}};return FiscalSystem.armyDailyNeed(context,army)/(GameClock.isDaily(context)?1:10)},
  isStationed(army){const city=this.data.cities.find(c=>c.id===army?.city);return !!city&&!army.engagementId&&city.force===army.force&&!army.fieldPosition&&!army.route?.length&&!army.siegeTarget&&!this.isCityBesieged(city)},
  // 组织度：驻在己方城中为满；在外按军仓存粮相对「轻松携带天数」的倍数下降（辎重拖长队列）。
  armyOrganization(state,army){if(!army)return 100;if(this.isStationed(army))return Math.round(Math.max(0,Math.min(100,army.cohesion??100)));const r=this.fieldLogisticsRules(),days=(army.stores?.food||0)/this.dailyRation(state,army),ratio=days/Math.max(1,this.easyCarryDays(army));return Math.round(Math.min(army.cohesion??100,Math.max(r.org_min,Math.min(100,100*Math.min(1,1/Math.max(1e-6,ratio))**.5))))},
  organizationPower(state,army){const r=this.fieldLogisticsRules();return 1-r.org_power*(1-this.armyOrganization(state,army)/100)},
  organizationRoutShift(state,army){return Math.round(this.fieldLogisticsRules().org_rout*(100-this.armyOrganization(state,army)))},
  marchDrag(state,army){return 1+this.fieldLogisticsRules().org_march*(1-this.armyOrganization(state,army)/100)},

  // 军粮展示共用的只读快照：存粮、实际耗粮与运输分别说明，不把城仓等级或历史粮道文案当成军队断粮。
  armySupplyStatus(state,army,{transport=false}={}){
    const dailyNeed=this.dailyRation(state,army),carried=Math.max(0,army.stores?.food||0),carriedDays=carried/dailyNeed,city=FiscalSystem.stationedCity(state,army),localFood=Math.max(0,city?.localFood||0),available=carried+localFood,besieged=!!city&&this.isCityBesieged(city),rules=this.fieldLogisticsRules(),light=this.isLightArmy(army);
    const last=army.stores?.lastConsumption,recent=last&&last.turn<=state.turn&&last.turn>=state.turn-1?last:null;
    let label,tone="good",reason;
    if(available>=dailyNeed){label=city?(localFood>=dailyNeed?(besieged?"城内供粮":"城仓供粮"):localFood>0?"接续供粮":"军仓供粮"):"军仓有粮";reason=city?(besieged?"被围期间优先取用城内现粮，军仓兜底；围困阻断外调。":localFood>=dailyNeed?`驻${city.name}，优先取用城仓，军仓作为备用。`:"城仓不足，当前可用随军粮；驻地不足部分按粮政调拨。"):"行军、围城及野外驻扎均消耗随军军仓。";
      if(!city&&carriedDays<rules.resupply_days){label="军粮偏少";tone="warn"}}
    else if(city){label=besieged?"城内军粮不足":recent?.short>0?"供粮不足":"待地方调粮";tone=besieged||recent?.short>0?"bad":"warn";reason=besieged?"城仓与军仓不足一日，外调被围困阻断。":recent?.short>0?"上次结算未领足口粮，当前城仓与军仓仍不足一日。":"城仓与军仓不足一日，需由驻地调粮；以每日实耗为准。"}
    else{label=carried>0?"不足一日":"军仓已空";tone="bad";reason="在途粮食尚未入仓，当前随军粮不足一日所需。"}
    if(city&&!besieged&&FiscalSystem.managedDepot(state,city)){reason="该地为指定前线仓，军团取用城仓与随军现粮；后方按供粮线路实运，未到粮食不能使用。";if(available<dailyNeed&&!recent?.short)label="等待前线粮队"}
    const convoy=army.convoy,manual=(state.policies?.fiscalAccounts?.shipments||[]).filter(c=>c.targetKind==="army"&&c.armyId===army.id&&c.forceId===army.force&&c.resource==="food"&&["在途","受阻"].includes(c.status)),cut=this.supplyCut(state,army),cityBy=id=>this.data.cities.find(c=>c.id===id);
    let delivery={label:city?(besieged?"城内存粮供给（围困）":"驻地直接供粮"):light?"轻装自携／就食":"尚无粮队在途",mode:city?"local":light?"light":"idle",source:city,eta:null};
    if(convoy){let eta=Math.max(0,convoy.legLeft||0);if(transport)for(let i=convoy.index+1;i<convoy.path.length-1;i++)eta+=this.legDaysBetween(convoy.path[i],convoy.path[i+1]);delivery={label:"粮队在途",mode:"convoy",source:cityBy(convoy.sourceId),eta:transport?Math.ceil(eta):null,redirect:convoy.path.at(-1)!==army.city,food:Math.floor(convoy.food),escort:convoy.escort};}
    else if(!city&&!light&&transport&&carriedDays<rules.resupply_days){const source=this.pickSupplySource(state,army);delivery.source=source?.city||null;delivery.label=source?"等待后方派粮":"无可达补给城";delivery.mode=source?"waiting":"unreachable"}
    if(!city&&delivery.mode==="convoy"&&delivery.eta>carriedDays)delivery.warning=`军仓约可支撑${Math.floor(carriedDays)}日，粮队约${delivery.eta}日后抵达，可能接续不上。`;
    return {label,tone,reason,ration:FiscalSystem.armyRationProfile(state,army),fieldDailyNeed:FiscalSystem.armyDailyNeed(state,army,{field:true})/(GameClock.isDaily(state)?1:10),dailyNeed,carried,carriedDays,city,localFood,besieged,recent,lastConsumption:last&&last.turn<=state.turn?last:null,delivery,manual,cut,light,condition:army.supply??100,organization:this.armyOrganization(state,army),easyDays:this.easyCarryDays(army),carryDays:this.armyCarryDays(army),targetFood:FiscalSystem.armyFoodTarget(state,army)};
  },

  // 路网上的最少段数路径（运粮队不择官民道，只求可达）；超出 maxHops 即不通。
  graphPath(fromId,toId,maxHops=14){if(fromId===toId)return [fromId];const graph=this.data.rules.city_graph||{},prev=new Map([[fromId,null]]);let frontier=[fromId];for(let depth=0;depth<maxHops&&frontier.length;depth++){const next=[];for(const id of frontier)for(const n of graph[id]||[]){if(prev.has(n))continue;prev.set(n,id);if(n===toId){const path=[n];let cur=id;while(cur){path.unshift(cur);cur=prev.get(cur)}return path}next.push(n)}frontier=next}return null},
  // 补给来源：己方未被围的城，前进粮仓视为近若干段；只考虑直线距离 source_cells 以内的。
  pickSupplySource(state,army){const r=this.fieldLogisticsRules(),here=this.data.cities.find(c=>c.id===army.city);if(!here)return null;const network=FiscalSystem.supplyRoutes(state,army.force).some(line=>line.enabled);let best=null;
    for(const city of this.data.cities){if(city.force!==army.force||this.isCityBesieged(city)||network&&(city.localFood||0)<=FiscalSystem.garrisonDailyFood(state,city.garrison)*30)continue;const reach=Math.hypot(city.x-here.x,city.y-here.y);if(reach>r.source_cells*(city.depot?1.5:1))continue;const path=this.graphPath(city.id,army.city,r.convoy_max_hops);if(!path)continue;const score=path.length-(city.depot||FiscalSystem.managedDepot(state,city)?r.depot_hop_bonus:0);if(!best||score<best.score)best={city,path,score}}return best},
  legDaysBetween(a,b){const leg=this.legInfo?.(a,b);return Math.max(1,Math.round(leg?.days||3))},
  escortFor(army,loaded,source){const r=this.fieldLogisticsRules(),level=r.escort_levels[army.escortLevel||"normal"]??1;return Math.max(0,Math.min(Math.round(loaded*r.escort_ratio*level),Math.floor((source.garrison||0)*r.escort_garrison_share)))},

  // 每日：在外军团的补给。轻装就食；大军军仓低于 resupply_days 日口粮且无粮队在途时，从补给来源派粮队。
  fieldResupply(state,army,events){const r=this.fieldLogisticsRules();army.stores??={gold:0,food:0,silk:0};const ration=this.dailyRation(state,army);
    if(this.isLightArmy(army)){const node=army.fieldPosition?this.data.cities.find(c=>Math.hypot(c.x-army.fieldPosition.x,c.y-army.fieldPosition.y)<=1):this.data.cities.find(c=>c.id===army.city);if(node&&node.force!==army.force&&(node.force==="neutral"||this.worldWar(state,node.force,army.force))&&army.stores.food<ration*5){const take=Math.min(Math.ceil(ration*2),Math.max(0,Math.floor(node.localFood||0)));if(take>0){node.localFood-=take;army.stores.food+=take;node.order=Math.max(0,(node.order??50)-r.forage_order);army.foragedTurn=state.turn}}return}
    if(army.convoy||army.stores.food>=ration*r.resupply_days)return;const pick=this.pickSupplySource(state,army);if(!pick){army.supplyStatus="无补给来源";return}
    const source=pick.city,wanted=Math.max(0,Math.ceil(ration*this.armyCarryDays(army)-army.stores.food)),own=Math.min(wanted,Math.max(0,Math.floor((source.localFood||0)-FiscalSystem.garrisonDailyFood(state,source.garrison)*30)));source.localFood-=own;const loaded=own+(own<wanted&&!FiscalSystem.supplyRoutes(state,army.force).some(line=>line.enabled)?FiscalSystem.drawRegionalFood(state,source,wanted-own,army.force):0);if(loaded<=0){army.supplyStatus="后方无粮可运";return}
    const escort=this.escortFor(army,loaded,source);source.garrison=Math.max(0,(source.garrison||0)-escort);army.supplyStatus="粮队在途";army.supplySourceId=source.id;
    army.convoy={sourceId:source.id,path:pick.path,index:0,legLeft:pick.path.length>1?this.legDaysBetween(pick.path[0],pick.path[1]):0,food:loaded,loadedFood:loaded,escort,departedTurn:state.turn};
    if(army.force===state.playerForceId)events.push({phase:"后勤",armyId:army.id,siteId:source.id,text:`粮队自${source.name}启运 ${loaded} 石赴${army.name}，经 ${pick.path.length-1} 段，护送 ${escort} 人`})},

  // 截粮判定：袭扰者（骑兵越多越好）对护送兵。主动袭扰成算高于路遇敌军的顺手截获。
  raidChance(raider,convoy,active=true){const r=this.fieldLogisticsRules(),cavalry=(raider.units?.cavalry||0)/Math.max(1,raider.soldiers),power=raider.soldiers*(1+cavalry*.5),guard=Math.max(1,convoy.escort*2);return Math.max(.05,Math.min(.9,(active?r.raid_base:r.passive_base)*2*(power/(power+guard))*(1+cavalry*.2)))},
  interceptConvoy(state,army,raider,node,active,events){const r=this.fieldLogisticsRules(),convoy=army.convoy,chance=this.raidChance(raider,convoy,active),success=state.random()<chance,source=this.data.cities.find(c=>c.id===convoy.sourceId),involved=[army.force,raider.force].includes(state.playerForceId);
    if(!success){if(active){this.removeTroops(raider,Math.round(raider.soldiers*r.raid_fail_loss));raider.morale=Math.max(0,(raider.morale??70)-5);if(involved)events.push({phase:"后勤",armyId:raider.id,siteId:node.id,text:`${raider.name}于${node.name}截击${army.name}粮队不成，护送力战击退`})}return false}
    const captured=Math.round(convoy.food*r.raid_capture*(this.quartermasterFactor?.(army,"raid")??1));raider.stores??={gold:0,food:0,silk:0};raider.stores.food+=captured;army.convoy=null;army.supplyCutTurn=state.turn;army.supplyStatus="粮道被截";army.morale=Math.max(0,(army.morale??70)-r.cut_morale);
    if(involved)events.push({phase:"后勤",armyId:army.id,siteId:node.id,lv:army.force===state.playerForceId?2:1,text:`${raider.name}于${node.name}截获${army.name}粮队：缴粮 ${captured} 石，余者焚毁，护送 ${convoy.escort} 人溃散`});return true},
  // 每日推进运粮队：逐段前行、途损；进入有敌军之处被截（守在路旁一段内的袭扰部队也会出击）；到达即交粮，护送回营。军团若已转移则改道追送。
  advanceConvoys(state,events){const r=this.fieldLogisticsRules(),days=GameClock.factor(state)*10;this.aiRaidPosture(state);
    // 军团解散、覆没或并编后，在途粮队与护送折返来源城（来源城已易手则就地散失）。
    const ledger=state.convoyLedger||{},alive=new Set(this.data.armies.map(a=>a.id));for(const [armyId,c] of Object.entries(ledger)){if(alive.has(armyId))continue;const back=this.data.cities.find(city=>city.id===c.sourceId&&city.force===c.force);if(back){back.localFood=(back.localFood||0)+Math.floor(c.food);back.garrison=(back.garrison||0)+c.escort;if(c.force===state.playerForceId)events.push({phase:"后勤",siteId:back.id,text:`${c.armyName}已不在，粮队折返${back.name}：交还粮 ${Math.floor(c.food)} 石、护送 ${c.escort} 人`})}}
    for(const army of this.data.armies){const convoy=army.convoy;if(!convoy)continue;convoy.food*=Math.max(0,1-r.convoy_loss_per_day*days);convoy.legLeft-=days;
      while(army.convoy&&convoy.legLeft<=0){if(convoy.index>=convoy.path.length-1)break;convoy.index++;const nodeId=convoy.path[convoy.index],node=this.data.cities.find(c=>c.id===nodeId),hostile=army2=>army2.force!==army.force&&army2.soldiers>=100&&this.worldWar(state,army2.force,army.force),present=this.data.armies.find(a=>(a.fieldPosition?Math.hypot(a.fieldPosition.x-node.x,a.fieldPosition.y-node.y)<=1:a.city===nodeId)&&!a.siegeTarget&&hostile(a)),lurking=this.data.armies.find(a=>a.raiding&&hostile(a)&&(a.fieldPosition?Math.hypot(a.fieldPosition.x-node.x,a.fieldPosition.y-node.y)<=1.5:(this.data.rules.city_graph[a.city]||[]).includes(nodeId)));
        if(node&&(present||lurking)&&this.interceptConvoy(state,army,present||lurking,node,!present||!!present.raiding,events))break;
        if(convoy.index<convoy.path.length-1)convoy.legLeft+=this.legDaysBetween(convoy.path[convoy.index],convoy.path[convoy.index+1])}
      if(!army.convoy||convoy.index<convoy.path.length-1)continue;
      const at=convoy.path[convoy.index];if(at!==army.city){const path=this.graphPath(at,army.city,r.convoy_max_hops);if(path&&path.length>1){convoy.path=[...convoy.path.slice(0,convoy.index),...path];convoy.legLeft=this.legDaysBetween(path[0],path[1]);continue}const back=this.data.cities.find(c=>c.id===convoy.sourceId);if(back){back.localFood=(back.localFood||0)+Math.floor(convoy.food);back.garrison=(back.garrison||0)+convoy.escort}army.convoy=null;army.supplyStatus="粮队追送不及，折返";continue}
      army.stores??={gold:0,food:0,silk:0};army.stores.food+=Math.floor(convoy.food);const source=this.data.cities.find(c=>c.id===convoy.sourceId);if(source&&source.force===army.force)source.garrison=(source.garrison||0)+convoy.escort;army.convoy=null;army.supplyStatus="粮道畅通";army.lastSupply={turn:state.turn,sourceId:convoy.sourceId,food:Math.floor(convoy.food)};
      if(army.force===state.playerForceId)events.push({phase:"后勤",armyId:army.id,text:`粮队抵${army.name}营：交粮 ${Math.floor(convoy.food)} 石（${state.turn-convoy.departedTurn} 日）`})}
    state.convoyLedger=Object.fromEntries(this.data.armies.filter(a=>a.convoy).map(a=>[a.id,{sourceId:a.convoy.sourceId,force:a.force,food:a.convoy.food,escort:a.convoy.escort,armyName:a.name}]))},
  supplyCut(state,army){return Number.isFinite(army?.supplyCutTurn)&&state.turn-army.supplyCutTurn<=this.fieldLogisticsRules().cut_days},

  // 袭扰粮道：玩家指令设定；离开驻地即自动解除。AI 骑兵占优、闲置、且附近有敌方粮道的军团会自行袭扰。
  setRaiding(state,army,on){if(!army)return {ok:false,error:"军团无效"};if(army.fieldPosition)return {ok:false,error:"请在小队行动中选择袭扰任务"};if(on&&army.siegeTarget)return {ok:false,error:"围城中的军团不能分兵袭扰"};army.raiding=!!on;if(on){delete army.route;delete army.destination;army.stance="袭扰粮道"}else if(army.stance==="袭扰粮道")army.stance="驻扎";return {ok:true,text:on?`${army.name}伏于${this.data.cities.find(c=>c.id===army.city)?.name||"野外"}一带，袭扰敌军粮道（截击本处及相邻一段过往粮队）`:`${army.name}停止袭扰`}},
  aiRaidPosture(state){for(const army of this.data.armies){if(army.fieldPosition)continue;if(army.route?.length||army.siegeTarget){if(army.raiding){army.raiding=false;if(army.stance==="袭扰粮道")army.stance="驻扎"}continue}if(army.force===state.playerForceId)continue;const cavalry=(army.units?.cavalry||0)/Math.max(1,army.soldiers);if(cavalry<.35||army.soldiers>10000){army.raiding=false;continue}
    const near=new Set([army.city,...(this.data.rules.city_graph[army.city]||[])]);army.raiding=this.data.armies.some(other=>other.convoy&&other.force!==army.force&&this.worldWar(state,other.force,army.force)&&other.convoy.path.slice(other.convoy.index).some(id=>near.has(id)))}},

  // 前进粮仓：在己方据点修建（耗金、工期），建成后加大仓储，且作为运粮来源时视为近若干段。
  buildDepot(state,cityId){const r=this.fieldLogisticsRules(),city=this.data.cities.find(c=>c.id===cityId);if(!city||city.force!==state.playerForceId)return {ok:false,error:"只能在己方据点修建"};if(city.depot)return {ok:false,error:"已有前进粮仓"};if(city.depotReadyTurn)return {ok:false,error:"粮仓正在修建"};if((state.resources.gold||0)<r.depot_gold)return {ok:false,error:`需金 ${r.depot_gold}`};
    state.resources.gold-=r.depot_gold;city.depotReadyTurn=state.turn+GameClock.duration(state,r.depot_days/10);return {ok:true,text:`${city.name}兴工修建前进粮仓，约 ${r.depot_days} 日竣工`}},
  resolveDepots(state,events){const r=this.fieldLogisticsRules();for(const city of this.data.cities){if(!city.depotReadyTurn||city.depotReadyTurn>state.turn)continue;delete city.depotReadyTurn;city.depot=true;city.storage=(city.storage||20000)+r.depot_storage;if(city.force===state.playerForceId)events.push({phase:"后勤",siteId:city.id,text:`${city.name}前进粮仓竣工，仓储 +${r.depot_storage}，可从后方转运囤粮供前线取用`})}},
});
