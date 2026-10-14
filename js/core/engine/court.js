// RuleEngine 分模块：汉庭。朝廷（天子、都城、挟天子者、天子威望、控制力）、各势力忠汉 / 服从 / 名分、汉官与爵位名录。
// 数据见 game/data/common/han_court.json；企划见 docs/HAN_COURT_PLAN.md。由 rule-engine.js 在 Node 中加载，浏览器按 index.html 顺序加载。
Object.assign(window.RuleEngine.prototype,{
  courtData(){return this.data.hanCourt||{offices:[],titles:[],rules:{},scenarios:{}}},
  courtRules(){return {obey_threshold:70,waver_threshold:40,smoothing:.5,relation_weight:.2,power_weight:6,power_cap:15,legit_scale:1.5,pragmatic_weight:.6,war_cap:20,distance_near:10,distance_far:40,distance_bonus:10,office_bonus_each:5,office_bonus_cap:15,defiance_decay:5,self_styled_factor:.5,control_capital_garrison:5000,control_gain:1,control_loss_no_capital:6,authority_drift:.3,...(this.courtData().rules||{})}},
  courtOffice(id){return this.courtData().offices.find(office=>office.id===id)||null},
  courtTitle(id){return this.courtData().titles.find(title=>title.id===id)||null},
  courtClamp(value){return Math.max(0,Math.min(100,Math.round(value*10)/10))},

  // 新开战局按剧本初值建立朝廷；人物按姓名匹配在任者，名录中找不到的人跳过并记入 court.skipped。
  initCourt(state){const config=this.courtData().scenarios?.[this.data.scenario?.id];if(!config){state.court=null;return null}
    const officerByName=new Map();for(const officer of this.data.officers)if(officer.status==="serving"&&!officerByName.has(officer.name))officerByName.set(officer.name,officer);
    const court={version:1,emperor:{...config.emperor},capital:config.capital,controller:config.controller||null,authority:config.authority??50,control:config.control??50,baseline:config.authority??50,offices:[],titles:[],stances:{},skipped:[],usurpers:[],rebels:[],defiance:{}};
    for(const [office,name,seat=null,variant=null,self=false] of config.offices||[]){const officer=officerByName.get(name);if(!officer||!this.courtOffice(office)){court.skipped.push(`${name}·${variant||this.courtOffice(office)?.name||office}`);continue}court.offices.push({office,seat,variant,officerId:officer.id,forceId:officer.force,self:Boolean(self),grantedTurn:0,grantedBy:self?officer.force:"court"})}
    for(const [title,name,fief=null,self=false] of config.titles||[]){const officer=officerByName.get(name);if(!officer||!this.courtTitle(title)){court.skipped.push(`${name}·${this.courtTitle(title)?.name||title}`);continue}court.titles.push({title,fief,officerId:officer.id,forceId:officer.force,self:Boolean(self),grantedTurn:0,grantedBy:self?officer.force:"court"})}
    for(const force of this.data.forces){if(force.id==="neutral")continue;const loyalty=config.han_loyalty?.[force.id]??50;court.stances[force.id]={hanLoyalty:loyalty,obedience:force.id===court.controller?100:this.courtClamp(loyalty*court.authority/100),legitimacy:0}}
    state.court=court;this.recomputeCourt(state,{immediate:true});return court},
  // 旧存档没有朝廷数据时按剧本初值补建；已有则补齐新增势力。
  ensureCourt(state){if(!state.court)return this.initCourt(state);const court=state.court;court.offices??=[];court.titles??=[];court.stances??={};court.usurpers??=[];court.rebels??=[];court.defiance??={};for(const force of this.data.forces)if(force.id!=="neutral"&&!court.stances[force.id])court.stances[force.id]={hanLoyalty:50,obedience:this.courtClamp(50*court.authority/100),legitimacy:0};return court},

  forceStrength(forceId){let total=0;for(const army of this.data.armies)if(army.force===forceId)total+=army.soldiers||0;for(const city of this.data.cities)if(city.force===forceId)total+=city.garrison||0;return total},
  forceSeat(forceId){const force=this.data.forces.find(item=>item.id===forceId),ruler=force?.ruler&&this.data.officers.find(officer=>officer.name===force.ruler&&officer.force===forceId),city=ruler&&this.data.cities.find(item=>item.id===ruler.city&&item.force===forceId);return city||this.data.cities.find(item=>item.force===forceId)||null},
  courtCapitalCity(state){return this.data.cities.find(city=>city.id===state.court?.capital)||null},

  // 服从的目标值。底数看「挟天子者的名分」：挟天子者忠汉越低，诏书越像矫诏——忠汉高者越不肯奉，
  // 唯实力是从的势力则仍会屈从；再加与挟天子者的关系、实力比、离都城远近、所受朝廷官职，减去近期抗诏。与挟天子者交战者封顶。
  courtObedienceTarget(state,forceId){const court=state.court,rules=this.courtRules(),stance=court.stances[forceId];if(!stance)return 0;if(court.usurpers.includes(forceId)||this.isCourtRebel?.(state,forceId))return 0;if(forceId===court.controller)return 100;
    const loyal=stance.hanLoyalty/100,legit=court.controller?Math.min(1,(court.stances[court.controller]?.hanLoyalty??50)*rules.legit_scale/100):1;
    let value=court.authority*(legit*loyal+(1-legit)*(1-loyal)*rules.pragmatic_weight);
    if(court.controller){value+=this.worldRelation(state,forceId,court.controller)*rules.relation_weight;const own=Math.max(1,this.forceStrength(forceId)),theirs=Math.max(1,this.forceStrength(court.controller));value+=Math.max(-rules.power_cap,Math.min(rules.power_cap,Math.log2(theirs/own)*rules.power_weight))}
    const seat=this.forceSeat(forceId),capital=this.courtCapitalCity(state);if(seat&&capital){const distance=Math.hypot(seat.x-capital.x,seat.y-capital.y),t=Math.max(0,Math.min(1,(distance-rules.distance_near)/Math.max(1,rules.distance_far-rules.distance_near)));value+=rules.distance_bonus*(1-2*t)}
    const granted=court.offices.filter(item=>item.forceId===forceId&&!item.self).length;value+=Math.min(rules.office_bonus_cap,granted*rules.office_bonus_each);
    value-=court.defiance[forceId]||0;if(court.controller&&this.worldWar(state,forceId,court.controller))value=Math.min(value,rules.war_cap);return this.courtClamp(value)},
  courtLegitimacy(state,forceId){const court=state.court,factor=this.courtRules().self_styled_factor;let total=0;for(const item of court.offices)if(item.forceId===forceId)total+=(this.courtOffice(item.office)?.legitimacy||0)*(item.self?factor:1);for(const item of court.titles)if(item.forceId===forceId)total+=(this.courtTitle(item.title)?.legitimacy||0)*(item.self?factor:1);total+=court.merit?.[forceId]||0;return Math.round(total)},

  // 名录维护（每日）：人物去世、被俘、下野或改投他方时官职出缺（负伤者仍在任）；爵位被俘者暂存，
  // 身死则世袭爵位只由原为君主者传给继位君主（臣下的爵位不传君主），否则除国。
  syncCourtHoldings(state,events=[]){const court=state.court,byId=new Map(this.data.officers.map(officer=>[officer.id,officer])),inOffice=officer=>["serving","injured"].includes(officer?.status);
    court.offices=court.offices.filter(item=>{const officer=byId.get(item.officerId);if(inOffice(officer)){item.forceId=officer.force;return true}if(officer)events.push({phase:"汉庭",text:`${officer.name}所任${item.variant||this.courtOffice(item.office)?.name||item.office}出缺`});return false});
    court.titles=court.titles.filter(item=>{const officer=byId.get(item.officerId);if(inOffice(officer)){item.forceId=officer.force;return true}if(officer?.status==="prisoner")return true;const title=this.courtTitle(item.title),force=this.data.forces.find(f=>f.id===item.forceId),wasRuler=officer&&force&&(force.formerRuler===officer.name||force.ruler===officer.name),heir=title?.hereditary&&wasRuler&&force.ruler&&this.data.officers.find(o=>o.name===force.ruler&&o.force===item.forceId&&o.status==="serving");if(heir&&heir.id!==item.officerId){events.push({phase:"汉庭",text:`${heir.name}袭${item.fief||""}${title.name}`});item.officerId=heir.id;return true}if(officer)events.push({phase:"汉庭",text:`${officer.name}${item.fief||""}${title?.name||""}除国`});return false})},

  // 每月重算：维护名录 → 控制力 → 天子威望回归 → 各势力服从（平滑）与名分。挟天子者势力覆灭则天子流离。
  recomputeCourt(state,{immediate=false}={}){const court=state.court;if(!court)return;const rules=this.courtRules();
    if(court.controller&&!this.data.cities.some(city=>city.force===court.controller)){court.controller=null;court.emperor.status="wandering"}
    const capital=this.courtCapitalCity(state);if(court.controller&&!immediate){const held=capital?.force===court.controller,garrison=held?(capital.garrison||0)+this.data.armies.filter(army=>army.force===court.controller&&army.city===capital.id).reduce((sum,army)=>sum+army.soldiers,0):0;court.control=this.courtClamp(court.control+(held?(garrison>=rules.control_capital_garrison?rules.control_gain:0):-rules.control_loss_no_capital))}
    if(!immediate)court.authority=this.courtClamp(court.authority+Math.sign((court.baseline??50)-court.authority)*Math.min(rules.authority_drift,Math.abs((court.baseline??50)-court.authority)));
    for(const [forceId,stance] of Object.entries(court.stances)){if(!this.data.forces.some(force=>force.id===forceId))continue;const target=this.courtObedienceTarget(state,forceId);stance.obedience=immediate?target:this.courtClamp(stance.obedience+(target-stance.obedience)*rules.smoothing);stance.legitimacy=this.courtLegitimacy(state,forceId)}
    for(const forceId of Object.keys(court.defiance)){court.defiance[forceId]=Math.max(0,court.defiance[forceId]-rules.defiance_decay);if(!court.defiance[forceId])delete court.defiance[forceId]}},
  resolveCourt(state,events){if(!state.court)return;this.syncCourtHoldings(state,events);if(GameClock.isMonthEnd(state))this.recomputeCourt(state)},

  // 实控区分档与名义区归属，供舆图与汉庭窗口使用。
  courtBand(state,forceId){const court=state.court;if(!court||!forceId||forceId==="neutral")return "化外";if(court.usurpers.includes(forceId)||this.isCourtRebel?.(state,forceId))return "逆贼";if(forceId===court.controller)return "直辖";const obedience=court.stances[forceId]?.obedience??0,rules=this.courtRules();return obedience>=rules.obey_threshold?"奉诏":obedience>=rules.waver_threshold?"观望":"不奉诏"},
  courtNominal(state,forceId){const court=state.court;if(!court||!forceId||forceId==="neutral")return "化外";return court.usurpers.includes(forceId)?"自立":this.isCourtRebel?.(state,forceId)?"逆贼":"奉汉"},
  courtHoldings(state,forceId){const court=state.court;if(!court)return {offices:[],titles:[]};return {offices:court.offices.filter(item=>item.forceId===forceId),titles:court.titles.filter(item=>item.forceId===forceId)}},
  courtSeatHolder(state,scope,seat){const court=state.court;if(!court)return null;return court.offices.find(item=>item.seat===seat&&this.courtOffice(item.office)?.scope===scope&&!item.self)||court.offices.find(item=>item.seat===seat&&this.courtOffice(item.office)?.scope===scope)||null},
  courtHoldingLabel(item){const office=item.office?this.courtOffice(item.office):null,title=item.title?this.courtTitle(item.title):null;if(office)return `${item.seat||""}${item.variant||office.name}${item.self?"（自领）":""}`;if(title)return `${item.fief?`${item.fief}${{wang:"王",gong:"公",xianhou:"侯"}[title.id]||title.name}`:title.name}${item.self?"（自称）":""}`;return ""}
});
