/* Shared mouse feedback. Moving within a control also restores a dismissed tip. */
(() => {
  function install({tooltip=document.getElementById("uiTooltip"),prepareButton=()=>{}}={}) {
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
    function hide() {
      button?.classList.remove("is-pointer-hover");button=null;target=null;
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
      if(!next.dataset.tip){hide();return}
      const changed=target!==next||tooltip.hidden||tooltip.textContent!==next.dataset.tip;
      target=next;
      if(changed){tooltip.textContent=next.dataset.tip;tooltip.hidden=false;if(tooltip.showPopover&&!tooltip.matches(":popover-open"))tooltip.showPopover();position()}
    }
    function listen(host,type,handler) {host.addEventListener(type,handler,true);listeners.push(()=>host.removeEventListener(type,handler,true))}
    const move=event=>{if(event.buttons){point=null;hide();return}point={x:event.clientX,y:event.clientY};update(event.target)};
    listen(document,"mousemove",move);
    listen(document,"mouseover",move);
    listen(document,"mouseout",event=>update(event.relatedTarget));
    listen(document,"mousedown",hide);
    listen(window,"blur",()=>{point=null;hide()});
    listen(window,"resize",position);
    listen(document,"scroll",()=>{if(point)update(document.elementFromPoint(point.x,point.y));position()});
    const observer=new MutationObserver(()=>{
      if(target&&(!target.isConnected||target.matches(":disabled")||!target.getClientRects().length)){hide();if(point)update(document.elementFromPoint(point.x,point.y))}
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","disabled","open"]});
    const initial=Array.from(document.querySelectorAll("button:hover,[data-tip]:hover")).at(-1);
    if(initial&&document.hasFocus())update(initial);
    window.ButtonFeedback.dispose=()=>{listeners.forEach(remove=>remove());observer.disconnect();hide()};
  }
  window.ButtonFeedback={install};
})();
