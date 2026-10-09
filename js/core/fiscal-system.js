/* One ledger for local treasuries, central treasuries, cargo and army stores. */
window.FiscalSystem=class FiscalSystem {
  static units={gold:"贯",food:"石",silk:"品",labor:"人日"};
  static names={gold:"钱币",food:"粮食",silk:"布帛",labor:"徭役"};
  static clamp(value,min,max){return Math.max(min,Math.min(max,value))}
  static monthIndex(date){return date.year*12+date.month-1}
  static defaults(){return {landRate:10,commercialRate:10,silkRate:10,periods:{land:1,commercial:1,food:12,silk:3},harvestMonth:9}}
  static commands=[
    ["set_collection_policy","征收制度","finance","财政","分别设置田租、商业税、粮食和布帛的税率与征收周期"],
    ["set_capital","设置首都","finance","财政","将己方城市设为中央府库所在地，新上缴按通往首都的道路计算"],
    ["dispatch_resources","府库调运","logistics","后勤","从中央或地方库拨送钱粮布帛，经道路运输后进入地方库或军队仓储"],
    ["dismiss_labor","遣散徭役","logistics","后勤","遣散指定城市的徭役，返还原县人口并停止其生产占用"],
    ["relieve_fire","扑救火灾","construction","建设","征发徭役清理火灾损伤，工程完成后自动遣散民夫"]
  ];
  static initialize(state){
    const data=state.data;
    state.policies.fiscalAccounts??={version:1,forces:{},shipments:[],laborGroups:[],projects:[],sequence:0};
    const ledger=state.policies.fiscalAccounts;
    ledger.forces??={};ledger.shipments??=[];ledger.laborGroups??=[];ledger.projects??=[];ledger.sequence??=0;
    state.resources.silk??=0;
    if(data.commandCatalog)for(const [id,name,categoryId,categoryName,description] of this.commands)if(!data.commandCatalog.commands.some(command=>command.id===id))data.commandCatalog.commands.push({id,name,categoryId,categoryName,description,status:"active",parameters:["actor_id","target_ids","amount","options"]});
    for(const force of data.forces.filter(force=>force.id!=="neutral")){
      const owned=data.cities.filter(city=>city.force===force.id),defaults=this.defaults();
      const account=ledger.forces[force.id]??={...defaults,capitalId:owned.find(city=>city.id===force.capital||city.name===force.capital)?.id||owned[0]?.id||null};
      account.periods={...defaults.periods,...account.periods};
      if(!owned.some(city=>city.id===account.capitalId))account.capitalId=owned[0]?.id||null;
      for(const key of ["landRate","commercialRate","silkRate","harvestMonth"])account[key]??=defaults[key];
      if(force.id===state.playerForceId)force.resources=state.resources;
      else force.resources??={gold:Math.max(6000,(force.cities||1)*3000),food:Math.max(18000,(force.soldiers||20000)*.45),silk:0,prestige:200};
      force.resources.silk??=0;
      for(const city of owned){
        city.localSilk??=0;city.publicSupport??=city.order??60;
        city.fiscal??={};const fiscal=city.fiscal;
        fiscal.accrued??={land:0,commercial:0,food:0,silk:0};
        fiscal.lastCollected??={};fiscal.pendingRemittance??={gold:0,food:0,silk:0};fiscal.attention??=0;fiscal.corruption??=25;fiscal.cropAccrued??=0;fiscal.cropYear??=state.date.year;fiscal.lastHarvestYear??=null;fiscal.localConsumption??={gold:0,food:0};
      }
    }
    for(const army of data.armies){army.stores??={gold:0,food:0,silk:0};for(const key of ["gold","food","silk"])army.stores[key]??=0}
    return ledger;
  }
  static account(state,forceId=state.playerForceId){return this.initialize(state).forces[forceId]}
  static governance(state,city){
    const engine=state.engine,profile=role=>engine.officialProfile(city,role),governor=profile("governor"),county=profile("commanderyGovernor"),finance=profile("commerce"),agriculture=profile("agriculture"),households=profile("population"),support=this.clamp((city.publicSupport??city.order??60)/100,.1,1);
    const ability=(governor.score+county.score+finance.score+households.score)/4;
    const efficiency=this.clamp(.48+ability/180-(city.fiscal?.attention||0)/250,.25,.98);
    const corruption=this.clamp((city.fiscal?.corruption??25)/100-(governor.score+finance.score)/700,.01,.45);
    const population=(city.population||0)+engine.countyPopulation(city.id),bureaucracy=Math.max(10,Math.ceil(population/12000)+(city.level||1)*8);
    return {efficiency,corruption,support,ability,agriculture:agriculture.score,bureaucracy,population};
  }
  static route(state,from,to,forceId){return state.engine.logisticsPath(from,to,forceId)}
  static enqueue(state,{forceId,sourceCityId,targetCityId,resource,amount,targetKind="central",armyId=null,purpose="上缴"}){
    const ledger=this.initialize(state),route=this.route(state,sourceCityId,targetCityId,forceId);
    if(!route)return null;
    const source=state.data.cities.find(city=>city.id===sourceCityId),score=this.governance(state,source).ability,distance=Math.max(0,route.length-1);
    const lossRate=this.clamp(distance*(resource==="food"?.025:resource==="silk"?.012:.008)*(1-score/160),0,.45),loss=Math.floor(amount*lossRate);
    const edgeDays=GameClock.isDaily(state)?10:1,shipment={id:`cargo-${++ledger.sequence}`,forceId,sourceCityId,targetCityId,targetKind,armyId,resource,amount:Math.floor(amount),transportLoss:loss,delivered:Math.floor(amount)-loss,route,nextIndex:0,edgeDays,segmentRemainingDays:route.length>1?edgeDays:1,departedTurn:state.turn,arriveTurn:state.turn+Math.max(1,distance*edgeDays),purpose,status:"在途"};
    ledger.shipments.push(shipment);return shipment;
  }
  static advanceShipments(state,events){
    const ledger=this.initialize(state);
    for(const cargo of ledger.shipments){
      if(cargo.status==="完成"||cargo.status==="没收"||cargo.departedTurn>=state.turn)continue;
      const next=cargo.route[Math.min(cargo.nextIndex+1,cargo.route.length-1)],destination=state.data.cities.find(city=>city.id===cargo.targetCityId),source=state.data.cities.find(city=>city.id===cargo.sourceCityId);
      if(destination?.force!==cargo.forceId){cargo.status="没收";cargo.completedTurn=state.turn;if(destination){const key={gold:"localGold",food:"localFood",silk:"localSilk"}[cargo.resource];destination[key]=(destination[key]||0)+cargo.delivered}if(cargo.laborId)this.dismissLabor(state,cargo.sourceCityId,events,cargo.laborId);events.push({phase:"财政",text:`${cargo.purpose}运输目的地失守，${cargo.delivered}${this.units[cargo.resource]}被当地势力没收`});continue}
      const current=cargo.route[cargo.nextIndex],edgeOpen=next===current||(state.data.rules.city_graph[current]||[]).includes(next);
      if(!edgeOpen||!next||state.data.cities.find(city=>city.id===next)?.force!==cargo.forceId||state.engine.isCityBesieged(next)||state.data.armies.some(army=>army.city===next&&army.force!==cargo.forceId&&!army.siegeTarget)||!source){cargo.status="受阻";cargo.arriveTurn+=1;continue}
      cargo.status="在途";cargo.segmentRemainingDays??=1;cargo.segmentRemainingDays-=1;if(cargo.segmentRemainingDays>0)continue;cargo.nextIndex=Math.min(cargo.nextIndex+1,cargo.route.length-1);cargo.segmentRemainingDays=cargo.edgeDays||1;
      if(cargo.nextIndex<cargo.route.length-1)continue;
      let pool;
      if(cargo.targetKind==="central")pool=state.data.forces.find(force=>force.id===cargo.forceId)?.resources;
      else if(cargo.targetKind==="army")pool=state.data.armies.find(army=>army.id===cargo.armyId&&army.force===cargo.forceId&&army.city===cargo.targetCityId)?.stores;
      if(cargo.targetKind==="local"||cargo.targetKind==="army"&&!pool){const key={gold:"localGold",food:"localFood",silk:"localSilk"}[cargo.resource],accepted=cargo.resource==="food"?Math.min(cargo.delivered,Math.max(0,(destination.storage||20000)-(destination[key]||0))):cargo.delivered;destination[key]=(destination[key]||0)+accepted;cargo.storageLoss=cargo.delivered-accepted;if(cargo.storageLoss)events.push({phase:"后勤",siteId:destination.id,text:`${destination.name}仓储不足，${cargo.storageLoss}石粮食无法入仓并损失`})}else if(pool)pool[cargo.resource]=(pool[cargo.resource]||0)+cargo.delivered;
      cargo.status="完成";cargo.completedTurn=state.turn;
      if(cargo.laborId)this.dismissLabor(state,cargo.sourceCityId,events,cargo.laborId);
      if(cargo.forceId===state.playerForceId)events.push({phase:"财政",siteId:destination.id,text:`${cargo.purpose}入库：${cargo.delivered}${this.units[cargo.resource]}${this.names[cargo.resource]}（路损 ${cargo.transportLoss}，行程 ${cargo.route.length-1} 段）`});
    }
    ledger.shipments=ledger.shipments.filter(cargo=>!["完成","没收"].includes(cargo.status)||state.turn-(cargo.completedTurn||cargo.departedTurn)<36);
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
    const requestedRetention=Math.floor((net-localUse)*keepRate),retained=resource==="food"?Math.floor(Math.min(net-localUse,Math.max(0,Math.min(city.storage||20000,Math.max(requestedRetention,g.population*.03+(city.garrison||0)/250*18+g.bureaucracy*6))-(city.localFood||0)))):requestedRetention,remittable=net-localUse-retained;
    city.localGold-=cost;fiscal.accrued[type]-=gross;fiscal.lastCollected[type]=month;fiscal.attention=this.clamp(fiscal.attention+12,0,100);
    const key={gold:"localGold",food:"localFood",silk:"localSilk"}[resource];city[key]=(city[key]||0)+retained;
    const shipment=this.enqueue(state,{forceId:city.force,sourceCityId:city.id,targetCityId:account.capitalId,resource,amount:remittable});
    if(!shipment){city[key]+=remittable;fiscal.pendingRemittance[resource]+=remittable}
    fiscal.lastCollection??={};fiscal.lastCollection[type]={turn:state.turn,gross,resource,cost,inefficiencyLoss,corruptionLoss,localUse,retained,remitted:shipment?remittable:0,pending:shipment?0:remittable,transportLoss:shipment?.transportLoss||0,expected:shipment?.delivered||0};
    city.publicSupport=this.clamp(city.publicSupport-(manual?1:.15)-Math.max(0,(type==="land"?account.landRate:type==="commercial"?account.commercialRate:account.silkRate)-15)*.12,0,100);
    if(city.force===state.playerForceId)events.push({phase:"财政",siteId:city.id,text:`${city.name}${{land:"田租",commercial:"商业税",food:"粮食",silk:"布帛"}[type]}征收 ${gross}${this.units[resource]}：行政损耗 ${inefficiencyLoss}、贪污 ${corruptionLoss}、地方耗用 ${localUse}、留用 ${retained}、${shipment?"上缴在途":"道路不通留存"} ${remittable}；征收经费 ${cost}贯`});
    return {ok:true,...fiscal.lastCollection[type]};
  }
  static settle(state,events){
    this.initialize(state);state.engine.syncCountyControl();state.engine.initializeAdministration();this.advanceShipments(state,events);this.advanceProjects(state,events);
    const scale=GameClock.factor(state),month=this.monthIndex(state.date),monthEnd=GameClock.isMonthEnd(state),autumn=state.date.month===9&&monthEnd;
    for(const force of state.data.forces.filter(force=>force.id!=="neutral"&&!force.eliminated)){
      const account=this.account(state,force.id),cities=state.data.cities.filter(city=>city.force===force.id),before={gold:force.resources.gold,food:force.resources.food,silk:force.resources.silk};
      let income=0,harvest=0,upkeep=0;
      for(const city of cities){
        const fiscal=city.fiscal,g=this.governance(state,city),counties=state.engine.countiesForCity(city.id),besieged=state.engine.isCityBesieged(city),factor=besieged?0:city.occupiedUntil?.5:1;
        fiscal.attention=Math.max(0,fiscal.attention-3*scale);fiscal.efficiency=g.efficiency;fiscal.effectiveCorruption=g.corruption;
        for(const resource of ["gold","food","silk"]){const key={gold:"localGold",food:"localFood",silk:"localSilk"}[resource],amount=Math.min(fiscal.pendingRemittance[resource]||0,city[key]||0);if(amount>0){const shipment=this.enqueue(state,{forceId:city.force,sourceCityId:city.id,targetCityId:account.capitalId,resource,amount,purpose:"补缴"});if(shipment){city[key]-=amount;fiscal.pendingRemittance[resource]-=amount}}}
        const countyPopulation=counties.reduce((sum,county)=>sum+(county.population||0),0),rural=(counties.length?countyPopulation+(city.population||0)*.15:(city.population||0)),agriculture=(city.agriculture||40)/50,commerce=(city.commerce||30)/50;
        const activeLabor=this.initialize(state).laborGroups.filter(group=>group.cityId===city.id&&group.status==="服役").reduce((sum,group)=>sum+group.people,0),laborFactor=this.clamp(1-activeLabor/Math.max(1,rural+activeLabor)*2,.1,1);
        const markets=(city.buildings||[]).filter(name=>name==="市集").length,farms=(city.buildings||[]).filter(name=>name==="农庄").length;
        const land=rural/1700*agriculture*(account.landRate/10)*g.support*factor*laborFactor*scale,commercial=((city.commerce||30)*1.2+rural/18000+markets*40)*commerce*(account.commercialRate/10)*g.support*factor*laborFactor*scale;
        fiscal.accrued.land+=land;fiscal.accrued.commercial+=commercial;income+=land+commercial;
        fiscal.cropAccrued+=(rural*.025*agriculture+farms*180)*factor*laborFactor*(.7+g.agriculture/160)*scale;
        fiscal.accrued.silk+=rural/18000*.6*(account.silkRate/10)*g.support*factor*laborFactor*scale;
        let cityHarvest=0;if(autumn&&fiscal.lastHarvestYear!==state.date.year){const crop=Math.floor(fiscal.cropAccrued);fiscal.accrued.food+=crop;fiscal.lastHarvestYear=state.date.year;fiscal.cropAccrued=0;fiscal.cropYear=state.date.year;harvest+=crop;cityHarvest=crop}
        fiscal.expenseRemainder=(fiscal.expenseRemainder||0)+g.bureaucracy*.16*scale;const expense=Math.floor(fiscal.expenseRemainder);fiscal.expenseRemainder-=expense;
        fiscal.foodExpenseRemainder=(fiscal.foodExpenseRemainder||0)+(besieged?0:(g.bureaucracy*.35+(city.garrison||0)/250)*scale);const foodExpense=Math.floor(fiscal.foodExpenseRemainder),foodTaken=Math.min(city.localFood||0,foodExpense);fiscal.foodExpenseRemainder-=foodExpense;
        city.localGold=Math.max(0,(city.localGold||0)-expense);city.localFood=Math.max(0,(city.localFood||0)-foodTaken);fiscal.localConsumption={gold:expense,food:foodTaken,foodNeed:foodExpense};upkeep+=foodExpense;
        if(!besieged&&foodTaken<foodExpense){city.order=Math.max(0,(city.order||50)-1);city.publicSupport=Math.max(0,city.publicSupport-1)}
        if(monthEnd)for(const type of ["land","commercial","food","silk"]){const period=account.periods[type],last=fiscal.lastCollected[type];const due=Number.isFinite(last)?month-last>=period:type==="food"?autumn:(month+1)%period===0;if(due)this.collect(state,city,type,events)}
        city.publicSupport=this.clamp(city.publicSupport+(account.landRate+account.commercialRate<=20?.06:-.03)*scale,0,100);
        const growth=(.00008+((city.order||50)-50)*.000006+(city.occupiedUntil?-.0005:0))*scale;
        const cityGrowth=city.population*growth+(fiscal.populationRemainder||0),cityDelta=Math.trunc(cityGrowth);city.population=Math.max(1000,city.population+cityDelta);fiscal.populationRemainder=cityGrowth-cityDelta;
        for(const county of counties){const total=county.population*growth+(county.growthRemainder||0),delta=Math.trunc(total);county.population=Math.max(500,county.population+delta);county.growthRemainder=total-delta;county.lastIncome={gold:Math.floor((land+commercial)*county.population/Math.max(1,rural)),food:Math.floor(cityHarvest*county.population/Math.max(1,rural))}}
      }
      if(force.id===state.playerForceId){const entry={turn:state.turn,income:Math.floor(income),harvest,upkeep,netFood:force.resources.food-before.food,gold:force.resources.gold,food:force.resources.food,silk:force.resources.silk,centralGold:force.resources.gold-before.gold,centralFood:force.resources.food-before.food,centralSilk:force.resources.silk-before.silk,grainPrice:state.engine.grainPrice(state),countyIncome:0,countyHarvest:0};state.policies.economyHistory??=[];state.policies.economyHistory.push(entry);state.policies.economyHistory=state.policies.economyHistory.slice(-36)}
    }
  }
  static consumeArmy(state,army,events){
    this.initialize(state);const city=state.data.cities.find(city=>city.id===army.city&&city.force===army.force),need=Math.max(1,Math.ceil(army.soldiers/(GameClock.isDaily(state)?600:60))),target=need*(GameClock.isDaily(state)?60:6);
    if(city&&!state.engine.isCityBesieged(city)){const fill=Math.min(Math.max(0,target-army.stores.food),city.localFood||0);city.localFood-=fill;army.stores.food+=fill}
    const taken=Math.min(need,army.stores.food);army.stores.food-=taken;army.stores.lastConsumption={turn:state.turn,need,taken};
    if(taken<need){army.supply=Math.max(0,(army.supply??100)-8);army.morale=Math.max(0,(army.morale??70)-4);if(army.force===state.playerForceId)events.push({phase:"后勤",text:`${army.name}军仓缺粮 ${need-taken}石，补给与士气下降`})}
  }
  static preview(state,forceId=state.playerForceId){
    const data=structuredClone(state.data),copy={...state,data,policies:structuredClone(state.policies),resources:structuredClone(state.resources),date:{...state.date},engine:new RuleEngine(data)},beforePopulation=state.economicSnapshot?.().population||0;
    this.settle(copy,[]);const row=copy.policies.economyHistory?.at(-1)||{},cities=data.cities.filter(city=>city.force===forceId),account=this.account(copy,forceId);
    return {...row,taxRate:account.landRate,season:1,seasonLabel:"按征收周期",foodYield:0,cityIncome:row.income||0,countyIncome:0,cityHarvest:row.harvest||0,countyHarvest:0,buildingGold:0,buildingFood:0,populationChange:cities.reduce((sum,city)=>sum+city.population+copy.engine.countyPopulation(city.id),0)-beforePopulation,localFoodGain:0,projectedGold:copy.resources.gold,projectedFood:copy.resources.food,projectedSilk:copy.resources.silk,account,cityRows:cities.map(city=>({id:city.id,name:city.name,state:copy.engine.isCityBesieged(city)?"围城":"正常",market:0,farm:0,localHarvest:0,populationChange:0,localGold:city.localGold,localFood:city.localFood,localSilk:city.localSilk,storage:city.storage,publicSupport:city.publicSupport,fiscal:city.fiscal})),shipments:copy.policies.fiscalAccounts.shipments.filter(cargo=>cargo.forceId===forceId),armies:data.armies.filter(army=>army.force===forceId).map(army=>({id:army.id,name:army.name,...army.stores})),laborGroups:copy.policies.fiscalAccounts.laborGroups.filter(group=>group.forceId===forceId&&group.status==="服役"),projects:copy.policies.fiscalAccounts.projects.filter(project=>project.forceId===forceId&&project.status!=="完成")};
  }
  static dismissLabor(state,cityId,events,groupId=null){
    const ledger=this.initialize(state);
    for(const group of ledger.laborGroups.filter(group=>group.cityId===cityId&&group.status==="服役"&&(!groupId||group.id===groupId))){for(const origin of group.origins){const county=state.data.counties.find(county=>county.id===origin.countyId);if(county)county.population+=origin.people}group.status="遣散";group.dismissedTurn=state.turn;events.push({phase:"徭役",siteId:cityId,text:`徭役遣散 ${group.people}人，返还原县编户；已服役 ${group.usedDays}人日`})}
  }
  static levyLabor(state,city,personDays,events,projectId=null){
    const ledger=this.initialize(state),needed=Math.ceil(personDays/10),cap=Math.floor(state.engine.countyPopulation(city.id)*.02),people=Math.min(needed,cap),cost=Math.ceil(people*.04);
    if(!people||city.localGold<cost)return null;
    let remaining=people;const origins=[];
    for(const county of state.engine.countiesForCity(city.id).sort((a,b)=>b.population-a.population)){const taken=Math.min(remaining,Math.max(0,county.population-500));if(taken){county.population-=taken;origins.push({countyId:county.id,people:taken});remaining-=taken}if(!remaining)break}
    const actual=people-remaining;if(!actual)return null;
    city.localGold-=cost;city.publicSupport=this.clamp(city.publicSupport-2,0,100);
    const group={id:`labor-${++ledger.sequence}`,forceId:city.force,cityId:city.id,origins,people:actual,totalDays:personDays,usedDays:0,projectId,status:"服役",startedTurn:state.turn};ledger.laborGroups.push(group);events.push({phase:"徭役",siteId:city.id,text:`${city.name}从辖县征发 ${actual}人、目标 ${personDays}人日，地方支出 ${cost}贯；服役人口暂离生产`});return group;
  }
  static advanceProjects(state,events){
    const ledger=this.initialize(state);
    for(const group of ledger.laborGroups.filter(group=>group.status==="服役"&&group.startedTurn<state.turn)){group.usedDays+=Math.min(group.people*(GameClock.isDaily(state)?1:10),Math.max(0,group.totalDays-group.usedDays));if(!group.projectId&&!group.cargoId&&group.usedDays>=group.totalDays)this.dismissLabor(state,group.cityId,events,group.id)}
    for(const project of ledger.projects.filter(project=>project.status==="施工"&&project.startedTurn<state.turn)){
      const city=state.data.cities.find(city=>city.id===project.cityId);if(!city||city.force!==project.forceId){project.status="中止";this.dismissLabor(state,project.cityId,events);continue}if(state.engine.isCityBesieged(city))continue;
      const labor=ledger.laborGroups.filter(group=>group.projectId===project.id&&group.status==="服役").reduce((sum,group)=>sum+group.people*(GameClock.isDaily(state)?1:10),0);project.completedDays=Math.min(project.requiredDays,project.completedDays+labor);if(project.completedDays<project.requiredDays)continue;
      this.completeProject(state,project,city);project.status="完成";for(const group of ledger.laborGroups.filter(group=>group.projectId===project.id))this.dismissLabor(state,city.id,events,group.id);events.push({phase:"建设",siteId:city.id,text:`${city.name}${project.name}完工，共 ${project.requiredDays}人日`});
    }
  }
  static completeProject(state,project,city){
    const options=project.options||{};
    if(project.type==="construct_building"){const def=state.data.rules.buildings[options.building];city.buildings.push(def.name);city.commerce+=def.commerce||0;city.agriculture+=def.agriculture||0}
    if(project.type==="repair")city.defenseDamage=Math.max(0,city.defenseDamage-30);
    if(project.type==="build_warehouse"){city.storage+=10000;city.buildings.push("仓库")}
    if(project.type==="fortify")city.level=Math.min(5,city.level+1);
    if(project.type==="waterworks"){city.agriculture+=2;city.floodResistance=Math.min(80,(city.floodResistance||0)+20);city.buildings.push("水利")}
    if(project.type==="relieve_fire"){city.fireDamage=0;city.defenseDamage=Math.max(0,city.defenseDamage-10)}
    if(project.type==="build_road"){const graph=state.data.rules.city_graph,target=project.targetCityId;graph[city.id]??=[];graph[target]??=[];if(!graph[city.id].includes(target))graph[city.id].push(target);if(!graph[target].includes(city.id))graph[target].push(city.id)}
  }
  static handleOrder(state,order,events){
    if(!["set_collection_policy","set_capital","dispatch_resources","dismiss_labor","relieve_fire","collect_tax","set_tax_rate","reward_officer","requisition_labor","transfer_gold","transfer_food","transport","construct_building","repair","build_road","build_warehouse","fortify","waterworks"].includes(order.type))return false;
    this.initialize(state);const engine=state.engine,city=state.data.cities.find(city=>city.id===order.cityIds?.[0]),own=city?.force===state.playerForceId,options=order.options||{},account=this.account(state),fail=message=>{events.push({phase:"财政",text:message});return true};
    if(order.type==="set_collection_policy"){
      const rates=["landRate","commercialRate","silkRate"],periods=["land","commercial","food","silk"];
      if(rates.some(key=>!Number.isFinite(Number(options[key]))||Number(options[key])<0||Number(options[key])>40)||periods.some(key=>![1,3,6,12].includes(Number(options[`${key}Period`]))))return fail("征收制度失败：税率须为0—40%，周期为1、3、6或12个月");
      for(const key of rates)account[key]=Number(options[key]);for(const key of periods)account.periods[key]=Number(options[`${key}Period`]);state.policies.taxRate=account.landRate;events.push({phase:"财政",text:`征收制度更新：田租 ${account.landRate}%、商业税 ${account.commercialRate}%、布帛 ${account.silkRate}%；粮食仅秋收产生`});return true;
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
    if(["construct_building","repair","build_road","build_warehouse","fortify","waterworks","relieve_fire"].includes(order.type)){
      if(!own||engine.isCityBesieged(city))return fail("工程需要未受围困的己方城市");const ledger=this.initialize(state),def=state.data.rules.buildings?.[options.building],pending=ledger.projects.filter(project=>project.cityId===city.id&&project.status==="施工"),cost={repair:300,build_road:1000,build_warehouse:700,fortify:600,waterworks:800,relieve_fire:100}[order.type]??def?.cost;
      if(order.type==="construct_building"&&(!def||city.buildings.length+pending.filter(project=>project.type==="construct_building").length>=(city.level||1)+2))return fail("工程失败：建筑无效或槽位已满");const target=state.data.cities.find(target=>target.id===order.cityIds?.[1]&&target.force===city.force);if(order.type==="build_road"&&!target)return fail("道路工程需要另一座己方城市");if(!Number.isFinite(cost)||city.localGold<cost)return fail(`工程需地方资金 ${cost||0}贯`);
      const project={id:`project-${++ledger.sequence}`,forceId:city.force,cityId:city.id,targetCityId:target?.id,type:order.type,name:def?.name||order.commandName||order.type,options,requiredDays:Math.max(500,cost*8),completedDays:0,startedTurn:state.turn,status:"施工"},levyFee=Math.ceil(Math.min(Math.ceil(project.requiredDays/10),Math.floor(engine.countyPopulation(city.id)*.02))*.04);if(city.localGold<cost+levyFee)return fail(`工程及征发需要地方经费 ${cost+levyFee}贯`);const group=this.levyLabor(state,city,project.requiredDays,events,project.id);if(!group)return fail("工程失败：无法征发辖县劳动力");city.localGold-=cost;project.laborId=group.id;ledger.projects.push(project);return fail(`${city.name}${project.name}开工，地方投入 ${cost}贯，需 ${project.requiredDays}人日`);
    }
    return false;
  }
};
