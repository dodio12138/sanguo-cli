// RuleEngine 分模块：世家。世家在本郡各处有地产份额，吸纳编户为依附户、收取地租；与各势力的关系经由
// 依附户登记率、征收与征兵配合度、世家县令三条路影响地方，不直接加减成。玩家可户籍清查、结好、征辟子弟、抑制豪强。
// 数据见 game/data/common/clans.json，数值可在 game_rules.json 的 clans 段覆盖；企划见 docs/POP_CLAN_PLAN.md。
(()=>{
const POP=()=>window.RuleEngine.POP;
Object.assign(window.RuleEngine.prototype,{
  clanRules(){return this._clanRules??=this.buildClanRules()},
  buildClanRules(){return {member_bonus:5,member_cap:25,tax_penalty:15,forced_levy_penalty:15,favor_decay:1,grievance_decay:1.5,compliance_scale:1.5,compliance_line:60,total_share_cap:.7,max_clans_per_place:4,other_place_share:.3,
    magistrate_share:.15,rent_per_thousand:1.5,
    inspection:{gold:300,per_10k:20,lift:.06,cap:.98,return_dependents:.15,grievance:60,cooldown_days:360,order_line:45,order:3},
    court:{gold:500,favor:8,cooldown_days:60},summon:{min_relation:55,favor:5},
    suppress:{wealth:.5,share:.5,dependents:.5,grievance:40,order:8,loyalty:10},
    marry:{gold:800,min_relation:45,favor:20,loyalty:5,cooldown_days:1080},
    contribute:{min_relation:60,wealth:.15,min_gold:200,food_per_gold:3,grievance:8,cooldown_days:180},
    relocate:{share:.5,dependents:.3,capital_share:.06,grievance:20,order:2,cooldown_days:720},
    intrigue:{min_share:.2,owner_max:30,attacker_min:60,chance:.25,damage:20,morale:10,cooldown_days:90},
    spread_wealth:2500,spread_max:4,
    ai:{court_chance:.1,court_relation:40,court_reserve:4000,inspect_chance:.03,contribute_chance:.05,contribute_gold_below:1500},...(this.data.rules?.clans||{})}},
  clanDef(id){const clans=this.data.clans||[];if(this._clanDefSource!==clans||this._clanDefSize!==clans.length){this._clanDefSource=clans;this._clanDefSize=clans.length;this._clanDefIndex=new Map(clans.map(clan=>[clan.id,clan]).reverse())}return this._clanDefIndex.get(id)||null},
  // 名号一律用「郡望 + 祖居县 + 姓氏」全称，如「颍川长社钟氏」；clans.json 的 name 为通行郡望简称
  clanName(id){return this.clanFullName(id)||this.clanDef(id)?.name||""},
  // 人物所属世家：同名者可用 memberIds 指定身份，避免吴将马忠误入蜀将马忠的族谱。
  officerClan(officer){if(officer?.familyId)return this.clanDef(officer.familyId);this._clanMemberIndex??=new Map((this.data.clans||[]).flatMap(clan=>clan.members.map(name=>[name,clan])));const clan=officer?this._clanMemberIndex.get(officer.name):null;return clan&&(!clan.memberIds?.[officer.name]||clan.memberIds[officer.name]===officer.id)?clan:null},

  // 开局地产：祖居县取全额份额；本郡离祖居最近的数处取三成（族大者处数多）；史载在他郡的支脉另有份额。
  // 同一处至多四家（份额最小者让出），合计不超过上限。读旧档时只补建档中没有的世家，并补上支脉（version 2）。
  initClans(state){const rules=this.clanRules();state.clans??={byId:{},inspections:{},levyGrievance:{}};state.clans.byId??={};const places=this.popPlaces(),newClanIds=new Set(),existingClanIds=new Set(Object.keys(state.clans.byId));
    for(const clan of this.data.clans||[]){if(state.clans.byId[clan.id])continue;const local=places.filter(place=>place.commandery===clan.commandery),seats=this.clanSeatPlaces(clan,places);if(!seats.length)continue;newClanIds.add(clan.id);
      const presence={},anchor=seats[0],spread=Math.max(1,Math.min(rules.spread_max,clan.spread??Math.round((clan.wealth||0)/rules.spread_wealth)));for(const place of seats)presence[place.id]=clan.land_share;
      const near=local.filter(place=>!seats.includes(place)).sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y)).slice(0,spread);for(const place of near)presence[place.id]=Math.round(clan.land_share*rules.other_place_share*1000)/1000;
      state.clans.byId[clan.id]={presence,wealth:clan.wealth||0,favor:{},grievance:{},courted:{},seatIds:seats.map(place=>place.id),branchIds:[]}}
    for(const clan of this.data.clans||[]){if((state.clans.version||1)>=2&&!newClanIds.has(clan.id))continue;const record=state.clans.byId[clan.id];if(!record)continue;record.branchIds??=[];for(const branch of clan.branches||[]){const place=this.clanPlaceByName(places,branch.seat,branch.commandery);if(!place||record.branchIds.includes(place.id))continue;record.presence[place.id]=Math.max(record.presence[place.id]||0,branch.share);record.branchIds.push(place.id)}}
    // 旧局新增世家只占现存族产留下的额度，不能靠重新排位挤走或稀释玩家已经营的地产。
    if(existingClanIds.size&&newClanIds.size){this.clanChanged();for(const place of places){const shares=Object.entries(this.clanSharesAt(state,place.id)),prior=shares.filter(([id])=>existingClanIds.has(id));let slots=Math.max(0,rules.max_clans_per_place-prior.length),room=Math.max(0,rules.total_share_cap-prior.reduce((n,[,v])=>n+v,0));
      for(const [id,share] of shares.filter(([id])=>newClanIds.has(id)).sort((a,b)=>b[1]-a[1])){const record=state.clans.byId[id],value=Math.floor(Math.min(share,room)*1000)/1000;if(slots<=0||value<=0)delete record.presence[place.id];else{record.presence[place.id]=value;room-=value;slots--}}}this.clanChanged()}
    state.clans.version=2;
    for(const place of places){const ranked=Object.entries(this.clanSharesAt(state,place.id)).sort((a,b)=>b[1]-a[1]);for(const [id] of ranked.slice(rules.max_clans_per_place))delete state.clans.byId[id].presence[place.id]}this.clanChanged();
    for(const place of places){const shares=this.clanSharesAt(state,place.id),sum=Object.values(shares).reduce((n,v)=>n+v,0);if(sum>rules.total_share_cap)for(const id of Object.keys(shares)){const presence=state.clans.byId[id].presence;presence[place.id]=Math.round(presence[place.id]*rules.total_share_cap/sum*1000)/1000}}this.clanChanged()},
  // 按县名找处所：县记录优先，同名据点一并算；先在指定郡内找，找不到再全图找。
  clanPlaceMatches(place,name){if(!name)return false;const bare=String(name).replace(/县$/,"");return place.name===name||place.name===`${bare}县`||place.name.replace(/县$/,"")===bare},
  clanPlaceByName(places,name,commandery){const hits=places.filter(place=>this.clanPlaceMatches(place,name)),local=hits.filter(place=>!commandery||place.commandery===commandery);return (local.length?local:hits).sort((a,b)=>(b.jurisdictionCityId?1:0)-(a.jurisdictionCityId?1:0))[0]||null},
  // 祖居处所：史载祖居县在图上则取之（县记录与同名据点），否则取 seat_place 指定的近处，再不然取本郡人口最多处。
  clanSeatPlaces(clan,places=this.popPlaces()){const local=name=>places.filter(place=>place.commandery===clan.commandery&&this.clanPlaceMatches(place,name));
    if(clan.seat&&local(clan.seat).length)return local(clan.seat);if(clan.seat_place){if(local(clan.seat_place).length)return local(clan.seat_place);const hit=this.clanPlaceByName(places,clan.seat_place,null);if(hit)return [hit]}
    if(clan.seat){const hit=this.clanPlaceByName(places,clan.seat,null);if(hit)return [hit]}const fallback=places.filter(place=>place.commandery===clan.commandery).sort((a,b)=>(b.population||0)-(a.population||0));return fallback.length?[fallback[0]]:[]},
  // 地产份额按处所建索引；份额变动（开局、抑制豪强、读档）后调用 clanChanged 重建。
  clanSharesAt(state,placeId){if(this._clanShareState!==state.clans||!this._clanShareIndex){this._clanShareState=state.clans;this._clanShareIndex=new Map();for(const [id,clan] of Object.entries(state.clans?.byId||{}))for(const [place,share] of Object.entries(clan.presence))if(share>0){const row=this._clanShareIndex.get(place)||{};row[id]=share;this._clanShareIndex.set(place,row)}}return this._clanShareIndex.get(placeId)||{}},
  // 族人索引：每日财政按城按职查家族传习，逐次遍历全部人物过慢；名册增删或 clanChanged 后重建，保持名册原序。
  clanMembers(clanId){const officers=this.data.officers||[];if(!this._clanMembersIndex||this._clanMembersSource!==officers||this._clanMembersSize!==officers.length){const byName=new Map,index=new Map;for(const clan of this.data.clans||[])for(const name of clan.members||[]){const list=byName.get(name)||[];list.push(clan);byName.set(name,list)}
      for(const officer of officers){const ids=new Set;if(officer.familyId)ids.add(officer.familyId);for(const clan of byName.get(officer.name)||[])if(!clan.memberIds?.[officer.name]||clan.memberIds[officer.name]===officer.id)ids.add(clan.id);for(const id of ids){const list=index.get(id)||[];list.push(officer);index.set(id,list)}}
      this._clanMembersIndex=index;this._clanMembersSource=officers;this._clanMembersSize=officers.length}return (this._clanMembersIndex.get(clanId)||[]).slice()},
  // 关系 = 50 + 本族在该势力任职者 − 税重 − 强征 + 结好 − 清查与抑制积怨，限 0–100。
  clanRelation(state,clanId,forceId){if(!forceId||forceId==="neutral")return 50;if(this._clanRelationTurn!==state.turn||this._clanRelationState!==state){this._clanRelationTurn=state.turn;this._clanRelationState=state;this._clanRelationCache=new Map()}const cacheKey=`${clanId}|${forceId}`;if(this._clanRelationCache.has(cacheKey))return this._clanRelationCache.get(cacheKey);const value=this.computeClanRelation(state,clanId,forceId);this._clanRelationCache.set(cacheKey,value);return value},
  clanChanged(){this._clanRelationCache=new Map();this._clanShareIndex=null;this._clanMembersIndex=null;this._scoreCache?.compliance?.clear()},
  computeClanRelation(state,clanId,forceId){const rules=this.clanRules(),clan=state.clans?.byId?.[clanId];if(!clan)return 50;
    const serving=this.clanMembers(clanId).filter(o=>o.force===forceId&&["serving","injured"].includes(o.status)).length,landRate=FiscalSystem.account?.(state,forceId)?.landRate??10,forced=this.levyModeOf(forceId)==="forced";
    return Math.max(0,Math.min(100,Math.round(50+Math.min(rules.member_cap,serving*rules.member_bonus)-Math.max(0,landRate-10)/10*rules.tax_penalty-(forced?rules.forced_levy_penalty:0)+(clan.favor[forceId]||0)-(clan.grievance[forceId]||0))))},
  // 世家配合度按城十日滚动缓存（随该城事务分数同日重算），关系变化缓慢，逐日重算开销大。
  clanCompliance(state,place,forceId){return this.cityCached?this.cityCached("compliance",place.id,`${place.id}|${forceId}`,()=>this.computeClanCompliance(state,place,forceId)):this.computeClanCompliance(state,place,forceId)},
  computeClanCompliance(state,place,forceId){const rules=this.clanRules();let loss=0;for(const [id,share] of Object.entries(this.clanSharesAt(state,place.id)))loss+=share*Math.max(0,rules.compliance_line-this.clanRelation(state,id,forceId))/100*rules.compliance_scale;return Math.max(.3,Math.min(1,1-loss))},
  // 县令：份额最大的世家达门槛即由其子弟出任；能力取该族才俊、按处所固定浮动。
  countyMagistrate(state,place){const node=this.popNode(place);if(place.jurisdictionCityId||node.countyNode||this.isCommanderyGovernment(node)){const key=this.familyCountyRoleKey?.(node,"magistrate")||"governor",appointed=this.validAdministrativeOfficer(node,node.administration?.[`${key}Id`]);if(appointed)return {clanId:this.officerClan(appointed)?.id||null,name:appointed.name,ability:this.officialProfile(node,this.isCommanderyGovernment(node)?"countyGovernor":"governor").score,officerId:appointed.id}}const cached=this._familyCountyOfficials?.get(place.id)||this._familyCountyOfficials?.get(node.id);if(cached)return cached.forceId===node.force&&cached.roleClans?.magistrate?{...cached,clanId:cached.roleClans.magistrate}:null;if(!(place.jurisdictionCityId||node.countyNode))return null;const top=Object.entries(this.clanSharesAt(state,place.id)).sort((a,b)=>b[1]-a[1])[0];if(!top||top[1]<this.clanRules().magistrate_share)return null;
    const clan=this.clanDef(top[0]),seed=[...place.id].reduce((n,c)=>n+c.charCodeAt(0),0)%31;return {clanId:clan.id,name:`${this.clanSurname(clan.id)}氏子弟`,ability:Math.max(30,Math.min(95,clan.talent-15+seed))}},
  forceClanPresence(state,forceId){const out=new Map();for(const place of this.popPlaces()){if(this.popNode(place).force!==forceId)continue;for(const [id,share] of Object.entries(this.clanSharesAt(state,place.id))){const row=out.get(id)||{clanId:id,places:0,dependents:0,share:0};row.places++;row.share+=share;row.dependents+=(place.pops||[]).filter(p=>p[POP().CLS]===POP().DEP&&p[POP().CLAN]===id).reduce((n,p)=>n+POP().total(p),0);out.set(id,row)}}return [...out.values()]},

  // —— 名号、分布与族谱 ——
  // 姓：复姓按常见表，其余取成员名的首字；郡望：郡名去「郡 / 国」（剩一字者保留全名）。全称如「颍川长社钟氏」。
  clanSurname(clanId){const clan=this.clanDef(clanId);if(!clan)return "";if(clan.surname)return clan.surname;const compound=["夏侯","诸葛","司马","公孙","皇甫","欧阳","上官","令狐","太史","东方","淳于","司徒","尉迟"],first=clan.members?.[0]||"";return compound.find(name=>first.startsWith(name))||first[0]||""},
  clanCommanderyShort(commandery){const bare=String(commandery||"").replace(/[郡国尹]$/,"");return bare.length>=2?bare:commandery||""},
  // 郡望：clans.json 的 wang（通行名以县为号者如「富春孙氏」在数据中注明郡望），否则取通行名去姓氏（如「清河崔氏」→ 清河）。
  clanWang(clanId){const clan=this.clanDef(clanId);if(!clan)return "";if(clan.wang)return clan.wang;const prefix=String(clan.name||"").replace(new RegExp(`${this.clanSurname(clanId)}氏$`),"");return prefix&&!/县$/.test(prefix)?prefix:this.clanCommanderyShort(clan.commandery)},
  clanSeatName(clanId){const seat=this.clanDef(clanId)?.seat||"",bare=seat.replace(/县$/,"");return bare.length>=2?bare:seat},
  clanFullName(clanId){const clan=this.clanDef(clanId);if(!clan)return "";if(clan.familyOnly)return clan.name;const wang=this.clanWang(clanId),seat=this.clanSeatName(clanId);return `${wang}${seat&&seat!==wang?seat:""}${this.clanSurname(clanId)}氏`},
  // 地产分布：一县的城邑（据点）与乡里（县记录）是同一处的两层人口，按县名（同郡同名，或同名且相距三格以内——地图把谯分属谯郡、沛国这类情形也算一处）合为一行——份额取两层较大者，依附户分城邑、乡里相加。
  // 少数郡治县的乡里仍归旧的郡城据点管辖（如平舆县乡里属「汝南」），两层可能分属不同据点乃至不同势力，故行内记 cityIds、forceIds。
  // 每行列份额、实控势力、是否祖居或支脉、县令是否出自本族；placeIds 为该行涵盖的处所。
  clanDistribution(state,clanId){const record=state.clans?.byId?.[clanId],P=POP();if(!record)return [];const rows=new Map;
    for(const [placeId,share] of Object.entries(record.presence)){if(!(share>0))continue;const place=this.popPlace(placeId);if(!place)continue;const node=this.popNode(place),bare=String(place.name).replace(/县$/,""),key=[...rows.keys()].find(k=>{const r=rows.get(k);return k.split("|")[0]===bare&&(r.commandery===place.commandery||Math.hypot(r.x-place.x,r.y-place.y)<=3)})||`${bare}|${placeId}`,dependents=(place.pops||[]).filter(p=>p[P.CLS]===P.DEP&&p[P.CLAN]===clanId).reduce((n,p)=>n+P.total(p),0),county=!!place.jurisdictionCityId;
      const row=rows.get(key)||{placeId,placeIds:[],name:bare.length>=2?bare:place.name,commandery:place.commandery,province:place.province||node.province,x:place.x,y:place.y,share:0,forceId:node.force||"neutral",cityId:node.id,dependents:0,urban:0,rural:0,county:false,seat:false,branch:false,magistrate:false,cityIds:[],forceIds:[]};
      row.placeIds.push(placeId);if(!row.cityIds.includes(node.id))row.cityIds.push(node.id);if(!row.forceIds.includes(node.force||"neutral"))row.forceIds.push(node.force||"neutral");if(!county){row.cityId=node.id;row.forceId=node.force||"neutral"}row.share=Math.max(row.share,share);row.dependents+=dependents;row[county?"rural":"urban"]+=dependents;if(county){row.county=true;row.placeId=placeId;row.commandery=place.commandery;row.x=place.x;row.y=place.y}
      row.seat||=!!record.seatIds?.includes(placeId);row.branch||=!!record.branchIds?.includes(placeId);row.magistrate||=this.countyMagistrate(state,place)?.clanId===clanId;rows.set(key,row)}
    return [...rows.values()].sort((a,b)=>b.share-a.share)},
  // 与各势力的关系：在其境内有地产或有族人仕官者，按关系排序，首位即本族倾向
  clanStances(state,clanId){const forces=new Set(this.clanDistribution(state,clanId).map(row=>row.forceId));for(const officer of this.clanMembers(clanId))if(["serving","injured"].includes(officer.status))forces.add(officer.force);forces.delete("neutral");
    return [...forces].filter(id=>this.data.forces.some(f=>f.id===id&&!f.eliminated)).map(forceId=>({forceId,relation:this.clanRelation(state,clanId,forceId),members:this.clanMembers(clanId).filter(o=>o.force===forceId&&["serving","injured"].includes(o.status)).length})).sort((a,b)=>b.relation-a.relation)},
  // 族谱：clans.json 的 kin 为 [甲, 乙, 称谓]，父子、叔侄等使乙低一辈（祖孙两辈），兄弟、夫妻同辈；按辈分分层供族谱图使用。
  clanKinGraph(clanId,family=null){const clan=family||this.clanDef(clanId);if(!clan)return {nodes:[],edges:[]};const down={父子:1,父女:1,母子:1,母女:1,养父子:1,叔侄:1,从叔侄:1,族叔侄:1,姑侄:1,祖孙:2,从祖孙:2},edges=(clan.kin||[]).map(([a,b,label])=>({a,b,label,step:down[String(label).replace(/（.*）/,"")]??0})),names=[...new Set([...(clan.members||[]),...edges.flatMap(edge=>[edge.a,edge.b])])],gen=new Map;
    for(const name of names){if(gen.has(name))continue;gen.set(name,0);const queue=[name];while(queue.length){const cur=queue.shift(),g=gen.get(cur);for(const edge of edges){if(edge.a===cur&&!gen.has(edge.b)){gen.set(edge.b,g+edge.step);queue.push(edge.b)}if(edge.b===cur&&!gen.has(edge.a)){gen.set(edge.a,g-edge.step);queue.push(edge.a)}}}}
    // 各连通块分别以最小辈分为 0
    const comp=new Map;let k=0;for(const name of names){if(comp.has(name))continue;const queue=[name];comp.set(name,k);while(queue.length){const cur=queue.shift();for(const edge of edges)for(const [x,y] of [[edge.a,edge.b],[edge.b,edge.a]])if(x===cur&&!comp.has(y)){comp.set(y,k);queue.push(y)}}k++}
    const floor=new Map;for(const name of names){const c=comp.get(name);floor.set(c,Math.min(floor.get(c)??Infinity,gen.get(name)))}
    const byName=new Map((family?this.data.officers.filter(o=>names.includes(o.name)&&(!clan.memberIds?.[o.name]||clan.memberIds[o.name]===o.id)):this.clanMembers(clanId)).map(o=>[o.name,o]));return {nodes:names.map(name=>({name,generation:gen.get(name)-floor.get(comp.get(name)),officer:byName.get(name)||null,linked:edges.some(edge=>edge.a===name||edge.b===name)})),edges}},
  // 人物的族亲（按族谱），称谓换成对方相对于本人的身份（父、子、兄、弟、叔、侄…），供人物档案点击跳转。
  // 族谱中甲为长、乙为幼：兄弟、姐弟、兄妹、夫妻亦按此序。
  officerKin(officer){const clan=this.officerClan(officer);if(!clan||!officer)return [];const ROLE={父子:["父","子"],父女:["父","女"],母子:["母","子"],养父子:["养父","养子"],叔侄:["叔父","侄"],从叔侄:["从叔","从侄"],族叔侄:["族叔","族侄"],姑侄:["姑","侄"],祖孙:["祖父","孙"],兄弟:["兄","弟"],从兄弟:["从兄","从弟"],族兄弟:["族兄","族弟"],兄妹:["兄","妹"],姐弟:["姐","弟"],夫妻:["夫","妻"]};
    return (clan.kin||[]).filter(([a,b])=>a===officer.name||b===officer.name).map(([a,b,label])=>{const base=String(label).replace(/（.*）/,""),note=String(label).match(/（.*）/)?.[0]||"",roles=ROLE[base],elder=b===officer.name;return {name:elder?a:b,label:(roles?roles[elder?0:1]:base)+note,relation:label,elder}})},

  // 每月：积怨与恩惠消退，地租入世家财富。
  resolveClans(state,events=[]){const rules=this.clanRules();this.clanChanged();for(const [id,clan] of Object.entries(state.clans?.byId||{})){for(const key of Object.keys(clan.favor))clan.favor[key]=Math.max(0,clan.favor[key]-rules.favor_decay);for(const key of Object.keys(clan.grievance))clan.grievance[key]=Math.max(0,clan.grievance[key]-rules.grievance_decay);
      let labor=0;for(const placeId of Object.keys(clan.presence)){const place=this.popPlace(placeId);for(const p of place?.pops||[])if(p[POP().CLS]===POP().DEP&&p[POP().CLAN]===id)labor+=p[POP().AM]+p[POP().AF]*.6}clan.wealth=Math.round(clan.wealth+labor/1000*rules.rent_per_thousand)}this.resolveClanIntrigue(state,events)},
  // 内应：被围之城，在地大族与城主关系恶劣、与围城一方交好，则可能暗通围城者——城防受损、守军士气下挫。
  resolveClanIntrigue(state,events=[]){const rules=this.clanRules().intrigue;state.clans.intrigue??={};for(const city of this.data.cities){if(!city.force||city.force==="neutral"||!this.isCityBesieged?.(city))continue;const last=state.clans.intrigue[city.id];if(last!=null&&state.turn-last<GameClock.duration(state,rules.cooldown_days/10))continue;
      const attackers=[...new Set(this.data.armies.filter(a=>a.siegeTarget===city.id&&a.force!==city.force).map(a=>a.force))];if(!attackers.length)continue;const shares={};for(const place of [city,...(this.countiesForCity?.(city.id)||[])])for(const [id,share] of Object.entries(this.clanSharesAt(state,place.id)))shares[id]=Math.max(shares[id]||0,share);
      for(const [clanId,share] of Object.entries(shares).sort((a,b)=>b[1]-a[1])){if(share<rules.min_share||this.clanRelation(state,clanId,city.force)>rules.owner_max)continue;const friend=attackers.map(id=>({id,relation:this.clanRelation(state,clanId,id)})).sort((a,b)=>b.relation-a.relation)[0];if(!friend||friend.relation<rules.attacker_min||state.random()>=rules.chance)continue;
        state.clans.intrigue[city.id]=state.turn;city.defenseDamage=Math.min(100,(city.defenseDamage||0)+rules.damage);city.siegeMorale=Math.max(0,(city.siegeMorale??60)-rules.morale);events.push({phase:"户口",siteId:city.id,lv:2,text:`${this.clanFullName(clanId)}暗通${this.data.forces.find(f=>f.id===friend.id)?.name||"围城者"}，为其内应：${city.name}城防受损、守军惊扰`});break}}},


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
  summonableMembers(state,clanId,forceId=state.playerForceId){const year=state.date.year;return this.clanMembers(clanId).filter(o=>!o.familyTravel&&(!o.familyCaptive||o.familyCaptive===forceId)&&(o.status==="free"||o.force==="neutral")&&!["dead","prisoner","unborn"].includes(o.status)&&(o.debutYear??0)<=year&&(!o.deathYear||o.deathYear>year))},
  summonClanMember(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().summon,clan=state.clans?.byId?.[clanId];if(!clan)return {ok:false,error:"无此世家"};if(this.clanRelation(state,clanId,forceId)<rules.min_relation)return {ok:false,error:`关系须达 ${rules.min_relation}`};
    const officer=this.summonableMembers(state,clanId,forceId)[0];if(!officer)return {ok:false,error:"本族暂无在野子弟"};const home=this.data.cities.find(c=>c.id===clan.seatIds?.[0])||this.data.cities.find(c=>c.force===forceId),city=home?.force===forceId?home:this.data.cities.find(c=>c.force===forceId);
    this.clanChanged();officer.force=forceId;officer.status="serving";delete officer.familyCaptive;officer.city=city?.id||officer.city;officer.loyalty=60;clan.favor[forceId]=(clan.favor[forceId]||0)+rules.favor;const text=`征辟${this.clanName(clanId)}子弟${officer.name}出仕`;events.push({phase:"人事",text});return {ok:true,text,officerId:officer.id}},
  suppressClan(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().suppress,clan=state.clans?.byId?.[clanId],pool=forceId===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===forceId)?.resources;if(!clan)return {ok:false,error:"无此世家"};
    const seats=(clan.seatIds||[]).map(id=>this.popPlace(id)).filter(Boolean);if(!seats.some(place=>this.popNode(place).force===forceId))return {ok:false,error:"须据有其祖居"};
    const P=POP(),seized=Math.round(clan.wealth*rules.wealth);clan.wealth-=seized;pool.gold=(pool.gold||0)+seized;let freed=0;
    for(const [placeId,share] of Object.entries(clan.presence)){const place=this.popPlace(placeId);if(!place||this.popNode(place).force!==forceId)continue;clan.presence[placeId]=Math.round(share*(1-rules.share)*1000)/1000;
      for(const p of (place.pops||[]).filter(pop=>pop[P.CLS]===P.DEP&&pop[P.CLAN]===clanId))freed+=this.popMove(place,p,rules.dependents,p[P.OCC],P.FREE,"",{registered:.8}).moved;this.popCompact(place);this.popSync(place);const node=this.popNode(place);if(node!==place||!place.jurisdictionCityId)node.order=Math.max(0,(node.order||50)-rules.order)}
    this.clanChanged();clan.grievance[forceId]=(clan.grievance[forceId]||0)+rules.grievance;for(const officer of this.clanMembers(clanId))if(officer.force===forceId&&officer.status==="serving")officer.loyalty=Math.max(0,(officer.loyalty??70)-rules.loyalty);
    const text=`抑制${this.clanName(clanId)}：没入家财 ${seized} 金，${freed} 口依附户改入编户`;events.push({phase:"户口",text,lv:2});return {ok:true,text,seized,freed}},
  // 联姻：与本族结亲，关系大增、族中仕于本方者忠诚上升；三年一次。
  marryClan(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().marry,clan=state.clans?.byId?.[clanId],pool=this.clanPool(state,forceId);if(!clan)return {ok:false,error:"无此世家"};
    if(this.clanRelation(state,clanId,forceId)<rules.min_relation)return {ok:false,error:`关系须达 ${rules.min_relation}`};clan.married??={};const last=clan.married[forceId];if(last!=null&&state.turn-last<GameClock.duration(state,rules.cooldown_days/10))return {ok:false,error:"已结姻亲，不宜再议"};if((pool?.gold||0)<rules.gold)return {ok:false,error:`需金 ${rules.gold}（聘礼）`};
    pool.gold-=rules.gold;clan.married[forceId]=state.turn;clan.favor[forceId]=(clan.favor[forceId]||0)+rules.favor;for(const officer of this.clanMembers(clanId))if(officer.force===forceId&&officer.status==="serving")officer.loyalty=Math.min(100,(officer.loyalty??70)+rules.loyalty);this.clanChanged();
    const text=`${this.forceLabel?.(forceId)||""}与${this.clanFullName(clanId)}结为姻亲`;events.push({phase:"户口",text});return {ok:true,text}},
  // 劝输：请本族助饷，按家财取金粮，关系稍损；半年一次。
  clanContribute(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().contribute,clan=state.clans?.byId?.[clanId],pool=this.clanPool(state,forceId);if(!clan)return {ok:false,error:"无此世家"};
    if(this.clanRelation(state,clanId,forceId)<rules.min_relation)return {ok:false,error:`关系须达 ${rules.min_relation}`};clan.contributed??={};const last=clan.contributed[forceId];if(last!=null&&state.turn-last<GameClock.duration(state,rules.cooldown_days/10))return {ok:false,error:"前番助饷未久"};
    const gold=Math.min(clan.wealth,Math.max(rules.min_gold,Math.round(clan.wealth*rules.wealth)));if(gold<rules.min_gold)return {ok:false,error:"本族家财已薄"};const food=gold*rules.food_per_gold;
    clan.wealth-=gold;pool.gold=(pool.gold||0)+gold;pool.food=(pool.food||0)+food;clan.contributed[forceId]=state.turn;clan.grievance[forceId]=(clan.grievance[forceId]||0)+rules.grievance;this.clanChanged();
    const text=`${this.clanFullName(clanId)}输金 ${gold}、粮 ${food} 以助军资`;events.push({phase:"户口",text});return {ok:true,text,gold,food}},
  // 徙豪强：把本族在本方境内的部分地产与依附户迁离乡里，以其一部安置于都城；地方豪强之势削弱，积怨上升。
  relocateClan(state,clanId,forceId=state.playerForceId,events=[]){const rules=this.clanRules().relocate,clan=state.clans?.byId?.[clanId];if(!clan)return {ok:false,error:"无此世家"};clan.relocated??={};const last=clan.relocated[forceId];if(last!=null&&state.turn-last<GameClock.duration(state,rules.cooldown_days/10))return {ok:false,error:"迁徙未久"};
    const ruler=this.forceRulerOfficer?.(forceId),capital=this.data.cities.find(c=>c.id===ruler?.city&&c.force===forceId),P=POP();if(!capital)return {ok:false,error:"本方没有都城"};
    const local=Object.keys(clan.presence).map(id=>this.popPlace(id)).filter(place=>place&&this.popNode(place).force===forceId&&this.popNode(place).id!==capital.id);if(!local.length)return {ok:false,error:"本族在本方境内（都城以外）无地产"};
    let moved=0;for(const place of local){clan.presence[place.id]=Math.round(clan.presence[place.id]*(1-rules.share)*1000)/1000;for(const p of (place.pops||[]).filter(pop=>pop[P.CLS]===P.DEP&&pop[P.CLAN]===clanId))moved+=this.popMove(place,p,rules.dependents,p[P.OCC],P.FREE,"",{registered:.8}).moved;this.popCompact(place);this.popSync(place);const node=this.popNode(place);node.order=Math.max(0,(node.order||50)-rules.order)}
    const shares=this.clanSharesAt(state,capital.id),total=Object.values(shares).reduce((n,v)=>n+v,0);if(shares[clanId]||Object.keys(shares).length<this.clanRules().max_clans_per_place)clan.presence[capital.id]=Math.round(Math.min((shares[clanId]||0)+rules.capital_share,(shares[clanId]||0)+Math.max(0,this.clanRules().total_share_cap-total))*1000)/1000;
    clan.relocated[forceId]=state.turn;clan.grievance[forceId]=(clan.grievance[forceId]||0)+rules.grievance;this.clanChanged();
    const text=`徙${this.clanFullName(clanId)}豪强于${capital.name}：乡里地产减半，${moved} 口依附户改入编户`;events.push({phase:"户口",text});return {ok:true,text,moved}},
  clanPool(state,forceId){return forceId===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===forceId)?.resources},
  // 各项交互的可行性与说明，供世家窗口显示
  clanActionStatus(state,clanId,forceId=state.playerForceId){const rules=this.clanRules(),clan=state.clans?.byId?.[clanId];if(!clan)return {};const relation=this.clanRelation(state,clanId,forceId),gold=this.clanPool(state,forceId)?.gold||0,since=key=>{const last=clan[key]?.[forceId];return last==null?Infinity:state.turn-last},days=d=>GameClock.duration(state,d/10),
      own=Object.keys(clan.presence).some(id=>{const place=this.popPlace(id);return place&&this.popNode(place).force===forceId}),seat=(clan.seatIds||[]).some(id=>{const place=this.popPlace(id);return place&&this.popNode(place).force===forceId}),idle=this.summonableMembers(state,clanId,forceId).length;
    const row=(ok,reason,tip)=>({ok,reason:ok?"":reason,tip});return {
      court:row(gold>=rules.court.gold&&since("courted")>=days(rules.court.cooldown_days),gold<rules.court.gold?`需金 ${rules.court.gold}`:"往来未久",`金 ${rules.court.gold} · 关系 +${rules.court.favor}`),
      marry:row(relation>=rules.marry.min_relation&&gold>=rules.marry.gold&&since("married")>=days(rules.marry.cooldown_days),relation<rules.marry.min_relation?`关系须达 ${rules.marry.min_relation}`:gold<rules.marry.gold?`需金 ${rules.marry.gold}`:"已结姻亲",`聘礼金 ${rules.marry.gold} · 关系 +${rules.marry.favor} · 族人仕于本方者忠诚 +${rules.marry.loyalty}`),
      summon:row(relation>=rules.summon.min_relation&&idle>0,relation<rules.summon.min_relation?`关系须达 ${rules.summon.min_relation}`:"本族暂无在野子弟",`在野子弟 ${idle} 人 · 关系 +${rules.summon.favor}`),
      contribute:row(relation>=rules.contribute.min_relation&&since("contributed")>=days(rules.contribute.cooldown_days)&&clan.wealth>=rules.contribute.min_gold,relation<rules.contribute.min_relation?`关系须达 ${rules.contribute.min_relation}`:clan.wealth<rules.contribute.min_gold?"家财已薄":"前番助饷未久",`约得金 ${Math.max(rules.contribute.min_gold,Math.round(clan.wealth*rules.contribute.wealth))}、粮三倍 · 积怨 +${rules.contribute.grievance}`),
      relocate:row(own&&since("relocated")>=days(rules.relocate.cooldown_days),own?"迁徙未久":"本族在本方境内无地产",`境内地产减半、三成依附户改编户，迁一部于都城 · 积怨 +${rules.relocate.grievance}`),
      suppress:row(seat,"须据有其祖居",`没入半数家财，境内地产减半 · 积怨 +${rules.suppress.grievance}，族人忠诚 −${rules.suppress.loyalty}`)}},
  setLevyMode(state,forceId,mode){const force=this.data.forces.find(f=>f.id===forceId);if(!force||!this.popRules().levy_floor[mode])return false;force.levyMode=mode;this.clanChanged();return true},

  // AI：府库充裕时结好关系低落、在境内有地产的世家；登记率偏低的据点偶尔清查。
  runClanAI(state,events){const rules=this.clanRules().ai;for(const force of this.data.forces){if(force.id==="neutral"||force.id===state.playerForceId||force.eliminated||!force.resources)continue;
      if(state.random()<rules.court_chance&&(force.resources.gold||0)>rules.court_reserve){const target=this.forceClanPresence(state,force.id).filter(row=>this.clanRelation(state,row.clanId,force.id)<rules.court_relation).sort((a,b)=>b.dependents-a.dependents)[0];if(target)this.courtClan(state,target.clanId,force.id,events)}
      if(state.random()<rules.contribute_chance&&(force.resources.gold||0)<rules.contribute_gold_below){const donor=this.forceClanPresence(state,force.id).filter(row=>this.clanActionStatus(state,row.clanId,force.id).contribute?.ok).sort((a,b)=>(state.clans.byId[b.clanId]?.wealth||0)-(state.clans.byId[a.clanId]?.wealth||0))[0];if(donor)this.clanContribute(state,donor.clanId,force.id,[])}
      if(state.random()<rules.inspect_chance){const city=this.data.cities.filter(c=>c.force===force.id&&c.pops&&this.countiesForCity(c.id).length).sort((a,b)=>(a.registeredPopulation/Math.max(1,a.population))-(b.registeredPopulation/Math.max(1,b.population)))[0];if(city&&(force.resources.gold||0)>this.inspectionCost(state,city)*3)this.inspectRegistry(state,city.id,force.id,[])}}}
});
})();
