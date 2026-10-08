(() => {
  const $=id=>document.getElementById(id),storageKey="sanguo.os-window-layout.v3";
  const definitions=[
    {selector:"#resourcePanel",id:"resourcePanel",title:"府库",icon:"库",handle:".card-title"},
    {selector:".turn-display",id:"calendarWindow",title:"历法",icon:"历",handle:".card-title"},
    {selector:".map-column",id:"mapWindow",title:"战略舆图",icon:"图",handle:".map-toolbar"},
    {selector:"#factionPanel",id:"factionPanel",title:"己方势力",icon:"君",handle:".card-title"},
    {selector:"#selectionRailPanel",id:"selectionRailPanel",title:"选中区域",icon:"选",handle:".card-title"},
    {selector:"#forcesRailPanel",id:"forcesRailPanel",title:"天下大势",icon:"势",handle:".card-title"},
    {selector:"#commandsRailPanel",id:"commandsRailPanel",title:"军令",icon:"令",handle:".card-title"},
    {selector:"#situationRailPanel",id:"situationRailPanel",title:"战局态势",icon:"报",handle:".card-title"}
  ];
  let topZ=100,layout={};
  try{layout=JSON.parse(localStorage.getItem(storageKey)||"{}")||{}}catch{}

  const isCompact=()=>matchMedia("(max-width:1000px)").matches;
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(layout))}catch{}}
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const snapValue=(value,candidates,distance=5)=>{let result=value,best=distance+1;for(const candidate of candidates){const delta=Math.abs(value-candidate);if(delta<=distance&&delta<best){result=candidate;best=delta}}return {value:result,snapped:best<=distance}};
  const titleOf=window=>window.dataset.windowTitle||"窗口";

  function focusWindow(window){
    document.querySelectorAll(".os-window.is-active").forEach(item=>item.classList.remove("is-active"));
    window.classList.add("is-active");window.style.zIndex=String(++topZ);
  }

  function remember(window){
    if(isCompact()||window.classList.contains("is-maximized"))return;
    const workspace=document.querySelector(".workspace"),box=window.getBoundingClientRect(),host=workspace.getBoundingClientRect();
    layout[window.dataset.windowId]={left:Math.round(box.left-host.left),top:Math.round(box.top-host.top),width:Math.round(box.width),height:Math.round(box.height),minimized:window.classList.contains("is-minimized")};save();
  }

  function restorePosition(window){
    const saved=layout[window.dataset.windowId];if(!saved||isCompact())return;
    window.dataset.userPositioned="true";
    for(const key of ["left","top","width","height"])if(Number.isFinite(saved[key]))window.style[key]=`${saved[key]}px`;
    window.style.right="auto";window.style.bottom="auto";
    if(saved.minimized)window.classList.add("is-minimized");
  }

  function constrainWindow(window){
    if(isCompact()||!document.body.classList.contains("game-started")||window.classList.contains("is-maximized"))return;
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
    window.classList.remove("is-minimized","is-maximized","is-active");window.classList.add("is-closed");updateTasks();
  }

  function openWindow(window){
    window.classList.remove("is-minimized","is-closed");const state=layout[window.dataset.windowId]||{};state.minimized=false;layout[window.dataset.windowId]=state;save();focusWindow(window);updateTasks();
  }

  function toggleMaximize(window){
    window.classList.toggle("is-maximized");
    if(window.classList.contains("is-minimized"))window.classList.remove("is-minimized");
    focusWindow(window);updateTasks();requestAnimationFrame(()=>dispatchEvent(new Event("resize")));
  }

  function addControls(window,handle){
    const controls=document.createElement("span");controls.className="os-window-buttons";
    const minimize=document.createElement("button");minimize.type="button";minimize.className="os-window-button";minimize.title="最小化";minimize.textContent="_";
    const maximize=document.createElement("button");maximize.type="button";maximize.className="os-window-button";maximize.title="最大化";maximize.textContent="□";
    const close=document.createElement("button");close.type="button";close.className="os-window-button os-window-close";close.title="关闭";close.textContent="×";
    for(const button of [minimize,maximize,close])button.addEventListener("pointerdown",event=>event.stopPropagation());
    minimize.onclick=()=>toggleMinimize(window);maximize.onclick=()=>toggleMaximize(window);close.onclick=()=>closeWindow(window);controls.append(minimize,maximize,close);handle.append(controls);
  }

  function addResizeGrip(window){
    const grip=document.createElement("span");grip.className="os-window-resize";grip.setAttribute("aria-hidden","true");window.append(grip);
    grip.addEventListener("pointerdown",event=>{
      if(event.button!==0||isCompact()||window.classList.contains("is-maximized"))return;
      event.stopPropagation();focusWindow(window);const startX=event.clientX,startY=event.clientY,startWidth=window.offsetWidth,startHeight=window.offsetHeight,minWidth=window.classList.contains("map-column")?410:180,minHeight=window.classList.contains("map-column")?320:76;
      window.style.right="auto";window.style.bottom="auto";grip.setPointerCapture(event.pointerId);
      const move=moveEvent=>{const host=document.querySelector(".workspace").getBoundingClientRect(),box=window.getBoundingClientRect(),maxWidth=Math.max(minWidth,host.right-box.left),maxHeight=Math.max(minHeight,host.bottom-box.top-46);window.style.width=`${clamp(startWidth+moveEvent.clientX-startX,minWidth,maxWidth)}px`;window.style.height=`${clamp(startHeight+moveEvent.clientY-startY,minHeight,maxHeight)}px`;if(window.classList.contains("map-column"))dispatchEvent(new Event("resize"))};
      const end=()=>{grip.removeEventListener("pointermove",move);remember(window);dispatchEvent(new Event("resize"))};grip.addEventListener("pointermove",move);grip.addEventListener("pointerup",end,{once:true});grip.addEventListener("pointercancel",end,{once:true});
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
      const end=endEvent=>{if(!endEvent.altKey)snapWindow(window,host);window.classList.remove("is-snapping");handle.removeEventListener("pointermove",move);remember(window)};handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",end,{once:true});handle.addEventListener("pointercancel",end,{once:true});
    });
    window.addEventListener("pointerdown",()=>focusWindow(window));
  }

  function createSystemMenu(){
    const dock=document.querySelector(".main-nav");if(!dock)return;
    const menu=document.createElement("nav");menu.className="os-start-menu";menu.hidden=true;menu.setAttribute("aria-label","应用菜单");
    [...dock.querySelectorAll(":scope > button")].forEach(button=>menu.append(button));const utilities=dock.querySelector(":scope > .nav-end");if(utilities)menu.append(utilities);document.body.append(menu);
    const launcher=document.createElement("button");launcher.type="button";launcher.className="os-start-button";launcher.textContent="漢";launcher.title="三国";launcher.setAttribute("aria-label","打开三国菜单");launcher.setAttribute("aria-expanded","false");launcher.onclick=event=>{event.stopPropagation();menu.hidden=!menu.hidden;launcher.setAttribute("aria-expanded",String(!menu.hidden))};dock.prepend(launcher);
    menu.addEventListener("click",event=>{if(event.target.closest("button")){menu.hidden=true;launcher.setAttribute("aria-expanded","false")}});document.addEventListener("pointerdown",event=>{if(!menu.hidden&&!menu.contains(event.target)&&event.target!==launcher){menu.hidden=true;launcher.setAttribute("aria-expanded","false")}});
  }

  let taskStrip,calendarTray;
  function syncCalendarTray(){if(!calendarTray)return;const match=$("dateLabel")?.textContent.match(/(上|中|下)旬/),day={上:5,中:15,下:25}[match?.[1]]||5;calendarTray.textContent=String(day)}
  function updateTasks(){
    if(!taskStrip)return;taskStrip.querySelectorAll("[data-task-window]").forEach(button=>{const window=document.querySelector(`[data-window-id="${button.dataset.taskWindow}"]`);button.classList.toggle("is-minimized",window?.classList.contains("is-minimized"));button.classList.toggle("is-closed",window?.classList.contains("is-closed"))});
    const calendar=document.querySelector('[data-window-id="calendarWindow"]');if(calendarTray)calendarTray.hidden=!(calendar?.classList.contains("is-minimized")||calendar?.classList.contains("is-closed"));
  }
  function createTaskStrip(windows){
    const dock=document.querySelector(".main-nav");if(!dock)return;taskStrip=document.createElement("span");taskStrip.className="os-task-strip";
    for(const window of windows){const button=document.createElement("button");button.type="button";button.className="os-task-button";button.dataset.taskWindow=window.dataset.windowId;button.textContent=titleOf(window);button.onclick=()=>window.classList.contains("is-minimized")||window.classList.contains("is-closed")?openWindow(window):toggleMinimize(window);taskStrip.append(button)}
    const resourceWindow=windows.find(window=>window.dataset.windowId==="resourcePanel"),calendarWindow=windows.find(window=>window.dataset.windowId==="calendarWindow"),tray=document.createElement("button");tray.type="button";tray.className="os-resource-tray";tray.title="切换府库窗口";const syncTray=()=>{tray.innerHTML=`金 <b>${$("goldValue")?.textContent||"—"}</b>　粮 <b>${$("foodValue")?.textContent||"—"}</b>　望 <b>${$("prestigeValue")?.textContent||"—"}</b>`};syncTray();for(const id of ["goldValue","foodValue","prestigeValue"]){const target=$(id);if(target)new MutationObserver(syncTray).observe(target,{childList:true,characterData:true,subtree:true})}tray.onclick=()=>{if(!resourceWindow)return;resourceWindow.classList.contains("is-minimized")||resourceWindow.classList.contains("is-closed")?openWindow(resourceWindow):toggleMinimize(resourceWindow)};
    calendarTray=document.createElement("button");calendarTray.type="button";calendarTray.className="os-calendar-tray";calendarTray.title="打开历法";calendarTray.hidden=true;calendarTray.onclick=()=>calendarWindow&&openWindow(calendarWindow);syncCalendarTray();
    const clock=document.createElement("time");clock.className="os-clock";const tick=()=>{const now=new Date();clock.textContent=now.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})};tick();setInterval(tick,30000);dock.append(taskStrip,clock);updateTasks();
    dock.insertBefore(calendarTray,clock);dock.insertBefore(tray,clock);
  }

  function bindDialogs(){
    document.querySelectorAll("dialog").forEach(dialog=>{const handle=dialog.querySelector(":scope > .dialog-title");if(!handle)return;handle.addEventListener("pointerdown",event=>{if(event.button!==0||event.target.closest("button")||isCompact())return;const box=dialog.getBoundingClientRect(),offsetX=event.clientX-box.left,offsetY=event.clientY-box.top;dialog.style.margin="0";dialog.style.left=`${box.left}px`;dialog.style.top=`${box.top}px`;dialog.classList.add("os-dialog-dragging");handle.setPointerCapture(event.pointerId);const move=moveEvent=>{dialog.style.left=`${clamp(moveEvent.clientX-offsetX,0,innerWidth-dialog.offsetWidth)}px`;dialog.style.top=`${clamp(moveEvent.clientY-offsetY,0,innerHeight-dialog.offsetHeight)}px`};const end=()=>{dialog.classList.remove("os-dialog-dragging");handle.removeEventListener("pointermove",move)};handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",end,{once:true});handle.addEventListener("pointercancel",end,{once:true})})});
  }

  function renderCalendar(){
    const label=$("dateLabel"),days=$("calendarDays");if(!label||!days)return;
    const match=label.textContent.match(/(\d+)年\s*(\d+)月(?:\s*(上|中|下)旬)?/),year=Number(match?.[1])||200,month=clamp(Number(match?.[2])||1,1,12),period=match?.[3]||"上",currentDay={上:5,中:15,下:25}[period],firstDay=new Date(year,month-1,1).getDay(),dayCount=new Date(year,month,0).getDate();
    days.replaceChildren(...Array.from({length:42},(_,index)=>{const cell=document.createElement("span"),day=index-firstDay+1;cell.className="os-calendar-day";if(day<1||day>dayCount)cell.classList.add("is-empty");else{cell.textContent=String(day);if(day===currentDay){cell.classList.add("is-current");cell.setAttribute("aria-current","date")}}return cell}));
    days.setAttribute("aria-label",`${year}年${month}月`);
    syncCalendarTray();
  }

  function initialize(){
    const windows=[];
    for(const definition of definitions){const window=document.querySelector(definition.selector);if(definition.id==="calendarWindow")document.querySelector(".workspace")?.prepend(window);const handle=window?.querySelector(definition.handle);if(!window||!handle)continue;window.classList.add("os-window");window.dataset.windowId=definition.id;window.dataset.windowTitle=definition.title;window.dataset.windowIcon=definition.icon;window.hidden=false;if(definition.id==="mapWindow"){const caption=document.createElement("span");caption.className="os-map-caption";caption.textContent=definition.title;handle.prepend(caption)}addControls(window,handle);addResizeGrip(window);bindDrag(window,handle);restorePosition(window);windows.push(window)}
    createSystemMenu();createTaskStrip(windows);bindDialogs();renderCalendar();
    const dateLabel=$("dateLabel");if(dateLabel)new MutationObserver(renderCalendar).observe(dateLabel,{childList:true,characterData:true,subtree:true});
    const map=windows.find(window=>window.dataset.windowId==="mapWindow");if(map)focusWindow(map);
    let wasCompact=isCompact();const clearGeometry=window=>{for(const key of ["left","top","right","bottom","width","height"])window.style.removeProperty(key)};
    const adapt=()=>{const compact=isCompact();if(compact)windows.forEach(clearGeometry);else{if(wasCompact)windows.forEach(window=>window.dataset.userPositioned&&restorePosition(window));windows.forEach(window=>window.dataset.userPositioned?constrainWindow(window):clearGeometry(window))}wasCompact=compact};
    addEventListener("resize",adapt);new MutationObserver(()=>requestAnimationFrame(adapt)).observe(document.body,{attributes:true,attributeFilter:["class"]});
    window.SanguoDesktop={reset(){localStorage.removeItem(storageKey);location.reload()},windows};
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();
})();
