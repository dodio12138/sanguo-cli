// RuleEngine 分模块：内政改制 P6——各职专属效果。能力 60 为及格（倍率 1），数值按"90 分 / 20 分"两端给出，偏离幅度再乘 bonus_scale；
// 分数取"能力 × 负荷效率"，所以过劳的官员加成也随之缩水。表见 docs/ADMINISTRATION_REFORM_PLAN.md 乙编 B3–B6。
(()=>{
const CENTRAL_PURPOSES=new Set(["上缴","补缴","中央济粮"]);
const RANK_LOYALTY=[0,.5,1,1.5,2,2.5],RANK_SALARY=[0,10,25,45,70,100];
// 职位格位：县 1、郡掾 2、太守与州属吏 3、州牧与幕府 4（用于"位高品卑"）。
const POST_GRADE={county:1,commandery:2,province:3,court:4};
Object.assign(window.RuleEngine.prototype,{
  // 能力换算（game_rules.json balance.ability）：60 为及格线，默认官员、将领也按 60；高于、低于都按差值乘斜率。
  abilityConfig(){return this._abilityConfig??=(()=>{const c=this.data.rules?.balance?.ability||{};return {pivot:60,default:60,bonus_scale:1.5,...c,battle:{leadership:.39,martial:.27,tactics:.18,steady:.3,charge_per_point:.2,deputy_cap:.15,staff_cap:.12,calibration:.8413,...(c.battle||{})},admin:{growth:1,county_governance:.3,commandery_governance:.2,recruit:1,training:1,fiscal_efficiency:.35,corruption_scale:1.5,registration:1.5,...(c.admin||{})}}})()},
  defaultAbility(){return this.abilityConfig().default},
  // 行政公式（结算与城市"政务结算"页共用）：基数取改制前默认官员的值，按能力相对 60 分的差值放大。
  adminGovernance(city,governor=this.officialProfile(city,"governor"),head=this.officialProfile(city,"commanderyGovernor")){const A=this.abilityConfig().admin;return .993*this.abilityFactor(governor.score,A.county_governance)*this.abilityFactor(head.score,A.commandery_governance)*this.lordAwayPenalty(city)*this.provinceGovernanceBonus(city)},
  adminGrowth(score){return .24*this.abilityFactor(score,this.abilityConfig().admin.growth,.1)},
  adminRecruit(score){return 111.5*this.abilityFactor(score,this.abilityConfig().admin.recruit,.1)},
  adminTraining(score){return .2407*this.abilityFactor(score,this.abilityConfig().admin.training,.1)},
  abilityFactor(score,slope,min=.25){const c=this.abilityConfig(),s=Number.isFinite(score)?score:c.default;return Math.max(min,1+(s-c.pivot)/c.pivot*slope)},
  // 分数到倍率：及格分为 1，90 分取 at90、20 分取 at20 的偏离再乘 bonus_scale；100 分按同斜率外推。
  officeBonus(score,at90,at20=2-at90){const c=this.abilityConfig(),p=c.pivot,s=Number.isFinite(score)?score:c.default;return s>=p?1+(Math.min(100,s)-p)/(90-p)*(at90-1)*c.bonus_scale:Math.max(.05,1+(p-Math.max(20,s))/(p-20)*(at20-1)*c.bonus_scale)},
  clerkScore(city,role){const office=city&&this.commanderyOfficeNode(city);return office?this.officialProfile(office,role).score:this.defaultAbility()},
  prefectScore(city){const office=city&&this.commanderyOfficeNode(city);return office?this.officialProfile(office,"commanderyGovernor").score:this.defaultAbility()},
  centralScore(forceId,role){return this.centralOfficer(forceId,role)?this.centralProfile(forceId,role).score:this.defaultAbility()},
  provinceScore(city,role){const post=city&&this.provincePostOf(city);return post&&this.provinceStaffOfficer(post,role)?this.provinceProfile(city,role).score:this.defaultAbility()},
  // 车队：太守（入境之郡）、营缮掾（郡内路段，含通行量）、仓曹掾（粮秣起讫之郡）、兵曹从事（州内兵粮）、度支官（中央上缴与济粮）。每段合计不低于 convoy_floor（×0.6）。
  convoyModifiers(state,{forceId,route=[],resource,purpose="上缴",targetKind}){const cities=new Map(route.map(id=>[id,this.data.cities.find(c=>c.id===id)])),own=c=>c&&c.force===forceId,source=cities.get(route[0]),target=cities.get(route[route.length-1]),food=resource==="food";
    const capitalId=state.policies?.fiscalAccounts?.forces?.[forceId]?.capitalId,central=CENTRAL_PURPOSES.has(purpose)||targetKind==="central"||(purpose==="自动供粮"&&source?.id===capitalId);
    const granary=food?Math.min(own(source)?this.officeBonus(this.clerkScore(source,"granary"),.93,1.04):1,own(target)?this.officeBonus(this.clerkScore(target,"granary"),.93,1.04):1):1,granaryLoss=food?Math.min(own(source)?this.officeBonus(this.clerkScore(source,"granary"),.85,1.07):1,own(target)?this.officeBonus(this.clerkScore(target,"granary"),.85,1.07):1):1;
    const zhou=own(source)&&own(target)&&this.provincePostOf(source),sameProvince=zhou&&zhou===this.provincePostOf(target),military=food||purpose==="粮草先行",bingcao=sameProvince&&military?this.officeBonus(this.provinceScore(source,"bingcao"),.92,1.04):1,bingcaoLoss=sameProvince&&military?this.officeBonus(this.provinceScore(source,"bingcao"),.9,1.04):1;
    const treasurer=central?this.officeBonus(this.centralScore(forceId,"treasurer"),.92,1.04):1,treasurerLoss=central?this.officeBonus(this.centralScore(forceId,"treasurer"),.9,1.05):1;
    const legDays=[],legCapacity=[];for(let i=1;i<route.length;i++){const a=cities.get(route[i-1]),b=cities.get(route[i]);let f=granary*bingcao*treasurer,cap=1;if(own(b))f*=this.officeBonus(this.prefectScore(b),.92,1.05);if(own(a)&&own(b)&&a.commandery===b.commandery){f*=this.officeBonus(this.clerkScore(b,"defense"),.94,1.03);cap=this.officeBonus(this.clerkScore(b,"defense"),1.1,.96)}legDays.push(Math.max(this.officeConfig().convoy_floor??.6,f));legCapacity.push(cap)}
    return {legDays,legCapacity,loss:granaryLoss*bingcaoLoss*treasurerLoss,central}},
  // 中央济粮：度支官按实际路程放宽触发阈值 max(触发日数, 运程+10)；长史提高每批上限（90 分 ×1.2）。
  reliefTriggerDays(state,forceId,city,base){if(!this.centralOfficer(forceId,"treasurer"))return base;const capital=this.data.cities.find(c=>c.id===state.policies?.fiscalAccounts?.forces?.[forceId]?.capitalId);if(!capital||capital===city)return base;const route=this.logisticsPath?.(capital.id,city.id,forceId);if(!route)return base;const days=state.data.routeNetwork&&this.legInfo?route.slice(1).reduce((n,id,i)=>n+(this.legInfo(route[i],id)?.days||10),0):(route.length-1)*10,weight=Math.min(1,Math.max(0,(this.centralScore(forceId,"treasurer")-20)/70));return Math.round(base+weight*Math.max(0,days+10-base))},
  reliefBatch(forceId,base){return Math.round(base*this.officeBonus(this.centralScore(forceId,"chief"),1.2,.95))},
  // 君主离都：都城与都城所在郡行政总系数 −8%；长史 60 分抵消一半，80 分以上全抵。
  lordAwayPenalty(city){if(!city||!this.lordAwayFromCapital(city.force))return 1;const capital=this.forceCapitalCity(city.force);if(!capital||capital.commandery!==city.commandery)return 1;const chief=this.centralOfficer(city.force,"chief")?this.centralScore(city.force,"chief"):0,offset=chief>=80?1:chief>=60?.5+(chief-60)/40:chief/120;return 1-.08*(1-Math.min(1,offset))},
  // 治中：州内行政总系数 +0～3%。
  provinceGovernanceBonus(city){const p=this.abilityConfig().pivot,s=this.provinceScore(city,"zhizhong");return 1+Math.max(0,Math.min(100,s)-p)/(90-p)*.03*this.abilityConfig().bonus_scale},
  // 司马：补员 ×1.10、驻城训练 ×1.08（90 分）；集结期 30→26 日。
  marshalFactor(forceId,kind){const s=this.centralScore(forceId,"marshal");return kind==="reinforce"?this.officeBonus(s,1.1,.95):kind==="training"?this.officeBonus(s,1.08,.96):kind==="rally"?this.officeBonus(s,26/30,1.05):1},
  // 幕府主簿：每旬（日）命令上限 8，分数 ≥70 +1、≥85 +2；方面汇报保留条数同增。
  maxPlayerOrders(state){const base=this.data.rules?.orders?.max_player_orders_per_turn||8,s=state?.playerForceId&&this.centralOfficer(state.playerForceId,"secretary",state)?this.centralScore(state.playerForceId,"secretary"):0;return base+(s>=85?2:s>=70?1:0)},
  // 郡主簿：督查持续 6→7 旬（90 分）；贪腐 −4 点。
  inspectionTurns(city,base){return Math.max(1,Math.round(base*this.officeBonus(this.clerkScore(city,"secretary"),7/6,5/6)))},
  secretaryCorruption(city){const c=this.abilityConfig(),s=this.clerkScore(city,"secretary");return s>c.pivot?-(Math.min(100,s)-c.pivot)/(90-c.pivot)*4*c.bonus_scale:0},
  // 劝农掾：屯田收益 ×1.08 / ×0.96；贼曹掾：战俘暴动逃亡 ×0.8 / ×1.1，治安低于 40 的县回升 +30%。
  farmingFactor(city){return this.officeBonus(this.clerkScore(city,"agriculture"),1.08,.96)},
  prisonerEscapeFactor(city){return this.officeBonus(this.clerkScore(city,"order"),.8,1.1)},
  lowOrderBoost(city){return (city.order??60)<40?this.officeBonus(this.clerkScore(city,"order"),1.3,1):1},
  // 州功曹从事：州内家族县吏能力 +9 / −5。
  provinceClerkAbility(city){const p=this.abilityConfig().pivot,s=this.provinceScore(city,"gongcao");return s>=p?Math.round((Math.min(100,s)-p)/(90-p)*9):-Math.round((p-Math.max(20,s))/(p-20)*5)},
  // 幕府功曹：搜访人才 ×1.25（90 分）。
  talentSearchFactor(forceId){return this.officeBonus(this.centralScore(forceId,"talent"),1.25,.9)},
  // 别驾：方面执行与汇报按"州牧 + 0.3×(别驾 − 及格分)"计。
  postHolderBoost(post){if(post?.kind!=="zhou")return 0;const o=this.provinceStaffOfficer(post,"biejia");return o?.3*(this.officerRawScore(o,["politics","intelligence"])*this.dutyEfficiency(o.id)-this.abilityConfig().pivot):0},
  // 品级与人事月结（B6）：品级 1–5 每月忠诚 +0.5～2.5、月俸 10～100（中央府库支付，欠俸改为 −1）；位高品卑 −0.5；
  // 幕府功曹 ≥70 全势力 +1；州功曹从事 0～1。小数累计满 1 才计入。
  monthlyOfficeLoyalty(state,officer){const rank=Math.max(0,Math.min(5,officer.officeRank||0)),pool=officer.force===state.playerForceId?state.resources:this.data.forces.find(f=>f.id===officer.force)?.resources;let delta=0;
    if(rank){const salary=RANK_SALARY[rank];if(pool&&(pool.gold||0)>=salary){pool.gold-=salary;delta+=RANK_LOYALTY[rank];officer.unpaid=false}else{delta-=1;officer.unpaid=true}}
    const load=this.officerLoad(officer.id),grade=Math.max(0,...(load?.posts||[]).map(p=>POST_GRADE[p.tier]||0));if(grade&&grade-rank>=2)delta-=.5;
    if(this.centralScore(officer.force,"talent")>=70)delta+=1;const city=this.data.cities.find(c=>c.id===officer.city);if(city)delta+=Math.max(0,Math.min(1,(this.provinceScore(city,"gongcao")-this.abilityConfig().pivot)/(90-this.abilityConfig().pivot)));
    officer.loyaltyCarry=(officer.loyaltyCarry||0)+delta;const whole=Math.trunc(officer.loyaltyCarry);officer.loyaltyCarry-=whole;return whole},
  // 州功曹从事：每月按分数（90 分 6%）在州内发现一名在野人才。
  provinceTalentDiscovery(state,events){for(const [forceId,command] of Object.entries(state.forceCommand||{}))for(const post of Object.values(command.posts||{})){if(post.kind!=="zhou"||!this.provinceStaffOfficer(post,"gongcao"))continue;const cities=this.postCities(post,forceId),score=this.officerRawScore(this.provinceStaffOfficer(post,"gongcao"),["politics","charm"])*this.dutyEfficiency(post.staff.gongcao),chance=Math.max(0,Math.min(1,(score-this.abilityConfig().pivot)/(90-this.abilityConfig().pivot)))*.06;if(!chance||state.random()>=chance)continue;const talent=this.data.officers.find(o=>o.status==="hidden"&&cities.some(c=>c.id===o.city));if(!talent)continue;talent.status="discovered";if(forceId===state.playerForceId)events.push({phase:"人事",text:`${post.title||"州府"}功曹从事访得在野人才${talent.name}，现可尝试登庸`})}},
  rankSalary(rank){return RANK_SALARY[Math.max(0,Math.min(5,rank||0))]},
  postGrade(officerId){const load=this.officerLoad(officerId);return Math.max(0,...(load?.posts||[]).map(p=>POST_GRADE[p.tier]||0))}
});
})();
