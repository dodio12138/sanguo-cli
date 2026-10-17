// 小队逐格行动与局部接战。city 仅保留后方归属锚点，fieldPosition 才是野外实际位置。
Object.assign(window.RuleEngine.prototype,{
  skirmishRules(){return {max_soldiers:3000,max_detachments:8,max_distance:24,max_steps:90,cells_per_day:.9,contact_radius:1.1,cooldown_days:2,mission_days:7,block_delay_days:3,harass_delay_days:2,ai_chance:.07,cohesion_march:.45,cohesion_field:.8,cohesion_rest:1.2,cohesion_city:4,cohesion_camp:2.5,...(this.data.rules.balance?.skirmish||{})}},
  fieldMissionName(mission){return {strike:'突击',block:'阻击',harass:'袭扰',hold:'隐蔽休整',withdraw:'撤回据点',merge:'返回合队'}[mission]||'野外行动'},
  // 与绘制共用的陆路实际位置；不能以 army.city 判断野外部队是否驻城。
  armyWorldPosition(army){
    if(army.fieldPosition)return {...army.fieldPosition,moving:!!army.fieldOrder?.path?.length};
    const city=this.data.cities.find(c=>c.id===army.city);if(!city)return null;
    if(!army.route?.length||!army.legElapsed)return {x:city.x,y:city.y,moving:false};
    const next=this.data.cities.find(c=>c.id===army.route[0]);if(!next)return {x:city.x,y:city.y};
    const points=this.armyLandLegPoints(city.id,next.id),fraction=Math.min(1,army.legElapsed/Math.max(1,army.legDays||this.armyLegDays(null,army)));
    return {...this.pointAlongPath(points,fraction),moving:true};
  },
  armyLandLegPoints(from,to){
    const a=this.data.cities.find(c=>c.id===from),b=this.data.cities.find(c=>c.id===to);if(!a||!b)return [];
    const leg=this.legInfo(from,to);if(leg.points?.length)return leg.points;
    if(window.MapGrid){const sources=[this.data.map,this.data.cities,this.data.rules.city_graph];if(!this.fieldRoadSources||sources.some((s,i)=>s!==this.fieldRoadSources[i])){this.fieldRoadSources=sources;this.fieldRoads=MapGrid.roadNetwork(this.data.map,this.data.cities,this.data.counties||[],this.data.rules.city_graph||{});this.fieldRoadPairs=new Map();for(const r of this.fieldRoads){this.fieldRoadPairs.set(`${r.from}:${r.to}`,r);this.fieldRoadPairs.set(`${r.to}:${r.from}`,r)}}
      const road=this.fieldRoadPairs.get(`${from}:${to}`);if(road?.points?.length)return road.from===from?road.points:[...road.points].reverse()}
    return [[a.x,a.y],[b.x,b.y]];
  },
  pointAlongPath(points,fraction){
    if(!points.length)return null;const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));let remaining=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,fraction));
    for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]){const t=remaining/Math.max(1e-8,lengths[i]);return {x:points[i][0]+(points[i+1][0]-points[i][0])*t,y:points[i][1]+(points[i+1][1]-points[i][1])*t}}remaining-=lengths[i]}
    return {x:points.at(-1)[0],y:points.at(-1)[1]};
  },
  fieldTerrain(point){if(!window.MapGrid||!point)return null;const grid=MapGrid.landGrid(this.data.map),x=Math.round(point.x),y=Math.round(point.y);return x>=0&&y>=0&&x<grid.width&&y<grid.height?grid.terrain[y*grid.width+x]:null},
  fieldStepCost(a,b){const grid=MapGrid.landGrid(this.data.map),terrain=this.fieldTerrain(b);if(!terrain||terrain==='ocean')return Infinity;const river=grid.rivers.has(a.x!==b.x?`v${Math.max(a.x,b.x)},${a.y}`:`h${a.x},${Math.max(a.y,b.y)}`);return (this.offroadRules().terrain_cost?.[terrain]??1)+(river?this.offroadRules().crossing_cost??3:0)},
  fieldRoute(army,target,soldiers=army.soldiers){
    if(!window.MapGrid)return {ok:false,error:'当前地图不支持逐格行军'};
    const origin=this.armyWorldPosition(army),rules=this.skirmishRules();if(!origin)return {ok:false,error:'找不到部队位置'};
    const start={x:Math.round(origin.x),y:Math.round(origin.y)};
    if(!Number.isInteger(target?.x)||!Number.isInteger(target?.y)||!this.fieldTerrain(target)||this.fieldTerrain(target)==='ocean'||this.fieldTerrain(start)==='ocean')return {ok:false,error:'请选择地图内的陆地格'};
    if(Math.hypot(target.x-start.x,target.y-start.y)>rules.max_distance)return {ok:false,error:`一次野外行动限 ${rules.max_distance} 格以内，可分段前进`};
    const path=MapGrid.landPath(this.data.map,start,target,{costs:this.offroadRules().terrain_cost||{},crossing:this.offroadRules().crossing_cost??3,margin:8});
    if(!path||path.steps>rules.max_steps)return {ok:false,error:'地形阻隔或绕行过远，无法到达'};
    const points=[path.points[0]];for(const p of path.points.slice(1))points.push(...MapGrid.gridLine(...points.at(-1),...p).slice(1));
    const cavalry=(army.units?.cavalry||0)/Math.max(1,army.soldiers),speed=rules.cells_per_day*(1+cavalry*.6),cost=path.cost+path.crossings*(this.offroadRules().crossing_cost??3);
    const marching=soldiers===army.soldiers?army:{...army,soldiers,stores:{food:(army.stores?.food||0)*soldiers/army.soldiers}};return {ok:true,start,points,days:Math.ceil(cost/speed*this.marchDrag(null,marching)),crossings:path.crossings};
  },
  armyMergeProblem(state,source,target){
    if(!source||!target||source===target||source.force!==target.force)return '须选择两支不同的本方部队';
    if([source,target].some(a=>a.engagementId||a.siegeTarget||a.retreat||a.route?.length||a.convoy||a.lastCombatTurn===state.turn||a.lastSkirmishTurn===state.turn))return '交战、围城、败退、行军或有在途粮队的部队不能立即合队';
    const a=this.armyWorldPosition(source),b=this.armyWorldPosition(target);if(!a||!b||Math.hypot(a.x-b.x,a.y-b.y)>.1)return '两军须抵达同一地点后才能合队';
    if(source.fieldPosition&&source.fieldOrder?.path?.length||target.fieldPosition&&target.fieldOrder?.path?.length)return '野外行军须先停下才能合队';
    return null;
  },
  mergeArmies(state,source,target,events){
    const problem=this.armyMergeProblem(state,source,target);if(problem)return {ok:false,error:problem};
    const total=source.soldiers+target.soldiers;
    for(const key of ['morale','training','cohesion','supply'])target[key]=Math.round(((source[key]??70)*source.soldiers+(target[key]??70)*target.soldiers)/Math.max(1,total));
    target.units??={infantry:target.soldiers,cavalry:0,archers:0};const units=source.units||{infantry:source.soldiers};for(const [key,n]of Object.entries(units))target.units[key]=(target.units[key]||0)+n;
    for(const key of ['soldiers','wounded','veterans','stragglers'])target[key]=(target[key]||0)+(source[key]||0);
    for(const key of ['stores','prisoners']){target[key]??={};for(const [k,n]of Object.entries(source[key]||{}))if(typeof n==='number')target[key][k]=(target[key][k]||0)+n}
    target.peakSoldiers=Math.max(total,target.peakSoldiers||0);target.reinforcementTarget=Math.max(total,target.reinforcementTarget||0);
    const assigned=new Set([target.commanderOfficerId,target.staffOfficerId,...(target.deputyOfficerIds||[])]);target.deputyOfficerIds??=[];for(const id of [source.commanderOfficerId,source.staffOfficerId,...(source.deputyOfficerIds||[])])if(id&&!assigned.has(id)){target.deputyOfficerIds.push(id);assigned.add(id)}
    for(const a of this.data.armies)if(a.detachedFrom===source.id){if(a===target)delete a.detachedFrom;else a.detachedFrom=target.id;}
    for(const corps of state.corps||[])if(corps.armyIds)corps.armyIds=corps.armyIds.filter(id=>id!==source.id);
    this.data.armies=this.data.armies.filter(a=>a!==source);if(state.selected?.type==='army'&&state.selected.value.id===source.id)state.selected.value=target;
    this.syncAllArmyOfficerLocations();events.push({phase:'编制',armyId:target.id,text:`${source.name}并入${target.name}，合计 ${total} 人；伤员、老兵、军资与随军人员一并移交`});return {ok:true,army:target};
  },
  resolveMergeOrder(state,order,events,forceId=this.playerForceId){const source=this.data.armies.find(a=>a.id===order.armyIds?.[0]&&a.force===forceId),target=this.data.armies.find(a=>a.id===(order.options?.targetArmyId||order.armyIds?.[1])&&a.force===forceId),result=this.mergeArmies(state,source,target,events);if(!result.ok)events.push({phase:'编制',text:`合队失败：${result.error}`});return result},
  beginFieldMerge(state,army,events){
    const target=this.data.armies.find(a=>a.id===army.detachedFrom&&a.force===army.force&&a!==army),at=target&&this.armyWorldPosition(target);
    const path=at&&this.fieldRoute(army,{x:Math.round(at.x),y:Math.round(at.y)});
    if(!path?.ok){events.push({phase:'行军',armyId:army.id,text:`${army.name}无法返回原军，先撤回己方据点独立整补`});if(army.fieldOrder)army.fieldOrder.afterMission='independent';this.beginFieldWithdrawal(state,army,events);return false}
    army.raiding=false;army.fieldOrder={mission:'merge',target:{x:Math.round(at.x),y:Math.round(at.y)},path:path.points.slice(1),credit:army.fieldOrder?.credit||0,targetArmyId:target.id,afterMission:'merge'};army.stance='返回合队';return true;
  },
  completeFieldMission(state,army,events){events.push({phase:'行军',armyId:army.id,text:`${army.name}任务结束，${army.fieldOrder?.afterMission==='merge'?'返回原军合队':'撤回后保持独立编制'}`});if(army.fieldOrder?.afterMission==='merge'&&army.detachedFrom)this.beginFieldMerge(state,army,events);else this.beginFieldWithdrawal(state,army,events)},
  // 先验证整条路径与分兵条件，再变更兵员和军仓；玩家与 AI 共用。
  resolveFieldOrder(state,order,events,forceId=this.playerForceId){
    const fail=error=>{events.push({phase:'调动',text:`小队行动失败：${error}`});return {ok:false,error}},army=this.data.armies.find(a=>a.id===order.armyIds?.[0]&&a.force===forceId),options=order.options||{},rules=this.skirmishRules();
    if(!army)return fail('须指定本方部队');if(!army.fieldPosition&&this.isCityBesieged(army.city))return fail('城池被围，须从攻守城窗口突围');if(army.engagementId||army.siegeTarget||army.retreat)return fail('围城或溃退中的部队须先完成当前行动');
    if(!['strike','block','harass','hold','withdraw'].includes(options.mission))return fail('请选择突击、阻击、袭扰或休整');
    if(army.route?.length&&!army.fieldPosition)return fail('请先就地扎营，再分兵或转入野外');
    if(options.afterMission&&!['merge','independent'].includes(options.afterMission))return fail('任务结束方式无效');const missionDays=Number(options.missionDays??rules.mission_days);if(!Number.isInteger(missionDays)||missionDays<1||missionDays>30)return fail('任务持续时间须为 1—30 日');
    const amount=Number(options.detachSoldiers??0),detach=amount>0;if(!Number.isInteger(amount)||amount<0)return fail('分遣人数须为非负整数');
    if(detach&&(!Number.isInteger(amount)||amount<100||amount>rules.max_soldiers||army.soldiers-amount<100))return fail(`分遣须为 100—${rules.max_soldiers} 人，原军至少留百人`);
    if(!detach&&army.soldiers>rules.max_soldiers)return fail(`逐格行动限 ${rules.max_soldiers} 人，请先分遣小队`);
    if(options.afterMission==='merge'&&!detach&&!army.detachedFrom)return fail('自动合并须先分遣小队，或选择已有别部');
    if(detach&&this.data.armies.filter(a=>a.force===forceId&&a.detachedFrom).length>=rules.max_detachments)return fail('本方分遣小队已达上限');
    const officer=options.officerId?this.data.officers.find(o=>o.id===options.officerId&&o.force===forceId&&o.city===army.city&&o.status==='serving'&&!this.isOfficerAssigned(o)):null;
    if(options.officerId&&!officer)return fail('主将须为同驻地未编入其他部队的在任人物');
    let target=options.target;if(options.mission==='withdraw'){const at=this.armyWorldPosition(army);target=this.data.cities.filter(c=>c.force===forceId&&!this.isCityBesieged(c)).sort((a,b)=>Math.hypot(a.x-at.x,a.y-at.y)-Math.hypot(b.x-at.x,b.y-at.y))[0]}
    const preview=this.fieldRoute(army,target,amount||army.soldiers);if(!preview.ok)return fail(preview.error);
    let unit=army;
    if(detach){
      army.stores??={gold:0,food:0,silk:0};const beforeVeterans=army.veterans||0,ratio=amount/army.soldiers,units={};let left=amount;for(const type of ['cavalry','archers']){units[type]=Math.min(left,Math.floor((army.units?.[type]||0)*ratio));left-=units[type]}units.infantry=left;
      const veterans=Math.floor((army.veterans||0)*ratio),stores=Object.fromEntries(['gold','food','silk'].map(k=>[k,Math.floor((army.stores?.[k]||0)*ratio)]));
      for(const [k,n]of Object.entries(stores))army.stores[k]=Math.max(0,(army.stores[k]||0)-n);
      const beforeUnits=army.units?{...army.units}:{infantry:army.soldiers,cavalry:0,archers:0};this.removeTroops(army,amount);army.units=Object.fromEntries(Object.keys(units).map(k=>[k,(beforeUnits[k]||0)-units[k]]));army.veterans=Math.max(0,beforeVeterans-veterans);
      unit={id:`field_${forceId}_${state.turn}_${this.data.armies.length+1}`,name:`${army.name}别部`,force:forceId,city:army.city,commander:officer?.name||'别部军吏',commanderOfficerId:officer?.id||null,deputyOfficerIds:[],staffOfficerId:null,soldiers:amount,peakSoldiers:amount,reinforcementTarget:amount,units,veterans,wounded:0,morale:army.morale,training:army.training,supply:army.supply,cohesion:army.cohesion??100,formation:army.formation,tactic:army.tactic,stores,stance:'野外行军',detachedFrom:army.id};this.data.armies.push(unit);
    }if(!army.fieldPosition)FiscalSystem.stockArmy(state,unit);
    this.clearLeg(unit);delete unit.route;delete unit.destination;unit.raiding=options.mission==='harass';unit.fieldPosition=preview.start;
    unit.fieldOrder={mission:options.mission,target:{x:target.x,y:target.y},path:preview.points.slice(1),credit:0,startedTurn:state.turn,originCityId:army.fieldOrder?.originCityId||army.city,afterMission:options.afterMission||army.fieldOrder?.afterMission||'independent',missionDays};unit.stance=preview.points.length>1?'野外行军':this.fieldMissionName(options.mission);
    events.push({phase:'行军',armyId:unit.id,position:preview.start,text:`${unit.name}${detach?`分遣 ${amount} 人，`:''}逐格赴（${target.x},${target.y}）${this.fieldMissionName(options.mission)}，预计 ${preview.days} 日`});return {ok:true,army:unit};
  },
  beginFieldWithdrawal(state,army,events){
    const here=army.fieldPosition;if(!here)return;const afterMission=army.fieldOrder?.afterMission||'independent';const cities=this.data.cities.filter(c=>c.force===army.force&&!this.isCityBesieged(c)).sort((a,b)=>Math.hypot(a.x-here.x,a.y-here.y)-Math.hypot(b.x-here.x,b.y-here.y));
    for(const city of cities.slice(0,6)){const route=this.fieldRoute(army,city);if(!route.ok)continue;army.fieldOrder={mission:'withdraw',path:route.points.slice(1),target:{x:city.x,y:city.y},credit:0,originCityId:city.id,afterMission};army.raiding=false;army.stance='野外撤退';return}
    army.raiding=false;army.fieldOrder={mission:'hold',path:[],target:{...here},credit:0};army.stance='隐蔽休整';events.push({phase:'行军',armyId:army.id,text:`${army.name}暂时找不到安全归路，就地收拢队伍`});
  },
  remainingFieldDays(army){if(!army.fieldPosition||!army.fieldOrder?.path?.length)return 0;let from=army.fieldPosition,cost=0;for(const [x,y]of army.fieldOrder.path){const to={x,y};cost+=this.fieldStepCost(from,to);from=to}const speed=this.skirmishRules().cells_per_day*(1+(army.units?.cavalry||0)/Math.max(1,army.soldiers)*.6)/this.marchDrag(null,army);return Math.ceil(Math.max(0,cost-(army.fieldOrder.credit||0))/Math.max(.1,speed))},
  // 主力本日路段的扫过范围，阻击无需等到其抵达城池才生效。
  fieldTargetDistance(position,target,state){
    const at=this.armyWorldPosition(target);if(!at)return Infinity;let best=Math.hypot(position.x-at.x,position.y-at.y);
    if(!target.fieldPosition&&target.route?.length){const leg=this.legInfo(target.city,target.route[0]);if(leg.mode==='water')return Infinity;const points=this.armyLandLegPoints(target.city,target.route[0]),days=Math.max(1,this.armyLegDays(state,target)),end=this.pointAlongPath(points,Math.min(1,((target.legElapsed||0)+this.armyDailyMarch(state,target))/days));
      if(end){const dx=end.x-at.x,dy=end.y-at.y,t=Math.max(0,Math.min(1,((position.x-at.x)*dx+(position.y-at.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(position.x-at.x-dx*t,position.y-at.y-dy*t))}}
    return best;
  },
  resolveSkirmish(state,raider,target,events){
    const mission=raider.fieldOrder.mission,rules=this.skirmishRules(),position={...raider.fieldPosition},terrain=this.fieldTerrain(position),cover=['forest','mountain','hill','hills','plateau'].includes(terrain)?1.25:1,local=Math.min(3000,target.soldiers),site={...position,terrain,type:'field'},powerA=this.combatPower(raider,{site}),powerD=this.combatPower(target,{site})*local/Math.max(1,target.soldiers),ratio=Math.max(.2,Math.min(3,powerA*cover/Math.max(1,powerD))),roll=.85+state.random()*.3;
    const inflicted=Math.min(target.soldiers*(mission==='harass'?.015:mission==='strike'?.045:.025),Math.sqrt(raider.soldiers*local)*(.035*ratio)*roll),received=Math.min(raider.soldiers*.3,local*(mission==='harass'?.012:mission==='strike'?.035:.045)/ratio/roll);
    const take=(army,n)=>{const total=Math.min(Math.max(0,army.soldiers-100),Math.round(n)),wounded=Math.round(total*.45);this.removeTroops(army,total);army.wounded=(army.wounded||0)+wounded;return {killed:total-wounded,wounded,total}};
    const a=take(raider,received),d=take(target,inflicted),orgHit=Math.min(12,(mission==='harass'?3:6)*ratio),slow=mission==='block'?Math.min(.65,.2+.2*ratio):mission==='harass'?.15:.25;
    raider.cohesion=Math.max(0,(raider.cohesion??100)-8-a.total/Math.max(100,raider.soldiers)*60);target.cohesion=Math.max(0,(target.cohesion??100)-orgHit);raider.morale=Math.max(0,(raider.morale??70)-a.total/Math.max(100,raider.soldiers)*70);target.morale=Math.max(0,(target.morale??70)-orgHit*.4);
    const delayDays=mission==='block'?rules.block_delay_days:mission==='harass'?rules.harass_delay_days:1;target.fieldDisruption={untilTurn:Math.max(target.fieldDisruption?.untilTurn||0,state.turn+delayDays-1),slow:Math.max(target.fieldDisruption?.untilTurn>=state.turn?target.fieldDisruption.slow:0,slow)};
    raider.lastSkirmishTurn=target.lastSkirmishTurn=state.turn;raider.fieldOrder.nextContactTurn=state.turn+rules.cooldown_days;
    for(const [observer,enemy]of [[raider,target],[target,raider]])if(observer.force===state.playerForceId)state.intelligence.armies[enemy.id]=Math.max(2,state.intelligence.armies[enemy.id]||0);
    events.push({phase:'野战',battleId:`skirmish:${state.turn}:${raider.id}:${target.id}`,armyId:raider.id,armyIds:[raider.id,target.id],forces:[raider.force,target.force],position,skirmish:true,mission,casualties:{attacker:a,defender:d},text:`（${position.x},${position.y}）${raider.name}${this.fieldMissionName(mission)}${target.name}：我方减员 ${a.total}（阵亡 ${a.killed}、伤 ${a.wounded}），敌方减员 ${d.total}（阵亡 ${d.killed}、伤 ${d.wounded}）；敌组织度 -${orgHit.toFixed(1)}，行军迟滞 ${delayDays} 日`});
    if(mission==='strike'){this.completeFieldMission(state,raider,events);return}
    if(raider.cohesion<40||raider.morale<40||raider.soldiers<300||target.soldiers>raider.soldiers*5)this.beginFieldWithdrawal(state,raider,events);
  },
  advanceFieldArmies(state,events){
    const rules=this.skirmishRules(),days=GameClock.factor(state)*10,engaged=new Set();
    for(const army of this.data.armies.filter(a=>a.fieldPosition)){
      const order=army.fieldOrder;if(!order)continue;
      if(order.mission==='merge'){
        const target=this.data.armies.find(a=>a.id===order.targetArmyId&&a.force===army.force);
        if(!target){this.beginFieldMerge(state,army,events);continue}
        if(!this.armyMergeProblem(state,army,target)){this.mergeArmies(state,army,target,events);continue}
        const at=this.armyWorldPosition(target);if(at&&(Math.round(at.x)!==order.target.x||Math.round(at.y)!==order.target.y))this.beginFieldMerge(state,army,events);
      }

      if(army.cohesion<30&&!['withdraw','merge'].includes(order.mission))this.beginFieldWithdrawal(state,army,events);
      const active=army.fieldOrder;active.credit=(active.credit||0)+rules.cells_per_day*(1+(army.units?.cavalry||0)/Math.max(1,army.soldiers)*.6)/this.marchDrag(state,army)*(army.fieldDisruption?.untilTurn>=state.turn?1-army.fieldDisruption.slow:1)*days;
      let guard=0;while(active.path?.length&&guard++<rules.max_steps){const p=active.path[0],next={x:p[0],y:p[1]},cost=this.fieldStepCost(army.fieldPosition,next);if(!Number.isFinite(cost)||Math.abs(next.x-army.fieldPosition.x)+Math.abs(next.y-army.fieldPosition.y)!==1){active.path=[];active.blocked=true;army.stance='道路受阻';events.push({phase:'行军',armyId:army.id,position:{...army.fieldPosition},text:`${army.name}前方地形不可通行，停在当前格等待改令`});break}if(active.credit<cost)break;active.credit-=cost;army.fieldPosition=next;active.path.shift();army.fieldMovedTurn=state.turn;
        if(this.contactFieldArmy(state,army,events,engaged)||army.fieldOrder!==active)break;
      }
      active.credit=Math.min(active.credit||0,8);
      if(army.fieldOrder!==active)continue;
      if(!active.path?.length){active.credit=0;army.stance=active.blocked?'道路受阻':this.fieldMissionName(active.mission);if(active.mission==='withdraw'){
        const city=this.data.cities.find(c=>c.x===army.fieldPosition.x&&c.y===army.fieldPosition.y&&c.force===army.force&&!this.isCityBesieged(c));
        if(city){army.city=city.id;if(active.afterMission==='merge'&&army.detachedFrom){this.beginFieldMerge(state,army,events);continue}delete army.fieldPosition;delete army.fieldOrder;army.raiding=false;army.stance='驻扎';events.push({phase:'行军',armyId:army.id,cityId:city.id,text:`${army.name}逐格撤回${city.name}，可以就仓整补`});continue}
      }}
      if(!active.path?.length&&!active.blocked&&['strike','block','harass'].includes(active.mission)){active.arrivedTurn??=state.turn;if(state.turn-active.arrivedTurn>=Math.max(1,active.missionDays||rules.mission_days)){this.completeFieldMission(state,army,events);continue}}
      this.contactFieldArmy(state,army,events,engaged);
    }
  },
  contactFieldArmy(state,army,events,engaged){
    const order=army.fieldOrder;if(!order||!army.fieldPosition||!['strike','block','harass'].includes(order.mission)||state.turn<Math.max(order.nextContactTurn||0,(army.lastSkirmishTurn??-100)+this.skirmishRules().cooldown_days)||engaged.has(army.id))return false;
    const candidates=this.data.armies.filter(a=>a!==army&&a.force!==army.force&&(a.fieldPosition||a.route?.length)&&!a.siegeTarget&&!engaged.has(a.id)&&this.worldWar(state,army.force,a.force));
    const target=candidates.map(a=>({a,d:this.fieldTargetDistance(army.fieldPosition,a,state)})).filter(t=>t.d<=this.skirmishRules().contact_radius).sort((a,b)=>a.d-b.d)[0]?.a;
    if(!target)return false;this.resolveSkirmish(state,army,target,events);engaged.add(army.id);engaged.add(target.id);return true;
  },
  resolveArmyCohesion(state){const r=this.skirmishRules(),days=GameClock.factor(state)*10;for(const army of this.data.armies){let value=army.cohesion??100;
    if(army.lastSkirmishTurn===state.turn||army.lastCombatTurn===state.turn)continue;
    if(army.route?.length)value-=r.cohesion_march*(army.movementMode==='forced_march'?3:1)*days;
    else if(army.fieldPosition&&army.fieldMovedTurn===state.turn)value-=r.cohesion_field*days;
    else if(!army.engagementId)value+=(this.isStationed(army)?r.cohesion_city:army.stance==='扎营'||army.fieldOrder?.mission==='hold'?r.cohesion_camp:r.cohesion_rest)*days;
    if(army.supply===0)value-=4*days;army.cohesion=Math.max(0,Math.min(100,value));
  }},
  runFieldAI(state,events){if(!window.MapGrid)return;const r=this.skirmishRules();for(const force of this.data.forces){if(force.id==='neutral'||force.eliminated||force.id===state.playerForceId&&!state.observerMode)continue;
    const detachedCount=this.data.armies.filter(a=>a.force===force.id&&a.detachedFrom).length,own=this.data.armies.filter(a=>a.force===force.id&&(a.soldiers<=r.max_soldiers||detachedCount<r.max_detachments)&&!a.fieldPosition&&!a.route?.length&&!a.siegeTarget&&!a.retreat&&a.soldiers>=500&&a.morale>=55&&this.isStationed(a)),targets=this.data.armies.filter(a=>a.force!==force.id&&a.route?.length&&!a.fieldPosition&&this.worldWar(state,force.id,a.force));
    if(!own.length||!targets.length)continue;let pair=null;const positions=targets.map(t=>({t,p:this.armyWorldPosition(t)}));for(const a of own){const v=positions.find(v=>v.p&&this.groundDistance(a.city,v.p)<8);if(v){pair={a,...v};break}}if(!pair||state.random()>=r.ai_chance*GameClock.factor(state)*10)continue;
    this.resolveFieldOrder(state,{armyIds:[pair.a.id],options:{mission:'block',target:{x:Math.round(pair.p.x),y:Math.round(pair.p.y)},...(pair.a.soldiers>r.max_soldiers?{detachSoldiers:1000}:{})}},events,force.id);
  }}
});
