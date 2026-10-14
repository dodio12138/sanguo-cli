// RuleEngine 分模块：世家。世家在本郡各处有地产份额，吸纳编户为依附户、收取地租；与各势力的关系经由
// 依附户登记率、征收与征兵配合度、世家县令三条路影响地方，不直接加减成。玩家可户籍清查、结好、征辟子弟、抑制豪强。
// 数据见 game/data/common/clans.json，数值可在 game_rules.json 的 clans 段覆盖；企划见 docs/POP_CLAN_PLAN.md。
(()=>{
const POP=()=>window.RuleEngine.POP;
Object.assign(window.RuleEngine.prototype,{
  clanRules(){return this._clanRules??=this.buildClanRules()},
  buildClanRules(){return {member_bonus:5,member_cap:25,tax_penalty:15,forced_levy_penalty:15,favor_decay:1,grievance_decay:1.5,compliance_scale:1.5,compliance_line:60,total_share_cap:.7,other_place_share:.3,
    magistrate_share:.15,rent_per_thousand:1.5,
    inspection:{gold:300,per_10k:20,lift:.06,cap:.98,return_dependents:.15,grievance:60,cooldown_days:360,order_line:45,order:3},
    court:{gold:500,favor:8,cooldown_days:60},summon:{min_relation:55,favor:5},
    suppress:{wealth:.5,share:.5,dependents:.5,grievance:40,order:8,loyalty:10},
    ai:{court_chance:.1,court_relation:40,court_reserve:4000,inspect_chance:.03},...(this.data.rules?.clans||{})}},
  clanDef(id){return (this.data.clans||[]).find(clan=>clan.id===id)||null},
  clanName(id){return this.clanDef(id)?.name||""},
  // 人物所属世家：按 clans.json 的成员名单挂接（同名者以名单为准）。
  officerClan(officer){this._clanMemberIndex??=new Map((this.data.clans||[]).flatMap(clan=>clan.members.map(name=>[name,clan])));return officer?this._clanMemberIndex.get(officer.name)||null:null},

  // 开局：按本郡与祖居给出各处地产份额；同一处多家合计不超过上限。
  // 开局建世家状态；读旧档时只补建档中没有的世家（已有世家的份额、积怨不动）。
  initClans(state){const rules=this.clanRules();state.clans??={byId:{},inspections:{},levyGrievance:{}};state.clans.byId??={};const places=this.popPlaces();
    for(const clan of this.data.clans||[]){if(state.clans.byId[clan.id])continue;const local=places.filter(place=>place.commandery===clan.commandery);if(!local.length)continue;const named=local.filter(place=>clan.seat&&[place.name,`${place.name}县`].includes(clan.seat)||place.name===`${clan.seat}县`),seats=named.length?named:[local.slice().sort((a,b)=>(b.population||0)-(a.population||0))[0]];
      const presence={};for(const place of local)presence[place.id]=Math.round((seats.includes(place)?clan.land_share:clan.land_share*rules.other_place_share)*1000)/1000;
      state.clans.byId[clan.id]={presence,wealth:clan.wealth||0,favor:{},grievance:{},courted:{},seatIds:seats.map(place=>place.id)}}
    for(const place of places){const shares=this.clanSharesAt(state,place.id),sum=Object.values(shares).reduce((n,v)=>n+v,0);if(sum>rules.total_share_cap)for(const id of Object.keys(shares)){const presence=state.clans.byId[id].presence;presence[place.id]=Math.round(presence[place.id]*rules.total_share_cap/sum*1000)/1000}}this.clanChanged()},
  // 地产份额按处所建索引；份额变动（开局、抑制豪强、读档）后调用 clanChanged 重建。
  clanSharesAt(state,placeId){if(this._clanShareState!==state.clans||!this._clanShareIndex){this._clanShareState=state.clans;this._clanShareIndex=new Map();for(const [id,clan] of Object.entries(state.clans?.byId||{}))for(const [place,share] of Object.entries(clan.presence))if(share>0){const row=this._clanShareIndex.get(place)||{};row[id]=share;this._clanShareIndex.set(place,row)}}return this._clanShareIndex.get(placeId)||{}},
  clanMembers(clanId){const names=new Set(this.clanDef(clanId)?.members||[]);return this.data.officers.filter(officer=>names.has(officer.name))},
  // 关系 = 50 + 本族在该势力任职者 − 税重 − 强征 + 结好 − 清查与抑制积怨，限 0–100。
  clanRelation(state,clanId,forceId){if(!forceId||forceId==="neutral")return 50;if(this._clanRelationTurn!==state.turn||this._clanRelationState!==state){this._clanRelationTurn=state.turn;this._clanRelationState=state;this._clanRelationCache=new Map()}const cacheKey=`${clanId}|${forceId}`;if(this._clanRelationCache.has(cacheKey))return this._clanRelationCache.get(cacheKey);const value=this.computeClanRelation(state,clanId,forceId);this._clanRelationCache.set(cacheKey,value);return value},
  clanChanged(){this._clanRelationCache=new Map();this._clanShareIndex=null},
  computeClanRelation(state,clanId,forceId){const rules=this.clanRules(),clan=state.clans?.byId?.[clanId];if(!clan)return 50;
    const serving=this.clanMembers(clanId).filter(o=>o.force===forceId&&["serving","injured"].includes(o.status)).length,landRate=FiscalSystem.account?.(state,forceId)?.landRate??10,forced=this.levyModeOf(forceId)==="forced";
    return Math.max(0,Math.min(100,Math.round(50+Math.min(rules.member_cap,serving*rules.member_bonus)-Math.max(0,landRate-10)/10*rules.tax_penalty-(forced?rules.forced_levy_penalty:0)+(clan.favor[forceId]||0)-(clan.grievance[forceId]||0))))},
  clanCompliance(state,place,forceId){const rules=this.clanRules();let loss=0;for(const [id,share] of Object.entries(this.clanSharesAt(state,place.id)))loss+=share*Math.max(0,rules.compliance_line-this.clanRelation(state,id,forceId))/100*rules.compliance_scale;return Math.max(.3,Math.min(1,1-loss))},
  // 县令：份额最大的世家达门槛即由其子弟出任；能力取该族才俊、按处所固定浮动。
  countyMagistrate(state,place){const node=this.popNode(place);if(!(place.jurisdictionCityId||node.countyNode))return null;const top=Object.entries(this.clanSharesAt(state,place.id)).sort((a,b)=>b[1]-a[1])[0];if(!top||top[1]<this.clanRules().magistrate_share)return null;
    const clan=this.clanDef(top[0]),seed=[...place.id].reduce((n,c)=>n+c.charCodeAt(0),0)%31;return {clanId:clan.id,name:`${clan.name.replace(/^.{2}/,"")}子弟`,ability:Math.max(30,Math.min(95,clan.talent-15+seed))}},
  forceClanPresence(state,forceId){const out=new Map();for(const place of this.popPlaces()){if(this.popNode(place).force!==forceId)continue;for(const [id,share] of Object.entries(this.clanSharesAt(state,place.id))){const row=out.get(id)||{clanId:id,places:0,dependents:0,share:0};row.places++;row.share+=share;row.dependents+=(place.pops||[]).filter(p=>p[POP().CLS]===POP().DEP&&p[POP().CLAN]===id).reduce((n,p)=>n+POP().total(p),0);out.set(id,row)}}return [...out.values()]},

  // 每月：积怨与恩惠消退，地租入世家财富。
  resolveClans(state){const rules=this.clanRules();this.clanChanged();for(const [id,clan] of Object.entries(state.clans?.byId||{})){for(const key of Object.keys(clan.favor))clan.favor[key]=Math.max(0,clan.favor[key]-rules.favor_decay);for(const key of Object.keys(clan.grievance))clan.grievance[key]=Math.max(0,clan.grievance[key]-rules.grievance_decay);
      let labor=0;for(const placeId of Object.keys(clan.presence)){const place=this.popPlace(placeId);for(const p of place?.pops||[])if(p[POP().CLS]===POP().DEP&&p[POP().CLAN]===id)labor+=p[POP().AM]+p[POP().AF]*.6}clan.wealth=Math.round(clan.wealth+labor/1000*rules.rent_per_thousand)}},

  // —— 玩家与 AI 操作 ——
  inspectionCost(state,city){const rules=this.clanRules().inspection,places=[city,...this.countiesForCity(city.id)],people=places.reduce((n,place)=>n+(place.population||0),0);return Math.round(rules.gold+people/10000*rules.per_10k)},
  inspectRegistry(state,cityId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().inspection,city=this.data.cities.find(c=>c.id===cityId),pool=forceId===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===forceId)?.resources;
    if(!city||city.force!==forceId)return {ok:false,error:"只能清查本方据点"};const last=state.clans.inspections[cityId];if(last!=null&&state.turn-last<GameClock.duration(state,rules.cooldown_days/10))return {ok:false,error:"去年已清查过，民间尚未复苏"};const cost=this.inspectionCost(state,city);if((pool?.gold||0)<cost)return {ok:false,error:`需金 ${cost}`};
    pool.gold-=cost;state.clans.inspections[cityId]=state.turn;const P=POP(),offended=new Map();let recovered=0;
    for(const place of [city,...this.countiesForCity(city.id)]){if(!place.pops)continue;for(const p of place.pops.slice()){if(p[P.CLS]===P.FREE)p[P.RR]=Math.min(rules.cap,Math.round((p[P.RR]+rules.lift)*100)/100);if(p[P.CLS]===P.DEP){const clanId=p[P.CLAN];recovered+=this.popMove(place,p,rules.return_dependents,p[P.OCC],P.FREE,"",{registered:.85}).moved;offended.set(clanId,Math.max(offended.get(clanId)||0,this.clanSharesAt(state,place.id)[clanId]||0))}}
      this.popCompact(place);this.popSync(place)}
    this.clanChanged();for(const [clanId,share] of offended){const clan=state.clans.byId[clanId];clan.grievance[forceId]=(clan.grievance[forceId]||0)+Math.round(rules.grievance*Math.max(.2,share))}
    if(offended.size&&[...offended.keys()].some(id=>this.clanRelation(state,id,forceId)<rules.order_line))city.order=Math.max(0,(city.order||50)-rules.order);
    const text=`${city.name}清查户籍：括出隐户 ${recovered} 口改入编户${offended.size?`，${[...offended.keys()].map(id=>this.clanName(id)).join("、")}不满`:""}`;events.push({phase:"户口",siteId:cityId,text});return {ok:true,text,recovered}},
  courtClan(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().court,clan=state.clans?.byId?.[clanId],pool=forceId===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===forceId)?.resources;if(!clan)return {ok:false,error:"无此世家"};
    const last=clan.courted[forceId];if(last!=null&&state.turn-last<GameClock.duration(state,rules.cooldown_days/10))return {ok:false,error:"往来未久，不宜频繁"};if((pool?.gold||0)<rules.gold)return {ok:false,error:`需金 ${rules.gold}`};
    pool.gold-=rules.gold;clan.courted[forceId]=state.turn;this.clanChanged();clan.favor[forceId]=(clan.favor[forceId]||0)+rules.favor;const text=`遣使厚礼结好${this.clanName(clanId)}`;if(forceId===state.playerForceId)events.push({phase:"户口",text});return {ok:true,text}},
  summonableMembers(state,clanId){const year=state.date.year;return this.clanMembers(clanId).filter(o=>(o.status==="free"||o.force==="neutral")&&!["dead","prisoner","unborn"].includes(o.status)&&(o.debutYear??0)<=year&&(!o.deathYear||o.deathYear>year))},
  summonClanMember(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().summon,clan=state.clans?.byId?.[clanId];if(!clan)return {ok:false,error:"无此世家"};if(this.clanRelation(state,clanId,forceId)<rules.min_relation)return {ok:false,error:`关系须达 ${rules.min_relation}`};
    const officer=this.summonableMembers(state,clanId)[0];if(!officer)return {ok:false,error:"本族暂无在野子弟"};const home=this.data.cities.find(c=>c.id===clan.seatIds?.[0])||this.data.cities.find(c=>c.force===forceId),city=home?.force===forceId?home:this.data.cities.find(c=>c.force===forceId);
    this.clanChanged();officer.force=forceId;officer.status="serving";officer.city=city?.id||officer.city;officer.loyalty=60;clan.favor[forceId]=(clan.favor[forceId]||0)+rules.favor;const text=`征辟${this.clanName(clanId)}子弟${officer.name}出仕`;events.push({phase:"人事",text});return {ok:true,text,officerId:officer.id}},
  suppressClan(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().suppress,clan=state.clans?.byId?.[clanId],pool=forceId===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===forceId)?.resources;if(!clan)return {ok:false,error:"无此世家"};
    const seats=(clan.seatIds||[]).map(id=>this.popPlace(id)).filter(Boolean);if(!seats.some(place=>this.popNode(place).force===forceId))return {ok:false,error:"须据有其祖居"};
    const P=POP(),seized=Math.round(clan.wealth*rules.wealth);clan.wealth-=seized;pool.gold=(pool.gold||0)+seized;let freed=0;
    for(const [placeId,share] of Object.entries(clan.presence)){const place=this.popPlace(placeId);if(!place||this.popNode(place).force!==forceId)continue;clan.presence[placeId]=Math.round(share*(1-rules.share)*1000)/1000;
      for(const p of (place.pops||[]).filter(pop=>pop[P.CLS]===P.DEP&&pop[P.CLAN]===clanId))freed+=this.popMove(place,p,rules.dependents,p[P.OCC],P.FREE,"",{registered:.8}).moved;this.popCompact(place);this.popSync(place);const node=this.popNode(place);if(node!==place||!place.jurisdictionCityId)node.order=Math.max(0,(node.order||50)-rules.order)}
    this.clanChanged();clan.grievance[forceId]=(clan.grievance[forceId]||0)+rules.grievance;for(const officer of this.clanMembers(clanId))if(officer.force===forceId&&officer.status==="serving")officer.loyalty=Math.max(0,(officer.loyalty??70)-rules.loyalty);
    const text=`抑制${this.clanName(clanId)}：没入家财 ${seized} 金，${freed} 口依附户改入编户`;events.push({phase:"户口",text,lv:2});return {ok:true,text,seized,freed}},
  setLevyMode(state,forceId,mode){const force=this.data.forces.find(f=>f.id===forceId);if(!force||!this.popRules().levy_floor[mode])return false;force.levyMode=mode;this.clanChanged();return true},

  // AI：府库充裕时结好关系低落、在境内有地产的世家；登记率偏低的据点偶尔清查。
  runClanAI(state,events){const rules=this.clanRules().ai;for(const force of this.data.forces){if(force.id==="neutral"||force.id===state.playerForceId||force.eliminated||!force.resources)continue;
      if(state.random()<rules.court_chance&&(force.resources.gold||0)>rules.court_reserve){const target=this.forceClanPresence(state,force.id).filter(row=>this.clanRelation(state,row.clanId,force.id)<rules.court_relation).sort((a,b)=>b.dependents-a.dependents)[0];if(target)this.courtClan(state,target.clanId,force.id,events)}
      if(state.random()<rules.inspect_chance){const city=this.data.cities.filter(c=>c.force===force.id&&c.pops&&this.countiesForCity(c.id).length).sort((a,b)=>(a.registeredPopulation/Math.max(1,a.population))-(b.registeredPopulation/Math.max(1,b.population)))[0];if(city&&(force.resources.gold||0)>this.inspectionCost(state,city)*3)this.inspectRegistry(state,city.id,force.id,[])}}}
});
})();
