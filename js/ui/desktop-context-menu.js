window.DesktopContextMenu = {
  bind({document,itemsFor}){
    const menu=document.createElement("nav");menu.className="os-context-menu";menu.hidden=true;menu.setAttribute("popover","manual");menu.setAttribute("role","menu");menu.setAttribute("aria-label","快捷操作");document.body.append(menu);
    let anchor=null;
    const open=()=>menu.matches(":popover-open")||!menu.hidden;
    const close=(restoreFocus=false)=>{if(menu.matches(":popover-open"))menu.hidePopover();menu.hidden=true;if(restoreFocus&&anchor?.isConnected)anchor.focus?.({preventScroll:true})};
    document.addEventListener("contextmenu",event=>{
      if(!document.body.classList.contains("game-started"))return;
      if(event.target.closest?.('input,textarea,select,[contenteditable="true"]')){close();return}
      const items=itemsFor(event);if(!items?.length){close();return}
      event.preventDefault();close();anchor=document.activeElement;menu.replaceChildren();
      for(const item of items){if(item.separator){const rule=document.createElement("hr");menu.append(rule);continue}const button=document.createElement("button");button.type="button";button.textContent=item.label;button.disabled=!!item.disabled;button.setAttribute("role","menuitem");button.onclick=()=>{close();item.run()};menu.append(button)}
      menu.hidden=false;if(menu.showPopover)menu.showPopover();
      const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(4,Math.min(event.clientX,window.innerWidth-box.width-4))}px`;menu.style.top=`${Math.max(4,Math.min(event.clientY,window.innerHeight-box.height-4))}px`;
      menu.querySelector("button:not(:disabled)")?.focus({preventScroll:true});
    });
    document.addEventListener("pointerdown",event=>{if(open()&&!menu.contains(event.target))close()});
    document.addEventListener("keydown",event=>{
      if(!open())return;const buttons=[...menu.querySelectorAll("button:not(:disabled)")],index=buttons.indexOf(document.activeElement);
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close(true)}
      else if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus()}
    },{capture:true});
    window.addEventListener("blur",()=>close());window.addEventListener("resize",()=>close());
    return {close,menu};
  }
};
