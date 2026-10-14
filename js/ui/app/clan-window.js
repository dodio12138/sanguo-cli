// 世家窗口的接线：ClanUI 出标记，这里负责开窗、切页、筛选、交互（结好、联姻、征辟、劝输、徙豪强、抑制）与舆图标注。
// 另以全局代理处理任何窗口里的链接：data-clan-open 开世家详情、data-officer-open 开人物档案、data-city-open 开据点档案。
SanguoApp.define("clanWindow",app=>{
  const {$,state,map,toast,log}=app;
  function renderClan(){const box=$("clanContent"),top=box.scrollTop;box.innerHTML=ClanUI.render(state);box.scrollTop=top;const canvas=box.querySelector("[data-clan-map]");if(canvas)ClanUI.drawMap(canvas,state,canvas.dataset.clanMap)}
  function openClan(clanId=null){if(clanId&&state.engine.clanDef(clanId)){ClanUI.view.clanId=clanId;ClanUI.view.tab="detail"}renderClan();if(!$("clanDialog").open)$("clanDialog").showModal()}
  function refreshClan(){if($("clanDialog").open)renderClan()}
  const ACTIONS={court:"courtClan",marry:"marryClan",summon:"summonClanMember",contribute:"clanContribute",relocate:"relocateClan",suppress:"suppressClan"};
  const CONFIRM={suppress:"抑制豪强：没入半数家财，境内地产减半；该族积怨极深，族中仕于本方者忠诚下降。确定？",relocate:"徙豪强：本族在境内的地产减半、三成依附户改入编户，一部迁往都城；该族记怨。确定？"};
  $("clanButton").onclick=()=>openClan();
  $("clanContent").addEventListener("click",event=>{const tab=event.target.closest("[data-clan-tab]");if(tab){ClanUI.view.tab=tab.dataset.clanTab;renderClan();return}
    const act=event.target.closest("[data-clan-act]");if(act){const kind=act.dataset.clanAct,clanId=act.dataset.clan;if(CONFIRM[kind]&&!confirm(`${state.engine.clanFullName(clanId)} · ${CONFIRM[kind]}`))return;const events=[],result=state.engine[ACTIONS[kind]](state,clanId,state.playerForceId,events);toast(result.ok?result.text:result.error);if(result.ok){log(result.text);app.renderResources();renderClan()}return}
    const focus=event.target.closest("[data-clan-focus]");if(focus){const clanId=focus.dataset.clanFocus,rows=state.engine.clanDistribution(state,clanId);map.setClanFocus?.({name:state.engine.clanFullName(clanId),points:rows.map(row=>({x:row.x,y:row.y,share:row.share,seat:row.seat,color:state.data.forces.find(f=>f.id===row.forceId)?.color}))});const center=rows.find(row=>row.seat)||rows[0];if(center)map.focusOn?.({x:center.x,y:center.y});$("clanDialog").close();toast(`舆图已标出${state.engine.clanFullName(clanId)}的地产（再点选任一城池即可取消）`)}});
  $("clanContent").addEventListener("change",event=>{const field=event.target.dataset.clanField;if(!field)return;ClanUI.view[field]=event.target.value;renderClan()});
  // 全局链接代理：族名、人名、城池在任何窗口都可点击跳转
  document.addEventListener("click",event=>{const clan=event.target.closest("[data-clan-open]");if(clan){event.preventDefault();openClan(clan.dataset.clanOpen);return}
    const person=event.target.closest("[data-officer-open]");if(person){event.preventDefault();const officer=state.data.officers.find(o=>o.id===person.dataset.officerOpen);if(officer)app.openOfficerDetail(officer);return}
    const city=event.target.closest("[data-city-open]");if(city){event.preventDefault();const target=state.data.cities.find(c=>c.id===city.dataset.cityOpen);if(target)app.openCityDetail(target)}});
  state.addEventListener("selection",()=>{if(map.clanFocus)map.setClanFocus(null)});state.addEventListener("turn",refreshClan);state.addEventListener("restore",refreshClan);
  return {openClan};
});
