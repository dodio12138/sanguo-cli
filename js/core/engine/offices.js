// RuleEngine 分模块：内政改制 P2——县廷、郡府（含行郡事、寄领）、州府、幕府各职位与行政容量。
// 负荷每旬随 invalidateDuties 重建并缓存；结算按"幕府定目标 0.10 · 州郡组织 0.27 · 县廷执行 0.63"合成各项政务分数。
// 设计见 docs/ADMINISTRATION_REFORM_PLAN.md 甲编 A2/A5 与乙编 B1–B5。
(()=>{
const STAT_NAMES={politics:"政",command:"统",intelligence:"智",charm:"魅",war:"武"};
const CENTRAL_ROLES={chief:{name:"长史",stats:["politics","intelligence"]},talent:{name:"功曹",stats:["politics","charm"]},marshal:{name:"司马",stats:["command","war"]},treasurer:{name:"度支官",stats:["politics","intelligence"]},advisor:{name:"军师",stats:["intelligence","command"]},secretary:{name:"主簿",stats:["intelligence","politics"]}};
const PROVINCE_ROLES={biejia:{name:"别驾",stats:["politics","intelligence"]},zhizhong:{name:"治中",stats:["politics","command"]},gongcao:{name:"功曹从事",stats:["politics","charm"]},bingcao:{name:"兵曹从事",stats:["command","intelligence"]}};
// 郡府属吏（设在郡治或行郡事据点）；县廷三职设在每个据点。
const CLERK_ROLES=["secretary","agriculture","commerce","order","population","defense","recruitment","granary"],COUNTY_ROLES=["assistant","commandant"];
// 各项结算政务：执行环节主责、郡府组织主责、幕府定目标主责、州府协办。
const AFFAIRS={
  agriculture:{name:"农业垦殖",exec:"magistrate",clerk:"agriculture",court:"chief"},
  commerce:{name:"商业财政",exec:"magistrate",clerk:"commerce",court:"treasurer"},
  registry:{name:"户籍安置",exec:"magistrate",clerk:"population",court:"chief"},
  works:{name:"工程营缮",exec:"magistrate",clerk:"defense",court:"chief"},
  granary:{name:"粮储调拨",exec:"magistrate",clerk:"granary",court:"treasurer",province:"bingcao"},
  order:{name:"治安司法",exec:"commandant",clerk:"order",court:"chief"},
  conscription:{name:"征募军备",exec:"commandant",clerk:"recruitment",court:"marshal",province:"bingcao"},
  training:{name:"训练整编",exec:"commandant",court:"marshal"},
  talent:{name:"人才任用",exec:"magistrate",court:"talent",province:"gongcao"}
};
const DEFAULTS={capacity:{base:60,per_score:.8,injured:.72},curve:{soft:.8,at_full:.92,exponent:.8,minimum:.38},tier_weights:{court:.1,commandery:.27,county:.63,province:.07},acting_commandery_factor:.9,acting_commandery_clerks:2,lodged_load_factor:1.25,assistant_share:{assistant:.35,secretary:.3,biejia:.3,zhizhong:.2,chief:.3},assistant_full_score:80,secretary_relief:[.08,.15],concurrent_county_load:.5,loads:{magistrate:{base:18,per_10k_population:3,per_subcounty:4,per_5k_garrison:2},commandant:{base:12,per_3k_garrison:3,frontier:10},prefect:{base:20,per_node:5,per_50k_population:3,frontier:10},clerk:{base:14,per_node:3},province_governor:{base:20,per_commandery:6,per_army:4,max_armies:10},province_clerk:{base:16,per_commandery:3},court:{base:20,per_node:.2,per_post:2,per_uncovered_commandery:2},army:{commander:30,deputy:15,staff:15},temporary:{besieged:20,occupied:15,inspection:8,lord_away:15,farming_army:3}},quality:{corruption_at_full:2,corruption_per_overload:.2}};
const active=o=>o&&["serving","injured"].includes(o.status),clamp01=v=>Math.max(0,Math.min(1,v));
Object.assign(window.RuleEngine.prototype,{
  officeConfig(){return this._officeConfig??={...DEFAULTS,...(this.data.rules?.balance?.offices||{})}},
  centralOfficeRoles(){return CENTRAL_ROLES},
  provinceOfficeRoles(){return PROVINCE_ROLES},
  administrativeAffairs(){return AFFAIRS},
  officeStatLabel(stats){return stats.map(key=>STAT_NAMES[key]||key).join("/")},
  officerRawScore(officer,stats){const base=this.data.administrativeDivisions?.default_official?.ability||45;return officer?stats.reduce((sum,key)=>sum+(officer[key]||base),0)/stats.length:base},
  officeCapacity(raw,injured=false){const c=this.officeConfig().capacity;return (c.base+c.per_score*raw)*(injured?c.injured:1)},
  // 负荷率→效率：80% 以内满效；80%～100% 线性降到 0.92；超载按 0.92×(1/L)^0.8 递减，最低 0.38。只降效，不停工。
  loadEfficiency(rate){const c=this.officeConfig().curve;if(rate<=c.soft)return 1;if(rate<=1)return 1-(rate-c.soft)/(1-c.soft)*(1-c.at_full);return Math.max(c.minimum,c.at_full*Math.pow(1/rate,c.exponent))},
  loadCorruption(rate){const q=this.officeConfig().quality,soft=this.officeConfig().curve.soft;if(rate<=soft)return 0;if(rate<=1)return (rate-soft)/(1-soft)*q.corruption_at_full;return q.corruption_at_full+(rate-1)*100*q.corruption_per_overload},
  magistrateRole(city){return this.isCommanderyGovernment(city)?"countyGovernor":"governor"},
  // 郡府所在：本方占郡治→郡府；未占郡治但本郡有两处以上据点→在最大据点设行郡事；本郡仅一处据点→寄领于最近的本方郡府；都没有→幕府代行。
  officeMap(){if(this._officeMap)return this._officeMap;const groups=new Map,byId=new Map(this.data.cities.map(c=>[c.id,c])),graph=this.data.rules?.city_graph||{},cfg=this.officeConfig();
    for(const city of this.data.cities){if(!city.force||city.force==="neutral")continue;const key=`${city.force}|${city.commandery}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(city)}
    const offices=new Map,byNode=new Map,lonely=[],size=c=>this.countyPopulation(c.id)||c.population||0;
    for(const [key,nodes] of groups){const seat=nodes.find(c=>c.commanderySeatNode);if(seat||nodes.length>=2){const node=seat||[...nodes].sort((a,b)=>size(b)-size(a)||String(a.id).localeCompare(String(b.id)))[0],office={key,node,force:node.force,commandery:node.commandery,mode:seat?"seat":"acting",nodes:nodes.map(city=>({city,weight:1}))};offices.set(key,office);for(const city of nodes)byNode.set(city.id,{office,mode:office.mode})}else lonely.push(nodes[0])}
    for(const city of lonely){const seen=new Set([city.id]);let frontier=[city.id],host=null;for(let depth=0;depth<6&&!host&&frontier.length;depth++){const next=[];for(const id of frontier)for(const nb of graph[id]||[]){if(seen.has(nb))continue;seen.add(nb);const other=byId.get(nb);const office=other&&other.force===city.force&&offices.get(`${other.force}|${other.commandery}`);if(office&&!host)host=office;next.push(nb)}frontier=next}
      if(host){host.nodes.push({city,weight:cfg.lodged_load_factor,lodged:true});byNode.set(city.id,{office:host,mode:"lodged"})}else byNode.set(city.id,{office:null,mode:"court"})}
    return this._officeMap={byNode,offices:[...offices.values()]}},
  commanderyOffice(city){return city&&this.officeMap().byNode.get(city.id)||{office:null,mode:"court"}},
  commanderyOfficeNode(city){return this.commanderyOffice(city).office?.node||null},
  isCommanderyOfficeNode(city){return this.commanderyOfficeNode(city)===city},
  // 该据点可任命的职位：县廷三职；郡府所在据点另有郡府属吏。
  cityOfficeRoles(city){const county=[this.magistrateRole(city),...COUNTY_ROLES],commandery=this.isCommanderyOfficeNode(city)?CLERK_ROLES:[];return {county,commandery,mode:this.commanderyOffice(city).mode}},
  centralOfficer(forceId,role,state=this.popState){const id=state?.forceCommand?.[forceId]?.central?.[role],officer=id&&this.officerById(id);return active(officer)&&officer.force===forceId?officer:null},
  centralProfile(forceId,role,state=this.popState){const def=CENTRAL_ROLES[role],officer=this.centralOfficer(forceId,role,state),raw=this.officerRawScore(officer,def.stats),efficiency=officer?this.dutyEfficiency(officer.id):1;return {role,name:def.name,officer,id:officer?.id||null,displayName:officer?.name||"空缺",raw:Math.round(raw),score:raw*efficiency,efficiency,defaulted:!officer}},
  provincePostOf(city,state=this.popState){const command=state?.forceCommand?.[city.force];if(!command)return null;return Object.values(command.posts||{}).find(post=>post.kind==="zhou"&&this.scopeContains?.(post.scope,city)&&this.holderActive?.(post,city.force))||null},
  provinceStaffOfficer(post,role){const id=post?.staff?.[role],officer=id&&this.officerById(id);return active(officer)&&officer.force===this.postHolder?.(post)?.force?officer:null},
  provinceProfile(city,role,state=this.popState){const def=PROVINCE_ROLES[role],post=this.provincePostOf(city,state),officer=post&&this.provinceStaffOfficer(post,role),raw=this.officerRawScore(officer,def.stats),efficiency=officer?this.dutyEfficiency(officer.id):1;return {role,name:def.name,post,officer,id:officer?.id||null,displayName:officer?.name||"空缺",raw:Math.round(raw),score:raw*efficiency,efficiency,defaulted:!officer}},
  // 州府属吏任免：挂在 kind=zhou 的方面上；同一人可兼，负荷照算。
  setProvinceOffice(state,postId,role,officerId){if(!PROVINCE_ROLES[role])return {ok:false,error:"无此职"};const post=Object.values(state.forceCommand||{}).flatMap(c=>Object.values(c.posts||{})).find(p=>p.id===postId);if(!post||post.kind!=="zhou")return {ok:false,error:"只有州级方面可设州府属吏"};const forceId=this.postHolder(post)?.force,officer=officerId&&this.officerById(officerId);if(officerId&&(!active(officer)||officer.force!==forceId))return {ok:false,error:"须为本方在仕人物"};post.staff??={};post.staff[role]=officerId||null;this.invalidateDuties();this.notifyAppointments?.(state);return {ok:true,text:officer?`${officer.name}任${post.title||""}${PROVINCE_ROLES[role].name}`:`${PROVINCE_ROLES[role].name}出缺`}},
  // 每旬负荷：按职位常务负荷与临时事务汇总到人；负荷率=Σ(负荷/该职容量)。默认官员（空缺）只记县令位，用于县廷效率。
  administrativeLoads(){if(this._adminLoads)return this._adminLoads;this._lordAway=new Map;const cfg=this.officeConfig(),L=cfg.loads,T=L.temporary,state=this.popState,officers=new Map,nodes=new Map,roles=this.administrationRoles(),share=(kind,officer,stats)=>officer?(cfg.assistant_share[kind]||0)*clamp01(this.officerRawScore(officer,stats)/cfg.assistant_full_score):0;
    const add=(officer,key,label,load,stats,meta={})=>{if(!active(officer)||!(load>0))return;let record=officers.get(officer.id);if(!record)officers.set(officer.id,record={officerId:officer.id,posts:[],rate:0,load:0});const raw=this.officerRawScore(officer,stats),capacity=this.officeCapacity(raw,officer.status==="injured");record.posts.push({key,label,load,capacity,raw:Math.round(raw),...meta});record.load+=load;record.rate+=load/capacity};
    const pending=[],concurrent=new Map,boosts=city=>Object.values(city.administration?.boosts||{}).filter(until=>until>=(state?.turn??0)).length;
    // 县廷
    for(const city of this.data.cities){if(!city.force||city.force==="neutral")continue;const admin=city.administration||{},magKey=this.magistrateRole(city),pop=this.countyPopulation(city.id)||0,sub=Math.max(0,this.countiesForCity(city.id).length-1),garrison=city.garrison||0,besieged=this.isCityBesieged?.(city),occupied=city.occupiedUntil&&city.occupiedUntil>(state?.turn??0),frontier=this.isFrontierCity(city);
      const magLoad=L.magistrate.base+pop/1e4*L.magistrate.per_10k_population+sub*L.magistrate.per_subcounty+garrison/5000*L.magistrate.per_5k_garrison+(city.fiscal?.attention||0)+boosts(city)*T.inspection+(besieged?T.besieged:0)+(occupied?T.occupied:0);
      const mag=this.validAdministrativeOfficer(city,admin[`${magKey}Id`]),asst=this.validAdministrativeOfficer(city,admin.assistantId),magStats=roles.governor.stats,s=share("assistant",asst,roles.assistant.stats),own=magLoad*(1-s);
      const node={cityId:city.id,magistrateLoad:magLoad,defaultRate:0,defaultEfficiency:1};nodes.set(city.id,node);
      if(mag)add(mag,`county:${city.id}`,`${city.name}县令`,own,magStats,{cityId:city.id,role:magKey,tier:"county"});
      else{node.defaultRate=own/this.officeCapacity(this.officerRawScore(null,magStats));node.defaultEfficiency=this.loadEfficiency(node.defaultRate);
        if(magKey==="governor"&&!city.commanderySeatNode&&!this.familyCountyPerson?.(this._familyState,city.id,"magistrate")){const seat=this.commanderySeat(city.commandery,city.force),head=seat&&seat!==city?this.validAdministrativeOfficer(seat,seat.administration?.commanderyGovernorId,true)||this.validAdministrativeOfficer(seat,seat.administration?.governorId):null;if(head&&this.officerRawScore(head,magStats)*(this.administrationConfig().concurrent_county_multiplier??.8)>this.officerRawScore(null,magStats))pending.push({head,city,load:own*cfg.concurrent_county_load,magKey})}}
      if(asst)add(asst,`county:${city.id}:assistant`,`${city.name}县丞`,magLoad*s,roles.assistant.stats,{cityId:city.id,role:"assistant",tier:"county"});
      const commandant=this.validAdministrativeOfficer(city,admin.commandantId);if(commandant)add(commandant,`county:${city.id}:commandant`,`${city.name}县尉`,L.commandant.base+garrison/3000*L.commandant.per_3k_garrison+(frontier?L.commandant.frontier:0)+(besieged?T.besieged:0),roles.commandant.stats,{cityId:city.id,role:"commandant",tier:"county"})}
    // 郡府（含行郡事；寄领据点按 1.25 计入所寄郡府）
    for(const office of this.officeMap().offices){const seat=office.node,admin=seat.administration||{},weight=office.nodes.reduce((n,item)=>n+item.weight,0),pop=office.nodes.reduce((n,item)=>n+(this.countyPopulation(item.city.id)||0),0),frontier=office.nodes.some(item=>this.isFrontierCity(item.city)),occupied=office.nodes.filter(item=>item.city.occupiedUntil&&item.city.occupiedUntil>(state?.turn??0)).length,acting=office.mode==="acting"?"行":"";
      const prefLoad=L.prefect.base+weight*L.prefect.per_node+pop/5e4*L.prefect.per_50k_population+(frontier?L.prefect.frontier:0)+occupied*T.occupied,prefect=this.actualCommanderyGovernor(seat),secretary=this.validAdministrativeOfficer(seat,admin.secretaryId),s=share("secretary",secretary,roles.secretary.stats),[low,high]=cfg.secretary_relief,relief=secretary?low+(high-low)*clamp01((this.officerRawScore(secretary,roles.secretary.stats)-45)/45):0,meta={cityId:seat.id,commandery:office.commandery,tier:"commandery"};
      if(prefect)add(prefect,`commandery:${office.force}:${office.commandery}`,`${office.commandery}${acting}太守`,prefLoad*(1-s),["politics","command","intelligence"],{...meta,role:"commanderyGovernor"});
      if(secretary)add(secretary,`commandery:${office.force}:${office.commandery}:secretary`,`${office.commandery}主簿`,prefLoad*s,roles.secretary.stats,{...meta,role:"secretary"});
      const farming=office.nodes.reduce((n,item)=>n+this.data.armies.filter(a=>a.city===item.city.id&&a.force===office.force&&a.farming).length,0);
      for(const role of CLERK_ROLES.slice(1)){const officer=this.validAdministrativeOfficer(seat,admin[`${role}Id`]);if(officer)add(officer,`commandery:${office.force}:${office.commandery}:${role}`,`${office.commandery}${roles[role].name}`,(L.clerk.base+weight*L.clerk.per_node)*(1-relief)+(role==="agriculture"?farming*T.farming_army:0),roles[role].stats,{...meta,role})}}
    // 州府与方面（任何方面所辖之郡都不再由幕府直接跨郡协调）
    const covered=new Map;for(const [forceId,command] of Object.entries(state?.forceCommand||{}))for(const post of Object.values(command.posts||{})){const holder=this.postHolder?.(post);if(!active(holder)||holder.force!==forceId)continue;const cities=this.postCities(post,forceId),commanderies=new Set(cities.map(c=>c.commandery)),armies=Math.min(L.province_governor.max_armies,this.data.armies.filter(a=>a.force===forceId&&cities.some(c=>c.id===a.city)).length);
      if(!covered.has(forceId))covered.set(forceId,new Set);for(const c of commanderies)covered.get(forceId).add(c);
      if(post.kind==="zhou"){const k=commanderies.size,load=L.province_governor.base+k*L.province_governor.per_commandery+armies*L.province_governor.per_army,b=this.provinceStaffOfficer(post,"biejia"),z=this.provinceStaffOfficer(post,"zhizhong"),sb=share("biejia",b,PROVINCE_ROLES.biejia.stats),sz=share("zhizhong",z,PROVINCE_ROLES.zhizhong.stats),meta={postId:post.id,tier:"province"};
        add(holder,`post:${post.id}`,post.title||"州牧",load*(1-sb-sz),["politics","command"],{...meta,role:"governor"});if(b)add(b,`post:${post.id}:biejia`,`${post.title||""}别驾`,load*sb,PROVINCE_ROLES.biejia.stats,{...meta,role:"biejia"});if(z)add(z,`post:${post.id}:zhizhong`,`${post.title||""}治中`,load*sz,PROVINCE_ROLES.zhizhong.stats,{...meta,role:"zhizhong"});
        for(const role of ["gongcao","bingcao"]){const o=this.provinceStaffOfficer(post,role);if(o)add(o,`post:${post.id}:${role}`,`${post.title||""}${PROVINCE_ROLES[role].name}`,L.province_clerk.base+k*L.province_clerk.per_commandery,PROVINCE_ROLES[role].stats,{...meta,role})}}
      else if(!this.isCivilPrefectPost?.(post))add(holder,`post:${post.id}`,post.title||"方面",4+armies*2,["command","intelligence"],{postId:post.id,tier:"province",role:"governor"})}
    // 幕府：君主与六席；长史分担君主负荷，君主离都时另承担 15 点
    for(const force of this.data.forces){if(force.id==="neutral")continue;const own=this.data.cities.filter(c=>c.force===force.id);if(!own.length)continue;const posts=Object.keys(state?.forceCommand?.[force.id]?.posts||{}).length,commanderies=new Set(own.map(c=>c.commandery)),uncovered=commanderies.size>1?[...commanderies].filter(c=>!covered.get(force.id)?.has(c)).length:0,base=L.court.base+own.length*L.court.per_node+posts*L.court.per_post+uncovered*L.court.per_uncovered_commandery,lord=this.forceRulerOfficer?.(force.id),capital=this.data.cities.find(c=>c.id===force.capital||c.name===force.capital),away=Boolean(lord&&capital&&lord.city!==capital.id),chief=this.centralOfficer(force.id,"chief",state),s=share("chief",chief,CENTRAL_ROLES.chief.stats),meta={forceId:force.id,tier:"court"};
      if(lord)add(lord,`court:${force.id}:lord`,"君主",base*(1-s)+(away&&!chief?T.lord_away:0),["politics","charm"],{...meta,role:"lord"});
      for(const [role,def] of Object.entries(CENTRAL_ROLES)){const o=this.centralOfficer(force.id,role,state);if(o)add(o,`court:${force.id}:${role}`,def.name,base+(role==="chief"?base*s+(away?T.lord_away:0):0),def.stats,{...meta,role})}
      this._lordAway.set(force.id,away)}
    for(const army of this.data.armies||[]){const commander=army.commanderOfficerId&&this.officerById(army.commanderOfficerId);if(commander&&commander.force===army.force)add(commander,`army:${army.id}:commander`,`${army.name}主将`,L.army.commander,["command","war"],{armyId:army.id,tier:"army",role:"commander"});for(const id of army.deputyOfficerIds||[]){const o=this.officerById(id);if(o&&o.force===army.force)add(o,`army:${army.id}:deputy`,`${army.name}副将`,L.army.deputy,["command","war"],{armyId:army.id,tier:"army",role:"deputy"})}const staff=army.staffOfficerId&&this.officerById(army.staffOfficerId);if(staff&&staff.force===army.force)add(staff,`army:${army.id}:staff`,`${army.name}参军`,L.army.staff,["intelligence","politics"],{armyId:army.id,tier:"army",role:"staff"})}
    // 县令出缺由郡守兼领：所有常任职务计入后再分派，按户口从大到小，兼领后负荷不超过 80% 才接手，余下由普通官员代理。
    const soft=cfg.curve.soft,magStats=this.administrationRoles().governor.stats;pending.sort((a,b)=>(this.countyPopulation(b.city.id)||0)-(this.countyPopulation(a.city.id)||0));for(const item of pending){const record=officers.get(item.head.id),capacity=this.officeCapacity(this.officerRawScore(item.head,magStats),item.head.status==="injured");if((record?.rate||0)+item.load/capacity>soft)continue;add(item.head,`county:${item.city.id}`,`兼领${item.city.name}县令`,item.load,magStats,{cityId:item.city.id,role:item.magKey,tier:"county",concurrent:true});concurrent.set(item.city.id,item.head.id)}
    for(const record of officers.values()){record.efficiency=this.loadEfficiency(record.rate);record.corruption=this.loadCorruption(record.rate)}
    return this._adminLoads={officers,nodes,concurrent}},
  concurrentMagistrate(city){const id=this.administrativeLoads().concurrent.get(city?.id);return id?this.officerById(id):null},
  officerLoad(officerId){return this.administrativeLoads().officers.get(officerId)||null},
  nodeDefaultEfficiency(city){return this.administrativeLoads().nodes.get(city?.id)?.defaultEfficiency??1},
  lordAwayFromCapital(forceId){this.administrativeLoads();return Boolean(this._lordAway?.get(forceId))},
  // 合成一项政务的分数：Σ环节权重×(该环节主责人能力×负荷效率)。各环节都为 45 分、负荷正常时等于 45，与旧结算一致。
  affairScore(city,affairId){const def=AFFAIRS[affairId],cfg=this.officeConfig(),w=cfg.tier_weights,parts=[];if(!def)return {score:45,parts};
    const exec=def.exec==="magistrate"?this.officialProfile(city,this.magistrateRole(city)):this.officialProfile(city,def.exec),court=this.centralProfile(city.force,def.court);parts.push({tier:"court",weight:w.court,profile:court},{tier:"county",weight:w.county,profile:exec});
    if(def.clerk||def.province){const {office,mode}=this.commanderyOffice(city),province=def.province?this.provinceProfile(city,def.province):null,useProvince=province?.post,orgWeight=useProvince?w.commandery-w.province:w.commandery;
      if(def.clerk){if(office){const profile=this.officialProfile(office.node,def.clerk),factor=mode==="acting"?cfg.acting_commandery_factor:1;parts.push({tier:"commandery",weight:orgWeight,profile,factor,mode})}else parts.push({tier:"commandery",weight:orgWeight,profile:court,factor:1,mode:"court"})}
      else parts.push({tier:"commandery",weight:orgWeight,profile:null,factor:1,mode,fixed:45});
      if(useProvince)parts.push({tier:"province",weight:w.province,profile:province})}
    let total=0,weight=0;for(const part of parts){const value=part.profile?part.profile.score*(part.factor??1):part.fixed;part.value=value;total+=value*part.weight;weight+=part.weight}return {score:weight?total/weight:45,parts,affair:affairId,name:def.name}},
  // 内政改制迁移（存档 v19 起；按城标记 schema，只做一次）：督练官→县尉；非郡府据点的郡掾转为待命，治安、城防官优先转为县尉。
  migrateAdministrationSchema(){const log=[];for(const city of this.data.cities||[]){const admin=city.administration;if(!admin||admin.schema>=2)continue;const office=this.isCommanderyOfficeNode(city),take=key=>{const id=admin[key];admin[key]=null;return id||null};
      const training=take("trainingId");delete admin.trainingId;if(training&&!admin.commandantId)admin.commandantId=training;else if(training)log.push({cityId:city.id,officerId:training,role:"督练官"});
      if(!office){for(const key of ["order","defense"]){const id=take(`${key}Id`);if(!id)continue;if(!admin.commandantId)admin.commandantId=id;else if(admin.commandantId!==id)log.push({cityId:city.id,officerId:id,role:key==="order"?"功曹":"城门校尉"})}
        for(const key of ["agriculture","commerce","population","recruitment"]){const id=take(`${key}Id`);if(id)log.push({cityId:city.id,officerId:id,role:{agriculture:"劝农官",commerce:"市曹",population:"户曹",recruitment:"兵曹"}[key]})}}
      admin.schema=2}
    if(log.length)(this._officeMigrationLog??=[]).push(...log);return log}
});
})();
