(() => {
  const $=id=>document.getElementById(id),storageKey="sanguo.os-window-layout.v3",legacyPresetKey="sanguo.os-window-preset.v1",presetKey=slot=>`sanguo.os-window-preset.v2.${slot}`;
  const definitions=[
    {selector:"#resourcePanel",id:"resourcePanel",title:"府库",icon:"库",handle:".card-title"},
    {selector:".turn-display",id:"calendarWindow",title:"历法",icon:"历",handle:".card-title"},
    {selector:".map-column",id:"mapWindow",title:"战略舆图",icon:"图",handle:".map-toolbar"},
    {selector:"#factionPanel",id:"factionPanel",title:"本势力",icon:"君",handle:".card-title"},
    {selector:"#selectionRailPanel",id:"selectionRailPanel",title:"选中区域",icon:"选",handle:".card-title"},
    {selector:"#forcesRailPanel",id:"forcesRailPanel",title:"天下大势",icon:"势",handle:".card-title"},
    {selector:"#commandsRailPanel",id:"commandsRailPanel",title:"军令",icon:"令",handle:".card-title"},
    {selector:"#situationRailPanel",id:"situationRailPanel",title:"图例",icon:"例",handle:".card-title"}
  ];
  let topZ=100,layout={};
  try{layout=JSON.parse(localStorage.getItem(storageKey)||"{}")||{}}catch{}

  const isCompact=()=>matchMedia("(max-width:1000px)").matches;
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(layout))}catch{}}
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const snapValue=(value,candidates,distance=5)=>{let result=value,best=distance+1;for(const candidate of candidates){const delta=Math.abs(value-candidate);if(delta<=distance&&delta<best){result=candidate;best=delta}}return {value:result,snapped:best<=distance}};
  const titleOf=window=>window.dataset.windowTitle||"窗口";

  function focusWindow(window){
    document.querySelectorAll(".os-window.is-active,.os-managed-dialog.is-active").forEach(item=>item.classList.remove("is-active"));
    window.classList.add("is-active");window.style.zIndex=String(++topZ);updateTasks();
  }

  function remember(window){
    if(isCompact()||window.classList.contains("is-maximized"))return;
    const workspace=document.querySelector(".workspace"),box=window.getBoundingClientRect(),host=workspace.getBoundingClientRect();
    layout[window.dataset.windowId]={...(layout[window.dataset.windowId]||{}),left:Math.round(box.left-host.left),top:Math.round(box.top-host.top),width:Math.round(box.width),height:Math.round(box.height),minimized:window.classList.contains("is-minimized"),closed:window.classList.contains("is-closed"),maximized:window.classList.contains("is-maximized")};save();
  }

  function restorePosition(window){
    const saved=layout[window.dataset.windowId];if(!saved||isCompact())return;
    window.classList.toggle("is-minimized",!!saved.minimized);window.classList.toggle("is-closed",!!saved.closed);window.classList.toggle("is-maximized",!!saved.maximized);
    const hasGeometry=["left","top","width","height"].some(key=>Number.isFinite(saved[key]));if(!hasGeometry)return;
    window.dataset.userPositioned="true";
    for(const key of ["left","top","width","height"])if(Number.isFinite(saved[key]))window.style[key]=`${saved[key]}px`;
    if(Number.isFinite(saved.z))window.style.zIndex=String(saved.z);
    window.style.right="auto";window.style.bottom="auto";
  }

  function constrainWindow(window){
    if(isCompact()||!document.body.classList.contains("game-started")||window.classList.contains("is-maximized")||window.classList.contains("is-minimized")||window.classList.contains("is-closed"))return;
    const workspace=document.querySelector(".workspace"),host=workspace?.getBoundingClientRect();if(!host)return;
    const box=window.getBoundingClientRect(),safeHeight=Math.max(140,host.height-46),width=Math.min(box.width,host.width),height=Math.min(box.height,safeHeight);
    window.style.width=`${Math.round(width)}px`;window.style.height=`${Math.round(height)}px`;window.style.right="auto";window.style.bottom="auto";
    window.style.left=`${Math.round(clamp(box.left-host.left,0,Math.max(0,host.width-width)))}px`;window.style.top=`${Math.round(clamp(box.top-host.top,0,Math.max(0,safeHeight-height)))}px`;
  }

  function snapWindow(window,host=document.querySelector(".workspace")?.getBoundingClientRect()){
    if(!host)return false;const box=window.getBoundingClientRect(),maxX=Math.max(0,host.width-box.width),maxY=Math.max(0,host.height-box.height-46),left=clamp(box.left-host.left,0,maxX),top=clamp(box.top-host.top,0,maxY),xCandidates=[0,maxX],yCandidates=[0,maxY];
    document.querySelectorAll(".os-window:not(.is-minimized):not(.is-closed):not(.is-maximized)").forEach(other=>{if(other===window)return;const rect=other.getBoundingClientRect(),otherLeft=rect.left-host.left,otherTop=rect.top-host.top;xCandidates.push(otherLeft,rect.right-host.left,otherLeft-box.width,rect.right-host.left-box.width);yCandidates.push(otherTop,rect.bottom-host.top,otherTop-box.height,rect.bottom-host.top-box.height)});
    const nextX=snapValue(left,xCandidates),nextY=snapValue(top,yCandidates);window.style.left=`${clamp(nextX.value,0,maxX)}px`;window.style.top=`${clamp(nextY.value,0,maxY)}px`;return nextX.snapped||nextY.snapped;
  }

  function toggleMinimize(window){
    window.classList.toggle("is-minimized");
    const state=layout[window.dataset.windowId]||{};state.minimized=window.classList.contains("is-minimized");layout[window.dataset.windowId]=state;save();updateTasks();
    if(!state.minimized)focusWindow(window);
  }

  function closeWindow(window){
    window.classList.remove("is-minimized","is-maximized","is-active");window.classList.add("is-closed");const state=layout[window.dataset.windowId]||{};Object.assign(state,{closed:true,minimized:false,maximized:false});layout[window.dataset.windowId]=state;save();updateTasks();
  }

  function openWindow(window){
    window.classList.remove("is-minimized","is-closed");const state=layout[window.dataset.windowId]||{};Object.assign(state,{closed:false,minimized:false});layout[window.dataset.windowId]=state;save();focusWindow(window);updateTasks();
  }

  function toggleMaximize(window){
    window.classList.toggle("is-maximized");
    if(window.classList.contains("is-minimized"))window.classList.remove("is-minimized");
    const state=layout[window.dataset.windowId]||{};Object.assign(state,{maximized:window.classList.contains("is-maximized"),minimized:false,closed:false});layout[window.dataset.windowId]=state;save();focusWindow(window);updateTasks();requestAnimationFrame(()=>dispatchEvent(new Event("resize")));
  }

  function addControls(window,handle){
    const controls=document.createElement("span");controls.className="os-window-buttons";
    const minimize=document.createElement("button");minimize.type="button";minimize.className="os-window-button";minimize.title="最小化";minimize.textContent="_";
    const maximize=document.createElement("button");maximize.type="button";maximize.className="os-window-button";maximize.title="最大化";maximize.textContent="□";
    const close=document.createElement("button");close.type="button";close.className="os-window-button os-window-close";close.title="关闭";close.textContent="×";
    minimize.setAttribute("aria-label",`最小化${titleOf(window)}`);maximize.setAttribute("aria-label",`最大化或还原${titleOf(window)}`);close.setAttribute("aria-label",`关闭${titleOf(window)}`);
    for(const button of [minimize,maximize,close])button.addEventListener("pointerdown",event=>event.stopPropagation());
    minimize.onclick=()=>toggleMinimize(window);maximize.onclick=()=>toggleMaximize(window);close.onclick=()=>closeWindow(window);controls.append(minimize,maximize,close);handle.append(controls);
  }

  function trackPointer(handle,pointerId,move,finish){
    let ended=false;
    const cleanup=(event,cancelled=false)=>{if(ended||event?.pointerId!==undefined&&event.pointerId!==pointerId)return;ended=true;handle.removeEventListener("pointermove",moving);handle.removeEventListener("pointerup",up);handle.removeEventListener("pointercancel",cancel);handle.removeEventListener("lostpointercapture",cancel);globalThis.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",visibility);if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);finish(event||{},cancelled)};
    const moving=event=>{if(event.pointerId!==pointerId)return;if(!(event.buttons&1)){cleanup(event,true);return}move(event)},up=event=>cleanup(event),cancel=event=>cleanup(event,true),visibility=()=>{if(document.hidden)cancel()};
    handle.addEventListener("pointermove",moving);handle.addEventListener("pointerup",up);handle.addEventListener("pointercancel",cancel);handle.addEventListener("lostpointercapture",cancel);globalThis.addEventListener("blur",cancel);document.addEventListener("visibilitychange",visibility);
  }

  function addResizeGrip(window){
    const grip=document.createElement("span");grip.className="os-window-resize";grip.setAttribute("aria-hidden","true");window.append(grip);
    grip.addEventListener("pointerdown",event=>{
      if(event.button!==0||isCompact()||window.classList.contains("is-maximized"))return;
      event.stopPropagation();focusWindow(window);const startX=event.clientX,startY=event.clientY,startWidth=window.offsetWidth,startHeight=window.offsetHeight,minWidth=window.classList.contains("map-column")?410:180,minHeight=window.classList.contains("map-column")?320:76;
      window.style.right="auto";window.style.bottom="auto";grip.setPointerCapture(event.pointerId);
      const move=moveEvent=>{const host=document.querySelector(".workspace").getBoundingClientRect(),box=window.getBoundingClientRect(),maxWidth=Math.max(minWidth,host.right-box.left),maxHeight=Math.max(minHeight,host.bottom-box.top-46);window.style.width=`${clamp(startWidth+moveEvent.clientX-startX,minWidth,maxWidth)}px`;window.style.height=`${clamp(startHeight+moveEvent.clientY-startY,minHeight,maxHeight)}px`;if(window.classList.contains("map-column"))dispatchEvent(new Event("resize"))};
      trackPointer(grip,event.pointerId,move,()=>{remember(window);dispatchEvent(new Event("resize"))});
      window.dataset.userPositioned="true";
    });
  }

  function bindDrag(window,handle){
    handle.addEventListener("dblclick",event=>{if(!event.target.closest("button,input,select"))toggleMaximize(window)});
    handle.addEventListener("pointerdown",event=>{
      if(event.button!==0||event.target.closest("button,input,select")||isCompact()||window.classList.contains("is-maximized"))return;
      focusWindow(window);const workspace=document.querySelector(".workspace"),host=workspace.getBoundingClientRect(),box=window.getBoundingClientRect(),offsetX=event.clientX-box.left,offsetY=event.clientY-box.top;
      window.dataset.userPositioned="true";
      window.style.left=`${box.left-host.left}px`;window.style.top=`${box.top-host.top}px`;window.style.right="auto";window.style.bottom="auto";handle.setPointerCapture(event.pointerId);
      const move=moveEvent=>{const maxX=Math.max(0,host.width-window.offsetWidth),maxY=Math.max(0,host.height-window.offsetHeight-46);window.style.left=`${clamp(moveEvent.clientX-host.left-offsetX,0,maxX)}px`;window.style.top=`${clamp(moveEvent.clientY-host.top-offsetY,0,maxY)}px`;window.classList.toggle("is-snapping",!moveEvent.altKey&&snapWindow(window,host))};
      trackPointer(handle,event.pointerId,move,(endEvent,cancelled)=>{if(!cancelled&&!endEvent.altKey)snapWindow(window,host);window.classList.remove("is-snapping");remember(window)});
    });
    window.addEventListener("pointerdown",()=>focusWindow(window));
  }

  function arrangeWindows(windows,mode){
    if(mode==="reset"){localStorage.removeItem(storageKey);location.reload();return}
    if(isCompact())return;
    const workspace=document.querySelector(".workspace"),host=workspace.getBoundingClientRect(),targets=windows.filter(window=>!window.classList.contains("is-closed"));
    if(mode==="minimize"||mode==="map"){for(const window of windows){const keep=mode==="map"&&window.dataset.windowId==="mapWindow";if(window.classList.contains("is-closed")&&!keep)continue;window.classList.toggle("is-minimized",!keep);window.classList.remove("is-closed");if(!keep)window.classList.remove("is-active");const state=layout[window.dataset.windowId]||{};Object.assign(state,{minimized:!keep,closed:false});layout[window.dataset.windowId]=state;if(keep)focusWindow(window)}save();updateTasks();return}
    const visible=targets.length?targets:windows,areaHeight=Math.max(320,host.height-46),mapWindow=visible.find(window=>window.dataset.windowId==="mapWindow"),sideWindows=visible.filter(window=>window!==mapWindow),mapWidth=mapWindow?Math.max(410,Math.round(host.width*.56)):0,sideColumns=host.width>=1200?2:1,sideRows=Math.max(1,Math.ceil(sideWindows.length/sideColumns));
    visible.forEach((window,index)=>{window.classList.remove("is-minimized","is-maximized","is-closed");window.dataset.userPositioned="true";window.style.right="auto";window.style.bottom="auto";if(mode==="cascade"){window.style.left=`${18+index*28}px`;window.style.top=`${14+index*24}px`;window.style.width=`${Math.min(window.classList.contains("map-column")?620:360,host.width-36-index*28)}px`;window.style.height=`${Math.min(window.classList.contains("map-column")?470:260,areaHeight-28-index*24)}px`}else if(window===mapWindow){window.style.left="4px";window.style.top="4px";window.style.width=`${mapWidth-8}px`;window.style.height=`${areaHeight-8}px`}else{const sideIndex=sideWindows.indexOf(window),column=sideIndex%sideColumns,row=Math.floor(sideIndex/sideColumns),availableWidth=host.width-mapWidth,width=Math.floor(availableWidth/sideColumns),height=Math.floor(areaHeight/sideRows);window.style.left=`${mapWidth+column*width+4}px`;window.style.top=`${row*height+4}px`;window.style.width=`${Math.max(180,width-8)}px`;window.style.height=`${Math.max(76,height-8)}px`}remember(window)});updateTasks();dispatchEvent(new Event("resize"));
  }

  function desktopNotice(message){const toast=$("toast");if(!toast)return;toast.textContent=message;toast.classList.add("show");clearTimeout(desktopNotice.timer);desktopNotice.timer=setTimeout(()=>toast.classList.remove("show"),1800)}
  function captureLayoutPreset(windows){const workspace=document.querySelector(".workspace"),host=workspace?.getBoundingClientRect(),snapshot={};for(const window of windows){const id=window.dataset.windowId,state={...(layout[id]||{}),minimized:window.classList.contains("is-minimized"),closed:window.classList.contains("is-closed"),maximized:window.classList.contains("is-maximized"),z:Number.parseInt(getComputedStyle(window).zIndex,10)||0};if(host&&!state.minimized&&!state.closed&&!state.maximized){const box=window.getBoundingClientRect();Object.assign(state,{left:Math.round(box.left-host.left),top:Math.round(box.top-host.top),width:Math.round(box.width),height:Math.round(box.height)})}snapshot[id]=state}return snapshot}
  function captureDialogPreset(){return [...document.querySelectorAll("dialog.os-managed-dialog")].filter(dialog=>dialog.open||dialog.classList.contains("is-dialog-minimized")).map(dialog=>{const state={id:dialog.id,kind:dialog.dataset.panelKind||null,open:dialog.open,minimized:dialog.classList.contains("is-dialog-minimized"),maximized:dialog.classList.contains("os-dialog-maximized"),z:Number.parseInt(getComputedStyle(dialog).zIndex,10)||0};if(dialog.open&&!state.maximized){const box=dialog.getBoundingClientRect();Object.assign(state,{left:Math.round(box.left),top:Math.round(box.top),width:Math.round(box.width),height:Math.round(box.height)})}return state})}
  function readLayoutPreset(slot){try{return JSON.parse(localStorage.getItem(presetKey(slot))||(slot===1?localStorage.getItem(legacyPresetKey):"")||"null")}catch{return null}}
  function saveLayoutPreset(windows,slot,loadButton){try{const snapshot=captureLayoutPreset(windows),dialogs=captureDialogPreset();localStorage.setItem(presetKey(slot),JSON.stringify({version:3,slot,savedAt:new Date().toISOString(),layout:snapshot,dialogs}));loadButton.disabled=false;desktopNotice(`当前版面已保存到预设${["一","二","三"][slot-1]}`)}catch{desktopNotice("版面预设保存失败")}}
  function reopenPresetDialog(state){const dialog=$(state.id);if(!dialog)return;const opener={helpDialog:()=>$("helpButton")?.click(),resourceDetailDialog:()=>document.querySelector("[data-resource-detail]")?.click(),reportDialog:()=>$("reportButton")?.click(),chronicleDialog:()=>$("openChronicleButton")?.click(),battleReportDialog:()=>$("battleReportButton")?.click(),commandDialog:()=>$("commandBookButton")?.click(),modToolsDialog:()=>$("modToolsButton")?.click(),aiDialog:()=>$("aiSettingsButton")?.click(),gameSettingsDialog:()=>$("gameSettingsButton")?.click(),saveManagerDialog:()=>$(state.kind==="load"?"loadButton":"saveButton")?.click()}[state.id];if(state.id==="ledgerDialog"&&state.kind)document.querySelector(`[data-ledger="${state.kind}"]`)?.click();else opener?.();if(!dialog.open)dialog.showModal();dialog.classList.remove("is-dialog-minimized","os-dialog-maximized","is-active");for(const key of ["left","top","right","bottom","width","height","margin","zIndex"])dialog.style.removeProperty(key);if(state.maximized)dialog.classList.add("os-dialog-maximized");else if(Number.isFinite(state.left)){Object.assign(dialog.style,{left:`${state.left}px`,top:`${state.top}px`,width:`${state.width}px`,height:`${state.height}px`,right:"auto",bottom:"auto",margin:"0px"})}if(Number.isFinite(state.z))dialog.style.zIndex=String(state.z);if(state.minimized){dialog.classList.add("is-dialog-minimized");if(dialog.open)dialog.close()}}
  function applyLayoutPreset(windows,slot){const record=readLayoutPreset(slot),preset=record?.layout||record;if(!preset||typeof preset!=="object"){desktopNotice(`预设${["一","二","三"][slot-1]}尚未保存`);return}layout=JSON.parse(JSON.stringify(preset));save();for(const window of windows){window.classList.remove("is-minimized","is-maximized","is-closed","is-active");for(const key of ["left","top","right","bottom","width","height","zIndex"])window.style.removeProperty(key);delete window.dataset.userPositioned;restorePosition(window);constrainWindow(window)}document.querySelectorAll("dialog.os-managed-dialog").forEach(dialog=>{if(dialog.open)dialog.close();dialog.classList.remove("is-dialog-minimized","os-dialog-maximized","is-active")});for(const state of record?.dialogs||[])reopenPresetDialog(state);updateTasks();const visible=windows.filter(window=>!window.classList.contains("is-minimized")&&!window.classList.contains("is-closed")).sort((a,b)=>(layout[b.dataset.windowId]?.z||0)-(layout[a.dataset.windowId]?.z||0))[0];if(visible)visible.classList.add("is-active");topZ=Math.max(100,...windows.map(window=>layout[window.dataset.windowId]?.z||0),...(record?.dialogs||[]).map(dialog=>dialog.z||0));dispatchEvent(new Event("resize"));desktopNotice(`已恢复版面预设${["一","二","三"][slot-1]}`)}

  const desktopApps=[
    {id:"mapWindow",name:"战略舆图",asset:"strategy-map"},
    {id:"factionPanel",name:"本势力",asset:"player-faction"},
    {id:"commandsRailPanel",name:"军令",asset:"military-orders"}
  ];
  const defaultIconPositions={mapWindow:{column:0,row:0},factionPanel:{column:0,row:1},commandsRailPanel:{column:0,row:2}};
  const iconPositionKey="sanguo.os-desktop-icons.v1",iconGrid={x:8,y:8,width:78,height:84};
  function nearestIconCell(column,row,bounds,occupied){
    column=clamp(Math.round(column),0,bounds.columns-1);row=clamp(Math.round(row),0,bounds.rows-1);
    let best=null,distance=Infinity;
    for(let y=0;y<bounds.rows;y++)for(let x=0;x<bounds.columns;x++){
      if(occupied.has(`${x}:${y}`))continue;
      const delta=Math.abs(x-column)+Math.abs(y-row);if(delta<distance){distance=delta;best={column:x,row:y}}
    }
    return best;
  }
  function createDesktopShortcuts(windows){
    const workspace=document.querySelector(".workspace");if(!workspace)return;
    const desktop=document.createElement("nav");desktop.className="os-desktop-icons";desktop.setAttribute("aria-label","桌面应用");
    let positions={};try{positions=JSON.parse(localStorage.getItem(iconPositionKey)||"{}")||{}}catch{}
    const buttons=[],bounds=()=>{const box=desktop.getBoundingClientRect();return {box,columns:Math.max(1,Math.floor((box.width-16)/iconGrid.width)),rows:Math.max(1,Math.floor((box.height-16)/iconGrid.height))}},valid=cell=>Number.isInteger(cell?.column)&&cell.column>=0&&Number.isInteger(cell?.row)&&cell.row>=0;
    const setCell=(button,cell)=>{button.dataset.gridColumn=String(cell.column);button.dataset.gridRow=String(cell.row);button.style.left=`${iconGrid.x+cell.column*iconGrid.width}px`;button.style.top=`${iconGrid.y+cell.row*iconGrid.height}px`};
    const occupiedByOthers=button=>new Set(buttons.filter(other=>other!==button).map(other=>`${other.dataset.gridColumn}:${other.dataset.gridRow}`));
    const arrangeIcons=()=>{if(isCompact())return;const grid=bounds();if(!grid.box.width||!grid.box.height)return;const occupied=new Set;buttons.forEach((button,index)=>{if(button.classList.contains("is-icon-dragging"))return;const saved=positions[button.dataset.desktopApp],initial=defaultIconPositions[button.dataset.desktopApp]||{column:0,row:index},desired=valid(saved)?saved:initial,cell=nearestIconCell(desired.column,desired.row,grid,occupied);if(cell){setCell(button,cell);occupied.add(`${cell.column}:${cell.row}`)}})};
    for(const app of desktopApps){
      const target=windows.find(window=>window.dataset.windowId===app.id);if(!target)continue;
      const button=document.createElement("button"),icon=document.createElement("img"),label=document.createElement("span");
      button.type="button";button.className="os-desktop-icon";button.dataset.desktopApp=app.id;button.setAttribute("aria-label",`打开${app.name}`);button.setAttribute("aria-pressed","false");
      icon.src=`assets/icons/${app.asset}.svg`;icon.alt="";icon.width=icon.height=48;icon.draggable=false;label.textContent=app.name;button.append(icon,label);
      const select=()=>{desktop.querySelectorAll("button").forEach(item=>{item.classList.toggle("is-selected",item===button);item.setAttribute("aria-pressed",String(item===button))})};
      let blockOpenUntil=0;
      button.onclick=event=>{select();if(event.detail===0&&Date.now()>=blockOpenUntil)openWindow(target)};
      button.ondblclick=()=>{if(Date.now()>=blockOpenUntil)openWindow(target)};
      button.addEventListener("pointerdown",event=>{
        if(event.button!==0||isCompact())return;event.preventDefault();select();button.focus({preventScroll:true});
        const grid=bounds(),box=button.getBoundingClientRect(),start={column:Number(button.dataset.gridColumn)||0,row:Number(button.dataset.gridRow)||0},offsetX=event.clientX-box.left,offsetY=event.clientY-box.top;
        let dragging=false;
        button.setPointerCapture(event.pointerId);
        const move=moveEvent=>{if(!dragging&&Math.hypot(moveEvent.clientX-event.clientX,moveEvent.clientY-event.clientY)<5)return;dragging=true;blockOpenUntil=Date.now()+500;button.classList.add("is-icon-dragging");button.style.left=`${clamp(moveEvent.clientX-grid.box.left-offsetX,0,Math.max(0,grid.box.width-72))}px`;button.style.top=`${clamp(moveEvent.clientY-grid.box.top-offsetY,0,Math.max(0,grid.box.height-76))}px`};
        trackPointer(button,event.pointerId,move,(endEvent,cancelled)=>{
          button.classList.remove("is-icon-dragging");if(!dragging){if(!cancelled&&event.pointerType==="touch")openWindow(target);return}
          blockOpenUntil=Date.now()+500;
          const cell=cancelled?start:nearestIconCell((Number.parseFloat(button.style.left)-iconGrid.x)/iconGrid.width,(Number.parseFloat(button.style.top)-iconGrid.y)/iconGrid.height,bounds(),occupiedByOthers(button));
          setCell(button,cell||start);
          if(!cancelled&&cell){positions[app.id]=cell;try{localStorage.setItem(iconPositionKey,JSON.stringify(positions))}catch{desktopNotice("桌面图标位置保存失败")}}
          arrangeIcons();
        });
      });
      button.addEventListener("pointerup",event=>{if(isCompact()&&event.pointerType==="touch")openWindow(target)});
      desktop.append(button);buttons.push(button);
    }
    workspace.prepend(desktop);
    requestAnimationFrame(arrangeIcons);addEventListener("resize",arrangeIcons);addEventListener("sanguo-game-ready",arrangeIcons,{once:true});
    workspace.addEventListener("pointerdown",event=>{if(event.target!==workspace&&event.target!==desktop)return;desktop.querySelectorAll("button").forEach(button=>{button.classList.remove("is-selected");button.setAttribute("aria-pressed","false")})});
  }

  function createSystemMenu(windows){
    const dock=document.querySelector(".main-nav");if(!dock)return;
    const menu=document.createElement("nav");menu.className="os-start-menu";menu.hidden=true;menu.setAttribute("popover","manual");menu.setAttribute("aria-label","应用菜单");
    const utilities=dock.querySelector(":scope > .nav-end"),originalButtons=[...dock.querySelectorAll(":scope > button"),...dock.querySelectorAll(":scope > .nav-end button")],moved=new Set,move=(button,parent)=>{if(button){parent.append(button);moved.add(button)}},makeSubmenu=(label,name,tip)=>{const trigger=document.createElement("button"),panel=document.createElement("section");trigger.type="button";trigger.className="os-submenu-trigger";trigger.textContent=label;trigger.dataset.submenu=name;trigger.dataset.tip=tip;trigger.setAttribute("aria-haspopup","menu");trigger.setAttribute("aria-expanded","false");panel.className="os-start-submenu";panel.dataset.submenuPanel=name;panel.setAttribute("role","menu");panel.setAttribute("aria-label",label);panel.hidden=true;menu.append(trigger,panel);return {trigger,panel}};
    $("mapHomeButton").dataset.tip="返回战略舆图并关闭已打开的资料窗口";$("helpButton").dataset.tip="查看游戏流程、操作方法与快捷键";move($("mapHomeButton"),menu);
    const applications=makeSubmenu("桌面应用","applications","");for(const window of windows){const button=document.createElement("button");button.type="button";button.className="os-app-launcher";button.textContent=titleOf(window);button.onclick=()=>openWindow(window);applications.panel.append(button)}
    const archive=makeSubmenu("档案与情报","archives","打开军政、内治、外交、情报与各类报告");originalButtons.filter(button=>button.dataset.ledger).forEach(button=>move(button,archive.panel));move($("battleReportButton"),archive.panel);move($("reportButton"),archive.panel);
    const saves=makeSubmenu("存档与读档","saves","保存当前战局或载入已有战局");move($("saveButton"),saves.panel);move($("loadButton"),saves.panel);
    const arrangement=makeSubmenu("窗口版面","layout","整理、最小化或重置桌面窗口");for(const [action,label,tip] of [["map","仅显示舆图","隐藏其他窗口，仅保留战略舆图"],["minimize","全部最小化","将所有桌面窗口收进底部任务栏"],["cascade","层叠窗口","把窗口按顺序错位层叠排列"],["tile","平铺窗口","自动将所有窗口平铺到可用区域"],["reset","恢复默认布局","清除当前窗口位置并恢复初始版面"]]){const button=document.createElement("button");button.type="button";button.className="os-layout-action";button.dataset.layoutAction=action;button.dataset.tip=tip;button.textContent=label;button.onclick=()=>arrangeWindows(windows,action);arrangement.panel.append(button)}
    const presets=makeSubmenu("版面预设","presets","保存或恢复三套自定义窗口版面");for(let slot=1;slot<=3;slot++){const row=document.createElement("div"),label=document.createElement("span"),savePreset=document.createElement("button"),loadPreset=document.createElement("button"),name=["一","二","三"][slot-1];row.className="os-preset-row";label.textContent=`预设${name}`;savePreset.type=loadPreset.type="button";savePreset.className=loadPreset.className="os-layout-preset";savePreset.dataset.layoutPreset="save";loadPreset.dataset.layoutPreset="load";savePreset.dataset.layoutSlot=loadPreset.dataset.layoutSlot=String(slot);savePreset.textContent="保存";loadPreset.textContent="恢复";savePreset.dataset.tip=`把当前窗口版面保存到预设${name}`;loadPreset.dataset.tip=`恢复预设${name}的窗口版面`;loadPreset.disabled=!readLayoutPreset(slot);savePreset.onclick=()=>saveLayoutPreset(windows,slot,loadPreset);loadPreset.onclick=()=>applyLayoutPreset(windows,slot);row.append(label,savePreset,loadPreset);presets.panel.append(row)}
    originalButtons.filter(button=>!moved.has(button)&&!["gameSettingsButton","helpButton","exitGameButton"].includes(button.id)).forEach(button=>move(button,menu));move($("gameSettingsButton"),menu);move($("helpButton"),menu);move($("exitGameButton"),menu);utilities?.remove();document.body.append(menu);
    const launcher=document.createElement("button");launcher.type="button";launcher.className="os-start-button";launcher.textContent="漢";launcher.title="三国";launcher.setAttribute("aria-label","打开三国菜单");launcher.setAttribute("aria-expanded","false");
    const submenuPairs=[applications,archive,saves,arrangement,presets];let activeSubmenu=null;
    const closeSubmenus=()=>{for(const pair of submenuPairs){pair.panel.hidden=true;pair.trigger.setAttribute("aria-expanded","false")}activeSubmenu=null},openSubmenu=pair=>{if(activeSubmenu===pair&&!pair.panel.hidden)return;closeSubmenus();pair.panel.hidden=false;pair.trigger.setAttribute("aria-expanded","true");activeSubmenu=pair;const root=menu.getBoundingClientRect(),trigger=pair.trigger.getBoundingClientRect(),panel=pair.panel.getBoundingClientRect(),left=root.right+3+panel.width<=innerWidth?root.right+3:Math.max(3,root.left-panel.width-3),top=clamp(trigger.top,3,Math.max(3,innerHeight-panel.height-38));pair.panel.style.left=`${Math.round(left)}px`;pair.panel.style.top=`${Math.round(top)}px`};
    submenuPairs.forEach(pair=>{pair.trigger.onclick=event=>{event.stopPropagation();activeSubmenu===pair&&!pair.panel.hidden?closeSubmenus():openSubmenu(pair)};pair.trigger.addEventListener("pointerenter",()=>openSubmenu(pair));pair.trigger.addEventListener("focus",()=>openSubmenu(pair))});
    const menuIsOpen=()=>menu.matches(":popover-open")||(!menu.showPopover&&!menu.hidden),setMenuOpen=open=>{if(open){menu.hidden=false;if(menu.showPopover&&!menu.matches(":popover-open"))menu.showPopover()}else{closeSubmenus();if(menu.hidePopover&&menu.matches(":popover-open"))menu.hidePopover();menu.hidden=true}launcher.setAttribute("aria-expanded",String(open))};
    launcher.onclick=event=>{event.stopPropagation();setMenuOpen(!menuIsOpen())};dock.prepend(launcher);
    menu.addEventListener("click",event=>{const button=event.target.closest("button");if(button&&!button.classList.contains("os-submenu-trigger"))setMenuOpen(false)});menu.querySelectorAll(":scope > button:not(.os-submenu-trigger)").forEach(button=>button.addEventListener("pointerenter",closeSubmenus));document.addEventListener("pointerdown",event=>{if(menuIsOpen()&&!menu.contains(event.target)&&event.target!==launcher)setMenuOpen(false)});document.addEventListener("keydown",event=>{if(event.key!=="Escape"||!menuIsOpen())return;if(activeSubmenu)closeSubmenus();else setMenuOpen(false)});
  }

  let taskStrip,calendarTray,resourceTray;
  function syncCalendarTray(){if(!calendarTray)return;const match=$("dateLabel")?.textContent.match(/(\d+)日/);calendarTray.textContent=match?.[1]||"1"}
  function syncTaskButton(button,{closed,minimized,active}){
    button.hidden=closed;button.classList.toggle("is-minimized",minimized);button.classList.toggle("is-active",active&&!minimized&&!closed);
    button.setAttribute("aria-pressed",String(active&&!minimized&&!closed));
  }
  function updateTasks(){
    if(!taskStrip)return;
    taskStrip.querySelectorAll("[data-task-window]").forEach(button=>{
      const window=document.querySelector(`[data-window-id="${button.dataset.taskWindow}"]`);
      syncTaskButton(button,{closed:!window||window.classList.contains("is-closed"),minimized:!!window?.classList.contains("is-minimized"),active:!!window?.classList.contains("is-active")});
    });
    taskStrip.querySelectorAll("[data-task-dialog]").forEach(button=>{
      const dialog=$(button.dataset.taskDialog),minimized=!!dialog?.classList.contains("is-dialog-minimized");
      syncTaskButton(button,{closed:!dialog||!dialog.open&&!minimized,minimized,active:!!dialog?.classList.contains("is-active")});
    });
    const calendar=document.querySelector('[data-window-id="calendarWindow"]'),resource=document.querySelector('[data-window-id="resourcePanel"]');
    if(calendarTray)calendarTray.hidden=!calendar?.classList.contains("is-minimized")||calendar.classList.contains("is-closed");
    if(resourceTray)resourceTray.hidden=!resource||resource.classList.contains("is-closed");
  }
  function createTaskStrip(windows){
    const dock=document.querySelector(".main-nav");if(!dock)return;taskStrip=document.createElement("span");taskStrip.className="os-task-strip";
    for(const window of windows){const button=document.createElement("button");button.type="button";button.className="os-task-button";button.dataset.taskWindow=window.dataset.windowId;button.textContent=titleOf(window);button.onclick=()=>window.classList.contains("is-minimized")||window.classList.contains("is-closed")?openWindow(window):window.classList.contains("is-active")?toggleMinimize(window):focusWindow(window);taskStrip.append(button)}
    const resourceWindow=windows.find(window=>window.dataset.windowId==="resourcePanel"),calendarWindow=windows.find(window=>window.dataset.windowId==="calendarWindow"),tray=document.createElement("button");tray.type="button";tray.className="os-resource-tray";tray.title="切换府库窗口";const syncTray=()=>{tray.innerHTML=`钱 <b>${$("goldValue")?.textContent||"—"}</b>　粮 <b>${$("foodValue")?.textContent||"—"}</b>　帛 <b>${$("silkValue")?.textContent||"—"}</b>`};resourceTray=tray;syncTray();for(const id of ["goldValue","foodValue","silkValue"]){const target=$(id);if(target)new MutationObserver(syncTray).observe(target,{childList:true,characterData:true,subtree:true})}tray.onclick=()=>{if(!resourceWindow)return;resourceWindow.classList.contains("is-minimized")||resourceWindow.classList.contains("is-closed")?openWindow(resourceWindow):toggleMinimize(resourceWindow)};
    calendarTray=document.createElement("button");calendarTray.type="button";calendarTray.className="os-calendar-tray";calendarTray.title="打开历法";calendarTray.hidden=true;calendarTray.onclick=()=>calendarWindow&&openWindow(calendarWindow);syncCalendarTray();
    const clock=document.createElement("time");clock.className="os-clock";const tick=()=>{const now=new Date();clock.textContent=now.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})};tick();setInterval(tick,30000);dock.append(taskStrip,clock);updateTasks();
    dock.insertBefore(calendarTray,clock);dock.insertBefore(tray,clock);updateTasks();
  }

  function bindDialogs(){
    const managedIds=new Set(["helpDialog","detailDialog","armyDetailDialog","officerDetailDialog","resourceDetailDialog","reportDialog","chronicleDialog","battleReportDialog","ledgerDialog","commandDialog","plannerDialog","modToolsDialog","aiDialog","saveManagerDialog","gameSettingsDialog"]),tasks=new Map;
    const syncTask=dialog=>{const button=tasks.get(dialog);if(!button)return;const title=dialog.querySelector(":scope > .dialog-title > span:not(.os-dialog-buttons):not(.dialog-tools)");if(title)button.textContent=title.textContent.trim();updateTasks()};
    const minimize=dialog=>{dialog.classList.add("is-dialog-minimized");if(dialog.open)dialog.close();syncTask(dialog)};
    const restore=dialog=>{dialog.classList.remove("is-dialog-minimized");if(!dialog.open)dialog.showModal();syncTask(dialog)};
    const maximize=dialog=>{dialog.classList.toggle("os-dialog-maximized");if(dialog.classList.contains("os-dialog-maximized")){dialog.style.removeProperty("left");dialog.style.removeProperty("top");dialog.style.removeProperty("margin")}else dialog.style.margin="auto"};
    const focusDialog=dialog=>{document.querySelectorAll(".os-window.is-active,.os-managed-dialog.is-active").forEach(item=>item.classList.remove("is-active"));dialog.classList.add("is-active");dialog.style.zIndex=String(++topZ);updateTasks()};
    const makeButton=(glyph,title,action,className="")=>{const button=document.createElement("button");button.type="button";button.className=`os-window-button ${className}`.trim();button.textContent=glyph;button.title=title;button.setAttribute("aria-label",`${title}窗口`);button.addEventListener("pointerdown",event=>event.stopPropagation());button.onclick=action;return button};
    document.querySelectorAll("dialog").forEach(dialog=>{dialog.classList.add("os-dialog-window");const handle=dialog.querySelector(":scope > .dialog-title");if(!handle)return;const managed=managedIds.has(dialog.id);if(managed){
        dialog.classList.add("os-managed-dialog");
        const nativeShow=dialog.show.bind(dialog),showManaged=()=>{dialog.classList.remove("is-dialog-minimized");if(!dialog.open)nativeShow();focusDialog(dialog);syncTask(dialog)};
        dialog.showModal=showManaged;
        const controls=document.createElement("span");controls.className="os-dialog-buttons";
        const min=makeButton("_","最小化",()=>minimize(dialog)),max=makeButton("□","最大化或还原",()=>maximize(dialog));
        const close=handle.querySelector("[data-close],#closeHelp");controls.append(min,max);if(close){close.classList.add("os-window-button","os-dialog-close");close.title="关闭";close.setAttribute("aria-label","关闭窗口");close.addEventListener("pointerdown",event=>event.stopPropagation());close.addEventListener("click",()=>dialog.classList.remove("is-dialog-minimized"));controls.append(close)}
        const tools=handle.querySelector(":scope > .dialog-tools");tools?tools.after(controls):handle.append(controls);
        if(taskStrip){const task=document.createElement("button");task.type="button";task.className="os-task-button os-dialog-task";task.textContent=dialog.querySelector(":scope > .dialog-title > span:not(.dialog-tools)")?.textContent?.trim()||handle.childNodes[0]?.textContent?.trim()||"窗口";task.hidden=true;task.dataset.taskDialog=dialog.id;task.onclick=()=>!dialog.open?restore(dialog):dialog.classList.contains("is-active")?minimize(dialog):focusDialog(dialog);taskStrip.append(task);tasks.set(dialog,task)}
        handle.addEventListener("dblclick",event=>{if(!event.target.closest("button"))maximize(dialog)});dialog.addEventListener("pointerdown",()=>focusDialog(dialog));dialog.addEventListener("close",()=>{dialog.classList.remove("is-active");syncTask(dialog)});new MutationObserver(()=>syncTask(dialog)).observe(dialog,{attributes:true,attributeFilter:["open"]})
      }
      handle.addEventListener("pointerdown",event=>{if(event.button!==0||event.target.closest("button")||isCompact()||dialog.classList.contains("os-dialog-maximized"))return;const box=dialog.getBoundingClientRect(),offsetX=event.clientX-box.left,offsetY=event.clientY-box.top;dialog.style.margin="0";dialog.style.left=`${box.left}px`;dialog.style.top=`${box.top}px`;dialog.classList.add("os-dialog-dragging");handle.setPointerCapture(event.pointerId);const move=moveEvent=>{const maxX=Math.max(0,innerWidth-dialog.offsetWidth),maxY=Math.max(0,innerHeight-dialog.offsetHeight),rawX=clamp(moveEvent.clientX-offsetX,0,maxX),rawY=clamp(moveEvent.clientY-offsetY,0,maxY),x=snapValue(rawX,[0,maxX]),y=snapValue(rawY,[0,maxY]);dialog.style.left=`${x.value}px`;dialog.style.top=`${y.value}px`;dialog.classList.toggle("is-snapping",x.snapped||y.snapped)};trackPointer(handle,event.pointerId,move,()=>dialog.classList.remove("os-dialog-dragging","is-snapping"))})});
  }

  function renderCalendar(){
    const label=$("dateLabel"),days=$("calendarDays");if(!label||!days)return;
    const match=label.textContent.match(/(\d+)年\s*(\d+)月\s*(\d+)日/),date={year:Number(match?.[1])||200,month:Number(match?.[2])||1,day:Number(match?.[3])||1},dayCount=GameClock.daysInMonth(date.year,date.month);
    if($("eraLabel"))$("eraLabel").textContent=GameClock.era(date);
    if($("calendarCycle"))$("calendarCycle").textContent=`岁次 ${GameClock.yearStem(date)} · ${GameClock.dayStem(date)}日`;
    days.replaceChildren(...Array.from({length:40},(_,index)=>{
      const cell=document.createElement("span"),day=index+1;cell.className="os-calendar-day";
      if(day>dayCount)cell.classList.add("is-empty");else{cell.textContent=GameClock.dayName(day);cell.setAttribute("aria-label",`${date.month}月${day}日`);if(day===date.day){cell.classList.add("is-current");cell.setAttribute("aria-current","date")}}
      return cell;
    }));
    days.setAttribute("aria-label",`${GameClock.era(date)}${date.month}月日序`);syncCalendarTray();
  }

  function initialize(){
    const windows=[];
    for(const definition of definitions){const window=document.querySelector(definition.selector);if(definition.id==="calendarWindow")document.querySelector(".workspace")?.prepend(window);const handle=window?.querySelector(definition.handle);if(!window||!handle)continue;window.classList.add("os-window");window.dataset.windowId=definition.id;window.dataset.windowTitle=definition.title;window.dataset.windowIcon=definition.icon;window.hidden=false;if(definition.id==="mapWindow"){const caption=document.createElement("span");caption.className="os-map-caption";caption.textContent=definition.title;handle.prepend(caption)}addControls(window,handle);addResizeGrip(window);bindDrag(window,handle);restorePosition(window);windows.push(window)}
    createDesktopShortcuts(windows);createSystemMenu(windows);createTaskStrip(windows);bindDialogs();renderCalendar();
    const dateLabel=$("dateLabel");if(dateLabel)new MutationObserver(renderCalendar).observe(dateLabel,{childList:true,characterData:true,subtree:true});
    const map=windows.find(window=>window.dataset.windowId==="mapWindow"),focusTarget=map&&!map.classList.contains("is-minimized")&&!map.classList.contains("is-closed")?map:windows.find(window=>!window.classList.contains("is-minimized")&&!window.classList.contains("is-closed"));if(focusTarget)focusWindow(focusTarget);
    let wasCompact=isCompact();const clearGeometry=window=>{for(const key of ["left","top","right","bottom","width","height"])window.style.removeProperty(key)};
    const adapt=()=>{const compact=isCompact();if(compact)windows.forEach(clearGeometry);else{if(wasCompact)windows.forEach(window=>window.dataset.userPositioned&&restorePosition(window));windows.forEach(window=>{if(!window.dataset.userPositioned)clearGeometry(window);constrainWindow(window)})}wasCompact=compact};
    addEventListener("resize",adapt);addEventListener("sanguo-game-ready",adapt,{once:true});new MutationObserver(()=>requestAnimationFrame(adapt)).observe(document.body,{attributes:true,attributeFilter:["class"]});requestAnimationFrame(adapt);
    window.SanguoDesktop={reset(){arrangeWindows(windows,"reset")},arrange:mode=>arrangeWindows(windows,mode),windows};
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();
})();
