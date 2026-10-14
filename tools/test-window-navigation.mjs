import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");
await import("../js/ui/fiscal-ui.js");
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});
const source=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const manager=fs.readFileSync(new URL("../js/ui/os-window-manager.js",import.meta.url),"utf8");
class Element {
  dataset={};style={left:"110px",top:"80px",zIndex:"1"};open=false;scrollTop=47;textContent="";nodes=[];
  classList={add(){},remove(){},toggle(){}};
  constructor(id=""){this.id=id}
  set innerHTML(value){
    this.markup=value;this.nodes=[];this.elements={};
    for(const match of value.matchAll(/<(button|tr|input|select)\b([^>]*)>/g)){
      const node=new Element();node.tag=match[1];node.attributes={};
      for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){
        node.attributes[attr[1]]=attr[2]??"";
        if(attr[1].startsWith("data-"))node.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2]??"";
      }
      if(node.attributes.name){
        node.value=node.attributes.value??"";
        if(node.tag==="select"){
          const body=value.slice(match.index+match[0].length).split("</select>")[0];
          const options=[...body.matchAll(/<option\b([^>]*)>/g)];
          node.value=(options.find(option=>option[1].includes("selected"))||options[0])?.[1].match(/value="([^"]*)"/)?.[1]??"";
        }
        this.elements[node.attributes.name]=node;
      }
      this.nodes.push(node);
    }
  }
  get innerHTML(){return this.markup||""}
  insertAdjacentHTML(_,value){this.innerHTML=this.innerHTML+value}
  querySelectorAll(selector){const attribute=selector.match(/^\[([^\]]+)\]$/)?.[1];return this.nodes.filter(node=>attribute in node.attributes)}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  addEventListener(type,fn){this[`on${type}`]=fn}
  showModal(){this.open=true;this.style.zIndex=String(++z)}
  close(){this.open=false}
  focus(){}
  closest(){return this}
  matches(selector){return selector===":modal"&&this.modal===true}
}
let z=10;
const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
const document={querySelectorAll:()=>[...elements.values()].filter(element=>element.open)};
// 界面模块：载入注册表与相关模块，以桩对象充当壳的 app 上下文；壳内的关窗与迷雾判定函数原样取自 app.js
const loader={},context=vm.createContext({$,state,document,MapGrid,FiscalUI,getComputedStyle:element=>element.style,loader});context.window=context;
vm.runInContext(fs.readFileSync(new URL("../js/ui/command-planner.js",import.meta.url),"utf8").replace("window.CommandPlanner","globalThis.CommandPlanner"),context);
vm.runInContext(fs.readFileSync(new URL("../js/ui/population-ui.js",import.meta.url),"utf8").replace("window.PopulationUI","globalThis.PopulationUI"),context);
const shellFunction=name=>{const start=source.indexOf(`  function ${name}(`);assert(start>=0,name);const end=source.indexOf("\n  function ",start+1);return source.slice(start,end)};
vm.runInContext(["closeTopDialog","cityIntel","fogNumber"].map(shellFunction).join("\n")+"\nglobalThis.shell={closeTopDialog,cityIntel,fogNumber};",context);
context.map={setPlannedRoute(){},intelLevel:()=>3,armyIntelLevel:()=>3};
for(const file of ["registry","command-book","resources","ledgers","planners","city-detail","army-detail","battle-detail","officers"])vm.runInContext(fs.readFileSync(new URL(`../js/ui/app/${file}.js`,import.meta.url),"utf8"),context);
const app={$,state,map:context.map,loader,forceBy:id=>state.data.forces.find(force=>force.id===id),esc:value=>String(value??""),toast(){},submit:()=>true,renderOrders(){},renderSelection(){},aiBridge:{audit:[]},...context.shell};
context.SanguoApp.mount(["commandBook","resources","ledgers","planners","cityDetail","armyDetail","battleDetail","officers"],app);
const {openLedger,openArmyDetail,openCityDetail,openOfficerDetail,openBuildingPlanner,openAdministrationPlanner,openArmyOfficePlanner,openReorganizePlanner,openTroopTransferPlanner,openCityCommands,closeTopDialog}=app;
const city=state.data.cities.find(city=>city.force==="cao"&&(city.type||"city")==="city");
const army=state.data.armies.find(army=>army.force==="cao");
const officer=state.data.officers.find(officer=>officer.force==="cao"&&officer.status==="serving");
state.data.officerBiographies={};
const retained=(id,run)=>{const window=$(id),content=$(id.replace("Dialog","Content")),before=content.innerHTML,position={...window.style},scroll=content.scrollTop;run();assert.equal(window.open,true,id);assert.equal(content.innerHTML,before,`${id} 内容被覆盖`);assert.equal(content.scrollTop,scroll);assert.deepEqual(window.style,position)};

await openLedger("military");
const row=$("ledgerContent").querySelectorAll("[data-army-detail]")[0];
assert(row,"军政档案应有可点击军团");
retained("ledgerDialog",()=>row.onclick());
assert.equal($("armyDetailDialog").open,true);
$("armyDetailDialog").close();assert.equal($("ledgerDialog").open,true);

openCityDetail(city);
for(const open of [()=>openArmyDetail(army),()=>openBuildingPlanner(city),()=>openAdministrationPlanner(city),()=>openCityCommands(city)])retained("detailDialog",open);
await openOfficerDetail(officer);
assert.equal($("detailDialog").open,true);assert.equal($("armyDetailDialog").open,true);assert.equal($("ledgerDialog").open,true);
for(const open of [()=>openArmyOfficePlanner(army),()=>openReorganizePlanner(army),()=>openTroopTransferPlanner(army,"reinforce")])retained("armyDetailDialog",open);
retained("officerDetailDialog",()=>openAdministrationPlanner(city));
$("plannerForm").querySelector("[data-cancel]").onclick();
assert.equal($("plannerDialog").open,false);assert.equal($("officerDetailDialog").open,true);

for(const id of ["form_army","reorganize_army","return_garrison","construct_building","agriculture"]){
  const command=state.data.commandCatalog.commands.find(command=>command.id===id);
  // 军团类命令不以城池为目标，按总命令书打开
  app.renderCommandBook(command.categoryId,["reorganize_army","return_garrison"].includes(id)?null:city);$("commandDialog").showModal();
  const button=$("commandList").querySelectorAll("[data-command-id]").find(button=>button.dataset.commandId===id);
  assert(button,id);retained("commandDialog",()=>button.onclick());assert.equal($("plannerDialog").open,true,id);
  $("plannerDialog").close();
}

// Async biographies cannot replace a newer selection or another entity window.
delete state.data.officerBiographies;
const pending=[];loader.loadOfficerBiographies=()=>new Promise(resolve=>pending.push(resolve));
const second=state.data.officers.find(item=>item.id!==officer.id);
const firstLoad=openOfficerDetail(officer),secondLoad=openOfficerDetail(second);
pending[1]({biographies:{[second.id]:"新列传"}});await secondLoad;
const latest=$("officerDetailContent").innerHTML;
pending[0]({biographies:{[officer.id]:"旧列传"}});await firstLoad;
assert.equal($("officerDetailContent").innerHTML,latest);

$("plannerDialog").showModal();closeTopDialog();
assert.equal($("plannerDialog").open,false);assert.equal($("ledgerDialog").open,true);assert.equal($("officerDetailDialog").open,true);
$("eventDialog").modal=true;$("eventDialog").showModal();closeTopDialog();assert.equal($("eventDialog").open,true);
for(const id of ["armyDetailDialog","officerDetailDialog"]){assert(html.includes(`id="${id}"`));assert(html.includes(`data-close="${id}"`));assert(manager.includes(`"${id}"`))}
console.log("窗口导航回归通过：军政→军团 / 城市→军团或人物 / 详情→规划 / 命令簿→规划 / 独立关闭 / 异步防覆盖 / Esc只关闭顶层");
