// 小队规划：分兵、地形格目标、任务与路线预览，共用实际规则验证。
SanguoApp.define('fieldOperations',app=>{
  const {$,state,map,esc,toast}=app;
  let picking=false,reopen=null;
  const clear=()=>{map.fieldRoutePreview=null;map.onFieldTargetPick=null;map.draw()};
  $('plannerDialog').addEventListener('close',()=>{if(!picking)clear()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&picking){event.preventDefault();picking=false;clear();reopen?.()}});
  function openFieldPlanner(initialArmy=null,initialMission=null,draft=null){
    const armies=state.data.armies.filter(a=>a.force===state.playerForceId),army=initialArmy||armies[0];if(!army){toast('当前没有可用部队');return}
    const engine=state.engine,rules=engine.skirmishRules(),position=engine.armyWorldPosition(army),selected=state.selected?.value,target=draft?.target||((state.selected?.type==='cell'&&selected)?selected:position);
    $('plannerTitle').textContent='小队行动 · 突击、阻击与袭扰';
    $('plannerForm').innerHTML=`<p class="planner-description planner-wide">百至${rules.max_soldiers.toLocaleString()}人可离开官道逐格行动。突击接敌后撤回；阻击迟滞路过敌军；袭扰削弱组织并择机截粮。驻城开拔时就仓领粮，野外消耗随军粮；撤回己方据点后才可整补。</p><label class="planner-wide">部队<select name="fieldArmy">${armies.map(a=>`<option value="${a.id}" ${a.id===army.id?'selected':''}>${esc(a.name)} · ${a.soldiers.toLocaleString()} 人${a.fieldPosition?' · 野外':''}</option>`).join('')}</select></label><label>任务<select name="fieldMission">${['strike','block','harass','hold','withdraw'].map(m=>`<option value="${m}" ${m===(draft?.mission||initialMission||army.fieldOrder?.mission||'harass')?'selected':''}>${engine.fieldMissionName(m)}</option>`).join('')}</select></label><label>分遣人数（0 为现有整队）<input name="detachSoldiers" type="number" min="0" max="${rules.max_soldiers}" step="100" value="${draft?.detachSoldiers??(army.soldiers>rules.max_soldiers?1000:0)}"></label><label>目标横格<input name="fieldX" type="number" min="0" max="${state.data.map.width-1}" value="${Math.round(target?.x||0)}"></label><label>目标纵格<input name="fieldY" type="number" min="0" max="${state.data.map.height-1}" value="${Math.round(target?.y||0)}"></label><div class="planner-wide detail-actions"><button type="button" data-field-pick>在军事地图选点</button></div><div class="planner-summary planner-wide" id="fieldPlanSummary" aria-live="polite"></div><div class="planner-actions"><button type="button" data-cancel>取消</button><button class="primary" type="submit">加入本日命令</button></div>`;
    const form=$('plannerForm'),values=()=>({army:state.data.armies.find(a=>a.id===form.elements.fieldArmy.value),mission:form.elements.fieldMission.value,detachSoldiers:Number(form.elements.detachSoldiers.value),target:{x:Number(form.elements.fieldX.value),y:Number(form.elements.fieldY.value)}});
    const refresh=()=>{
      const v=values(),at=engine.armyWorldPosition(v.army);let goal=v.target;if(v.mission==='withdraw')goal=state.data.cities.filter(c=>c.force===v.army.force&&!engine.isCityBesieged(c)).sort((a,b)=>Math.hypot(a.x-at.x,a.y-at.y)-Math.hypot(b.x-at.x,b.y-at.y))[0];
      const preview=engine.fieldRoute(v.army,goal,v.detachSoldiers||v.army.soldiers),food=engine.armySupplyStatus(state,v.army),count=v.detachSoldiers||v.army.soldiers;form.elements.fieldX.disabled=form.elements.fieldY.disabled=v.mission==='withdraw';
      const invalid=count<100||count>rules.max_soldiers||v.detachSoldiers&&v.army.soldiers-v.detachSoldiers<100;
      $('fieldPlanSummary').textContent=invalid?`小队须为 100—${rules.max_soldiers} 人，原军至少留百人。`:!preview.ok?preview.error:`当前位置（${at.x.toFixed(1)},${at.y.toFixed(1)}） →（${goal.x},${goal.y}） · ${engine.fieldMissionName(v.mission)}\n${count.toLocaleString()} 人 · 约 ${preview.days} 日 · 渡河 ${preview.crossings} 处 · 现有携粮约 ${Math.floor(food.carriedDays)} 日${engine.isStationed(v.army)?"，出发时就仓补足":""}\n组织度 ${engine.armyOrganization(state,v.army)} / 100；穿越复杂地形更慢，野外接敌会损失组织。`;
      map.fieldRoutePreview=preview.ok?preview.points:null;map.draw();return {...v,preview,invalid};
    };
    form.oninput=refresh;form.onchange=refresh;
    form.querySelector('[data-cancel]').onclick=()=>$('plannerDialog').close();
    form.querySelector('[data-field-pick]').onclick=()=>{
      const v=values();picking=true;reopen=()=>openFieldPlanner(v.army,v.mission,v);$('armyDetailDialog').close();$('plannerDialog').close();state.setLayer('military');
      toast('在地图上点击目标陆地格；Esc 取消选点');map.onFieldTargetPick=cell=>{picking=false;clear();openFieldPlanner(v.army,v.mission,{...v,target:{x:cell.x,y:cell.y}})};
    };
    form.onsubmit=event=>{event.preventDefault();const v=refresh();if(!v.preview.ok||v.invalid){toast($('fieldPlanSummary').textContent);return}const order=state.addStructuredOrder('field_operation',{armyIds:[v.army.id],targetIds:[v.army.id],text:`行军/小队行动 ${v.army.name} ${engine.fieldMissionName(v.mission)}（${v.target.x},${v.target.y}）`,options:{mission:v.mission,target:v.target,detachSoldiers:v.detachSoldiers}});if(order){toast('小队行动已加入本日命令');$('plannerDialog').close()}};
    refresh();$('plannerDialog').showModal();
  }
  return {openFieldPlanner};
});
