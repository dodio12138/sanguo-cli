/* One ledger for local treasuries, central treasuries, cargo and army stores. */
window.FiscalSystem=class FiscalSystem {
  static units={gold:"贯",food:"石",silk:"品",labor:"人日"};
  static names={gold:"钱币",food:"粮食",silk:"布帛",labor:"徭役"};
  static clamp(value,min,max){return Math.max(min,Math.min(max,value))}
  static monthIndex(date){return date.year*12+date.month-1}
  static defaults(){return {landRate:10,commercialRate:10,silkRate:10,periods:{land:1,commercial:1,food:12,silk:3},harvestMonth:9,arrears:"remit",autoGrainRelief:true}}
  static arrearsModes={remit:"补缴至首都",retain:"地方留用"}
  static commands=[
    ["set_collection_policy","征收制度","finance","财政","分别设置田租、商业税、粮食和布帛的税率与征收周期"],
    ["set_capital","设置首都","finance","财政","将己方城市设为中央府库所在地，新上缴按通往首都的道路计算"],
    ["build_supply_depot","修建前进粮仓","logistics","后勤","在己方县城扩建前进粮仓，耗金800、约20日完工；可将其指定为自动供粮的收粮仓"],
    ["set_supply_route","自动供粮线路","logistics","后勤","指定后方县仓或中央府库，按前线仓的囤粮目标自动沿安全道路转运；每五日检查，已在途粮食计入目标"],
    ["dispatch_resources","府库调运","logistics","后勤","从中央或地方库拨送钱粮布帛，经道路运输后进入地方库或军队仓储"],
    ["dismiss_labor","遣散徭役","logistics","后勤","遣散指定城市的徭役，返还原县人口并停止其生产占用"],
    ["relieve_fire","扑救火灾","construction","建设","征发徭役清理火灾损伤，工程完成后自动遣散民夫"]
  ];
  static minRemittance(state,resource){return state.data.rules.balance?.economy?.min_remittance?.[resource]??({gold:100,food:600,silk:20})[resource]??1}
  static initialize(state){
    const data=state.data;
    state.policies.fiscalAccounts??={version:1,forces:{},shipments:[],laborGroups:[],projects:[],sequence:0};
    const ledger=state.policies.fiscalAccounts;
    ledger.supplyRoutes??=[];ledger.forces??={};ledger.shipments??=[];ledger.laborGroups??=[];ledger.projects??=[];ledger.sequence??=0;
    state.resources.silk??=0;
    for(const army of data.armies){army.stores??={gold:0,food:0,silk:0};for(const key of ["gold","food","silk"])army.stores[key]??=0}
    // 一回合内只做一次完整初始化（据点逾三百，逐次遍历开销大）；势力账户与各城财政字段在此补齐。
    const playerForce=data.forces.find(force=>force.id===state.playerForceId);if(playerForce)playerForce.resources=state.resources;
    this.initStamps??=new WeakMap();const stamp=`${state.turn}|${state.playerForceId}|${data.cities.length}|${data.forces.length}`;if(this.initStamps.get(ledger)===stamp)return ledger;this.initStamps.set(ledger,stamp);
    for(const city of data.cities){city.localSilk??=0;city.publicSupport??=city.order??60;city.fiscal??={};const fiscal=city.fiscal;fiscal.accrued??={land:0,commercial:0,food:0,silk:0};fiscal.lastCollected??={};fiscal.pendingRemittance??={gold:0,food:0,silk:0};fiscal.attention??=0;fiscal.corruption??=25;fiscal.cropAccrued??=0;fiscal.cropYear??=state.date.year;fiscal.lastHarvestYear??=null;fiscal.localConsumption??={gold:0,food:0}}
    if(data.commandCatalog)for(const [id,name,categoryId,categoryName,description] of this.commands)if(!data.commandCatalog.commands.some(command=>command.id===id))data.commandCatalog.commands.push({id,name,categoryId,categoryName,description,status:"active",parameters:["actor_id","target_ids","amount","options"]});
    for(const force of data.forces.filter(force=>force.id!=="neutral")){
      const owned=data.cities.filter(city=>city.force===force.id),defaults=this.defaults();
      const account=ledger.forces[force.id]??={...defaults,capitalId:owned.find(city=>city.id===force.capital||city.name===force.capital)?.id||owned[0]?.id||null};
      account.periods={...defaults.periods,...account.periods};
      if(!owned.some(city=>city.id===account.capitalId))account.capitalId=owned[0]?.id||null;
      for(const key of ["landRate","commercialRate","silkRate","harvestMonth","arrears","autoGrainRelief"])account[key]??=defaults[key];
      if(!this.arrearsModes[account.arrears])account.arrears=defaults.arrears;
      if(force.id===state.playerForceId)force.resources=state.resources;
      else force.resources??=this.startingResources(state.data,force);
      force.resources.silk??=0;
    }

    return ledger;
  }
  static account(state,forceId=state.playerForceId){return this.initialize(state).forces[forceId]}
  static governance(state,city){
    // 官员相关部分随行政负荷缓存（每旬或任免时重建），每日只算民心、贪腐底数等实时项。
    const engine=state.engine,cache=engine.administrativeLoads?.().governance,cached=cache?.get(city.id),officials=cached||(()=>{const profile=role=>engine.officialProfile(city,role),affair=id=>engine.affairScore?engine.affairScore(city,id):profile({commerce:"commerce",agriculture:"agriculture",registry:"population"}[id]),magistrate=engine.magistrateRole?profile(engine.magistrateRole(city)):null;return {governor:profile("governor"),county:profile("commanderyGovernor"),finance:affair("commerce"),agriculture:affair("agriculture"),households:affair("registry"),overload:magistrate?.officer&&!magistrate.familyId?engine.officerLoad?.(magistrate.officer.id)?.corruption||0:engine.loadCorruption?.(engine.administrativeLoads?.().nodes.get(city.id)?.defaultRate||0)||0,secretary:engine.secretaryCorruption?.(city)||0}})();if(cache&&!cached)cache.set(city.id,officials);const {governor,county,finance,agriculture,households,overload}=officials,support=this.clamp((city.publicSupport??city.order??60)/100,.1,1);
    const ability=(governor.score+county.score+finance.score+households.score)/4;
    // 手动征收的"注意力"并入县令的行政负荷（offices.js）：县令过劳时其分数下降，过 80% 后贪腐另增（质量下降）。
    const efficiency=this.clamp(.48+ability/180,.25,.98);
    const corruption=this.clamp(((city.fiscal?.corruption??25)+overload+officials.secretary)/100-(governor.score+finance.score)/700,.01,.45);
    const population=(city.population||0)+engine.countiesForCity(city.id).reduce((sum,county)=>sum+(county.population||0),0),bureaucracy=Math.max(10,Math.ceil(population/12000)+(city.level||1)*8);
    return {efficiency,corruption,support,ability,agriculture:agriculture.score,bureaucracy,population};
  }
  static route(state,from,to,forceId){return state.engine.logisticsPath(from,to,forceId)}
  static enqueue(state,{forceId,sourceCityId,targetCityId,resource,amount,targetKind="central",armyId=null,purpose="上缴"}){
    const ledger=this.initialize(state),route=this.route(state,sourceCityId,targetCityId,forceId);
    if(!route)return null;
    const source=state.data.cities.find(city=>city.id===sourceCityId),score=this.governance(state,source).ability,distance=Math.max(0,route.length-1);
    // 转运按路段里程与类型计损耗与日程：漕运最省，栈道山道最费；大宗粮秣超出道路通行量时车队延误。
    const cfg=state.data.rules.balance?.logistics||{},legs=state.data.routeNetwork&&state.engine.legInfo?route.slice(1).map((id,index)=>state.engine.legInfo(route[index],id)):null,baseRate=resource==="food"?.025:resource==="silk"?.012:.008;
    const rawLoss=legs?legs.reduce((sum,leg)=>sum+(leg.li?leg.li/100*(cfg.loss_per_100li?.[resource]??baseRate*.6)*(cfg.kind_loss?.[leg.kind]??1):baseRate),0):distance*baseRate,office=state.engine.convoyModifiers?.(state,{forceId,route,resource,purpose,targetKind}),lossRate=this.clamp(rawLoss*(1-score/160)*(office?.loss??1),0,cfg.max_loss??.45),loss=Math.floor(amount*lossRate);
    const daily=GameClock.isDaily(state),edgeDays=daily?10:1,legDays=daily&&legs?legs.map((leg,index)=>{const convoy=amount/Math.max(.1,(leg.capacity??1)*(office?.legCapacity?.[index]??1)*(cfg.cargo_per_capacity??20000));return Math.max(1,Math.ceil(leg.days*(convoy<=1?1:1+(convoy-1)*(cfg.cargo_delay??.5))*(office?.legDays?.[index]??1)))}):null,travel=legDays?legDays.reduce((sum,days)=>sum+days,0):distance*edgeDays,shipment={id:`cargo-${++ledger.sequence}`,forceId,sourceCityId,targetCityId,targetKind,armyId,resource,amount:Math.floor(amount),transportLoss:loss,delivered:Math.floor(amount)-loss,route,nextIndex:0,edgeDays,...(legDays?{legDays}:{}),segmentRemainingDays:route.length>1?legDays?.[0]??edgeDays:1,departedTurn:state.turn,arriveTurn:state.turn+Math.max(1,travel),purpose,status:"在途"};
    ledger.shipments.push(shipment);return shipment;
  }
  static advanceShipments(state,events){
    const ledger=this.initialize(state);
    for(const cargo of ledger.shipments){
      if(cargo.status==="完成"||cargo.status==="没收"||cargo.departedTurn>=state.turn)continue;
      const next=cargo.route[Math.min(cargo.nextIndex+1,cargo.route.length-1)],destination=state.data.cities.find(city=>city.id===cargo.targetCityId),source=state.data.cities.find(city=>city.id===cargo.sourceCityId);
      if(destination?.force!==cargo.forceId){cargo.status="没收";cargo.completedTurn=state.turn;if(destination){const key={gold:"localGold",food:"localFood",silk:"localSilk"}[cargo.resource];destination[key]=(destination[key]||0)+cargo.delivered}if(cargo.laborId)this.dismissLabor(state,cargo.sourceCityId,events,cargo.laborId);events.push({phase:"财政",text:`${cargo.purpose}运输目的地失守，${cargo.delivered}${this.units[cargo.resource]}被当地势力没收`});continue}
      const current=cargo.route[cargo.nextIndex],edgeOpen=next===current||(state.data.rules.city_graph[current]||[]).includes(next);
      if(!edgeOpen||!next||state.data.cities.find(city=>city.id===next)?.force!==cargo.forceId||state.engine.isCityBesieged(next)||state.data.armies.some(army=>!army.fieldPosition&&army.city===next&&army.force!==cargo.forceId&&!army.siegeTarget)||!source){cargo.status="受阻";cargo.arriveTurn+=1;continue}
      cargo.status="在途";cargo.segmentRemainingDays??=1;cargo.segmentRemainingDays-=1;if(cargo.segmentRemainingDays>0)continue;cargo.nextIndex=Math.min(cargo.nextIndex+1,cargo.route.length-1);cargo.segmentRemainingDays=cargo.legDays?.[cargo.nextIndex]??cargo.edgeDays??1;
      if(cargo.nextIndex<cargo.route.length-1)continue;
      let pool;
      if(cargo.targetKind==="central")pool=state.data.forces.find(force=>force.id===cargo.forceId)?.resources;
      else if(cargo.targetKind==="army")pool=state.data.armies.find(army=>!army.fieldPosition&&army.id===cargo.armyId&&army.force===cargo.forceId&&army.city===cargo.targetCityId)?.stores;
      if(cargo.targetKind==="local"||cargo.targetKind==="army"&&!pool){const key={gold:"localGold",food:"localFood",silk:"localSilk"}[cargo.resource],accepted=cargo.resource==="food"?Math.min(cargo.delivered,Math.max(0,(destination.storage||20000)-(destination[key]||0))):cargo.delivered;destination[key]=(destination[key]||0)+accepted;cargo.storageLoss=cargo.delivered-accepted;if(cargo.storageLoss)events.push({phase:"后勤",siteId:destination.id,text:`${destination.name}仓储不足，${cargo.storageLoss}石粮食无法入仓并损失`})}else if(pool)pool[cargo.resource]=(pool[cargo.resource]||0)+cargo.delivered;
      cargo.status="完成";cargo.completedTurn=state.turn;
      if(cargo.laborId)this.dismissLabor(state,cargo.sourceCityId,events,cargo.laborId);
      if(cargo.forceId===state.playerForceId)events.push({phase:"财政",siteId:destination.id,text:`${cargo.purpose}入库：${cargo.delivered}${this.units[cargo.resource]}${this.names[cargo.resource]}（路损 ${cargo.transportLoss}，行程 ${cargo.route.length-1} 段）`});
    }
    // 已结束的转运只留一旬、每势力至多 30 条备查，其余并入分势力、分物资的累计汇总，存档不随据点数与时间无限增长。
    const keepTurns=GameClock.duration(state,1),finished=cargo=>["完成","没收"].includes(cargo.status),recent=new Map();ledger.archive??={};
    for(const cargo of [...ledger.shipments].reverse()){if(!finished(cargo))continue;const count=recent.get(cargo.forceId)||0,fresh=state.turn-(cargo.completedTurn||cargo.departedTurn)<keepTurns;if(fresh&&count<30){recent.set(cargo.forceId,count+1);continue}cargo.archived=true;const bucket=((ledger.archive[cargo.forceId]??={})[cargo.resource]??={shipments:0,amount:0,delivered:0,loss:0,confiscated:0});bucket.shipments++;bucket.amount+=cargo.amount||0;bucket.delivered+=cargo.status==="完成"?cargo.delivered||0:0;bucket.loss+=cargo.transportLoss||0;if(cargo.status==="没收")bucket.confiscated+=cargo.delivered||0}
    ledger.shipments=ledger.shipments.filter(cargo=>!cargo.archived);
  }
  // 指定仓使用现有县城库存；扩建仓容仍走原有前进粮仓工程，不额外生成粮食。
  static supplyRoutes(state,forceId=state.playerForceId){return (state.policies?.fiscalAccounts?.supplyRoutes||[]).filter(line=>line.forceId===forceId)}
  static managedDepot(state,city){return this.supplyRoutes(state,city.force).some(line=>line.enabled&&line.targetCityId===city.id)}
  static supplyReserve(state,city,reserveFood=0){return Math.ceil(Math.max(reserveFood,this.localFoodReserve(state,city,this.governance(state,city),false),this.garrisonDailyFood(state,city.garrison)*30))}
  static supplyLineStatus(state,line){
    const source=state.data.cities.find(c=>c.id===line.sourceCityId),target=state.data.cities.find(c=>c.id===line.targetCityId),central=line.sourceKind==="central",account=state.policies?.fiscalAccounts?.forces?.[line.forceId];
    const incoming=(state.policies?.fiscalAccounts?.shipments||[]).filter(c=>c.forceId===line.forceId&&c.resource==="food"&&c.targetCityId===line.targetCityId&&c.targetKind==="local"&&["在途","受阻"].includes(c.status)).reduce((n,c)=>n+c.delivered,0),goal=Math.min(line.targetFood,target?.storage||20000),stock=Math.max(0,target?.localFood||0),need=Math.max(0,goal-stock-incoming);
    let status=!line.enabled?"已停用":source?.force!==line.forceId||target?.force!==line.forceId?"仓址失守":central&&account?.capitalId!==source?.id?"府库已迁移":state.engine.isCityBesieged(source)||state.engine.isCityBesieged(target)?"仓址被围":need<=0?"目标已满足":null;
    const pool=central?(line.forceId===state.playerForceId?state.resources:state.data.forces.find(f=>f.id===line.forceId)?.resources):source,reserve=source?(central?line.reserveFood:this.supplyReserve(state,source,line.reserveFood)):0,spare=Math.max(0,(pool?.[central?"food":"localFood"]||0)-reserve);
    if(!status&&spare<=0)status="后方余粮不足";
    return {source,target,central,pool,reserve,spare,incoming,goal,stock,need,status:status||"按期供粮"};
  }
  static configureSupplyRoute(state,order){
    const options=order.options||{},forceId=state.playerForceId,sourceKind=options.source==="central"?"central":"local",sourceCityId=sourceKind==="central"?this.account(state).capitalId:order.cityIds?.[0],targetCityId=order.cityIds?.[1],source=state.data.cities.find(c=>c.id===sourceCityId),target=state.data.cities.find(c=>c.id===targetCityId),ledger=this.initialize(state);
    const byId=ledger.supplyRoutes.find(line=>line.id===options.supplyLineId&&line.forceId===forceId);if(byId&&options.enabled==="no"){byId.enabled=false;byId.status="已停用";return {ok:true,line:byId}}
    if(source?.force!==forceId||target?.force!==forceId||sourceCityId===targetCityId)return {ok:false,error:"须指定两座不同的己方县城粮仓"};
    const targetFood=Number(options.targetFood),reserveFood=Number(options.reserveFood),batchFood=Number(options.batchFood),enabled=options.enabled!=="no";
    if(![targetFood,reserveFood,batchFood].every(Number.isSafeInteger)||targetFood<1||targetFood>100000000||reserveFood<0||reserveFood>100000000||batchFood<1||batchFood>100000000)return {ok:false,error:"囤粮目标、每批数量须为正整数，后方留粮须为非负整数"};
    const duplicate=ledger.supplyRoutes.find(line=>line.forceId===forceId&&line.sourceKind===sourceKind&&line.sourceCityId===sourceCityId&&line.targetCityId===targetCityId),existing=byId||duplicate;if(byId&&duplicate&&byId!==duplicate)return {ok:false,error:"该供粮线路已存在，请调整已有线路"};
    // 连锁仓可以逐级转运，禁止形成相互倒粮的环。
    const outgoing=new Map();for(const line of ledger.supplyRoutes){if(line===existing||!line.enabled||line.forceId!==forceId)continue;const nodes=outgoing.get(line.sourceCityId)||[];nodes.push(line.targetCityId);outgoing.set(line.sourceCityId,nodes)}
    const seen=new Set(),queue=[targetCityId];while(enabled&&queue.length){const id=queue.pop();if(id===sourceCityId)return {ok:false,error:"供粮线路不能形成循环，请先停用反向线路"};if(seen.has(id))continue;seen.add(id);queue.push(...outgoing.get(id)||[])}
    const line=existing||{id:`supply-${++ledger.sequence}`,forceId,sourceKind,sourceCityId,targetCityId};Object.assign(line,{sourceKind,sourceCityId,targetCityId,targetFood,reserveFood,batchFood,enabled,lastReviewTurn:null});if(!existing)ledger.supplyRoutes.push(line);
    return {ok:true,line};
  }
  static advanceSupplyRoutes(state,events){
    const lines=state.policies?.fiscalAccounts?.supplyRoutes;if(!lines?.length)return;
    const interval=GameClock.isDaily(state)?5:1;
    for(const line of lines){if(!line.enabled||line.lastReviewTurn!=null&&state.turn-line.lastReviewTurn<interval)continue;line.lastReviewTurn=state.turn;
      const row=this.supplyLineStatus(state,line);line.status=row.status;if(row.status!=="按期供粮")continue;
      const amount=Math.floor(Math.min(row.need,row.spare,line.batchFood));if(amount<=0)continue;
      const cargo=this.enqueue(state,{forceId:line.forceId,sourceCityId:line.sourceCityId,targetCityId:line.targetCityId,resource:"food",amount,targetKind:"local",purpose:"自动供粮"});if(!cargo){line.status="道路受阻";continue}
      row.pool[row.central?"food":"localFood"]-=amount;cargo.supplyLineId=line.id;line.lastShipmentTurn=state.turn;
      if(line.forceId===state.playerForceId)events.push({phase:"后勤",siteId:row.target.id,text:`${row.source.name}${row.central?"中央府库":"县仓"}自动运粮 ${amount} 石至${row.target.name}前线仓，现粮 ${Math.floor(row.stock)}、在途 ${row.incoming+cargo.delivered} 石`});
    }
  }
  static grainRules(state){return {sow_month:3,harvest_month:9,opening_reserve_days:60,relief_review_days:5,relief_trigger_days:30,relief_target_days:90,central_reserve_days:30,relief_batch:20000,relief_max_dispatches:8,farming_soldier_share:.5,farming_land_share:.1,farming_ration_factor:.5,farming_food_per_worker:3,farming_training_factor:.5,...state.data.rules.balance?.grain}}
  static canFarmArmy(state,army){const city=this.stationedCity(state,army);return !!city&&!army.retreat&&army.stance!=="败退"&&!army.raiding&&!state.engine.isCityBesieged(city)}
  static farmingAt(state,city){
    const active=state.data.armies.filter(a=>a.farming?.cityId===city.id&&a.force===city.force&&a.city===city.id&&this.canFarmArmy(state,a));if(!active.length)return [];
    const rules=this.grainRules(state),limit=Math.floor(this.governance(state,city).population*rules.farming_land_share),rows=[];let left=limit;
    for(const army of active.sort((a,b)=>a.id.localeCompare(b.id))){const wanted=Math.floor(army.soldiers*rules.farming_soldier_share),workers=Math.max(0,Math.min(left,wanted));left-=workers;rows.push({armyId:army.id,workers,wanted})}
    return rows;
  }
  static armyFarming(state,army){const city=this.stationedCity(state,army),eligible=this.canFarmArmy(state,army),row=city&&army.farming?.cityId===city.id?this.farmingAt(state,city).find(r=>r.armyId===army.id):null,rules=this.grainRules(state),workers=row?.workers||0,share=workers/Math.max(1,row?.wanted||0);return {eligible,active:eligible&&workers>0,workers,rateFactor:1-(1-rules.farming_ration_factor)*share,trainingFactor:1-(1-rules.farming_training_factor)*share,annualFood:workers*rules.farming_food_per_worker*(city?state.engine.farmingFactor?.(city)??1:1)}}
  static advanceFarming(state,city){
    for(const army of state.data.armies.filter(a=>a.farming?.cityId===city.id))if(!this.canFarmArmy(state,army)||army.city!==army.farming.cityId)delete army.farming;
    const fiscal=city.fiscal,rows=this.farmingAt(state,city),stamp=`${state.date.year}-${state.date.month}-${state.date.day??state.date.xun}`;
    if(!rows.length||fiscal.lastFarmingAccrual===stamp)return;fiscal.lastFarmingAccrual=stamp;
    const days=(Date.UTC(state.date.year+1,0,1)-Date.UTC(state.date.year,0,1))/86400000;
    fiscal.farmingAccrued=(fiscal.farmingAccrued||0)+rows.reduce((s,r)=>s+r.workers,0)*this.grainRules(state).farming_food_per_worker/days*(GameClock.isDaily(state)?1:10);
  }
  static grainDate(date){return Date.UTC(date.year,date.month-1,GameClock.isDaily({date})?date.day:(date.xun||0)*10+1)}
  static cropCalendar(state,city){const rules=this.grainRules(state),year=state.date.year,month=rules.harvest_month,begin=Date.UTC(year,rules.sow_month-1,1),end=Date.UTC(year,month,0),now=this.grainDate(state.date),day=86400000;return {year,month,day:new Date(end).getUTCDate(),begin,end,growing:now>=begin&&now<=end,elapsed:Math.max(0,Math.min((end-begin)/day+1,(now-begin)/day)),duration:(end-begin)/day+1}}
  // 延续原年度可征粮规模，集中在生长期累计；这不是全地区粮食总产量。
  static cropAnnualDue(state,city,g=this.governance(state,city),inputs={}){
    const e=state.engine,base=p=>e.taxBase?e.taxBase(state,p):(p.population||0),counties=e.countiesForCity(city.id),comply=e.clanCompliance&&state.clans?e.clanCompliance(state,city,city.force):1;
    const rural=inputs.rural??(counties.length?counties.reduce((s,c)=>s+base(c),0)+base(city)*.15:base(city))*comply;
    const workers=(state.policies.fiscalAccounts?.laborGroups||[]).filter(group=>group.cityId===city.id&&group.status==="服役").reduce((s,group)=>s+group.people,0),labor=inputs.laborFactor??this.clamp(1-workers/Math.max(1,rural+workers)*2,.1,1),factor=state.engine.isCityBesieged(city)?0:city.occupiedUntil?.5:1,farms=(city.buildings||[]).filter(n=>n==="农庄").length;
    const days=(Date.UTC(state.date.year+1,0,1)-Date.UTC(state.date.year,0,1))/86400000;
    return (rural*.025*(city.agriculture||40)/50+farms*180)*this.foodRules(state).crop_scale*factor*labor*(.7+g.agriculture/160)*days/10;
  }
  static collectionEstimate(g,gross){const administrative=Math.floor(gross*(1-g.efficiency)*(1-g.support*.45)),corruption=Math.floor((gross-administrative)*g.corruption),net=gross-administrative-corruption,useRate=this.clamp(.06+g.bureaucracy/1600+(1-g.support)*.15,.06,.35);return Math.max(0,net-Math.floor(net*useRate))}
  // 与 settle 的普通守军时基一致；在野军团不占后方县仓。守军日/旬标定另行校准。
  static localDailyGrain(state,city,g=this.governance(state,city)){
    const armies=state.data.armies.filter(a=>a.force===city.force&&this.stationedCity(state,a)?.id===city.id),prisoners=Object.values(city.prisoners||{}).reduce((s,n)=>s+n,0);
    return g.bureaucracy*.035+this.garrisonDailyFood(state,city.garrison)*.1+prisoners*this.foodRules(state).garrison_ration+armies.reduce((s,a)=>s+this.armyDailyNeed(state,a)/(GameClock.isDaily(state)?1:10),0);
  }
  static incomingGrain(state,city){return (state.policies.fiscalAccounts?.shipments||[]).filter(c=>c.forceId===city.force&&c.targetCityId===city.id&&c.resource==="food"&&c.targetKind==="local"&&["在途","受阻"].includes(c.status))}
  static grainForecast(state,city,g=this.governance(state,city)){
    const calendar=this.cropCalendar(state,city),f=city.fiscal||{},now=this.grainDate(state.date),after=now>calendar.end||f.lastHarvestYear===state.date.year,year=state.date.year+(after?1:0),end=Date.UTC(year,calendar.month,0),days=Math.max(1,Math.round((end-now)/86400000)+1),daily=this.localDailyGrain(state,city,g),stock=Math.max(0,city.localFood||0),pending=this.incomingGrain(state,city),incoming=pending.reduce((s,c)=>s+c.delivered,0),annual=this.cropAnnualDue(state,city,g),futureFraction=after?1:Math.max(0,calendar.duration-calendar.elapsed)/calendar.duration;
    const farming=this.farmingAt(state,city).reduce((s,r)=>s+r.workers,0),farmExpected=(f.farmingAccrued||0)+farming*this.grainRules(state).farming_food_per_worker*days/365;
    const expected=Math.floor((after?0:f.cropAccrued||0)+annual*futureFraction+farmExpected),collectable=this.collectionEstimate(g,expected+(f.accrued?.food||0)),onTime=pending.filter(c=>c.status==="在途"&&c.arriveTurn-state.turn<=days).reduce((s,c)=>s+c.delivered,0),need=Math.ceil(daily*days),gap=Math.max(0,need-stock-onTime),progress=after?0:Math.min(100,Math.floor(calendar.elapsed/calendar.duration*100));
    return {year,month:calendar.month,day:new Date(end).getUTCDate(),days,daily,stock,incoming,onTime,expected,collectable,need,gap,progress,farming,farmExpected:Math.floor(farmExpected),farmAccrued:Math.floor(f.farmingAccrued||0),coverDays:daily>0?Math.floor(stock/daily):null,relief:f.grainRelief||null};
  }
  static seedOpeningGrain(state){
    const ledger=this.initialize(state);if(ledger.grainOpening)return;const rules=this.grainRules(state),deficits=new Map();
    for(const city of state.data.cities){const g=this.governance(state,city),calendar=this.cropCalendar(state,city),f=city.fiscal;
      f.grainVersion=1;f.cropAccrued=this.grainDate(state.date)<=calendar.end?this.cropAnnualDue(state,city,g)*calendar.elapsed/calendar.duration:0;
      const config=state.data.cityResourceProfiles,scenario=config?.scenarios?.[state.data.scenario?.id]||config?.scenarios?.["200_guandu"]||{},adjustment={...scenario.default,...scenario.regions?.[city.resourceRegion],...scenario.cities?.[city.id]},forecast=this.grainForecast(state,city,g),factor=this.clamp((adjustment.food_stock??.74)/.74,.25,1.25),target=Math.ceil(forecast.daily*(forecast.days+rules.opening_reserve_days)*factor),before=city.localFood||0;
      // 库存低于通常水平的剧本保留缺粮设定，不以自动补齐抹平历史困境。
      const granted=factor<.8?0:Math.max(0,Math.min(city.storage||20000,target)-before);city.localFood=before+granted;
      f.openingGrain={target,added:granted,shortfall:Math.max(0,target-city.localFood),scarce:factor<.8};
      if(city.force!=="neutral"&&factor>=.8)deficits.set(city.force,(deficits.get(city.force)||0)+f.openingGrain.shortfall);
    }
    for(const force of state.data.forces){if(!force.resources)continue;const before=force.resources.food||0;force.resources.food=Math.max(before,deficits.get(force.id)||0)}
    ledger.grainOpening={version:1,date:{...state.date}};
  }
  static advanceGrainRelief(state,events){
    const ledger=this.initialize(state),rules=this.grainRules(state),interval=GameClock.isDaily(state)?rules.relief_review_days:1;
    if(ledger.lastGrainReview!=null&&state.turn-ledger.lastGrainReview<interval)return;ledger.lastGrainReview=state.turn;
    for(const force of state.data.forces.filter(f=>f.id!=="neutral"&&!f.eliminated)){
      const account=ledger.forces[force.id];if(!account?.autoGrainRelief)continue;
      const source=state.data.cities.find(c=>c.id===account.capitalId&&c.force===force.id),pool=force.id===state.playerForceId?state.resources:force.resources;
      if(!source||!pool||state.engine.isCityBesieged(source))continue;
      const protectedFood=Math.max(this.localDailyGrain(state,source)*rules.central_reserve_days,...this.supplyRoutes(state,force.id).filter(l=>l.enabled&&l.sourceKind==="central").map(l=>l.reserveFood)),candidates=[];
      for(const city of state.data.cities){if(city.force!==force.id)continue;const daily=this.localDailyGrain(state,city),incoming=this.incomingGrain(state,city).reduce((s,c)=>s+c.delivered,0),stock=Math.max(0,city.localFood||0),managed=this.managedDepot(state,city);
        const trigger=daily&&stock+incoming<daily*Math.max(rules.relief_trigger_days,90)?state.engine.reliefTriggerDays?.(state,force.id,city,rules.relief_trigger_days)??rules.relief_trigger_days:rules.relief_trigger_days;city.fiscal.grainRelief={status:managed?"指定粮线供粮":!daily||stock+incoming>=daily*trigger?"储粮充足":incoming?"中央粮在途":"待中央调拨",incoming};
        if(managed||!daily||stock+incoming>=daily*trigger)continue;
        if(state.engine.isCityBesieged(city)){city.fiscal.grainRelief.status="被围无法调入";continue}
        candidates.push({city,daily,incoming,stock,cover:stock/daily});
      }
      candidates.sort((a,b)=>a.cover-b.cover);let dispatched=0;
      for(const row of candidates){const {city,daily,incoming,stock}=row;if(dispatched>=rules.relief_max_dispatches)break;
        const spare=Math.max(0,Math.floor((pool.food||0)-protectedFood));if(spare<=0){city.fiscal.grainRelief.status="中央余粮不足";continue}
        const goal=Math.min(city.storage||20000,Math.ceil(daily*rules.relief_target_days)),need=Math.max(0,goal-stock-incoming);if(need<=0)continue;
        const amount=Math.floor(Math.min(need,state.engine.reliefBatch?.(force.id,rules.relief_batch)??rules.relief_batch,spare)),cargo=this.enqueue(state,{forceId:force.id,sourceCityId:source.id,targetCityId:city.id,resource:"food",amount,targetKind:"local",purpose:"中央济粮"});
        if(!cargo){city.fiscal.grainRelief.status="道路不通";continue}
        pool.food-=amount;cargo.grainRelief=true;city.fiscal.grainRelief={status:"中央粮在途",incoming:incoming+cargo.delivered,cargoId:cargo.id};dispatched++;
        if(force.id===state.playerForceId)events.push({phase:"后勤",siteId:city.id,text:`中央自${source.name}拨粮 ${amount} 石救济${city.name}，预计 ${cargo.arriveTurn-state.turn} 日后入县仓，路损 ${cargo.transportLoss} 石`});
      }
    }
  }
  static collect(state,city,type,events,manual=false){
    const fiscal=city.fiscal,account=this.account(state,city.force),engine=state.engine,month=this.monthIndex(state.date),last=fiscal.lastCollected[type];
    if(engine.isCityBesieged(city))return {ok:false,error:"围城期间无法征收"};
    if(manual&&Number.isFinite(last)&&month<=last)return {ok:false,error:"本月已经征收，不能重复征收"};
    const gross=Math.floor(fiscal.accrued[type]||0);
    if(gross<=0)return {ok:false,error:"尚无应征收入"};
    const resource=["land","commercial"].includes(type)?"gold":type,cost=Math.ceil(18+this.governance(state,city).population/14000),g=this.governance(state,city);
    if((city.localGold||0)<cost)return {ok:false,error:`征收需地方经费 ${cost}贯`};
    const inefficiencyLoss=Math.floor(gross*(1-g.efficiency)*(1-g.support*.45)),corruptionLoss=Math.floor((gross-inefficiencyLoss)*g.corruption),net=gross-inefficiencyLoss-corruptionLoss;
    const useRate=this.clamp(.06+g.bureaucracy/1600+(1-g.support)*.15,.06,.35),localUse=Math.floor(net*useRate),keepRate=this.clamp((city.reserveRatio??25)/100+g.bureaucracy/3000,.05,.8);
    const requestedRetention=Math.floor((net-localUse)*keepRate),retained=resource==="food"?Math.floor(Math.min(net-localUse,Math.max(0,Math.min(city.storage||20000,Math.max(requestedRetention,g.population*.03+this.garrisonDailyFood(state,city.garrison)*18+g.bureaucracy*6))-(city.localFood||0)))):requestedRetention,remittable=net-localUse-retained;
    city.localGold-=cost;fiscal.accrued[type]-=gross;fiscal.lastCollected[type]=month;fiscal.attention=this.clamp(fiscal.attention+12,0,100);
    const key={gold:"localGold",food:"localFood",silk:"localSilk"}[resource];city[key]=(city[key]||0)+retained;
    // 零星上缴先记为待解，攒满一批（见 balance.economy.min_remittance）再起运，免得数百辆小车同时在途。
    const batched=remittable>0&&remittable<this.minRemittance(state,resource),shipment=batched?null:this.enqueue(state,{forceId:city.force,sourceCityId:city.id,targetCityId:account.capitalId,resource,amount:remittable});
    if(!shipment){city[key]+=remittable;fiscal.pendingRemittance[resource]+=remittable}
    fiscal.lastCollection??={};fiscal.lastCollection[type]={turn:state.turn,gross,resource,cost,inefficiencyLoss,corruptionLoss,localUse,retained,remitted:shipment?remittable:0,pending:shipment?0:remittable,transportLoss:shipment?.transportLoss||0,expected:shipment?.delivered||0};
    city.publicSupport=this.clamp(city.publicSupport-(manual?1:.15)-Math.max(0,(type==="land"?account.landRate:type==="commercial"?account.commercialRate:account.silkRate)-15)*.12,0,100);
    if(city.force===state.playerForceId)events.push({phase:"财政",siteId:city.id,text:`${city.name}${{land:"田租",commercial:"商业税",food:"粮食",silk:"布帛"}[type]}征收 ${gross}${this.units[resource]}：行政损耗 ${inefficiencyLoss}、贪污 ${corruptionLoss}、地方耗用 ${localUse}、留用 ${retained}、${shipment?"上缴在途":batched?"零星待解":"道路不通留存"} ${remittable}；征收经费 ${cost}贯`});
    return {ok:true,...fiscal.lastCollection[type]};
  }
  static settle(state,events){
    this.initialize(state);for(const army of state.data.armies)if(army.farming&&(!this.canFarmArmy(state,army)||army.city!==army.farming.cityId))delete army.farming;state.engine.syncCountyControl();state.engine.initializeAdministration();this.advanceShipments(state,events);this.advanceProjects(state,events);
    const scale=GameClock.factor(state),month=this.monthIndex(state.date),monthEnd=GameClock.isMonthEnd(state),autumn=state.date.month===this.grainRules(state).harvest_month&&monthEnd;
    for(const force of state.data.forces.filter(force=>force.id!=="neutral"&&!force.eliminated)){
      const account=this.account(state,force.id),cities=state.data.cities.filter(city=>city.force===force.id),before={gold:force.resources.gold,food:force.resources.food,silk:force.resources.silk};
      let income=0,harvest=0,upkeep=0;
      for(const city of cities){
        const fiscal=city.fiscal,g=this.governance(state,city),counties=state.engine.countiesForCity(city.id),besieged=state.engine.isCityBesieged(city),factor=besieged?0:city.occupiedUntil?.5:1;
        fiscal.attention=Math.max(0,fiscal.attention-3*scale);fiscal.efficiency=g.efficiency;fiscal.effectiveCorruption=g.corruption;
        const foodReserve=this.localFoodReserve(state,city,g),keepArrears=account.arrears==="retain";let arrearLine="";
        for(const resource of ["gold","food","silk"]){const key={gold:"localGold",food:"localFood",silk:"localSilk"}[resource],owed=fiscal.pendingRemittance[resource]||0;if(owed<=0)continue;
          if(keepArrears){fiscal.pendingRemittance[resource]=0;fiscal.arrearsRetained={gold:0,food:0,silk:0,...(typeof fiscal.arrearsRetained==="object"?fiscal.arrearsRetained:null)};fiscal.arrearsRetained[resource]+=owed;arrearLine+=`${arrearLine?"、":""}${this.names[resource]} ${owed}${this.units[resource]}`;continue}
          const amount=Math.min(owed,Math.max(0,(city[key]||0)-(resource==="food"?foodReserve:0)));if(amount<this.minRemittance(state,resource))continue;const shipment=this.enqueue(state,{forceId:city.force,sourceCityId:city.id,targetCityId:account.capitalId,resource,amount,purpose:"补缴"});if(shipment){city[key]-=amount;fiscal.pendingRemittance[resource]-=amount;arrearLine+=`${arrearLine?"、":""}${this.names[resource]} ${amount}${this.units[resource]}`}}
        if(arrearLine&&city.force===state.playerForceId&&(keepArrears||(fiscal.arrearsNoticeTurn??-999)+30<=state.turn)){fiscal.arrearsNoticeTurn=state.turn;events.push({phase:"财政",siteId:city.id,text:keepArrears?`${city.name}欠额 ${arrearLine}不再补缴，转为地方留用`:`${city.name}以本地余粮补缴欠额 ${arrearLine}${foodReserve?`，本地留底粮食 ${foodReserve}石优先保障驻军与军团`:""}`})}
        const engine=state.engine,base=place=>engine.taxBase?engine.taxBase(state,place):(place.population||0),comply=engine.clanCompliance&&state.clans?engine.clanCompliance(state,city,city.force):1,countyBase=counties.reduce((sum,county)=>sum+base(county),0),rural=(counties.length?countyBase+base(city)*.15:base(city))*comply,agriculture=(city.agriculture||40)/50,commerce=(city.commerce||30)/50;
        const activeLabor=this.initialize(state).laborGroups.filter(group=>group.cityId===city.id&&group.status==="服役").reduce((sum,group)=>sum+group.people,0),laborFactor=this.clamp(1-activeLabor/Math.max(1,rural+activeLabor)*2,.1,1);
        const markets=(city.buildings||[]).filter(name=>name==="市集").length,farms=(city.buildings||[]).filter(name=>name==="农庄").length;
        const land=rural/1700*agriculture*(account.landRate/10)*g.support*factor*laborFactor*scale,commercial=((city.commerce||30)*1.2+rural/18000+markets*40)*commerce*(account.commercialRate/10)*g.support*factor*laborFactor*scale;
        fiscal.accrued.land+=land;fiscal.accrued.commercial+=commercial;income+=land+commercial;
        const calendar=this.cropCalendar(state,city),stamp=`${state.date.year}-${state.date.month}-${state.date.day??state.date.xun}`;
        fiscal.grainVersion??=1;
        if(calendar.growing&&fiscal.lastCropAccrual!==stamp){fiscal.cropAccrued+=this.cropAnnualDue(state,city,g,{rural,laborFactor})/calendar.duration*(GameClock.isDaily(state)?1:10);fiscal.lastCropAccrual=stamp}
        fiscal.accrued.silk+=rural/18000*.6*(account.silkRate/10)*g.support*factor*laborFactor*scale;
        this.advanceFarming(state,city);
        let cityHarvest=0;if(autumn&&fiscal.lastHarvestYear!==state.date.year){const crop=Math.floor(fiscal.cropAccrued+(fiscal.farmingAccrued||0));fiscal.lastHarvestFarming=Math.floor(fiscal.farmingAccrued||0);fiscal.accrued.food+=crop;fiscal.lastHarvestYear=state.date.year;fiscal.cropAccrued=0;fiscal.farmingAccrued=0;fiscal.cropYear=state.date.year;harvest+=crop;cityHarvest=crop}
        fiscal.expenseRemainder=(fiscal.expenseRemainder||0)+g.bureaucracy*.16*scale;const expense=Math.floor(fiscal.expenseRemainder);fiscal.expenseRemainder-=expense;
        fiscal.foodExpenseRemainder=(fiscal.foodExpenseRemainder||0)+(besieged?0:(g.bureaucracy*.35+this.garrisonDailyFood(state,city.garrison)*(GameClock.isDaily(state)?1:10))*scale);const foodExpense=Math.floor(fiscal.foodExpenseRemainder),foodTaken=Math.min(city.localFood||0,foodExpense);fiscal.foodExpenseRemainder-=foodExpense;
        city.localGold=Math.max(0,(city.localGold||0)-expense);city.localFood=Math.max(0,(city.localFood||0)-foodTaken);fiscal.localConsumption={gold:expense,food:foodTaken,foodNeed:foodExpense};upkeep+=foodExpense;
        if(!besieged&&foodTaken<foodExpense){city.order=Math.max(0,(city.order||50)-1);city.publicSupport=Math.max(0,city.publicSupport-1)}
        if(monthEnd)for(const type of ["land","commercial","food","silk"]){const period=account.periods[type],last=fiscal.lastCollected[type];const due=Number.isFinite(last)?month-last>=period:type==="food"?autumn:(month+1)%period===0;if(due)this.collect(state,city,type,events)}
        city.publicSupport=this.clamp(city.publicSupport+(account.landRate+account.commercialRate<=20?.06:-.03)*scale,0,100);
        // 人口增减由人口系统按月结算（出生、死亡、迁徙），这里只分摊县的收入
        for(const county of counties){const share=base(county)*comply/Math.max(1,rural);county.lastIncome={gold:Math.floor((land+commercial)*share),food:Math.floor(cityHarvest*share)}}
      }
      if(force.id===state.playerForceId){const entry={turn:state.turn,income:Math.floor(income),harvest,upkeep,netFood:force.resources.food-before.food,gold:force.resources.gold,food:force.resources.food,silk:force.resources.silk,centralGold:force.resources.gold-before.gold,centralFood:force.resources.food-before.food,centralSilk:force.resources.silk-before.silk,grainPrice:state.engine.grainPrice(state),countyIncome:0,countyHarvest:0};state.policies.economyHistory??=[];state.policies.economyHistory.push(entry);state.policies.economyHistory=state.policies.economyHistory.slice(-36)}
    }
    this.advanceSupplyRoutes(state,events);this.advanceGrainRelief(state,events);
  }
  static incomeSources(state,forceId=state.playerForceId){
    const cities=state.data.cities.filter(city=>city.force===forceId),rows=[];
    for(const city of cities)for(const [kind,item] of Object.entries(city.fiscal?.lastCollection||{}))if(item&&item.gross>0)rows.push({cityId:city.id,cityName:city.name,kind,resource:item.resource,turn:item.turn||0,gross:item.gross,remitted:item.remitted||0,retained:item.retained||0,arrears:item.pending||0});
    return ["gold","food","silk"].map(resource=>{
      const matching=rows.filter(row=>row.resource===resource);
      if(!matching.length)return {resource,turn:null,total:0,entries:[]};
      const turn=Math.max(...matching.map(row=>row.turn)),merged=new Map;
      for(const row of matching.filter(row=>row.turn===turn)){const entry=merged.get(row.cityId)||{cityId:row.cityId,cityName:row.cityName,kinds:[],gross:0,remitted:0,retained:0,arrears:0};entry.gross+=row.gross;entry.remitted+=row.remitted;entry.retained+=row.retained;entry.arrears+=row.arrears;entry.kinds.push(row.kind);merged.set(row.cityId,entry)}
      const entries=[...merged.values()],total=entries.reduce((sum,entry)=>sum+entry.gross,0);
      for(const entry of entries)entry.share=total>0?entry.gross/total:0;entries.sort((a,b)=>b.gross-a.gross);
      return {resource,turn,total,entries};
    });
  }
  static pendingArrears(state,forceId=state.playerForceId){
    const cities=state.data.cities.filter(city=>city.force===forceId);
    return ["gold","food","silk"].reduce((totals,resource)=>(totals[resource]=cities.reduce((sum,city)=>sum+(city.fiscal?.pendingRemittance?.[resource]||0),0),totals),{});
  }
  // 野战日粮参考汉简大石粟口径；驻屯官粮净支出另设平衡参数，不作为实际食量或统一史制。
  // 开局府库：玩家与 AI 同一公式，钱按据点数、粮按兵力（乘仓储倍率）。
  static startingResources(data,force,prestige=200){const stock={army_ration:.066,stock_scale:4,...(data?.rules?.balance?.food||{})}.stock_scale;return {gold:Math.max(6000,(force?.cities||1)*3000),food:Math.round(Math.max(18000,(force?.soldiers||20000)*.45)*stock),silk:0,prestige}}
  static foodRules(state){return {army_ration:.066,stationed_ration:.033,garrison_ration:.05,crop_scale:1,stock_scale:4,...(state?.data?.rules?.balance?.food||{})}}
  static garrisonDailyFood(state,soldiers){return Math.max(0,soldiers||0)*this.foodRules(state).garrison_ration}
  // 驻屯按较低的官仓净支出计；这是就地供养的平衡抽象，不是把士卒饮食减半。
  static armyRationProfile(state,army,{field=false}={}){const rules=this.foodRules(state),city=field?null:this.stationedCity(state,army),stationed=!!city&&!army.retreat&&army.stance!=="败退"&&!army.raiding&&!state.engine?.isCityBesieged(city),farm=stationed&&army.farming&&state.engine?this.armyFarming(state,army):null;return {mode:farm?.active?"farming":stationed?"stationed":"field",label:farm?.active?"屯田供养":stationed?"驻屯供养":"行军战备",rate:stationed?rules.stationed_ration*(farm?.rateFactor??1):rules.army_ration}}
  static armyDailyNeed(state,army,options){return Math.max(1,Math.ceil(((army.soldiers||0)+(army.wounded||0)+Object.values(army.prisoners||{}).reduce((n,v)=>n+v,0)*.5)*this.armyRationProfile(state,army,options).rate*(GameClock.isDaily(state)?1:10)*(state.engine?.quartermasterFactor?.(army,"ration")??1)))}
  // 随军满仓按携粮天数（玩家可调，默认为该军轻松携带的天数）；超出会压低组织度，见 engine/logistics.js。
  static armyFoodTarget(state,army){const days=state.engine?.armyCarryDays?state.engine.armyCarryDays(army):60;return Math.ceil(this.armyDailyNeed(state,army,{field:true})*(GameClock.isDaily(state)?days:days/10))}
  static localFoodReserve(state,city,g,includeDepot=true){const garrisonReserve=Math.floor((g.population||0)*.03+this.garrisonDailyFood(state,city.garrison)*18+g.bureaucracy*6),armyReserve=state.data.armies.filter(army=>!army.fieldPosition&&army.force===city.force&&army.city===city.id).reduce((sum,army)=>sum+Math.max(0,this.armyFoodTarget(state,army)-((army.stores&&army.stores.food)||0)),0);return Math.max(0,garrisonReserve+armyReserve,...(includeDepot?this.supplyRoutes(state,city.force).filter(line=>line.enabled).flatMap(line=>[line.targetCityId===city.id?Math.min(line.targetFood,city.storage||20000):0,line.sourceKind==="local"&&line.sourceCityId===city.id?line.reserveFood:0]):[]))}
  static supplyCity(state,army){
    if(army.fieldPosition)return null;const city=state.data.cities.find(item=>item.id===army.city&&item.force===army.force);
    return city&&!state.engine.isCityBesieged(city)?city:null;
  }
  static stationedCity(state,army){
    if(army.engagementId||army.fieldPosition||army.route?.length||army.siegeTarget)return null;
    // 被围的城内仍能就仓；围困只阻断外调，不使城内现存粮消失。
    return state.data.cities.find(city=>city.id===army.city&&city.force===army.force)||null;
  }
  static hasLedger(state){return Boolean(state?.data?.cities&&state.policies)}
  static stockArmy(state,army){
    army.stores??={gold:0,food:0,silk:0};for(const key of ["gold","food","silk"])army.stores[key]??=0;
    if(!this.hasLedger(state))return 0;
    this.initialize(state);
    const city=this.supplyCity(state,army),target=this.armyFoodTarget(state,army),fill=city?Math.min(Math.max(0,target-army.stores.food),city.localFood||0):0;
    if(fill>0){city.localFood-=fill;army.stores.food+=fill}
    const extra=city&&army.stores.food<target?this.drawRegionalFood(state,city,target-army.stores.food,army.force):0;army.stores.food+=extra;
    return fill+extra;
  }
  // 调粮次序（粮政）：本郡（州）各城余粮最先取用（各留本城守军三十日口粮）。其后按粮政：
  // 就近调运（默认）——境内其他城仓（各留六十日口粮，途损随里程）；
  // 中央统筹／郡县自给——不跨郡即时抽粮；中央济粮另走安全道路实运。AI 势力默认就近调运。
  static GRAIN_DISPATCH={nearby:"就近调运",central:"中央统筹",local:"郡县自给"};
  static grainDispatch(state,forceId){const mode=forceId===state.playerForceId?state.policies?.grainDispatch:null;return this.GRAIN_DISPATCH[mode]?mode:"nearby"}
  static haulRules(state){return {haul_cells:30,haul_loss_per_cell:.008,haul_max_loss:.3,haul_reserve_days:60,field_resupply_days:20,...(state?.data?.rules?.balance?.food||{})}}
  static drawRegionalFood(state,city,amount,forceId=city.force){if(this.managedDepot(state,city))return 0;let remaining=Math.max(0,Math.ceil(amount));const local=new Set([city.id]);for(const source of state.engine.reinforcementSources?.(city,forceId)||[]){local.add(source.city.id);if(!remaining)break;const other=source.city;if(other.id===city.id||this.managedDepot(state,other))continue;const spare=Math.max(0,(other.localFood||0)-Math.ceil(this.garrisonDailyFood(state,other.garrison)*30)),taken=Math.min(remaining,spare);if(taken){other.localFood-=taken;remaining-=taken}}
    const haul=()=>{if(!remaining)return;const cfg=this.haulRules(state),near=state.data.cities.filter(other=>other.force===forceId&&!local.has(other.id)&&!this.managedDepot(state,other)&&!state.engine.isCityBesieged(other)).map(other=>({other,distance:Math.hypot(other.x-city.x,other.y-city.y)})).filter(item=>item.distance<=cfg.haul_cells).sort((a,b)=>a.distance-b.distance);
      for(const {other,distance} of near){if(!remaining)break;const keep=1-Math.min(cfg.haul_max_loss,distance*cfg.haul_loss_per_cell),spare=Math.max(0,(other.localFood||0)-Math.ceil(this.garrisonDailyFood(state,other.garrison)*cfg.haul_reserve_days)),shipped=Math.min(spare,Math.ceil(remaining/keep));if(shipped<=0)continue;other.localFood-=shipped;remaining=Math.max(0,remaining-Math.floor(shipped*keep))}};
    // 中央粮不再直接瞬移到军仓；中央济粮通过 advanceGrainRelief 实际运入县仓。
    const mode=this.grainDispatch(state,forceId);if(mode==="nearby")haul();
    return Math.max(0,Math.ceil(amount)-remaining)}
  // 行军与围城中的军团：随军军仓不足二十日时，由距其最近的己方城池沿补给线续运。
  static fieldAnchor(state,army){const here=state.data.cities.find(city=>city.id===army.city);if(!here)return null;if(here.force===army.force&&!state.engine.isCityBesieged(here))return here;const cfg=this.haulRules(state);let best=null;for(const city of state.data.cities){if(city.force!==army.force||state.engine.isCityBesieged(city))continue;const distance=Math.hypot(city.x-here.x,city.y-here.y);if(distance<=cfg.haul_cells&&(!best||distance<best.distance))best={city,distance}}return best?.city||null}
  static consumeArmy(state,army,events){
    army.stores??={gold:0,food:0,silk:0};army.stores.food??=0;
    if(!this.hasLedger(state))return 0;
    this.initialize(state);
    const need=this.armyDailyNeed(state,army),city=this.stationedCity(state,army);
    const fromCity=city?Math.min(need,Math.max(0,city.localFood||0)):0;
    if(fromCity>0)city.localFood-=fromCity;
    const fromStores=Math.min(need-fromCity,army.stores.food);army.stores.food-=fromStores;
    const fromRegion=city&&!state.engine.isCityBesieged(city)&&need-fromCity-fromStores>0?this.drawRegionalFood(state,city,need-fromCity-fromStores,army.force):0;
    // 在外军团：大军由补给来源派运粮队实运，轻装在敌境就食（engine/logistics.js）；无引擎时退回旧的就近续运。
    if(!city&&state.engine?.fieldResupply)state.engine.fieldResupply(state,army,events);
    else if(!city&&army.stores.food<need*this.haulRules(state).field_resupply_days/(GameClock.isDaily(state)?1:10)){const anchor=this.fieldAnchor(state,army);if(anchor){const wanted=this.armyFoodTarget(state,army)-army.stores.food,own=Math.min(wanted,Math.max(0,(anchor.localFood||0)-Math.ceil(this.garrisonDailyFood(state,anchor.garrison)*30)));anchor.localFood-=own;army.stores.food+=own+(own<wanted?this.drawRegionalFood(state,anchor,wanted-own,army.force):0);army.stores.lastResupply={turn:state.turn,cityId:anchor.id}}}
    const taken=fromCity+fromStores+fromRegion,short=need-taken;
    army.stores.lastConsumption={turn:state.turn,need,taken,rationMode:this.armyRationProfile(state,army).mode,fromCity:fromCity+fromRegion,fromRegion,fromStores,short,cityId:city?.id||null,source:short>0?"缺粮":fromCity>=need?"城市粮仓":fromRegion?"郡府调拨":fromStores>=need-fromCity?"随军军仓":"兼取"};
    if(short>0){army.supply=Math.max(0,(army.supply??100)-8);army.morale=Math.max(0,(army.morale??70)-4);if(army.force===state.playerForceId)events.push({phase:"后勤",text:`${army.name}军仓缺粮 ${short}石，补给与士气下降`})}
    return need;
  }
  static preview(state,forceId=state.playerForceId){
    const data=structuredClone(state.data),copy={...state,data,policies:structuredClone(state.policies),resources:structuredClone(state.resources),date:{...state.date},engine:new RuleEngine(data)},beforePopulation=state.economicSnapshot?.().population||0;
    this.settle(copy,[]);const row=copy.policies.economyHistory?.at(-1)||{},cities=data.cities.filter(city=>city.force===forceId),account=this.account(copy,forceId);
    return {...row,taxRate:account.landRate,season:1,seasonLabel:"按征收周期",foodYield:0,cityIncome:row.income||0,countyIncome:0,cityHarvest:row.harvest||0,countyHarvest:0,buildingGold:0,buildingFood:0,populationChange:cities.reduce((sum,city)=>sum+city.population+copy.engine.countyPopulation(city.id),0)-beforePopulation,localFoodGain:0,projectedGold:copy.resources.gold,projectedFood:copy.resources.food,projectedSilk:copy.resources.silk,account,cityRows:cities.map(city=>({id:city.id,name:city.name,state:copy.engine.isCityBesieged(city)?"围城":"正常",market:0,farm:0,localHarvest:0,populationChange:0,localGold:city.localGold,localFood:city.localFood,localSilk:city.localSilk,storage:city.storage,publicSupport:city.publicSupport,fiscal:city.fiscal})),shipments:copy.policies.fiscalAccounts.shipments.filter(cargo=>cargo.forceId===forceId),armies:data.armies.filter(army=>army.force===forceId).map(army=>({id:army.id,name:army.name,...army.stores})),laborGroups:copy.policies.fiscalAccounts.laborGroups.filter(group=>group.forceId===forceId&&group.status==="服役"),projects:copy.policies.fiscalAccounts.projects.filter(project=>project.forceId===forceId&&project.status!=="完成")};
  }
  static dismissLabor(state,cityId,events,groupId=null){
    const ledger=this.initialize(state);
    for(const group of ledger.laborGroups.filter(group=>group.cityId===cityId&&group.status==="服役"&&(!groupId||group.id===groupId))){for(const origin of group.origins){const home=origin.countyId?state.data.counties.find(county=>county.id===origin.countyId):state.data.cities.find(item=>item.id===origin.cityId);if(home)state.engine.returnPeople?state.engine.returnPeople(state,home,origin.people):home.population+=origin.people}group.status="遣散";group.dismissedTurn=state.turn;events.push({phase:"徭役",siteId:cityId,text:`徭役遣散 ${group.people}人，返还原县编户；已服役 ${group.usedDays}人日`})}
  }
  static levyLabor(state,city,personDays,events,projectId=null){
    const ledger=this.initialize(state),needed=Math.ceil(personDays/10),cap=Math.floor(state.engine.countyPopulation(city.id)*.02),people=Math.min(needed,cap),cost=Math.ceil(people*.04);
    if(!people||city.localGold<cost)return null;
    const origins=[],actual=state.engine.drawCountyPopulation(city.id,people,origins);if(!actual)return null;
    city.localGold-=cost;city.publicSupport=this.clamp(city.publicSupport-2,0,100);
    const group={id:`labor-${++ledger.sequence}`,forceId:city.force,cityId:city.id,origins,people:actual,totalDays:personDays,usedDays:0,projectId,status:"服役",startedTurn:state.turn};ledger.laborGroups.push(group);events.push({phase:"徭役",siteId:city.id,text:`${city.name}从辖县征发 ${actual}人、目标 ${personDays}人日，地方支出 ${cost}贯；服役人口暂离生产`});return group;
  }
  static advanceProjects(state,events){
    const ledger=this.initialize(state);
    for(const group of ledger.laborGroups.filter(group=>group.status==="服役"&&group.startedTurn<state.turn)){group.usedDays+=Math.min(group.people*(GameClock.isDaily(state)?1:10),Math.max(0,group.totalDays-group.usedDays));if(!group.projectId&&!group.cargoId&&group.usedDays>=group.totalDays)this.dismissLabor(state,group.cityId,events,group.id)}
    for(const project of ledger.projects.filter(project=>project.status==="施工"&&project.startedTurn<state.turn)){
      const city=state.data.cities.find(city=>city.id===project.cityId);if(!city||city.force!==project.forceId){project.status="中止";this.dismissLabor(state,project.cityId,events);continue}if(state.engine.isCityBesieged(city))continue;
      const labor=ledger.laborGroups.filter(group=>group.projectId===project.id&&group.status==="服役").reduce((sum,group)=>sum+group.people*(GameClock.isDaily(state)?1:10),0)*(state.engine.projectSpeed?.(state.engine.projectDefaults(project,city),city)??1);project.completedDays=Math.min(project.requiredDays,project.completedDays+labor);if(project.completedDays<project.requiredDays)continue;
      this.completeProject(state,project,city);project.status="完成";state.engine.invalidateDuties?.();for(const group of ledger.laborGroups.filter(group=>group.projectId===project.id))this.dismissLabor(state,city.id,events,group.id);events.push({phase:"建设",siteId:city.id,text:`${city.name}${project.name}完工，共 ${project.requiredDays}人日`});
    }
  }
  static completeProject(state,project,city){
    const options=project.options||{};
    if(project.type==="construct_building"){const def=state.data.rules.buildings[options.building];city.buildings.push(def.name);city.commerce+=def.commerce||0;city.agriculture+=def.agriculture||0}
    if(project.type==="repair")city.defenseDamage=Math.max(0,city.defenseDamage-30);
    if(project.type==="build_warehouse"){city.storage+=10000*this.foodRules(state).stock_scale;city.buildings.push("仓库")}
    if(project.type==="fortify")city.level=Math.min(5,city.level+1);
    if(project.type==="waterworks"){city.agriculture+=2;city.floodResistance=Math.min(80,(city.floodResistance||0)+20);city.buildings.push("水利")}
    // 内政改制 P4 新增项目：开垦提高农业；安置流民按六成落户为编户，治安小升。
    if(project.type==="reclaim_land"){city.agriculture=Math.min(100,(city.agriculture||0)+4);for(const county of state.engine.countiesForCity(city.id))county.agriculture=Math.min(100,(county.agriculture||0)+2)}
    if(project.type==="settle_refugees"){project.settled=state.engine.settleRefugees(city,.6);city.order=Math.min(100,(city.order||0)+2)}
    if(project.type==="relieve_fire"){city.fireDamage=0;city.defenseDamage=Math.max(0,city.defenseDamage-10)}
    if(project.type==="build_road"){const graph=state.data.rules.city_graph,target=project.targetCityId;graph[city.id]??=[];graph[target]??=[];if(!graph[city.id].includes(target))graph[city.id].push(target);if(!graph[target].includes(city.id))graph[target].push(city.id);(state.data.builtRoads??=[]).push([city.id,target])}
  }
  static handleOrder(state,order,events){
    if(!["army_farming","build_supply_depot","set_supply_route","set_collection_policy","set_capital","dispatch_resources","dismiss_labor","relieve_fire","collect_tax","set_tax_rate","reward_officer","requisition_labor","transfer_gold","transfer_food","transport","construct_building","repair","build_road","build_warehouse","fortify","waterworks","reclaim_land","settle_refugees"].includes(order.type))return false;
    this.initialize(state);const engine=state.engine,city=state.data.cities.find(city=>city.id===order.cityIds?.[0]),own=city?.force===state.playerForceId,options=order.options||{},account=this.account(state),fail=message=>{events.push({phase:"财政",text:message});return true};
    if(order.type==="army_farming"){
      const army=state.data.armies.find(a=>a.force===state.playerForceId&&(order.armyIds?.length?a.id===order.armyIds[0]:order.text?.includes(a.name)));
      if(!army)return fail("屯田失败：请选择本方军团");
      if(options.enabled==="no"){delete army.farming;return fail(`${army.name}停止屯田，已有田间成果保留至当地收获`)}
      if(!this.canFarmArmy(state,army))return fail("屯田须驻己方县城，不能在行军、野外、围城、败退或袭扰时进行");
      if(army.farming)return fail(`${army.name}已在屯田`);
      army.farming={cityId:army.city,startedTurn:state.turn};return fail(`${army.name}开始屯田，减少官粮支出并积累本地下一次收成，军伍训练放缓`);
    }
    if(order.type==="build_supply_depot"){if(!own||engine.isCityBesieged(city))return fail("修建粮仓需要未被围困的己方县城");const result=engine.buildDepot(state,city?.id);return fail(result.ok?result.text:`修建粮仓失败：${result.error}`)}
    if(order.type==="set_supply_route"){const result=this.configureSupplyRoute(state,order);return fail(result.ok?`自动供粮线路${result.line.enabled?"已启用":"已停用"}，每五日检查前线仓缺口；已启运粮队继续运输`:`供粮设置失败：${result.error}`)}
    if(order.type==="set_collection_policy"){
      const rates=["landRate","commercialRate","silkRate"],periods=["land","commercial","food","silk"];
      if(rates.some(key=>!Number.isFinite(Number(options[key]))||Number(options[key])<0||Number(options[key])>40)||periods.some(key=>![1,3,6,12].includes(Number(options[`${key}Period`]))))return fail("征收制度失败：税率须为0—40%，周期为1、3、6或12个月");
      if(options.arrears!==undefined&&!this.arrearsModes[options.arrears])return fail("征收制度失败：欠缴处理只能选择补缴或地方留用");
      for(const key of rates)account[key]=Number(options[key]);for(const key of periods)account.periods[key]=Number(options[`${key}Period`]);state.policies.taxRate=account.landRate;if(options.arrears!==undefined)account.arrears=options.arrears;events.push({phase:"财政",text:`征收制度更新：田租 ${account.landRate}%、商业税 ${account.commercialRate}%、布帛 ${account.silkRate}%；粮食仅秋收产生；欠缴${this.arrearsModes[account.arrears]}`});return true;
    }
    if(order.type==="set_tax_rate"){const rate=Number(order.amount);if(!Number.isFinite(rate)||rate<0||rate>40)return fail("税率必须在0—40%之间");account.landRate=rate;account.commercialRate=rate;state.policies.taxRate=rate;return fail(`田租和商业税均设为 ${rate}%`)}
    if(order.type==="set_capital"){if(!own)return fail("首都必须是己方城市");account.capitalId=city.id;return fail(`中央府库迁至${city.name}，已发出的上缴继续送往原定目的地`)}
    if(order.type==="collect_tax"){if(!own)return fail("征收需要己方城市");const type=options.resource||"land";if(!["land","commercial","food","silk"].includes(type))return fail("征收类别无效");const result=this.collect(state,city,type,events,true);if(!result.ok)return fail(`${city.name}征收失败：${result.error}`);return true}
    if(order.type==="reward_officer"){const resource=options.rewardResource||"gold",officer=state.data.officers.find(officer=>officer.id===order.officerIds?.[0]&&officer.force===state.playerForceId&&officer.status==="serving"),amount=Math.floor(Number(order.amount??(resource==="silk"?20:200)));if(!["gold","silk"].includes(resource)||!officer||!Number.isFinite(amount)||amount<=0||state.resources[resource]<amount)return fail("赏赐失败：人物、数量无效或中央库存不足");state.resources[resource]-=amount;officer.loyalty=this.clamp((officer.loyalty||70)+Math.min(10,Math.ceil(amount/(resource==="silk"?2:20))),0,100);officer.merit=(officer.merit||0)+20;return fail(`${officer.name}获赐${this.names[resource]} ${amount}${this.units[resource]}`)}
    if(order.type==="dismiss_labor"){if(!own)return fail("遣散需要己方城市");this.dismissLabor(state,city.id,events);return true}
    if(order.type==="requisition_labor"){if(!own||engine.isCityBesieged(city))return fail("徭役征发需要未受围困的己方城市");const days=Math.floor(Number(order.amount)||0);if(days<=0)return fail("徭役须指定正数人日");if(options.projectId&&!state.policies.fiscalAccounts.projects.some(project=>project.id===options.projectId&&project.cityId===city.id&&project.forceId===city.force&&project.status==="施工"))return fail("徭役必须投入本城正在施工的工程");const group=this.levyLabor(state,city,days,events,options.projectId||null);if(!group)return fail("征发失败：辖县人口或地方经费不足");return true}
    if(["transfer_gold","transfer_food","transport","dispatch_resources"].includes(order.type)){
      if(!own)return fail("调运需要己方起点城市");const resource=order.type==="transfer_gold"?"gold":order.type==="transfer_food"?"food":options.resource||"food";
      if(!["gold","food","silk"].includes(resource))return fail("调运物资无效");const target=state.data.cities.find(city=>city.id===order.cityIds?.[1]&&city.force===state.playerForceId),army=state.data.armies.find(army=>army.id===order.armyIds?.[0]&&army.force===state.playerForceId),destination=army?state.data.cities.find(city=>city.id===army.city):target;
      if(!destination)return fail("调运目的地无效");const central=options.source==="central",key={gold:"localGold",food:"localFood",silk:"localSilk"}[resource],source=central?state.data.cities.find(city=>city.id===account.capitalId):city,pool=central?state.resources:city,balanceKey=central?resource:key,amount=Math.floor(Number(order.amount)||0);
      if(!source||amount<=0||(pool[balanceKey]||0)<amount)return fail("调运失败：库存不足或数量无效");const route=this.route(state,source.id,destination.id,state.playerForceId);if(!route)return fail("调运失败：没有连通的己方安全道路，飞地无法越境转运");let group=null;
      if(options.useLabor==="yes"){const days=Math.max(10,Math.ceil(amount*Math.max(1,route.length-1)*.2)),fee=Math.ceil(Math.min(Math.ceil(days/10),Math.floor(engine.countyPopulation(source.id)*.02))*.04);if(!central&&resource==="gold"&&city.localGold<amount+fee)return fail("调运及徭役征发经费不足");group=this.levyLabor(state,source,days,events);if(!group)return fail("运输徭役征发失败：地方人口或经费不足")}
      const cargo=this.enqueue(state,{forceId:state.playerForceId,sourceCityId:source.id,targetCityId:destination.id,resource,amount,targetKind:army?"army":"local",armyId:army?.id,purpose:"调运"});if(group){group.cargoId=cargo.id;cargo.laborId=group.id}pool[balanceKey]-=amount;events.push({phase:"后勤",text:`调运 ${amount}${this.units[resource]}${this.names[resource]}，预计 ${Math.max(1,cargo.route.length-1)}回合后到达，路损 ${cargo.transportLoss}`});return true;
    }
    if(["construct_building","repair","build_road","build_warehouse","fortify","waterworks","relieve_fire","reclaim_land","settle_refugees"].includes(order.type)){
      if(!own||engine.isCityBesieged(city))return fail("工程需要未受围困的己方城市");const ledger=this.initialize(state),def=state.data.rules.buildings?.[options.building],pending=ledger.projects.filter(project=>project.cityId===city.id&&project.status==="施工"),refugees=order.type==="settle_refugees"?engine.refugeeCount(city):0,cost={repair:300,build_road:1000,build_warehouse:700,fortify:600,waterworks:800,relieve_fire:100,reclaim_land:900,settle_refugees:Math.max(200,Math.round(refugees*.04))}[order.type]??def?.cost;if(order.type==="settle_refugees"&&refugees<200)return fail(`${city.name}流民不足 200 人，无需安置`);if(pending.some(project=>project.type===order.type&&["reclaim_land","settle_refugees","waterworks"].includes(order.type)))return fail(`${city.name}已有同类项目在办`);
      if(order.type==="construct_building"&&(!def||city.buildings.length+pending.filter(project=>project.type==="construct_building").length>=(city.level||1)+2))return fail("工程失败：建筑无效或槽位已满");const target=state.data.cities.find(target=>target.id===order.cityIds?.[1]&&target.force===city.force);if(order.type==="build_road"&&!target)return fail("道路工程需要另一座己方城市");if(!Number.isFinite(cost)||city.localGold<cost)return fail(`工程需地方资金 ${cost||0}贯`);
      const project={id:`project-${++ledger.sequence}`,forceId:city.force,cityId:city.id,targetCityId:target?.id,type:order.type,name:def?.name||order.commandName||order.type,options,requiredDays:Math.max(500,cost*8),completedDays:0,startedTurn:state.turn,status:"施工"},levyFee=Math.ceil(Math.min(Math.ceil(project.requiredDays/10),Math.floor(engine.countyPopulation(city.id)*.02))*.04);if(city.localGold<cost+levyFee)return fail(`工程及征发需要地方经费 ${cost+levyFee}贯`);const group=this.levyLabor(state,city,project.requiredDays,events,project.id);if(!group)return fail("工程失败：无法征发辖县劳动力");city.localGold-=cost;project.laborId=group.id;engine.projectDefaults?.(project,city);if(Number(options.deadlineDays)>0)project.deadlineTurn=state.turn+Math.round(Number(options.deadlineDays));else project.deadlineTurn=state.turn+Math.ceil(project.requiredDays/Math.max(1,group.people)*1.3);if(options.priority&&engine.projectPriorities?.().includes(options.priority))project.priority=options.priority;ledger.projects.push(project);engine.invalidateDuties?.();return fail(`${city.name}${project.name}立项开工：地方投入 ${cost}贯，需 ${project.requiredDays}人日，主责 ${engine.officerById(project.leadId)?.name||"普通官员"}`);
    }
    return false;
  }
};
