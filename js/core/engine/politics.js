// 战役政治：战争压力、外交协议、宗属整合、招抚与可配置战略分支。
(()=>{
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0)),alive=o=>o&&!["dead","unborn","not_born","not_appeared","unappeared"].includes(o.status),terminal=new Set(["accepted","rejected","cancelled","expired"]);
Object.assign(window.RuleEngine.prototype,{
  campaignEnabled(state){return state.policies?.campaign?.enabled===true},
  initializeCampaign(state,options={}){
    const source=this.data.rules.balance?.politics;if(!source)return;
    state.policies.campaign={version:1,enabled:options.enabled!==false,mode:options.mode==="free"?"free":"historical",tempo:options.tempo==="standard"?"standard":"rapid",victory:["military","political","regional"].includes(options.victory)?options.victory:"political",rules:structuredClone(source),warAuthorization:structuredClone(this.data.rules.balance?.ai?.war_authorization||{}),profile:structuredClone(this.data.scenario?.ai_campaign||{}),startedDay:GameClock.elapsedDays(state)};
    const campaign=state.policies.campaign;if(!campaign.profile.regional_goal){const major=this.data.forces.filter(f=>f.id!=="neutral").sort((a,b)=>this.data.cities.filter(c=>c.force===b.id).length-this.data.cities.filter(c=>c.force===a.id).length).slice(0,2).map(f=>f.id);campaign.profile.regional_goal={name:"起始战区霸权",provinces:[...new Set(this.data.cities.filter(c=>major.includes(c.force)).map(c=>c.province).filter(Boolean))],share:.7}}
    campaign.regionalBaseline={};const region=campaign.profile.regional_goal,regional=this.data.cities.filter(c=>c.force!=="neutral"&&region.provinces.includes(c.province));for(const c of regional)campaign.regionalBaseline[c.force]=(campaign.regionalBaseline[c.force]||0)+1;campaign.regionalTotal=regional.length;
    const p=this.ensurePolitics(state),now=GameClock.elapsedDays(state);
    for(const [weakId,strongId] of Object.entries(state.diplomacy.worldVassals))if(!p.agreements.some(g=>g.kind==="vassal"&&g.weakId===weakId&&g.status==="active"))p.agreements.push({id:`agreement-${++p.sequence}`,weakId,strongId,kind:"vassal",terms:this.normalizePoliticalTerms("vassalize"),day:now,status:"active",loyalty:65,progress:0});
  },
  politicsRules(state){const c=state.policies?.campaign,r=c?.rules||this.data.rules.balance?.politics||{};return {...r,...(r.tempo_presets?.[c?.tempo]||{})}},
  ensurePolitics(state){const d=this.ensureWorldDiplomacy(state);const p=d.politics??={version:1,sequence:0,pressure:{},proposals:[],agreements:[],receptions:[],pacifications:[],strategies:{},trust:{},milestones:[]};for(const [id,root]of Object.entries(d.vassals||{}))if(!d.worldVassals[id])d.worldVassals[id]=root;d.vassals=Object.fromEntries(Object.entries(d.worldVassals).filter(([,root])=>root===state.playerForceId));return p},
  sovereignOf(state,id){const map={...state.diplomacy?.vassals,...state.diplomacy?.worldVassals},seen=new Set;let root=id;while(map[root]&&!seen.has(root)){seen.add(root);root=map[root]}return root},
  synchronizePoliticalWars(state){
    if(!state.diplomacy?.politics)return;const d=state.diplomacy,playerRoot=this.sovereignOf(state,state.playerForceId),rows=new Map,wars=new Set(playerRoot===state.playerForceId?d.wars.map(id=>this.sovereignOf(state,id)).filter(id=>id!==playerRoot):[]);
    for(const w of d.worldWars){const [a,b]=w.key.split(":"),x=this.sovereignOf(state,w.a||a),y=this.sovereignOf(state,w.b||b);if(x===y)continue;if([x,y].includes(state.playerForceId)){wars.add(x===state.playerForceId?y:x);continue}const key=this.pairKey(x,y);if(!rows.has(key))rows.set(key,{...w,key,a:x,b:y})}d.worldWars=[...rows.values()];
    d.wars=playerRoot===state.playerForceId?[...wars]:this.data.forces.filter(f=>f.id!=="neutral"&&!f.eliminated&&this.sovereignOf(state,f.id)!==playerRoot&&rows.has(this.pairKey(playerRoot,this.sovereignOf(state,f.id)))).map(f=>f.id);
  },
  politicalTransitAllowed(forceId,ownerId){const state=this.popState;return !!state?.diplomacy?.politics&&forceId!=="neutral"&&ownerId!=="neutral"&&this.sovereignOf(state,forceId)===this.sovereignOf(state,ownerId)},
  politicalPool(state,id){return id===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===id)?.resources},
  politicalRelation(state,a,b){if(a===state.playerForceId)return state.relations?.[b]||0;if(b===state.playerForceId)return state.relations?.[a]||0;return state.diplomacy?.worldRelations?.[this.pairKey(a,b)]||0},
  recordPoliticalAbuse(state,forceId,severity){if(!this.campaignEnabled(state)&&!state.diplomacy?.politics)return;const p=this.ensurePolitics(state);p.trust[forceId]=clamp((p.trust[forceId]||0)-Math.max(0,severity),-100,100);for(const g of p.agreements)if(g.kind==="vassal"&&g.status==="active"&&g.strongId===forceId&&g.terms.protectFamilies)g.loyalty=clamp(g.loyalty-severity*.5,0,100)},
  politicalSiteValue(state,city){const force=this.data.forces.find(f=>f.id===city.force),ruler=this.forceRulerOfficer?.(city.force),rank=window.MapGrid?.nodeRank?.(city,this.data.administrativeDivisions);return Math.max(force?.capital===city.id||force?.capital===city.name||ruler?.city===city.id?1:0,rank==="province"?.85:city.commanderySeatNode||rank==="commandery"?.6:.15,clamp((city.population||0)/500000)*.6,city.depot?.5:0)},
  recordWarPressure(state,{id,forceId,opponentId,kind="defeat",severity=0,siteId=null,officerId=null}){
    if(!this.campaignEnabled(state)||!id||!forceId||forceId==="neutral")return;
    const p=this.ensurePolitics(state),r=this.politicsRules(state),rows=p.pressure[forceId]??=[];
    if(rows.some(x=>x.id===id))return;
    rows.push({id,opponentId,kind,severity:clamp(severity),siteId,officerId,day:GameClock.elapsedDays(state)});
    p.pressure[forceId]=rows.slice(-(r.pressure_limit||64));
    const strategy=p.strategies[forceId];if(strategy)strategy.nextReviewDay=Math.min(strategy.nextReviewDay||Infinity,GameClock.elapsedDays(state)+1);
  },
  recordPoliticalBattle(state,{battleId,winnerId,loserId,siteId,start=0,loss=0}){
    if(!this.campaignEnabled(state)||start<=0||!winnerId||!loserId)return;
    const r=this.politicsRules(state),size=clamp(start/(r.major_battle_soldiers||10000)),severity=clamp(loss/Math.max(1,start))*(.25+.75*size);
    this.recordWarPressure(state,{id:`${battleId}:${loserId}`,forceId:loserId,opponentId:winnerId,severity:Math.min(size<.1?r.minor_defeat_cap??.04:1,severity),siteId});
    this.recordWarPressure(state,{id:`${battleId}:${winnerId}`,forceId:winnerId,opponentId:loserId,kind:"victory",severity:severity*.5,siteId});
  },
  recordPoliticalCityLoss(state,city,newOwner){
    if(!this.campaignEnabled(state))return;
    const p=this.ensurePolitics(state),former=city.force;
    for(const row of p.pressure[newOwner]||[])if(row.kind==="site_loss"&&row.siteId===city.id)row.recovered=true;
    if(former!=="neutral")this.recordWarPressure(state,{id:`city:${city.id}:${former}:${state.turn}`,forceId:former,opponentId:newOwner,kind:"site_loss",severity:this.politicalSiteValue(state,city),siteId:city.id});
  },
  campaignFacts(state,forceId){
    const cfg=this.politicsRules(state),now=GameClock.elapsedDays(state),rows=state.diplomacy?.politics?.pressure?.[forceId]||[],sites=this.data.cities.filter(c=>c.force===forceId),armies=this.data.armies.filter(a=>a.force===forceId),ruler=this.forceRulerOfficer?.(forceId),pool=this.politicalPool(state,forceId)||{};
    let defeats=0,wins=0,siteLoss=0;const lostSites=new Map;
    for(const row of rows){const age=now-row.day;if(age<0||age>(cfg.pressure_lookback_days||180)||row.recovered||row.kind==="leader_capture"&&this.officerById(row.officerId)?.status!=="prisoner")continue;const value=row.severity*Math.pow(.5,age/(cfg.pressure_half_life_days||60));if(row.kind==="victory")wins+=value;else if(row.kind==="site_loss")lostSites.set(row.siteId,Math.max(lostSites.get(row.siteId)||0,value));else defeats+=value}
    for(const value of lostSites.values())siteLoss+=value;
    const effective=armies.reduce((n,a)=>n+(a.soldiers||0)*clamp((a.morale??70)/70,.2,1.2)*clamp((a.organization??70)/70,.25,1.2)*clamp((a.supply??80)/80,.25,1.1),0)+sites.reduce((n,c)=>n+(c.garrison||0)*.45,0),soldiers=armies.reduce((n,a)=>n+(a.soldiers||0),0)+sites.reduce((n,c)=>n+(c.garrison||0),0),food=(pool.food||0)+sites.reduce((n,c)=>n+(c.localFood||0),0),dailyFood=Math.max(1,soldiers*(window.FiscalSystem?.foodRules(state).army_ration??.03)),byId=new Map(this.data.cities.map(c=>[c.id,c])),neighbors=new Set;
    for(const c of sites)for(const id of this.data.rules.city_graph?.[c.id]||[]){const other=byId.get(id);if(other&&![forceId,"neutral"].includes(other.force))neighbors.add(other.force)}
    const secure=sites.filter(c=>!this.isCityBesieged(c)).length,resolve=clamp(((ruler?.ambition??3)-1)/4)*.7+clamp((ruler?.loyalty??70)/100)*.3,existing=state.diplomacy?.politics?.strategies?.[forceId],crisis=existing?.successionUntil>now?1:0;
    const largestNeighbor=Math.max(0,...[...neighbors].map(id=>this.forcePower(id)));
    return {actor_id:forceId,year:state.date.year,month:state.date.month,elapsed_days:now-(state.policies.campaign?.startedDay||now),military_disadvantage:clamp((largestNeighbor-soldiers)/Math.max(1,soldiers)/3),forceId,sites:sites.length,effectivePower:effective,soldiers,food,neighbors:[...neighbors],recent_defeat_pressure:clamp((defeats-wins)/(cfg.defeat_pressure_scale||1.5)),key_site_loss:clamp(siteLoss),war_exhaustion:clamp((defeats*.35+siteLoss*.3)+(food/dailyFood<30?.3:0)),independence_resolve:resolve,isolation:sites.length?clamp(1-secure/sites.length+(neighbors.size>1?.15:0)):1,safe_rear_capacity:clamp(secure/Math.max(1,sites.length)),offensive_readiness:clamp(effective/Math.max(1,soldiers)),succession_crisis:crisis};
  },
  submissionParties(state,proposal){const map={...state.diplomacy.vassals,...state.diplomacy.worldVassals};if(proposal.type==="offer_submission")return {weakId:proposal.fromId,strongId:proposal.toId};if(proposal.type==="negotiate_integration"&&map[proposal.fromId]===proposal.toId)return {weakId:proposal.fromId,strongId:proposal.toId};return {weakId:proposal.toId,strongId:proposal.fromId}},
  normalizePoliticalTerms(type,terms={}){return {kind:["full","vassal","peace"].includes(terms.kind)?terms.kind:type==="vassalize"?"vassal":type==="seek_peace"?"peace":"full",retainOffices:terms.retainOffices!==false,protectFamilies:terms.protectFamilies!==false,autonomy:terms.autonomy===true,tributeRate:clamp(terms.tributeRate??.08,0,.2),gold:Math.max(0,Math.floor(Number(terms.gold)||0)),cessionCityIds:Array.isArray(terms.cessionCityIds)?[...new Set(terms.cessionCityIds)].slice(0,12):[]}},
  evaluateSubmission(state,proposal){
    const r=this.politicsRules(state),terms=this.normalizePoliticalTerms(proposal.type,proposal.terms),{weakId,strongId}=this.submissionParties(state,proposal),weak=this.data.forces.find(f=>f.id===weakId&&!f.eliminated),strong=this.data.forces.find(f=>f.id===strongId&&!f.eliminated),no=reason=>({eligible:false,chance:0,reason,terms,weakId,strongId,breakdown:[]});
    if(!weak||!strong||weakId===strongId||[weakId,strongId].includes("neutral"))return no("交涉双方已不具备独立议约资格");
    const map={...state.diplomacy.vassals,...state.diplomacy.worldVassals};
    if(map[weakId]&&map[weakId]!==strongId)return no("须先解除原有臣属关系");
    if(this.sovereignOf(state,strongId)===weakId||map[strongId])return no("不能形成循环臣属或由附庸自行兼并");
    if(terms.kind==="peace"){
      if(!this.worldWar(state,weakId,strongId))return no("双方并未交战");
      for(const id of terms.cessionCityIds){const city=this.cityById(id);if(!city||city.force!==proposal.fromId||this.isCityBesieged(city)&&!this.data.armies.some(a=>a.siegeTarget===id&&a.force===proposal.toId))return no("割让城池归属或围城状态已改变");if(!(this.data.rules.city_graph?.[id]||[]).some(next=>this.cityById(next)?.force===proposal.toId))return no("割地须与接收方实际疆域接壤")}
      const a=this.campaignFacts(state,proposal.toId),b=this.campaignFacts(state,proposal.fromId);return {eligible:true,chance:clamp(.2+a.war_exhaustion*.4+a.recent_defeat_pressure*.3+terms.cessionCityIds.length*.08+Math.min(.2,terms.gold/5000),.05,.95),terms,weakId,strongId,breakdown:[],facts:a};
    }
    const a=this.campaignFacts(state,weakId),b=this.campaignFacts(state,strongId),connected=a.neighbors.some(id=>this.sovereignOf(state,id)===strongId)||map[weakId]===strongId||this.data.armies.some(x=>x.force===strongId&&this.cityById(x.siegeTarget||x.city)?.force===weakId);
    if(!connected)return no("双方缺乏可兑现的军事或保护联系");
    const relative=b.effectivePower/Math.max(1,a.effectivePower),voluntary=proposal.type==="offer_submission",motive=relative>=(r.submission_min_ratio??1.5)||a.recent_defeat_pressure>=(r.submission_min_pressure??.3)||a.key_site_loss>=.4||map[weakId]===strongId;
    if(!motive&&!voluntary)return no("对方实力与政局尚稳，没有归降动机");
    // 整体接收会继承对外战争；不能一边承诺保护，一边绕过接收方现有和约。
    if(["full","vassal"].includes(terms.kind))for(const f of this.data.forces)if(![weakId,strongId,"neutral"].includes(f.id)&&!f.eliminated&&this.worldWar(state,weakId,f.id)&&this.worldPeaceProtected(state,strongId,f.id))return no("接收方与对方现有敌国有有效和约，须先解决外交冲突");
    const allies=this.data.forces.filter(f=>![weakId,strongId,"neutral"].includes(f.id)&&!f.eliminated&&this.worldFriendly(state,weakId,f.id)&&a.neighbors.includes(f.id)),relief=allies.reduce((best,f)=>Math.max(best,clamp(this.campaignFacts(state,f.id).effectivePower/Math.max(1,b.effectivePower))*.6),0),trust=clamp((state.diplomacy?.politics?.trust?.[strongId]||0)/100,-1,1),features={military_disadvantage:clamp((relative-1)/3),recent_defeat_pressure:a.recent_defeat_pressure,key_site_loss:a.key_site_loss,isolation:a.isolation,war_exhaustion:a.war_exhaustion,credible_terms:(terms.retainOffices?.5:0)+(terms.protectFamilies?.3:0)+(terms.autonomy?.2:0),receiver_trust:trust,peripheral_dependence:clamp((b.sites-a.sites)/Math.max(1,b.sites))*(1-relief),independence_resolve:a.independence_resolve,credible_relief:relief,receiver_abuse:clamp(-trust)},weights=r.submission_weights||{},breakdown=Object.entries(features).map(([key,value])=>({key,value,contribution:value*(weights[key]||0)}));
    const contract=state.diplomacy?.politics?.agreements?.find(g=>g.weakId===weakId&&g.strongId===strongId&&g.kind==="vassal"&&g.status==="active"),duration=contract?GameClock.elapsedDays(state)-contract.day:0,integrationBonus=contract?clamp(duration/(r.integration_days||180))*.25:0;
    let chance=clamp((r.submission_base??.08)+breakdown.reduce((n,x)=>n+x.contribution,0)+(terms.kind==="vassal"?.18:0)-Math.max(0,terms.tributeRate-.1)*.8+integrationBonus+Math.min(.12,terms.gold/10000),r.submission_min??.02,r.submission_max??.92);
    if(proposal.type==="negotiate_integration"&&!contract)return no("双方尚无可整合的附庸协议");
    if(voluntary)chance=clamp((r.voluntary_base??.75)+(relative>=1?.1:-.25)-(a.war_exhaustion*.1),.1,.95);
    return {eligible:true,chance,weakId,strongId,terms,breakdown,facts:a,relativePower:relative};
  },
  submitDiplomaticProposal(state,proposal,actorId=state.playerForceId,events=[]){
    if(!this.campaignEnabled(state))return {ok:false,error:"请先在外交窗口启用战役政治"};
    if(actorId!==proposal.fromId)return {ok:false,error:"不能代其他势力提出协议"};
    if(!["demand_surrender","offer_submission","vassalize","negotiate_integration","seek_peace"].includes(proposal.type))return {ok:false,error:"未知的外交协议"};
    const p=this.ensurePolitics(state),r=this.politicsRules(state),now=GameClock.elapsedDays(state),candidate={...proposal,terms:this.normalizePoliticalTerms(proposal.type,proposal.terms)},assessment=this.evaluateSubmission(state,candidate);
    if(!assessment.eligible)return {ok:false,error:assessment.reason};
    const pair=this.pairKey(proposal.fromId,proposal.toId),revision=JSON.stringify((p.pressure[assessment.weakId]||[]).map(x=>[x.id,x.recovered])),termsKey=JSON.stringify({...candidate.terms,gold:Math.floor(candidate.terms.gold/500)*500,tributeRate:Math.floor(candidate.terms.tributeRate/.05)*.05,cessionCityIds:[...candidate.terms.cessionCityIds].sort()}),previous=[...p.proposals].reverse().find(x=>x.pair===pair);
    if(previous&&!terminal.has(previous.status))return {ok:false,error:"双方已有待答复的交涉"};
    if(previous&&now-previous.day<(r.retry_days||30)&&previous.revision===revision&&previous.termsKey===termsKey)return {ok:false,error:"局势与实质条款未变，请待交涉冷却后重议"};
    const pool=this.politicalPool(state,proposal.fromId);if(!pool||(pool.gold||0)<candidate.terms.gold)return {ok:false,error:"承诺款项不足"};pool.gold-=candidate.terms.gold;
    const row={id:`diplomatic-${++p.sequence}`,pair,type:proposal.type,fromId:proposal.fromId,toId:proposal.toId,terms:candidate.terms,termsKey,revision,day:now,dueDay:now+(r.reply_days||5),expiresDay:now+(r.proposal_expiry_days||90),pendingActor:proposal.toId,status:"waiting",roll:state.random(),escrow:candidate.terms.gold};p.proposals.push(row);
    events.push({phase:"外交",proposalId:row.id,text:`${this.forceLabel(row.fromId)}向${this.forceLabel(row.toId)}提出${({full:"整体归降",vassal:"臣属自治",peace:"停战议和"})[row.terms.kind]}交涉，等待答复`});return {ok:true,proposal:row};
  },
  refundPoliticalProposal(state,row){if(!row.escrow)return;const pool=this.politicalPool(state,this.data.forces.find(f=>f.id===row.fromId)?.eliminated?(this.data.forces.find(f=>f.id===row.fromId)?.integratedInto||row.fromId):row.fromId);if(pool)pool.gold=(pool.gold||0)+row.escrow;row.escrow=0},
  respondDiplomaticProposal(state,id,response,actorId,events=[]){
    const p=this.ensurePolitics(state),row=p.proposals.find(x=>x.id===id),now=GameClock.elapsedDays(state);if(!row||terminal.has(row.status)||row.pendingActor!==actorId)return {ok:false,error:"不是待本方答复的交涉"};
    if(now<row.dueDay)return {ok:false,error:"使者尚未抵达"};
    if(now>row.expiresDay)return {ok:false,error:"交涉已经过期"};
    if(response==="reject"){row.status="rejected";this.refundPoliticalProposal(state,row);events.push({phase:"外交",text:`${this.forceLabel(actorId)}拒绝了交涉`});return {ok:true}}
    if(response==="vassal"&&row.terms.kind==="full"){row.terms.kind="vassal";row.terms.autonomy=true;row.status="counter";row.pendingActor=actorId===row.fromId?row.toId:row.fromId;row.dueDay=now+(this.politicsRules(state).reply_days||5);events.push({phase:"外交",text:`${this.forceLabel(actorId)}提出保留自治、改为附庸的条件`});return {ok:true}}
    if(response!=="accept")return {ok:false,error:"未知答复"};
    const assessment=this.evaluateSubmission(state,row);if(!assessment.eligible){row.status="cancelled";this.refundPoliticalProposal(state,row);return {ok:false,error:assessment.reason}}
    return this.completePoliticalAgreement(state,row,assessment,events);
  },
  completePoliticalAgreement(state,row,assessment,events){
    if(row.status==="accepted")return {ok:true};const p=this.ensurePolitics(state),now=GameClock.elapsedDays(state),{weakId,strongId,terms}=assessment;
    const agreement={id:`agreement-${++p.sequence}`,proposalId:row.id,weakId,strongId,fromId:row.fromId,toId:row.toId,kind:terms.kind,terms:structuredClone(terms),day:now,status:"active",loyalty:70,progress:0};
    if(terms.kind==="full"){const result=this.beginForceReception(state,agreement,events);if(!result.ok)return result}
    else if(terms.kind==="vassal"){
      const enemies=this.data.forces.filter(f=>![weakId,strongId,"neutral"].includes(f.id)&&!f.eliminated&&this.worldWar(state,weakId,f.id)).map(f=>f.id),map=state.diplomacy.worldVassals;map[weakId]=strongId;this.setPairTreaty(state,weakId,strongId,"non_aggression",null);for(const enemy of enemies){if(!this.worldWar(state,strongId,enemy))this.declareWorldWar(state,strongId,enemy,events,"保护新附庸");state.diplomacy.coalitions??=[];state.diplomacy.coalitions.push({id:`vassal-protection-${agreement.id}-${enemy}`,agreementId:agreement.id,leaderId:strongId,memberIds:[strongId,weakId],targetId:enemy,expiresTurn:state.turn+GameClock.duration(state,18)})}state.diplomacy.vassals=Object.fromEntries(Object.entries(map).filter(([,root])=>root===state.playerForceId));this.invalidateAIWarPlans(state,[weakId,strongId]);
    }else{for(const id of terms.cessionCityIds)this.transferPoliticalCity(state,this.cityById(id),row.toId);this.setPairTreaty(state,weakId,strongId,"truce",this.politicsRules(state).truce_months||6);this.synchronizePrefectPosts?.(state)}
    row.status="accepted";row.pendingActor=null;const receiver=this.politicalPool(state,terms.kind==="full"?strongId:row.toId);if(row.escrow&&receiver)receiver.gold=(receiver.gold||0)+row.escrow;row.escrow=0;p.agreements.push(agreement);
    p.trust[strongId]=clamp((p.trust[strongId]||0)+3,-100,100);events.push({phase:"天下外交",agreementId:agreement.id,text:`${this.forceLabel(weakId)}与${this.forceLabel(strongId)}达成${({full:"归降接收",vassal:"附庸自治",peace:"停战议和"})[terms.kind]}协议${terms.retainOffices&&terms.kind!=="peace"?"，保留原有地方任官":""}`});return {ok:true,agreement};
  },
  transferPoliticalCity(state,city,newOwner){
    if(!city||city.force===newOwner)return;const former=city.force;city.force=newOwner;for(const county of this.countiesForCity(city.id))county.force=newOwner;
    this.invalidateAIWarPlans(state,new Set([former,newOwner,...(this.data.rules.city_graph?.[city.id]||[]).map(id=>this.cityById(id)?.force).filter(Boolean)]));this.dropCityScores?.(new Set([former,newOwner]));this.invalidateDuties?.(true);
  },
  beginForceReception(state,agreement,events=[]){
    const p=this.ensurePolitics(state),prior=p.receptions.find(x=>x.agreementId===agreement.id);if(prior?.completed)return {ok:true,reception:prior};
    const oldId=agreement.weakId,newId=agreement.strongId,old=this.data.forces.find(f=>f.id===oldId),next=this.data.forces.find(f=>f.id===newId),r=this.politicsRules(state);if(!old||!next||old.eliminated||next.eliminated)return {ok:false,error:"接收双方已经改变"};
    const originalSites=this.data.cities.filter(c=>c.force===oldId),originalArmies=this.data.armies.filter(a=>a.force===oldId),originalOfficers=this.data.officers.filter(o=>o.force===oldId),ruler=this.forceRulerOfficer?.(oldId),refusers=new Set;
    for(const a of originalArmies){const o=this.officerById(a.commanderOfficerId);if(o&&o!==ruler&&(o.loyalty??70)>85&&(o.ambition??3)>=4&&(a.route?.length||a.fieldPosition)&&state.random()<(r.refusal_chance??.15))refusers.add(o.id)}
    const keptArmies=originalArmies.filter(a=>refusers.has(a.commanderOfficerId)),receivedArmies=originalArmies.filter(a=>!refusers.has(a.commanderOfficerId)),keptOfficerIds=new Set(keptArmies.flatMap(a=>[a.commanderOfficerId,...(a.deputyOfficerIds||[]),a.staffOfficerId,a.quartermasterOfficerId,a.marshalOfficerId,...(a.lieutenants||[]).map(x=>x.officerId)]).filter(id=>id&&id!==ruler?.id));
    // 先撤销涉及原势力的其他交涉、退回暂存款，再移交府库，避免重复入库或丢失保证金。
    for(const q of p.proposals)if(q.id!==agreement.proposalId&&!terminal.has(q.status)&&[q.fromId,q.toId].includes(oldId)){q.status="cancelled";this.refundPoliticalProposal(state,q)}
    const from=this.politicalPool(state,oldId),to=this.politicalPool(state,newId);if(!from||!to||from===to)return {ok:false,error:"府库接收关系无效"};
    const record={agreementId:agreement.id,oldId,newId,day:GameClock.elapsedDays(state),cityIds:originalSites.map(c=>c.id),armyIds:receivedArmies.map(a=>a.id),officerIds:originalOfficers.filter(o=>!keptOfficerIds.has(o.id)).map(o=>o.id),resources:{},retainedAppointments:originalSites.map(c=>({cityId:c.id,governor:c.governor,roles:Object.fromEntries(Object.entries(c.administration||{}).filter(([k,v])=>k.endsWith("Id")&&v))})),completed:false};p.receptions.push(record);
    for(const c of originalSites){this.transferPoliticalCity(state,c,newId);if(!agreement.terms.retainOffices){c.governor="普通官员";for(const key of Object.keys(c.administration||{}))if(key.endsWith("Id"))c.administration[key]=null}}
    const battles=new Map(this.data.armies.filter(a=>a.engagement).map(a=>[a.engagement.id,a.engagement]));const interrupted=new Set(receivedArmies.map(a=>a.engagementId).filter(Boolean));for(const a of this.data.armies)if(interrupted.has(a.engagementId)){const b=battles.get(a.engagementId);if(b)this.settleBattleStragglers(a,b);delete a.engagementId;delete a.engagement;a.stance=a.retreat?"败退":"驻扎"}
    for(const a of receivedArmies){a.force=newId;if(a.siegeTarget&&this.cityById(a.siegeTarget)?.force===newId){delete a.siegeTarget;delete a.siegeMethod;delete a.destination}if(a.route?.length&&this.cityById(a.destination)?.force===newId&&a.stance==="围城"){delete a.route;delete a.destination}a.receptionAgreementId=agreement.id}
    for(const o of originalOfficers)if(!keptOfficerIds.has(o.id)){o.force=newId;if(alive(o)&&["serving","injured"].includes(o.status))o.loyalty=Math.max(45,Math.min(o.loyalty??70,80));}
    for(const a of [...receivedArmies,...keptArmies]){a.deputyOfficerIds=(a.deputyOfficerIds||[]).filter(id=>this.officerById(id)?.force===a.force);a.lieutenants=(a.lieutenants||[]).filter(x=>this.officerById(x.officerId)?.force===a.force);for(const key of ["staffOfficerId","quartermasterOfficerId","marshalOfficerId"])if(a[key]&&this.officerById(a[key])?.force!==a.force)delete a[key]}
    for(const key of ["gold","food","silk","prestige"]){record.resources[key]=Math.max(0,from[key]||0);to[key]=(to[key]||0)+record.resources[key];from[key]=0}
    // 地方库存、人口、伤员、军资与工程保持原量，只转移所有权。
    const fiscal=state.policies.fiscalAccounts;if(fiscal){for(const key of ["shipments","laborGroups","projects","supplyRoutes"])for(const x of fiscal[key]||[])if(x.forceId===oldId&&!keptArmies.some(a=>a.id===x.armyId))x.forceId=newId;}
    for(const c of originalSites){if(c.prisonerHolder===oldId)c.prisonerHolder=newId;for(const id of [oldId,newId])if(c.prisoners?.[id]){c.garrison=(c.garrison||0)+c.prisoners[id];delete c.prisoners[id]}}
    for(const a of receivedArmies)if(state.convoyLedger?.[a.id])state.convoyLedger[a.id].force=newId;
    for(const o of this.data.officers){if(o.capturedBy===oldId)o.capturedBy=newId;if(o.originalForce===oldId)o.originalForce=newId;if(o.familyCaptive===oldId)o.familyCaptive=newId;}
    for(const a of receivedArmies)for(const id of [oldId,newId])if(a.prisoners?.[id]){this.addTroops(a,"infantry",a.prisoners[id]);delete a.prisoners[id]}
    for(const family of Object.values(state.clans?.byId||{})){for(const h of [family.household,...(family.householdBranches||[])].filter(Boolean)){if(h.allegiance===oldId)h.allegiance=newId;if(h.capturedBy===oldId)h.capturedBy=newId;if(h.travel?.forceId===oldId)h.travel.forceId=newId}if(family.favor?.[oldId]!=null)family.favor[newId]=Math.max(family.favor[newId]||0,family.favor[oldId])+3;}
    if(state.court){for(const x of [...(state.court.offices||[]),...(state.court.titles||[])])if(x.forceId===oldId&&!keptOfficerIds.has(x.officerId))x.forceId=newId;if(state.court.controller===oldId)state.court.controller=newId;}
    this.receivePoliticalPosts(state,oldId,newId,ruler,agreement,record);
    const enemies=this.data.forces.filter(f=>![oldId,newId,"neutral"].includes(f.id)&&!f.eliminated&&this.worldWar(state,oldId,f.id)).map(f=>f.id);
    for(const enemy of enemies)if(!this.worldWar(state,newId,enemy)&&!this.worldPeaceProtected(state,newId,enemy))this.declareWorldWar(state,newId,enemy,events,"承接归降势力的保护义务");
    const d=state.diplomacy;d.worldWars=d.worldWars.filter(w=>![w.a,w.b,...w.key.split(":")].includes(oldId));d.wars=d.wars.filter(id=>id!==oldId);d.worldTreaties=d.worldTreaties.filter(t=>!t.key.split(":").includes(oldId));d.treaties=d.treaties.filter(t=>t.forceId!==oldId);delete d.worldVassals[oldId];delete d.vassals[oldId];for(const [id,root]of Object.entries(d.worldVassals))if(root===oldId)d.worldVassals[id]=newId;for(const g of p.agreements)if(g.strongId===oldId&&g.kind==="vassal"&&g.status==="active")g.strongId=newId;
    for(const g of p.agreements)if(g.weakId===oldId&&g.kind==="vassal")g.status="integrated";
    old.eliminated=keptArmies.length===0;old.integratedInto=newId;old.remnant=keptArmies.length>0;if(old.remnant){old.ruler=this.officerById(keptArmies[0].commanderOfficerId)?.name||old.ruler;old.name=`${old.ruler||old.name}残部`;this.declareWorldWar(state,oldId,newId,events,"在外部将拒绝归降")}
    for(const f of this.data.forces)f.cities=this.data.cities.filter(c=>c.force===f.id).length;
    this.clanChanged?.();this.synchronizePrefectPosts?.(state);this.synchronizeProvincePosts?.(state);this.syncAllArmyOfficerLocations?.();this.auditSieges?.(state,events);this.invalidateDuties?.(true);record.completed=true;agreement.status="completed";
    events.push({phase:"天下",receptionId:agreement.id,text:`接收${old.name}：${record.cityIds.length}处据点、${receivedArmies.length}支军团、${record.officerIds.length}名人物，原有仓粮与兵员保留${keptArmies.length?`；${keptArmies.length}支在外部队拒绝归降`:""}`});return {ok:true,reception:record};
  },
  receivePoliticalPosts(state,oldId,newId,ruler,agreement,record){
    const old=state.forceCommand?.[oldId];if(!old)return;const target=this.commandOf(state,newId),ids=new Map(Object.keys(old.posts).map(id=>[id,`received_${agreement.id}_${id}`])),rootId=`received_${agreement.id}`,scope={provinces:[],commanderies:[...new Set(record.cityIds.map(id=>this.cityById(id)?.commandery).filter(Boolean))]};
    const parent=ruler?.force===newId&&ruler.status==="serving"&&agreement.terms.retainOffices?rootId:null;
    if(parent)target.posts[rootId]={id:rootId,kind:"dudu",scope,holderId:ruler.id,parentId:null,title:`${ruler.name}归附方面`,policy:{type:"hold",targetCityId:null},directives:[],reports:[],autoArmies:false,status:{defiance:0,mode:"恭顺"},createdTurn:state.turn};
    for(const [id,post]of Object.entries(old.posts)){const holder=this.officerById(post.holderId);if(holder?.force!==newId)continue;if(!agreement.terms.retainOffices)continue;const copy=structuredClone(post);copy.id=ids.get(id);copy.scope={provinces:[],commanderies:scope.commanderies.filter(name=>this.scopeContains(post.scope,{commandery:name,province:this.commanderyProvince(name)}))};if(!copy.scope.commanderies.length)continue;copy.parentId=post.parentId&&ids.has(post.parentId)?ids.get(post.parentId):parent;copy.directives=[];copy.policy={type:"hold",targetCityId:null};target.posts[copy.id]=copy;}
    for(const post of Object.values(target.posts))if(post.parentId&&!target.posts[post.parentId])post.parentId=parent;
    for(const a of this.data.armies.filter(a=>a.force===newId&&record.armyIds.includes(a.id)))a.postId=target.posts[ids.get(a.postId)]?ids.get(a.postId):parent;
    old.posts=Object.fromEntries(Object.entries(old.posts).filter(([,post])=>this.officerById(post.holderId)?.force===oldId));old.operations=[];
  },
  resolvePoliticalProposals(state,events){
    if(!this.campaignEnabled(state)&&!state.diplomacy?.politics)return;const p=this.ensurePolitics(state),now=GameClock.elapsedDays(state);
    for(const row of [...p.proposals]){
      if(terminal.has(row.status))continue;
      if(now>row.expiresDay||![row.fromId,row.toId].every(id=>this.data.forces.some(f=>f.id===id&&!f.eliminated))){row.status="expired";this.refundPoliticalProposal(state,row);continue}
      if(now<row.dueDay)continue;if(row.pendingActor===state.playerForceId){if(!row.announced){row.announced=true;events.push({phase:"外交",proposalId:row.id,pending:true,lv:3,text:`${this.forceLabel(row.fromId===state.playerForceId?row.toId:row.fromId)}的交涉条件已送达，请在外交窗口答复`})}continue}
      const result=this.evaluateSubmission(state,row);
      if(!result.eligible){row.status="cancelled";this.refundPoliticalProposal(state,row);events.push({phase:"外交",text:`交涉取消：${result.reason}`});continue}
      if(row.roll<result.chance){this.respondDiplomaticProposal(state,row.id,"accept",row.pendingActor,events);continue}
      if(row.status!=="counter"&&row.terms.kind==="full"&&row.type!=="offer_submission"){
        const counter=this.evaluateSubmission(state,{...row,terms:{...row.terms,kind:"vassal",autonomy:true}});
        if(counter.eligible&&row.roll<counter.chance){this.respondDiplomaticProposal(state,row.id,"vassal",row.pendingActor,events);continue}
      }
      this.respondDiplomaticProposal(state,row.id,"reject",row.pendingActor,events);
    }
    const limit=this.politicsRules(state).proposal_history_limit||64;p.proposals=[...p.proposals.filter(q=>!terminal.has(q.status)),...p.proposals.filter(q=>terminal.has(q.status)&&now-q.day<180).slice(-limit)];
  },
  settlePoliticalVassals(state,events){
    if((!this.campaignEnabled(state)&&!state.diplomacy?.politics)||!GameClock.isMonthEnd(state))return;const p=this.ensurePolitics(state),r=this.politicsRules(state),now=GameClock.elapsedDays(state);
    for(const g of p.agreements.filter(x=>x.kind==="vassal"&&x.status==="active")){
      if(g.settledMonth===`${state.date.year}-${state.date.month}`)continue;g.settledMonth=`${state.date.year}-${state.date.month}`;
      const weak=this.data.forces.find(f=>f.id===g.weakId&&!f.eliminated),strong=this.data.forces.find(f=>f.id===g.strongId&&!f.eliminated);if(!weak||!strong){g.status="ended";delete state.diplomacy.worldVassals[g.weakId];delete state.diplomacy.vassals[g.weakId];continue}
      const from=this.politicalPool(state,g.weakId),to=this.politicalPool(state,g.strongId),facts=this.campaignFacts(state,g.weakId),gift=Math.floor(Math.max(0,(from.gold||0)-(r.vassal_gold_reserve||1000))*g.terms.tributeRate);from.gold-=gift;to.gold=(to.gold||0)+gift;g.totalTribute=(g.totalTribute||0)+gift;for(const coalition of state.diplomacy.coalitions||[])if(coalition.agreementId===g.id)coalition.expiresTurn=state.turn+GameClock.duration(state,18);
      const held=this.data.cities.filter(c=>c.force===g.weakId),attacked=held.some(c=>this.isCityBesieged(c)),protectedBy=this.data.armies.some(a=>a.force===g.strongId&&held.some(c=>a.destination===c.id||a.city===c.id)),trust=p.trust[g.strongId]||0;
      g.loyalty=clamp(g.loyalty+(g.terms.protectFamilies?2:0)+(protectedBy?4:0)-(attacked&&!protectedBy?10:0)+trust*.03-(g.terms.tributeRate>.12?4:0),0,100);
      g.progress=clamp((now-g.day)/(r.integration_days||180)*(g.loyalty/100),0,1);
      if(g.loyalty<(r.vassal_revolt_loyalty||25)&&facts.independence_resolve>.6){delete state.diplomacy.worldVassals[g.weakId];delete state.diplomacy.vassals[g.weakId];g.status="seceded";state.diplomacy.coalitions=(state.diplomacy.coalitions||[]).filter(c=>c.agreementId!==g.id);this.breakPairTreaty(state,g.weakId,g.strongId);this.setPairTreaty(state,g.weakId,g.strongId,"truce",1);events.push({phase:"天下外交",text:`${this.forceLabel(g.weakId)}因保护失约与臣属不满解除附庸关系`});continue}
      if(this.campaignEnabled(state)&&g.progress>=1&&!p.proposals.some(q=>!terminal.has(q.status)&&q.pair===this.pairKey(g.weakId,g.strongId))&&g.strongId!==state.playerForceId)this.submitDiplomaticProposal(state,{fromId:g.strongId,toId:g.weakId,type:"negotiate_integration",terms:{...g.terms,kind:"full"}},g.strongId,events);
    }
    for(const g of p.agreements.filter(x=>x.kind==="full"&&x.status==="completed"&&!x.obligationChecked&&now-x.day>=30)){
      g.obligationChecked=true;const rec=p.receptions.find(x=>x.agreementId===g.id);if(!g.terms.retainOffices||!rec)continue;
      const broken=(rec.retainedAppointments||[]).some(x=>{const city=this.cityById(x.cityId);return city?.force===g.strongId&&Object.entries(x.roles).some(([role,id])=>{const o=this.officerById(id);return o&&["serving","injured"].includes(o.status)&&o.force===g.strongId&&city.administration?.[role]!==id})});if(broken){p.trust[g.strongId]=clamp((p.trust[g.strongId]||0)-15,-100,100);events.push({phase:"外交",text:`${this.forceLabel(g.strongId)}提前撤换保官协议中的地方任官，守约信誉下降`})}
    }
  },
  schedulePoliticalPacification(state,seat,newOwner,oldOwner,events){
    if(!this.campaignEnabled(state)||!seat.commanderySeatNode||!oldOwner||oldOwner==="neutral")return false;
    const p=this.ensurePolitics(state),r=this.politicsRules(state),now=GameClock.elapsedDays(state),targets=this.data.cities.filter(c=>c.id!==seat.id&&c.commandery===seat.commandery&&c.force===oldOwner&&(window.MapGrid?.nodeKind?.(c)||c.type||"city")==="city");
    for(const city of targets)if(!p.pacifications.some(x=>x.cityId===city.id&&x.status==="pending")){const item={id:`pacify-${++p.sequence}`,cityId:city.id,seatId:seat.id,fromId:oldOwner,toId:newOwner,day:now,dueDay:now+(r.pacification_days||12),status:"pending",roll:state.random()};p.pacifications.push(item)}
    if(targets.length)events.push({phase:"招抚",siteId:seat.id,text:`${seat.name}失守，向${seat.commandery}属县发出招抚；守军、援军与地方官可在答复前决定去留`});return true;
  },
  resolvePoliticalPacifications(state,events){
    if(!this.campaignEnabled(state)&&!state.diplomacy?.politics)return;const p=this.ensurePolitics(state),r=this.politicsRules(state),now=GameClock.elapsedDays(state);
    for(const row of p.pacifications){if(row.status!=="pending"||now<row.dueDay)continue;const city=this.cityById(row.cityId),seat=this.cityById(row.seatId);row.status="resisted";
      if(!city||!seat||city.force!==row.fromId||seat.force!==row.toId||this.worldPeaceProtected(state,row.fromId,row.toId))continue;
      const defenders=this.data.armies.filter(a=>a.force===row.fromId&&(a.city===city.id||a.destination===city.id&&a.route?.length));if(defenders.length||(city.garrison||0)>(r.pacification_max_garrison||2500)||this.isCityBesieged(city))continue;
      const governor=this.actualCommanderyGovernor?.(city)||this.data.officers.find(o=>o.name===city.governor&&o.force===row.fromId),loyalty=governor?.loyalty??60,family=governor&&this.officerClan?.(governor),familySupport=family?this.clanRelation(state,family.id,row.toId)/100:.5,pressure=this.campaignFacts(state,row.fromId),chance=clamp((r.pacification_base??.2)+pressure.key_site_loss*.2+pressure.recent_defeat_pressure*.2+(this.isIsolatedCity(city.id,row.fromId)?.2:0)+familySupport*.15-(loyalty-50)*.007-(city.garrison||0)/20000+(p.trust[row.toId]||0)/300,.02,.9);
      row.chance=chance;if(row.fromId===state.playerForceId){row.status="awaiting_player";events.push({phase:"招抚",siteId:city.id,text:`${city.name}收到归附条件，等待主公决定；守军继续守土`});continue}
      if(row.roll>=chance){events.push({phase:"招抚",siteId:city.id,text:`${city.name}地方官选择继续抵抗`});continue}
      this.acceptPoliticalPacification(state,row,events);
    }
    p.pacifications=p.pacifications.filter(x=>["pending","awaiting_player"].includes(x.status)||now-x.day<90).slice(-128);
  },
  acceptPoliticalPacification(state,row,events){const city=this.cityById(row.cityId),seat=this.cityById(row.seatId);if(!city||city.force!==row.fromId||seat?.force!==row.toId||this.data.armies.some(a=>a.force===row.fromId&&a.city===city.id))return {ok:false,error:"城池归属或驻军已经改变"};const officials=new Set(Object.entries(city.administration||{}).filter(([k])=>k.endsWith("Id")).map(([,v])=>v));for(const o of this.data.officers)if(o.force===row.fromId&&o.city===city.id&&(officials.has(o.id)||o.name===city.governor))o.force=row.toId;this.transferPoliticalCity(state,city,row.toId);row.status="accepted";this.synchronizePrefectPosts?.(state);events.push({phase:"招抚",siteId:city.id,text:`${city.name}接受招抚，守军、县库和地方任官归属${this.forceLabel(row.toId)}，人口与粮食不作攻城损耗`});return {ok:true}},
  campaignCondition(condition,facts){
    if(!condition)return true;if(condition.all)return condition.all.every(c=>this.campaignCondition(c,facts));if(condition.any)return condition.any.some(c=>this.campaignCondition(c,facts));if(condition.not)return !this.campaignCondition(condition.not,facts);
    if(!Object.hasOwn(facts,condition.fact))return false;const v=facts[condition.fact];if(Object.hasOwn(condition,"eq")&&v!==condition.eq)return false;if(Object.hasOwn(condition,"gte")&&v<condition.gte)return false;if(Object.hasOwn(condition,"lte")&&v>condition.lte)return false;if(Object.hasOwn(condition,"gt")&&v<=condition.gt)return false;if(Object.hasOwn(condition,"lt")&&v>=condition.lt)return false;return true;
  },
  historicalRivalBonus(state,forceId,targetId){
    const c=state.policies?.campaign;if(!c?.enabled||c.mode!=="historical")return 0;
    const target=this.data.forces.find(f=>f.id===targetId&&!f.eliminated);if(!target)return 0;
    const a=this.campaignFacts(state,forceId),b=this.campaignFacts(state,targetId),facts={...a,target_active:1,target_relative_power:b.effectivePower/Math.max(1,a.effectivePower),year:state.date.year};
    return (Array.isArray(c.profile.preferences)?c.profile.preferences:[]).filter(x=>x.actor===forceId&&x.target===targetId&&this.campaignCondition(x.when,facts)).reduce((n,x)=>n+(Number(x.weight)||0),0);
  },
  chooseCampaignIntent(state,forceId){
    const p=this.ensurePolitics(state),now=GameClock.elapsedDays(state),facts=this.campaignFacts(state,forceId),profile=state.policies.campaign.mode==="historical"?state.policies.campaign.profile:{},graph=profile.intent_graph||this.politicsRules(state).intent_graph||{},strategy=p.strategies[forceId]??={node:graph.initial||"assess",nextReviewDay:now};
    const nodes=new Map((Array.isArray(graph.nodes)?graph.nodes:[]).filter(n=>n&&typeof n.id==="string").map(n=>[n.id,n])),node=nodes.get(strategy.node)||nodes.get(graph.initial),valid=new Set(["regroup","advance","seek_peace","seek_relief","offer_submission","split_succession"]);
    if(!node)return {intent:facts.recent_defeat_pressure>.5?"seek_peace":"advance",facts};
    const choices=(Array.isArray(node.choices)?node.choices:[]).filter(x=>this.campaignCondition(x.when,facts)).map(x=>({...x,weight:Math.max(0,(x.weight??x.base_weight??1)+Object.entries(x.weight_by_fact||{}).reduce((n,[key,w])=>n+(facts[key]||0)*w,0))}));
    let roll=state.random()*choices.reduce((n,x)=>n+x.weight,0),chosen=choices.find(x=>(roll-=x.weight)<0)||choices.at(-1);if(!chosen)return {intent:"regroup",facts};
    if(chosen.next&&nodes.has(chosen.next))strategy.node=chosen.next;
    if(!valid.has(chosen.intent))return {intent:"regroup",facts};strategy.intent=chosen.intent;strategy.intentDay=now;return {intent:chosen.intent,facts,choice:chosen,cooldownDays:Number(node.cooldown_days)||0};
  },
  selectCampaignForce(state,actorId,selector,candidates){const list=candidates.filter(f=>f.id!==actorId&&!f.eliminated);if(selector&&typeof selector==="object")return list.find(f=>f.id===selector.force_id)||null;if(selector==="main_enemy")return list.find(f=>f.id===this.reviewAIWarPlan(state,actorId)?.primaryForceId)||null;if(selector==="reachable_ally")return list.filter(f=>this.worldFriendly(state,actorId,f.id)).sort((a,b)=>this.forcePower(b.id)-this.forcePower(a.id))[0]||null;if(selector==="weak_neighbor")return list.sort((a,b)=>this.forcePower(a.id)-this.forcePower(b.id))[0]||null;if(selector&&selector!=="credible_protector")return null;return list.sort((a,b)=>this.forcePower(b.id)-this.forcePower(a.id))[0]||null},
  runCampaignDiplomacyAI(state,events){
    if(!this.campaignEnabled(state))return;const p=this.ensurePolitics(state),r=this.politicsRules(state),now=GameClock.elapsedDays(state);
    for(const force of this.data.forces.filter(f=>!["neutral",state.playerForceId].includes(f.id)&&!f.eliminated)){
      const strategy=p.strategies[force.id]??={node:"assess",nextReviewDay:now+1+[...force.id].reduce((n,c)=>n+c.charCodeAt(0),0)%21},ruler=this.forceRulerOfficer?.(force.id);
      if(strategy.rulerId&&ruler?.id!==strategy.rulerId&&!alive(this.officerById(strategy.rulerId))){strategy.successionUntil=now+(r.succession_window_days||120);strategy.nextReviewDay=now}strategy.rulerId=ruler?.id||strategy.rulerId;
      if(now<strategy.nextReviewDay||state.random()>(r.ai_daily_review_chance??.25))continue;strategy.nextReviewDay=now+(r.ai_review_days||30)+Math.floor(state.random()*10);
      const chosen=this.chooseCampaignIntent(state,force.id);strategy.nextReviewDay=Math.max(strategy.nextReviewDay,now+(chosen.cooldownDays||0));const facts=chosen.facts,root=this.sovereignOf(state,force.id);strategy.intent=chosen.intent;const complete=result=>{strategy.lastOutcome=result?.ok?"success":"failure";const next=chosen.choice?.[result?.ok?"next_on_success":"next_on_failure"],graph=(state.policies.campaign.mode==="historical"?state.policies.campaign.profile.intent_graph:null)||r.intent_graph;if(next&&graph?.nodes?.some(n=>n.id===next))strategy.node=next;return result};
      if(chosen.intent==="regroup"){strategy.restUntil=now+(r.regroup_days||15);complete({ok:true});continue}
      if(chosen.intent==="split_succession"){complete(this.splitPoliticalSuccession(state,force.id,events));continue}
      if(root!==force.id){complete({ok:false});continue}
      const neighbors=facts.neighbors.map(id=>this.data.forces.find(f=>f.id===this.sovereignOf(state,id)&&!f.eliminated)).filter(Boolean),unique=[...new Map(neighbors.map(f=>[f.id,f])).values()],strongest=this.selectCampaignForce(state,force.id,chosen.choice?.target_selector||"credible_protector",unique);
      if(chosen.intent==="seek_relief"){
        const ally=this.selectCampaignForce(state,force.id,chosen.choice?.target_selector||"reachable_ally",unique),enemy=unique.find(f=>this.worldWar(state,force.id,f.id));if(ally&&enemy&&!this.worldPeaceProtected(state,ally.id,enemy.id)){if(!this.worldWar(state,ally.id,enemy.id))this.declareWorldWar(state,ally.id,enemy.id,events,"中央接受盟友求援");state.diplomacy.coalitions??=[];if(!state.diplomacy.coalitions.some(c=>c.targetId===enemy.id&&c.memberIds.includes(force.id)))state.diplomacy.coalitions.push({id:`relief-${++p.sequence}`,leaderId:ally.id,memberIds:[ally.id,force.id],targetId:enemy.id,expiresTurn:state.turn+GameClock.duration(state,9)});}complete({ok:!!ally&&!!enemy});continue;
      }
      if(chosen.intent==="offer_submission"&&strongest){const trial={fromId:force.id,toId:strongest.id,type:"offer_submission",terms:{kind:facts.key_site_loss>.5&&facts.recent_defeat_pressure>.5?"full":"vassal",retainOffices:true,protectFamilies:true,autonomy:true}};complete(this.submitDiplomaticProposal(state,trial,force.id,events));continue}
      if(chosen.intent==="seek_peace"){
        const enemy=unique.filter(f=>this.worldWar(state,force.id,f.id)).sort((a,b)=>this.forcePower(b.id)-this.forcePower(a.id))[0];complete(enemy?this.submitDiplomaticProposal(state,{fromId:force.id,toId:enemy.id,type:"seek_peace",terms:{kind:"peace"}},force.id,events):{ok:false});continue;
      }
      const main=this.reviewAIWarPlan(state,force.id)?.primaryForceId,target=chosen.choice?.target_selector?this.selectCampaignForce(state,force.id,chosen.choice.target_selector,unique):unique.find(f=>f.id===main)||this.selectCampaignForce(state,force.id,"weak_neighbor",unique);if(!target){complete({ok:false});continue}
      const trial={fromId:force.id,toId:target.id,type:"demand_surrender",terms:{kind:"full",retainOffices:true,protectFamilies:true}},score=this.evaluateSubmission(state,trial);
      complete(score.eligible&&score.chance>=(r.ai_proposal_min_chance??.35)?this.submitDiplomaticProposal(state,trial,force.id,events):{ok:false});
    }
  },
  splitPoliticalSuccession(state,forceId,events){
    if(forceId===state.playerForceId)return {ok:false,error:"玩家继承争议由玩家处理"};const p=this.ensurePolitics(state),strategy=p.strategies[forceId],now=GameClock.elapsedDays(state);if(!strategy||strategy.successionUntil<now||strategy.splitDay)return {ok:false,error:"没有可分裂的继承争议"};
    const posts=this.commandPosts(state,forceId),ruler=this.forceRulerOfficer(forceId),candidate=posts.find(post=>{const h=this.postHolder(post);return !post.parentId&&h&&h!==ruler&&(h.ambition??3)>=4&&(h.loyalty??70)<50&&this.postCities(post,forceId).length});if(!candidate)return {ok:false,error:"地方方面仍支持统一继承"};
    const holder=this.postHolder(candidate),sites=this.postCities(candidate,forceId),old=this.data.forces.find(f=>f.id===forceId),newId=`succession_${forceId}_${++p.sequence}`,newForce={id:newId,name:holder.name,ruler:holder.name,color:old.color,capital:sites[0].id,resources:{gold:0,food:0,silk:0,prestige:0},cities:sites.length};this.data.forces.push(newForce);
    const all=this.data.cities.filter(c=>c.force===forceId),fraction=sites.length/Math.max(1,all.length),oldPool=this.politicalPool(state,forceId);for(const key of ["gold","food","silk","prestige"]){const n=Math.floor((oldPool[key]||0)*fraction);oldPool[key]-=n;newForce.resources[key]=n}
    const ids=new Set(sites.map(c=>c.id)),armyIds=new Set(this.postArmies(candidate,forceId).map(a=>a.id));for(const c of sites)this.transferPoliticalCity(state,c,newId);for(const a of this.data.armies)if(a.force===forceId&&armyIds.has(a.id))a.force=newId;for(const o of this.data.officers)if(o.force===forceId&&alive(o)&&(o.id===holder.id||ids.has(o.city)&&o!==ruler))o.force=newId;
    const command=this.commandOf(state,newId),oldCommand=this.commandOf(state,forceId);for(const post of posts)if(this.officerById(post.holderId)?.force===newId){command.posts[post.id]=post;delete oldCommand.posts[post.id];if(!command.posts[post.parentId])post.parentId=null}strategy.splitDay=now;this.declareWorldWar(state,forceId,newId,events,"继承争议导致地方方面自立");this.synchronizePrefectPosts?.(state);events.push({phase:"天下",text:`${holder.name}因继承争议与地方离心据${sites[0].name}自立，所属兵粮人口按实划分`});return {ok:true};
  },
  resolveCampaignVictory(state,events){
    if(!this.campaignEnabled(state)||state.gameOver||!GameClock.isMonthEnd(state))return;const p=this.ensurePolitics(state),r=this.politicsRules(state),now=GameClock.elapsedDays(state),groups=new Map,sites=this.data.cities.filter(c=>c.force!=="neutral"),total=sites.reduce((n,c)=>n+(c.population||1),0);
    for(const c of sites){const root=this.sovereignOf(state,c.force),g=groups.get(root)||{root,population:0,sites:0,keySites:0};const agreement=p.agreements.find(a=>a.kind==="vassal"&&a.weakId===c.force&&a.status==="active");const stable=c.force===root||agreement&&agreement.loyalty>=60&&now-agreement.day>=(r.vassal_stable_days||60);if(stable&&!this.isCityBesieged(c)){g.population+=c.population||1;g.sites++;if(c.commanderySeatNode)g.keySites++}groups.set(root,g)}
    const ranked=[...groups.values()].sort((a,b)=>b.population-a.population),leader=ranked[0];if(!leader)return;
    const region=state.policies.campaign.profile.regional_goal,regional=region?sites.filter(c=>(region.provinces||[]).includes(c.province)):[],ownedRegion=regional.filter(c=>this.sovereignOf(state,c.force)===leader.root);
    if(regional.length&&ownedRegion.length/regional.length>=(region.share??.7)&&ownedRegion.length-(state.policies.campaign.regionalBaseline?.[leader.root]||0)>=Math.max(1,Math.ceil(regional.length*(r.regional_min_gain??.05)))&&!p.milestones.some(m=>m.id==="regional"&&m.root===leader.root)){p.milestones.push({id:"regional",root:leader.root,day:now});events.push({phase:"天下形势",text:`${this.forceLabel(leader.root)}完成${region.name||"区域霸权"}阶段目标，可继续争取天下统一`});if(state.policies.campaign.victory==="regional")state.gameOver={result:state.observerMode?"observer":this.sovereignOf(state,state.playerForceId)===leader.root?"victory":"defeat",winnerForceId:leader.root,campaignGoal:"regional",turn:state.turn,text:`${this.forceLabel(leader.root)}完成区域战役目标。`}}
    const significant=ranked.filter(g=>g.population/Math.max(1,total)>=(r.significant_group_share??.12)),peace=significant.every(g=>g.root===leader.root||this.worldPeaceProtected(state,leader.root,g.root)),keyTotal=sites.filter(c=>c.commanderySeatNode).length,ready=leader.population/Math.max(1,total)>=(r.political_population_share??.8)&&(keyTotal?leader.keySites/keyTotal:leader.sites/Math.max(1,sites.length))>=(r.political_key_share??.6)&&peace;
    if(!ready){p.victoryCandidate=null;return}if(p.victoryCandidate?.root!==leader.root)p.victoryCandidate={root:leader.root,since:now};
    if(state.policies.campaign.victory!=="political"||now-p.victoryCandidate.since<(r.political_hold_days||180))return;
    state.gameOver={result:state.observerMode?"observer":this.sovereignOf(state,state.playerForceId)===leader.root?"victory":"defeat",winnerForceId:leader.root,campaignGoal:"political",turn:state.turn,text:`${this.forceLabel(leader.root)}以直辖与稳定臣属建立天下秩序，政治统一达成。`};
  },
  continueCampaign(state){if(!state.gameOver?.campaignGoal||!state.observerMode&&this.data.forces.find(f=>f.id===state.playerForceId)?.eliminated)return {ok:false,error:"当前战局无法继续"};state.policies.campaign.victory="military";state.gameOver=null;return {ok:true}},
  endPoliticalVassalage(state,weakId,actorId,events=[]){const p=this.ensurePolitics(state),root=state.diplomacy.worldVassals[weakId]||state.diplomacy.vassals[weakId];if(!root||![weakId,root].includes(actorId))return {ok:false,error:"只能解除本方的臣属协议"};delete state.diplomacy.worldVassals[weakId];delete state.diplomacy.vassals[weakId];const ids=new Set;for(const g of p.agreements)if(g.kind==="vassal"&&g.weakId===weakId&&g.status==="active"){g.status="seceded";ids.add(g.id)}state.diplomacy.coalitions=(state.diplomacy.coalitions||[]).filter(c=>!ids.has(c.agreementId));if(actorId===weakId)this.recordPoliticalAbuse(state,actorId,10);this.breakPairTreaty(state,weakId,root);this.setPairTreaty(state,weakId,root,"truce",1);this.invalidateAIWarPlans(state,[weakId,root]);events.push({phase:"天下外交",text:`${this.forceLabel(weakId)}与${this.forceLabel(root)}解除臣属关系，保留一个月交接停战`});return {ok:true}},
  resolveCampaignPolitics(state,events){if(!this.campaignEnabled(state)&&!state.diplomacy?.politics)return;this.synchronizePoliticalWars(state);this.resolvePoliticalProposals(state,events);this.resolvePoliticalPacifications(state,events);this.settlePoliticalVassals(state,events);this.runCampaignDiplomacyAI(state,events);this.resolveCampaignVictory(state,events)},
  resolvePoliticalOrder(state,order,events){
    const ids=new Set(["demand_surrender","vassalize","offer_submission","negotiate_integration","respond_diplomacy","set_campaign_mode","pacify_region","authorize_war","end_vassalage"]);if(!ids.has(order.type)&&!(order.type==="seek_peace"&&order.options?.political))return false;
    if(!this.campaignEnabled(state)&&!["set_campaign_mode","offer_submission","negotiate_integration","respond_diplomacy","pacify_region","authorize_war","end_vassalage"].includes(order.type))return false;
    let result;const options=order.options||{},actor=state.playerForceId;
    if(order.type==="end_vassalage")result=this.endPoliticalVassalage(state,options.weakId,actor,events);
    else if(order.type==="authorize_war"){
      const grants=state.policies.warGrants??=[];
      if(options.revokeId){const index=grants.findIndex(g=>g.id===options.revokeId&&g.forceId===actor);if(index<0)result={ok:false,error:"无此授权"};else{grants.splice(index,1);result={ok:true}}}
      else{const target=this.data.forces.find(f=>f.id===options.targetForceId&&f.id!==actor&&f.id!=="neutral"&&!f.eliminated),postId=options.postId||"direct",post=this.commandPosts(state,actor).find(p=>p.id===postId);if(!target||this.worldPeaceProtected(state,actor,target.id)||(!["direct","all"].includes(postId)&&!post)||options.commandery&&!this.data.cities.some(c=>c.commandery===options.commandery))result={ok:false,error:"对象、方面或地域无效，或双方有有效和约"};else{const day=GameClock.elapsedDays(state);state.policies.warGrantSequence=(state.policies.warGrantSequence||0)+1;grants.push({id:`war-grant-${state.policies.warGrantSequence}`,forceId:actor,targetForceId:target.id,postId,commandery:options.commandery||null,issuedDay:day,expiresDay:day+clamp(options.days||90,1,360)});result={ok:true}}}
      if(result.ok)events.push({phase:"政策",text:options.revokeId?"已撤回方面开战授权":"已下达限定对象、地域及期限的开战授权"});
    }else if(order.type==="set_campaign_mode"){
      if(!["historical","free","off"].includes(options.mode)||!(["rapid","standard"].includes(options.tempo))||!(["military","political","regional"].includes(options.victory)))result={ok:false,error:"战役模式、节奏或目标无效"};else{if(!state.policies.campaign)this.initializeCampaign(state,{...options,enabled:options.mode!=="off"});else Object.assign(state.policies.campaign,{enabled:options.mode!=="off",mode:options.mode==="off"?state.policies.campaign.mode:options.mode,tempo:options.tempo,victory:options.victory});result={ok:true};events.push({phase:"政策",text:"战役模式与整合节奏已调整；已有协议继续履行"})}
    }else if(order.type==="respond_diplomacy")result=this.respondDiplomaticProposal(state,options.proposalId,options.response,actor,events);
    else if(order.type==="pacify_region"){
      const p=this.ensurePolitics(state),row=p.pacifications.find(x=>x.id===options.pacificationId&&x.fromId===actor&&x.status==="awaiting_player");if(!row)result={ok:false,error:"没有待本方决定的招抚"};else if(options.response==="accept")result=this.acceptPoliticalPacification(state,row,events);else{row.status="resisted";result={ok:true};events.push({phase:"招抚",siteId:row.cityId,text:`${this.cityById(row.cityId)?.name}奉命继续守土`})}
    }else{const target=order.forceIds?.[0]||order.targetIds?.find(id=>this.data.forces.some(f=>f.id===id));result=this.submitDiplomaticProposal(state,{fromId:actor,toId:target,type:order.type,terms:options.terms||options},actor,events)}
    if(!result?.ok)events.push({phase:"外交",text:`交涉未执行：${result?.error||"条件不符"}`});return true;
  }
});
})();
