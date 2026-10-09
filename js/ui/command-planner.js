window.CommandPlanner = class CommandPlanner {
  static open({command,state,contextCity,dialog,form,title,toast}) {
    if(FiscalUI.open({command,state,contextCity,dialog,form,title,toast}))return true;
    const ownCities=state.data.cities.filter(c=>c.force===state.playerForceId),enemyCities=state.data.cities.filter(c=>![state.playerForceId,"neutral"].includes(c.force)),allCities=state.data.cities,ownArmies=state.data.armies.filter(a=>a.force===state.playerForceId),enemyArmies=state.data.armies.filter(a=>a.force!==state.playerForceId),ownOfficers=state.data.officers.filter(o=>o.force===state.playerForceId&&o.status==="serving"),enemyOfficers=state.data.officers.filter(o=>![state.playerForceId,"neutral"].includes(o.force)&&o.status==="serving"),talents=state.data.officers.filter(o=>["hidden","discovered","free","prisoner"].includes(o.status)),forces=state.data.forces.filter(f=>![state.playerForceId,"neutral"].includes(f.id)),items=state.data.items||[],corps=state.corps||[],fields=[];
    const add=(name,label,values,selected=null)=>{if(values.length)fields.push({name,label,values,selected})};
    const armyCommands=new Set(["disband_army","reinforce","return_garrison","redeploy","assemble","move","forced_march","camp","ambush","raid","explore","retreat","train_troops"]),ownOfficerCommands=new Set(["transfer_officer","recall_officer","exile_officer","reward_officer","punish_officer","grant_item","confiscate_item","appoint_office","dismiss_office","promote_office","demote_office","designate_heir","set_advisor","study","personal_training","travel","personal_investigation","rest"]),enemyOfficerCommands=new Set(["poach_officer","sow_discord","bribe","instigate_defection"]),enemyCityCommands=new Set(["scout_city","investigate_route","investigate_terrain","incite","establish_inside_contact","sabotage","spread_rumor"]),twoCityCommands=new Set(["build_road","transfer_gold","transfer_food","transport","establish_supply_route"]),amountCommands=new Set(["buy_food","sell_food","transfer_gold","transfer_food","transport","set_storage","requisition_labor","reinforce","return_garrison","recruit_troops","exchange_gold","exchange_food","set_tax_rate"]);
    if(command.id==="recruit_officer")add("officer1","目标人物",talents.filter(o=>["discovered","free"].includes(o.status)||o.status==="prisoner"&&o.capturedBy===state.playerForceId));
    else if(command.id==="release_prisoner")add("officer1","目标人物",talents.filter(o=>o.status==="prisoner"&&o.capturedBy===state.playerForceId));
    else if(enemyOfficerCommands.has(command.id)||command.id==="investigate_person")add("officer1","目标人物",enemyOfficers);
    else if(ownOfficerCommands.has(command.id))add("officer1","执行/目标人物",ownOfficers);
    if(command.categoryId==="relationship"){add("officer1","发起人",ownOfficers);add("officer2",command.id==="recommend"?"被推荐人":"交往对象",command.id==="recommend"?talents:ownOfficers)}
    if(command.id==="create_corps"){add("officer1","负责人",ownOfficers);add("army1","所属部队",ownArmies);add("city1","辖区城市",ownCities,contextCity?.id)}
    if(["disband_corps","adjust_jurisdiction","set_leader"].includes(command.id))add("corps1","军团组织",corps);
    if(command.id==="adjust_jurisdiction")add("city1","增加辖区",ownCities,contextCity?.id);
    if(command.id==="set_leader")add("officer1","新负责人",ownOfficers);
    if(armyCommands.has(command.id))add("army1","己方军团",ownArmies);
    if(command.id==="scout_army")add("army1","目标军团",enemyArmies);
    if(command.id==="form_army"){add("city1","编军城市",ownCities,contextCity?.id);add("officer1","主将",ownOfficers);fields.push({name:"amount",label:"编成兵力",number:true,value:3000})}
    if(["redeploy","assemble","move","forced_march","raid","retreat"].includes(command.id))add("city1","目的地",command.id==="raid"?enemyCities:allCities,contextCity?.id);
    if(enemyCityCommands.has(command.id))add("city1","目标城市",enemyCities,contextCity?.id);
    if(["transfer_officer","travel"].includes(command.id))add("city1","目标城市",ownCities,contextCity?.id);
    if(command.id==="personal_investigation")add("city1","调查城市",allCities,contextCity?.id);
    if(command.id==="search_talent"||command.categoryId==="domestic"||["construct_building","repair","build_warehouse","fortify","waterworks","set_storage","requisition_labor","promote_technology"].includes(command.id))add("city1","己方城市",ownCities,contextCity?.id);
    if(twoCityCommands.has(command.id)){add("city1","起始城市",ownCities,contextCity?.id);add("city2","目标城市",ownCities)}
    if(command.id==="exchange_land"){add("city1","交出城市",ownCities);add("city2","换入城市",enemyCities)}
    if(command.categoryId==="diplomacy"){add("force1","外交对象",forces);if(["coalition","request_war_entry"].includes(command.id))add("force2","讨伐/参战目标",forces)}
    if(command.id==="request_reinforcements")add("city1","援军目的地",ownCities,contextCity?.id);
    if(command.id==="grant_item")add("item1","授予宝物",items.filter(i=>!i.owner));
    if(command.id==="confiscate_item")add("item1","没收宝物",items.filter(i=>i.owner));
    const choices={set_development_policy:["均衡","农业优先","商业优先"],set_diplomatic_policy:["中立","强硬"],set_fiscal_policy:["稳健","扩张"],set_authority:["逐项审批","自动执行"],research:["农政","军制","转运","吏治"],reform:["农政","军制","转运","吏治"]};
    if(command.id==="construct_building")add("building","建筑类型",Object.entries(state.data.rules.buildings||{}).map(([id,def])=>({id,name:`${def.name} · ${def.cost}金`})));
    if(choices[command.id])add("choice","执行选项",choices[command.id].map(name=>({id:name,name})));
    if(command.id==="set_military_goal")add("city1","军事目标",enemyCities);
    if(amountCommands.has(command.id))fields.push({name:"amount",label:command.id==="set_tax_rate"?"税率 %":command.id==="set_storage"?"保留比例 %":"数量",number:true,value:command.id==="set_tax_rate"?15:command.id==="set_storage"?40:1000});
    if(!fields.length)return false;
    title.textContent=`${command.categoryName} · ${command.name}`;
    form.innerHTML=`<p class="planner-description">${command.description||`${command.name}：加入本日命令队列。`}</p>`+fields.map(field=>field.number?`<label>${field.label}<input name="${field.name}" type="number" min="0" value="${field.value}"></label>`:`<label>${field.label}<select name="${field.name}">${field.values.map(v=>`<option value="${v.id}" ${v.id===field.selected?"selected":""}>${v.name}</option>`).join("")}</select></label>`).join("")+`<div class="planner-summary">命令将在日终统一结算。</div><div class="planner-actions"><button type="button" data-cancel>取消</button><button class="primary" type="submit">加入本日命令</button></div>`;
    form.querySelector("[data-cancel]").onclick=()=>dialog.close();
    form.onsubmit=event=>{event.preventDefault();const value=name=>form.elements[name]?.value,ids=prefix=>fields.filter(f=>f.name.startsWith(prefix)&&!f.number).map(f=>value(f.name)).filter(Boolean),cityIds=ids("city"),armyIds=ids("army"),officerIds=ids("officer"),forceIds=ids("force"),itemIds=ids("item"),corpsIds=ids("corps"),building=value("building");if((cityIds.length>1&&new Set(cityIds).size<cityIds.length)||(forceIds.length>1&&new Set(forceIds).size<forceIds.length)||(officerIds.length>1&&new Set(officerIds).size<officerIds.length)){toast("起始与目标不能相同");return}const targetIds=[...cityIds,...armyIds,...officerIds,...forceIds,...itemIds,...corpsIds],pool=[...state.data.cities,...state.data.armies,...state.data.officers,...state.data.forces,...items,...corps],names=targetIds.map(id=>pool.find(x=>x.id===id)?.name).filter(Boolean),choice=value("choice"),buildingName=state.data.rules.buildings?.[building]?.name,amount=value("amount")?Number(value("amount")):null,text=`${command.categoryName}/${command.name} ${[...names,choice,buildingName].filter(Boolean).join(" ")}${amount!==null?` ${amount}`:""}`,order=state.addStructuredOrder(command.id,{text,targetIds,cityIds,armyIds,officerIds,forceIds,itemIds,amount,options:{choice,corpsIds,building}});if(order){toast(`${command.name}已加入本日命令`);dialog.close()}};
    dialog.showModal();return true;
  }
};
