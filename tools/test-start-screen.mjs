import fs from "node:fs";

const source=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");
const paintBody=source.match(/const paint=\(\)=>\{([\s\S]*?)\n    \}\n    function beginNewGame/)?.[1];
if(!paintBody||!source.includes("else{if(refreshSlot)clearActive();finishResume();paint()}"))throw new Error("无法识别开局 paint 函数及其刷新恢复分支");
if(/;paint\(\)\s*$/.test(paintBody.trim()))throw new Error("paint 函数发生自递归，开局界面将卡死");
if(!source.includes('{id:"observer",name:"观察者"'))throw new Error("开局界面缺少观察者选项");
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
for(const id of ["startHomeView","startNewView","startLoadView","startSettingsView","startExitView","startSaveSlots","gameSaveSlots","gameSettingsDialog","chronicleEnabled","gameChronicleEnabled"])if(!html.includes(`id="${id}"`))throw new Error(`1.0 主菜单缺少页面或控件：${id}`);
for(const id of ["startForceStep","startSetupStep"])if(!new RegExp(`<section[^>]*id="${id}"[^>]*\\bhidden\\b`).test(html))throw new Error(`${id} 必须默认隐藏`);
for(const id of ["startScenarioStep","campaignDifficultyChoice","campaignSpeedChoice","startBriefTitle","startForceObjective"])if(!html.includes(`id="${id}"`))throw new Error(`分步开局缺少 ${id}`);
for(const code of ['$("campaignSelect").hidden=newStep>2','$("startScenarioStep").hidden=newStep>2','$("startForceStep").hidden=newStep>2','$("startSetupStep").hidden=newStep!==3',"scenarioPicked=true","if(newStep===2){newStep=3","if(newStep!==3)return",'newStep===3?"开始战局":"下一步"',"newStep>2){newStep--;paint();focusStep()","pickForce(hit.id)","drawMinimap();"]){if(!source.includes(code))throw new Error(`分步流程未覆盖 ${code}`)}
if(!source.includes('loading||!scenarioPicked||!force')||!source.includes('newStep!==3'))throw new Error("未确认剧本或未到设置步骤时不得直接建立战局");
if(!html.includes('<div id="campaignSelect" class="campaign-select"><section id="startScenarioStep"')||!html.includes('id="campaignMinimapCanvas"'))throw new Error("剧本与势力须同屏：左列剧本、右侧势力小地图与名录");
if(!html.includes('id="forceChoices" class="force-choices"></div><aside class="campaign-brief"'))throw new Error("势力介绍必须在独立区域，不能追加到势力长列表末尾");
if(source.includes("startBriefObserver"))throw new Error("开局介绍不能残留已移除观察器的声明或清理调用，否则进入战局会失败");
const startScreenAt=html.indexOf('id="startScreen"'),shellAt=html.indexOf('class="app-shell"'),editorButtonAt=html.indexOf('id="openMapEditor"');
if(!(startScreenAt>=0&&editorButtonAt>startScreenAt&&editorButtonAt<shellAt))throw new Error("1.0 舆图编辑器入口未放在开始界面");
if(!source.includes("window.MapEditor?.install(")||!source.includes("editorSource=()=>scenarioData"))throw new Error("1.0 开始界面舆图编辑器未绑定所选剧本数据");
const editorDialog=html.slice(html.indexOf('id="mapEditorDialog"'),html.indexOf('id="eventDialog"'));
for(const id of ["mapEditorCanvas","mapEditorOverlay","mapEditorHover"])if(!editorDialog.includes(`id="${id}"`))throw new Error(`舆图编辑器弹窗缺少悬停元素：${id}`);
if(editorDialog.indexOf('id="mapEditorOverlay"')<editorDialog.indexOf('id="mapEditorCanvas"'))throw new Error("舆图编辑器叠加层必须排主画布之后");
if(!editorDialog.includes('class="map-editor-canvas-wrap"')||!editorDialog.includes('class="map-editor-column"'))throw new Error("舆图编辑器缺少画布包裹层或读数列");
if(!editorDialog.includes('<select id="mapEditorValue">'))throw new Error("舆图编辑器笔刷取值应为包含全部取值的下拉框");
if(editorDialog.includes('id="mapEditorValueOptions"'))throw new Error("舆图编辑器笔刷取值不应再使用 datalist 输入框");
for(const id of ["mapEditorToolLayer","mapEditorToolCity","mapEditorToolRoad","mapEditorPanelLayer","mapEditorPanelCity","mapEditorPanelRoad"])if(!editorDialog.includes(`id="${id}"`))throw new Error(`舆图编辑器缺少工具分区：${id}`);
if(!editorDialog.includes('id="mapEditorPanelCity" hidden')||!editorDialog.includes('id="mapEditorPanelRoad" hidden'))throw new Error("舆图编辑器非当前工具面板应默认隐藏");
if(editorDialog.indexOf('id="mapEditorPanelLayer"')>editorDialog.indexOf('id="mapEditorPanelCity"'))throw new Error("舆图编辑器工具面板顺序应为图层/据点/道路");
if(!editorDialog.includes('id="mapEditorElements"'))throw new Error("舆图编辑器缺少显示元素分组");
for(const key of ["grid","cities","roads","counties","waterways","landmarks"])if(!editorDialog.includes(`data-editor-element="${key}"`))throw new Error(`舆图编辑器缺少显示元素开关：${key}`);
const editorSource=fs.readFileSync(new URL("../js/ui/map-editor.js",import.meta.url),"utf8");
if(!editorSource.includes("applyTool(")||!editorSource.includes("roadPick")||!editorSource.includes("setTool(\"city\")"))throw new Error("舆图编辑器未按工具分派画布交互");
if(!editorSource.includes('activeTool==="city"')||!editorSource.includes('activeTool==="road"'))throw new Error("舆图编辑器画布点击未区分据点与道路工具");
if(!editorSource.includes("dialog.classList.add(\"os-dialog-maximized\")"))throw new Error("舆图编辑器打开时未最大化");
if(!editorSource.includes("valueOptions("))throw new Error("舆图编辑器笔刷取值未使用候选取值");
if(!editorSource.includes("elementPresets={layer:")||!editorSource.includes("elementState")||!editorSource.includes("elementVisible("))throw new Error("舆图编辑器未按工具过滤显示元素");
if(!editorSource.includes("syncElements("))throw new Error("舆图编辑器显示元素开关未与工具联动");
if(editorSource.includes("mapEditorValuePick"))throw new Error("舆图编辑器仍残留已废弃的取值选择器");
const css=fs.readFileSync(new URL("../css/ui-polish.css",import.meta.url),"utf8");if(!css.includes(".start-screen [hidden]{display:none!important}"))throw new Error("主菜单的隐藏页面可能被 flex/grid 样式重新显示");
const desktopCss=fs.readFileSync(new URL("../css/os-desktop.css",import.meta.url),"utf8");
for(const pseudo of ["scrollbar","scrollbar-track","scrollbar-thumb","scrollbar-corner"]){const rule=desktopCss.split("\n").find(line=>line.includes(`::-webkit-${pseudo}{`));if(!rule?.includes(".start-screen *")||!rule?.includes(".terminal-select-list")||!rule?.includes(".os-window"))throw new Error(`开局面板、下拉列表与桌面窗口未共用 ${pseudo} 主题`)}
if(!css.includes(".start-grid>section{min-width:0;scrollbar-gutter:stable;overscroll-behavior:contain;"))throw new Error("开局滚动面板未保留滚动槽与独立滚动边界");
for(const rule of [".campaign-pane{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;", ".campaign-brief{min-width:0;min-height:0;overflow:auto;", ".campaign-force-layout{display:grid;", ".start-screen .start-footer{flex:0 0 auto!important;"]){if(!css.includes(rule))throw new Error(`分步布局缺少裁切与滚动约束：${rule}`)}
if(!source.includes("sanguo-cli.slot.")||!source.includes("resumeSlot"))throw new Error("缺少本地多槽存档管理");
for(const id of ["newSaveName","gameSaveName","updateCurrentSave","createSaveCopy"])if(!html.includes(`id="${id}"`))throw new Error(`命名档案管理缺少 ${id}`);
if(html.includes('id="newSaveSlotChoice"')||source.includes('rows=["1","2","3"]'))throw new Error("存档界面不能保留固定三卡槽");
if(!source.includes('pendingNewSlot=SaveLibrary.newId();beginNewGame()')||!source.includes('await SaveLibrary.initialize()'))throw new Error("新游戏必须使用独立编号且先加载旧存档库");
const catalog=JSON.parse(fs.readFileSync(new URL("../game/data/history/scenarios/index.json",import.meta.url),"utf8"));
{const years=catalog.scenarios.map(item=>Number(item.id.split("_")[0]));if(catalog.scenarios.length<6||years.some((year,index)=>index&&year<=years[index-1]))throw new Error("剧本未按时间排列")}
if(!source.includes('scenarios.find(s=>s.id===data.scenario.id)'))throw new Error("更改列表顺序后必须保持选中剧本与实际数据一致");
if(!source.includes('activeSessionKey="sanguo.active-session.v1"')||!source.includes("queueMicrotask(()=>resumeSlot(refreshSlot))")||!source.includes("clearActive();location.reload()"))throw new Error("缺少刷新自动恢复与显式返回主菜单逻辑");
if(!html.includes('document.documentElement.classList.add("resume-pending")')||!html.includes("html.resume-pending .start-screen")||!source.includes('finishResume=()=>document.documentElement.classList.remove("resume-pending")'))throw new Error("刷新恢复期间仍可能闪现主菜单");
console.log("开局界面结构通过：剧本势力同屏与小地图 / 独立势力介绍 / 上一步 / 阻止跳步开局 / 设置与多槽存档 / 刷新恢复战局");
