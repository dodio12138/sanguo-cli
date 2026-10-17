// RuleEngine 分模块：出征军职——主将、副将（可多名）、军师／参军、军需官、军司马、部将若干。
// 不设规模门槛：职位空缺时由主将在负荷允许时兼领（按八成能力），否则由普通军吏（45 分）代办；
// 部队大了主将负荷自然过高，界面标红提示添人。部将可分领一部分兵（如全部骑兵），分遣小队须由随军人物带队。
(()=>{
const ROLES={commander:{name:"主将",stats:["command","war"]},deputy:{name:"副将",stats:["command","war"]},staff:{name:"军师",stats:["intelligence","command"]},quartermaster:{name:"军需官",stats:["politics","intelligence"]},marshal:{name:"军司马",stats:["command","politics"]},lieutenant:{name:"部将",stats:["command","war"]}};
const UNIT_TYPES=["infantry","cavalry","archers"];
const active=o=>o&&["serving","injured"].includes(o.status);
Object.assign(window.RuleEngine.prototype,{
  armyRoles(){return ROLES},
  armyLieutenants(army){return (army?.lieutenants||[]).filter(row=>row&&row.officerId)},
  // 随军人物：除主将外，全军所有在职将校（副将、军师、军需官、军司马、部将）。
  armyMembers(army){const out=[],push=(id,role)=>{const o=id&&this.officerById(id);if(active(o)&&o.force===army.force&&!out.some(x=>x.officer.id===o.id))out.push({officer:o,role})};push(army.commanderOfficerId,"commander");for(const id of army.deputyOfficerIds||[])push(id,"deputy");push(army.staffOfficerId,"staff");push(army.quartermasterOfficerId,"quartermaster");push(army.marshalOfficerId,"marshal");for(const row of this.armyLieutenants(army))push(row.officerId,"lieutenant");return out},
  armyEscorts(army){return this.armyMembers(army).filter(x=>x.role!=="commander")},
  // 部将所领兵：按兵种取不超过全军现有兵数，超出时按比例收缩（伤亡后自动缩小）。
  lieutenantShares(army){const rows=this.armyLieutenants(army).filter(row=>active(this.officerById(row.officerId))),units=army.units||{infantry:army.soldiers||0},out=rows.map(row=>({officerId:row.officerId,units:{}}));for(const type of UNIT_TYPES){const want=rows.map(row=>Math.max(0,Math.floor(row.units?.[type]||0))),total=want.reduce((a,b)=>a+b,0),have=Math.max(0,units[type]||0),scale=total>have&&total?have/total:1;want.forEach((n,i)=>out[i].units[type]=Math.floor(n*scale))}return out},
  armyLoadModel(army){const cfg=this.officeConfig().loads.army||{},soldiers=army.soldiers||0,shares=this.lieutenantShares(army),led=shares.reduce((n,s)=>n+UNIT_TYPES.reduce((m,t)=>m+(s.units[t]||0),0),0),busy=Boolean(army.route?.length||army.fieldPosition||army.siegeTarget||army.engagementId);
    return {command:(cfg.commander_base??20)+Math.max(0,soldiers-led)/1000*(cfg.per_1k_soldiers??1.5)+(busy?cfg.campaign??10:0),staff:(cfg.staff_base??8)+soldiers/3000,quartermaster:(cfg.quartermaster_base??6)+soldiers/2000*(busy?1.5:1),marshal:(cfg.marshal_base??6)+soldiers/2500,lieutenant:share=>(cfg.lieutenant_base??4)+UNIT_TYPES.reduce((m,t)=>m+(share.units[t]||0),0)/1000*(cfg.per_1k_soldiers??1.5),shares}},
  // 军职负荷（由 offices.js 的负荷汇总调用）：主将常务；副将分担主将三成；军需、军务空缺时主将在负荷允许内兼领。
  armyOfficeLoads(add,pending){const share=this.officeConfig().assistant_share?.deputy??.3;for(const army of this.data.armies||[]){const commander=army.commanderOfficerId&&this.officerById(army.commanderOfficerId);if(!commander||commander.force!==army.force)continue;const m=this.armyLoadModel(army),meta=role=>({armyId:army.id,tier:"army",role}),deputies=(army.deputyOfficerIds||[]).map(id=>this.officerById(id)).filter(o=>active(o)&&o.force===army.force),deputyShare=deputies.length?Math.min(share,deputies.reduce((n,o)=>n+share*Math.min(1,this.officerRawScore(o,ROLES.deputy.stats)/80),0)):0;
      add(commander,`army:${army.id}:commander`,`${army.name}主将`,m.command*(1-deputyShare),ROLES.commander.stats,meta("commander"));for(const o of deputies)add(o,`army:${army.id}:deputy:${o.id}`,`${army.name}副将`,m.command*deputyShare/deputies.length+4,ROLES.deputy.stats,meta("deputy"));
      for(const role of ["staff","quartermaster","marshal"]){const o=army[`${role}OfficerId`]&&this.officerById(army[`${role}OfficerId`]);if(active(o)&&o.force===army.force)add(o,`army:${army.id}:${role}`,`${army.name}${ROLES[role].name}`,m[role],ROLES[role].stats,meta(role));else if(role!=="staff")pending.push({army,commander,role,load:m[role]})}
      for(const s of m.shares){const o=this.officerById(s.officerId);if(active(o)&&o.force===army.force)add(o,`army:${army.id}:lieutenant:${o.id}`,`${army.name}部将`,m.lieutenant(s),ROLES.lieutenant.stats,meta("lieutenant"))}}},
  // 某项军务的实际分数：在任者能力×负荷效率；空缺时主将兼领按八成；都不行由普通军吏 45 分。
  armyDutyProfile(army,role){const def=ROLES[role],id=role==="deputy"?army.deputyOfficerIds?.[0]:army[`${role}OfficerId`],o=id&&this.officerById(id);if(active(o)&&o.force===army.force){const raw=this.officerRawScore(o,def.stats),efficiency=this.dutyEfficiency(o.id);return {role,officer:o,raw:Math.round(raw),score:raw*efficiency,efficiency,mode:"appointed"}}
    const head=this.administrativeLoads().armyConcurrent?.get(`${army.id}:${role}`),commander=head&&this.officerById(head);if(commander){const raw=this.officerRawScore(commander,def.stats),efficiency=this.dutyEfficiency(commander.id)*.8;return {role,officer:null,concurrent:commander,raw:Math.round(raw),score:raw*efficiency,efficiency,mode:"concurrent"}}
    return {role,officer:null,raw:45,score:45,efficiency:1,mode:"default"}},
  // 军需官：军粮日耗 ×0.92（90 分）、轻松携粮天数 ×1.15、补给车队被截损失 ×0.8。
  quartermasterFactor(army,kind){const s=this.armyDutyProfile(army,"quartermaster").score;return kind==="ration"?this.officeBonus(s,.92,1.04):kind==="carry"?this.officeBonus(s,1.15,.95):kind==="raid"?this.officeBonus(s,.8,1.1):kind==="convoy"?this.officeBonus(s,.9,1.05):1},
  // 军司马：行军与野外组织度损耗 ×0.8、休整恢复 ×1.2（90 分）。
  marshalArmyFactor(army,kind){const s=this.armyDutyProfile(army,"marshal").score;return kind==="loss"?this.officeBonus(s,.8,1.1):kind==="recover"?this.officeBonus(s,1.2,.9):1},
  // 军师：受伏时士气打击 ×0.5（90 分）。
  staffAmbushFactor(army){const o=army.staffOfficerId&&this.officerById(army.staffOfficerId);if(!active(o)||o.force!==army.force)return 1;return this.officeBonus(this.officerRawScore(o,ROLES.staff.stats)*this.dutyEfficiency(o.id),.5,1.1)},
  // 副将接替：主将缺（阵亡、被俘、离任）时由首位副将代行主将。
  promoteDeputy(army,events){const ids=army.deputyOfficerIds||[];for(const id of ids){const o=this.officerById(id);if(!active(o)||o.force!==army.force)continue;army.deputyOfficerIds=ids.filter(x=>x!==id);army.commanderOfficerId=o.id;army.commander=o.name;events?.push?.({phase:"编制",armyId:army.id,text:`${army.name}主将出缺，副将${o.name}接替指挥`});return o}return null},
  // 军职任免（任命面板）：主将、副将若干、军师、军需官、军司马、部将若干（各领一部分兵）。同一人在本军只任一职。
  setArmyOffices(armyId,assignments={}){this.invalidateDuties();this.initializeAdministration();const army=this.data.armies.find(a=>a.id===armyId);if(!army)return {ok:false,error:"军团不存在"};if(army.fieldPosition)return {ok:false,error:"野外小队须撤回据点后更换军职"};
    const lieutenants=(assignments.lieutenants||[]).filter(row=>row?.officerId),deputies=[...new Set((assignments.deputies||[]).filter(Boolean))],single=["commander","staff","quartermaster","marshal"].map(role=>assignments[role]||null),ids=[...single.filter(Boolean),...deputies,...lieutenants.map(row=>row.officerId)];
    if(new Set(ids).size!==ids.length)return {ok:false,error:"同一人在本军只能任一职"};
    const valid=id=>this.data.officers.some(o=>o.id===id&&o.force===army.force&&o.city===army.city&&["serving","injured"].includes(o.status)&&!this.isOfficerAssigned(o,army.id));if(ids.some(id=>!valid(id)))return {ok:false,error:"军职只能任命驻地内未编入其他军团的人物"};
    const units=army.units||{infantry:army.soldiers||0};for(const type of UNIT_TYPES){const sum=lieutenants.reduce((n,row)=>n+Math.max(0,Math.floor(Number(row.units?.[type])||0)),0);if(sum>(units[type]||0))return {ok:false,error:`部将所领${({infantry:"步兵",cavalry:"骑兵",archers:"弩兵"})[type]}合计超过全军现有 ${units[type]||0} 人`}}
    if(assignments.commander){const o=this.officerById(assignments.commander);army.commanderOfficerId=o.id;army.commander=o.name}else{army.commanderOfficerId=null;army.commander="普通将领"}
    army.deputyOfficerIds=deputies;army.staffOfficerId=assignments.staff||null;army.quartermasterOfficerId=assignments.quartermaster||null;army.marshalOfficerId=assignments.marshal||null;army.lieutenants=lieutenants.map(row=>({officerId:row.officerId,units:Object.fromEntries(UNIT_TYPES.map(t=>[t,Math.max(0,Math.floor(Number(row.units?.[t])||0))]))}));
    if(Number.isFinite(assignments.target))army.reinforcementTarget=Math.max(100,Math.round(assignments.target));this.invalidateDuties();this.syncAllArmyOfficerLocations(true);this.notifyAppointments?.(this.popState);return {ok:true,army}},
  // AI：主将负荷超过 80% 时，从同城闲置人物中依次补军需官、军司马、军师、副将。
  aiStaffArmies(state,forceId){let filled=0;for(const army of this.data.armies.filter(a=>a.force===forceId&&!a.fieldPosition&&!a.detachedFrom)){const commander=army.commanderOfficerId&&this.officerById(army.commanderOfficerId);if(!commander)continue;const load=this.officerLoad(commander.id);if(!load||load.rate<=.8)continue;
      const free=this.data.officers.filter(o=>o.force===forceId&&o.city===army.city&&o.status==="serving"&&!this.isOfficerAssigned(o)&&!(this.officerLoad(o.id)?.rate>.5));for(const role of ["quartermaster","marshal","staff","deputy"]){if(role==="deputy"?(army.deputyOfficerIds||[]).length:army[`${role}OfficerId`])continue;const pick=free.filter(o=>!this.armyMembers(army).some(m=>m.officer.id===o.id)).sort((a,b)=>this.officerRawScore(b,ROLES[role].stats)-this.officerRawScore(a,ROLES[role].stats))[0];if(!pick||this.officerRawScore(pick,ROLES[role].stats)<50)continue;if(role==="deputy")army.deputyOfficerIds=[pick.id];else army[`${role}OfficerId`]=pick.id;free.splice(free.indexOf(pick),1);filled++}}
    if(filled){this.invalidateDuties();this.syncAllArmyOfficerLocations(true)}return filled}
});
})();
