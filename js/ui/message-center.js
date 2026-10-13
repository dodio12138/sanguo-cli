// 消息分级与汇总：每日结算的事件按与玩家的关系分为紧急、重要、一般、琐事四级。
// 紧急：向我宣战、我方城池新遭围攻或失守、我军溃败、待决事件、我方君主或将领变故。
// 重要：命令反馈、我方相关的战事与行军、涉及我方的外交、天下大事与大举兴兵。
// 一般：其余与我方据点、军团、人物有关的结算。琐事：他方的日常结算。
window.MessageCenter=class MessageCenter{
  static LEVELS=["琐事","一般","重要","紧急"];
  static INBOX_LIMIT=150;
  static militaryPhases=new Set(["行军","野战","攻城","守城","战斗","战法","战果","掠夺","探索","补给","后勤","诸侯","联军","调动"]);

  // 结算前快照：我方据点、军团、人物与已遭围攻的城，用来判断“新近失守”“新遭围攻”。
  static snapshot(state){const own=state.data.cities.filter(city=>city.force===state.playerForceId),armies=state.data.armies.filter(army=>army.force===state.playerForceId);
    return {forceName:state.data.forces.find(force=>force.id===state.playerForceId)?.name||"",cityIds:own.map(city=>city.id),besiegedIds:own.filter(city=>state.data.armies.some(army=>army.siegeTarget===city.id&&army.force!==state.playerForceId)).map(city=>city.id),armyIds:armies.map(army=>army.id),armyNames:armies.map(army=>army.name),officerNames:state.data.officers.filter(officer=>officer.force===state.playerForceId&&officer.status==="serving").map(officer=>officer.name)}}

  static context(state,before=null,orderTerms=[]){const now=MessageCenter.snapshot(state),prior=before||now,names=[...new Set([...prior.armyNames,...now.armyNames,...state.data.cities.filter(city=>prior.cityIds.includes(city.id)||now.cityIds.includes(city.id)).map(city=>city.name)])].filter(Boolean);
    return {forceName:now.forceName||prior.forceName,ownBefore:new Set(prior.cityIds),ownNow:new Set(now.cityIds),besiegedBefore:new Set(prior.besiegedIds||[]),besiegedNow:new Set(now.besiegedIds),armyIds:new Set([...prior.armyIds,...now.armyIds]),armyNames:new Set([...prior.armyNames,...now.armyNames]),officerNames:new Set(prior.officerNames||[]),names,orderTerms:orderTerms.filter(term=>String(term).length>=2)}}

  static mentions(text,list){for(const name of list)if(name&&text.includes(name))return true;return false}

  static classify(event,ctx){const text=String(event.text||""),phase=event.phase||"",own=ctx.forceName,site=event.siteId||event.cityId||event.toCityId||null,ownSite=site&&(ctx.ownBefore.has(site)||ctx.ownNow.has(site)),ownArmy=event.armyId&&ctx.armyIds.has(event.armyId)||(event.armyIds||[]).some(id=>ctx.armyIds.has(id))||MessageCenter.mentions(text,ctx.armyNames),ownForce=own&&text.includes(own);
    // 紧急
    if(event.pending)return 3;
    if(phase==="天下外交"&&own&&text.includes(`向${own}宣战`))return 3;
    if(phase==="战果"&&site&&ctx.ownBefore.has(site)&&!ctx.ownNow.has(site))return 3;
    if(["攻城","守城","战斗"].includes(phase)&&site&&ctx.besiegedNow.has(site)&&!ctx.besiegedBefore.has(site))return 3;
    if(["野战","人物"].includes(phase)&&ownArmy&&/溃|败退|全军覆没|阵亡|被俘/.test(text))return 3;
    if(phase==="人事"&&(ownForce||MessageCenter.mentions(text,ctx.officerNames))&&/卒|殁|被俘|出奔|嗣位|让于|散为/.test(text))return 3;
    if(phase==="天下大事"&&ownForce)return 3;
    // 重要
    if(ctx.orderTerms.length&&MessageCenter.mentions(text,ctx.orderTerms))return 2;
    if(MessageCenter.militaryPhases.has(phase)&&(ownSite||ownArmy))return 2;
    if(["天下外交","外交"].includes(phase)&&ownForce)return 2;
    if(["天下大事","天下大势","事件","事件抉择"].includes(phase))return 2;
    if(phase==="人事"&&/卒|殁|嗣位|让于|散为/.test(text))return 2;
    // 一般 / 琐事
    if(ownSite||ownArmy||ownForce||MessageCenter.mentions(text,ctx.names)||MessageCenter.mentions(text,ctx.officerNames))return 1;
    return 0}

  // 给本日战报事件标注等级（lv，仅存一般及以上，琐事不存以省存档）。
  static annotate(report,ctx){for(const event of report?.events||[]){const level=MessageCenter.classify(event,ctx);if(level)event.lv=level;else delete event.lv}return report}
  static level(event){return event?.lv||0}

  // 收件箱：重要及以上的消息逐日累积，未读计数显示在任务栏，打开汇总后标为已读。
  static inbox(state){const box=state.policies.messageInbox??={items:[],read:0,sequence:0};box.items??=[];return box}
  static collect(state,report){const box=MessageCenter.inbox(state),added=[];for(const event of report?.events||[]){if(MessageCenter.level(event)<2)continue;const item={id:++box.sequence,turn:report.turn,date:report.date||"",lv:MessageCenter.level(event),phase:event.phase||"",text:String(event.text||"").slice(0,240),siteId:event.siteId||event.cityId||null,kind:["野战","攻城","守城","战斗","战法"].includes(event.phase)?"battle":null};box.items.unshift(item);added.push(item)}box.items=box.items.slice(0,MessageCenter.INBOX_LIMIT);return added}
  static unread(state){const box=MessageCenter.inbox(state);return box.items.filter(item=>item.id>box.read)}
  static markRead(state){const box=MessageCenter.inbox(state);box.read=box.sequence}
};
