window.TerminalSelect = (() => {
  let openControl=null;const controls=new WeakMap();
  const close=control=>{if(!control)return;control.root.classList.remove("open");control.button.setAttribute("aria-expanded","false");control.list.hidden=true;if(control.list.parentElement!==control.root)control.root.append(control.list);if(openControl===control)openControl=null};
  const closeAll=except=>{if(openControl&&openControl!==except)close(openControl)};
  const sync=control=>{const options=[...control.select.options],buttons=[...control.list.querySelectorAll("button")],stale=buttons.length!==options.length||options.some((option,index)=>buttons[index]?.textContent!==option.textContent);if(stale){control.list.replaceChildren();options.forEach((option,index)=>{const item=document.createElement("button");item.type="button";item.setAttribute("role","option");item.disabled=option.disabled;item.textContent=option.textContent;item.onclick=()=>{control.select.selectedIndex=index;control.select.dispatchEvent(new Event("change",{bubbles:true}));close(control);control.button.focus()};control.list.append(item)})}const option=control.select.options[control.select.selectedIndex];control.button.querySelector("span").textContent=option?.textContent||"请选择";control.list.querySelectorAll("button").forEach((button,index)=>{const selected=index===control.select.selectedIndex;button.classList.toggle("selected",selected);button.setAttribute("aria-selected",String(selected))})};
  const placement=(rect,menuHeight,viewportHeight)=>{const below=Math.max(0,viewportHeight-rect.bottom-8),above=Math.max(0,rect.top-8),openUp=below<menuHeight;return {openUp,available:openUp?above:below}};
  const enhance=select=>{
    if(select.dataset.terminalSelect||select.multiple||select.size>1)return;select.dataset.terminalSelect="true";select.classList.add("terminal-select-native");
    const root=document.createElement("div"),button=document.createElement("button"),list=document.createElement("div"),control={select,root,button,list};
    root.className="terminal-select";button.type="button";button.className="terminal-select-button";button.setAttribute("aria-haspopup","listbox");button.setAttribute("aria-expanded","false");button.disabled=select.disabled;button.innerHTML="<span></span><i aria-hidden=\"true\"></i>";list.className="terminal-select-list";list.setAttribute("role","listbox");list.hidden=true;
    controls.set(select,control);select.parentNode.insertBefore(root,select);root.append(select,button,list);sync(control);
    button.onclick=()=>{
      if(openControl===control){close(control);return}
      closeAll(control);
      const host=select.closest("dialog[open]")||document.body,rect=button.getBoundingClientRect();
      host.append(list);list.style.position="fixed";list.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-rect.width-8))}px`;list.style.width=`${Math.min(rect.width,window.innerWidth-16)}px`;list.style.right="auto";list.style.top="0";list.style.bottom="auto";list.style.maxHeight=`${Math.max(48,Math.min(260,window.innerHeight-16))}px`;list.style.visibility="hidden";list.hidden=false;
      const desiredHeight=Math.min(260,list.querySelectorAll("button").length*30+8),{openUp,available}=placement(rect,desiredHeight,window.visualViewport?.height||window.innerHeight);
      list.style.top=openUp?"auto":`${rect.bottom+3}px`;list.style.bottom=openUp?`${window.innerHeight-rect.top+3}px`:"auto";list.style.maxHeight=`${Math.max(48,Math.min(desiredHeight,available-4))}px`;list.style.visibility="visible";
      root.classList.add("open");button.setAttribute("aria-expanded","true");openControl=control;list.querySelector(".selected:not(:disabled)")?.focus()
    };
    button.onkeydown=event=>{if(["ArrowDown","ArrowUp","Enter"," "].includes(event.key)){event.preventDefault();if(!root.classList.contains("open"))button.click()}else if(event.key==="Escape")close(control)};
    list.onkeydown=event=>{const items=[...list.querySelectorAll("button:not(:disabled)")],index=items.indexOf(document.activeElement);if(event.key==="ArrowDown"){event.preventDefault();items[(index+1)%items.length]?.focus()}else if(event.key==="ArrowUp"){event.preventDefault();items[(index-1+items.length)%items.length]?.focus()}else if(event.key==="Escape"){event.preventDefault();close(control);button.focus()}};
    select.addEventListener("change",()=>sync(control));
  };
  const absorbTitle=element=>{if(!element?.hasAttribute?.("title"))return;const message=element.getAttribute("title");if(message&&!element.dataset.tip)element.dataset.tip=message;element.removeAttribute("title")};
  const scan=root=>{if(root.matches?.("select"))enhance(root);root.querySelectorAll?.("select").forEach(enhance);absorbTitle(root);root.querySelectorAll?.("[title]").forEach(absorbTitle)};
  scan(document);new MutationObserver(records=>records.forEach(record=>{if(record.type==="attributes")absorbTitle(record.target);else record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)})})).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["title"]});
  document.addEventListener("pointerdown",event=>{if(openControl&&!openControl.root.contains(event.target)&&!openControl.list.contains(event.target))close(openControl)});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&openControl)close(openControl)},true);
  return {enhance,scan,closeAll,refresh:select=>{const control=controls.get(select);if(control)sync(control)},placement};
})();
