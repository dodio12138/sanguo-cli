// 幕府窗口的接线：CommandUI 出标记，这里负责开窗、切页、展开辖郡与执行任免、方针、指令。
SanguoApp.define("forceCommandWindow",app=>{
  const {$,state,toast}=app;
  // 幕府：本势力官制图与方面指挥
  let commandTab="chart";
  function openForceCommand(tab=commandTab){commandTab=tab;const box=$("forceCommandContent"),top=box.scrollTop;box.innerHTML=CommandUI.render(state,commandTab);box.scrollTop=top;if(!$("forceCommandDialog").open)$("forceCommandDialog").showModal()}
  function refreshForceCommand(){if($("forceCommandDialog").open)openForceCommand(commandTab)}
  $("forceCommandButton").onclick=()=>openForceCommand();
  $("forceCommandContent").addEventListener("click",event=>{const tab=event.target.closest("[data-cmd-tab]");if(tab){openForceCommand(tab.dataset.cmdTab);return}const expand=event.target.closest("[data-cmd-expand]");if(expand){event.preventDefault();const id=expand.dataset.cmdExpand;CommandUI.expanded.has(id)?CommandUI.expanded.delete(id):CommandUI.expanded.add(id);openForceCommand("chart");return}const pick=event.target.closest("[data-post-select]");if(pick){CommandUI.selected=pick.dataset.postSelect||null;openForceCommand("posts");return}const action=event.target.closest("[data-cmd-action]");if(!action)return;if(action.dataset.cmdAction==="remove"&&!confirm("召还此方面大员？其忠诚将下降，辖区归上级。"))return;const result=CommandUI.act(state,action.dataset.cmdAction,action.dataset);toast(result.ok?result.text:result.error);if(result.ok&&result.text)state.reports[0]?.events?.push({phase:"方面",text:result.text});openForceCommand(commandTab);app.renderResources()});
  $("forceCommandContent").addEventListener("change",event=>{const target=event.target;if(target.dataset.cmdCheck){const list=CommandUI.draft[target.dataset.cmdCheck],index=list.indexOf(target.value);if(target.checked&&index<0)list.push(target.value);if(!target.checked&&index>=0)list.splice(index,1);return}const field=target.dataset.cmdField;if(!field)return;if(field.startsWith("central_")){const result=state.engine.setCentralOffice(state,state.playerForceId,field.slice(8),target.value||null);toast(result.ok?result.text:result.error);openForceCommand(commandTab);return}CommandUI.draft[field]=target.value;if(["kind","policy","directive"].includes(field))openForceCommand(commandTab)});
  state.addEventListener("turn",refreshForceCommand);state.addEventListener("restore",refreshForceCommand);
  return {};
});
