/* Shared mouse feedback. Moving within a control also restores a dismissed tip. */
(() => {
  function prepareControl(button){
    const chrome=".os-window-button,.os-dialog-close,.os-task-button,.os-start-button,.os-resource-tray,.os-calendar-tray,.os-desktop-icon,.os-app-launcher,.os-submenu-trigger,.os-layout-action,.os-layout-preset,.terminal-select-button,[role=option],[data-close],[data-world-tab],[data-rail-tab],#mapHomeButton,#helpButton,#gameSettingsButton,#closeHelp";
    if(button.matches(chrome)){delete button.dataset.tip;button.removeAttribute("title");return}
    const title=button.getAttribute("title");
    if(title&&!button.dataset.tip)button.dataset.tip=title;
    button.removeAttribute("title");
    if(/^(执行[：:]|选择[：:])/.test(button.dataset.tip||"")||/^执行.+操作$/.test(button.dataset.tip||""))delete button.dataset.tip;
  }
  function install({tooltip=document.getElementById("uiTooltip"),prepareButton=prepareControl}={}) {
    window.ButtonFeedback?.dispose?.();
    let target=null,button=null,point=null;
    const listeners=[];
    tooltip.setAttribute("popover","manual");
    function position() {
      if(!target||tooltip.hidden)return;
      const rect=target.getBoundingClientRect(),pad=8,gap=7;
      tooltip.style.width="max-content";
      tooltip.style.width=`${Math.min(220,innerWidth-pad*2,Math.max(72,tooltip.scrollWidth))}px`;
      const box=tooltip.getBoundingClientRect();
      tooltip.style.left=`${Math.max(pad,Math.min(rect.left,innerWidth-box.width-pad))}px`;
      tooltip.style.top=`${Math.max(pad,rect.bottom+gap+box.height<=innerHeight-pad?rect.bottom+gap:rect.top-box.height-gap)}px`;
    }
    function hide(clearButton=true) {
      if(clearButton){button?.classList.remove("is-pointer-hover");button=null}target=null;
      if(tooltip.matches(":popover-open"))tooltip.hidePopover();
      tooltip.hidden=true;
    }
    function update(node) {
      const next=node?.closest?.("button,[data-tip]");
      // Desktop windows override the old rail's [hidden] attribute in CSS.
      // Use rendered visibility, rather than that attribute, for hit controls.
      if(!next||next.matches(":disabled")||next.closest("[inert]")||!next.isConnected||!next.getClientRects().length||getComputedStyle(next).visibility!=="visible"){hide();return}
      if(next.matches("button"))prepareButton(next);
      const nextButton=next.matches("button")?next:null;
      if(button!==nextButton){button?.classList.remove("is-pointer-hover");button=nextButton}
      button?.classList.add("is-pointer-hover");
      if(!next.dataset.tip){hide(false);return}
      const changed=target!==next||tooltip.hidden||tooltip.textContent!==next.dataset.tip;
      target=next;
      if(changed){tooltip.textContent=next.dataset.tip;tooltip.hidden=false;if(tooltip.showPopover&&!tooltip.matches(":popover-open"))tooltip.showPopover();position()}
    }
    function listen(host,type,handler) {host.addEventListener(type,handler,true);listeners.push(()=>host.removeEventListener(type,handler,true))}
    const move=event=>{if(event.buttons){point=null;hide();return}point={x:event.clientX,y:event.clientY};update(event.target)};
    listen(document,"mousemove",move);
    listen(document,"mouseover",move);
    listen(document,"mouseout",event=>update(event.relatedTarget));
    listen(document,"mousedown",()=>hide());
    listen(window,"blur",()=>{point=null;hide()});
    listen(window,"resize",position);
    listen(document,"scroll",()=>{if(point)update(document.elementFromPoint(point.x,point.y));position()});
    const observer=new MutationObserver(()=>{
      const current=target||button;
      if(current&&(!current.isConnected||current.matches(":disabled")||!current.getClientRects().length)){hide();if(point)update(document.elementFromPoint(point.x,point.y))}
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","disabled","open"]});
    const initial=Array.from(document.querySelectorAll("button:hover,[data-tip]:hover")).at(-1);
    if(initial&&document.hasFocus())update(initial);
    window.ButtonFeedback.dispose=()=>{listeners.forEach(remove=>remove());observer.disconnect();hide()};
  }
  window.ButtonFeedback={install,prepareControl};
})();
