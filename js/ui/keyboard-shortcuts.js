/* Keep game shortcuts separate from native text entry and window controls. */
window.GameShortcuts = {
  createHandler({document,actions,blocked=()=>false,citySelected=()=>false}) {
    const bindings={" ":"toggle",c:"commands",b:"battles",r:"reports",i:"intelligence",h:"help","[":"slower","]":"faster",Enter:"city",o:"cityCommands",m:"march"};
    return event=>{
      if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229)return;
      const key=event.key.length===1?event.key.toLowerCase():event.key;
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&key==="s"){
        event.preventDefault();actions.save();return;
      }
      if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
      if(key==="Escape"){
        // Menus and custom selects own Escape; do not close a second window.
        if(document.querySelector('.os-start-menu:not([hidden]),.terminal-select.open,.os-context-menu:not([hidden])'))return;
        event.preventDefault();actions.close();return;
      }
      const target=event.target,active=document.activeElement;
      const editing=node=>node?.isContentEditable||node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="listbox"]');
      if(editing(target)||editing(active)||blocked()||document.querySelector('.os-start-menu:not([hidden]),.terminal-select.open,.os-context-menu:not([hidden])'))return;
      if(key==="Enter"&&(target?.closest?.('button,a,[role="button"]')||active?.closest?.('button,a,[role="button"]')))return;
      const layer=key.match(/^F([1-5])$/);
      const action=layer?"layer":bindings[key];if(!action)return;
      if(["city","cityCommands","march"].includes(action)&&!citySelected())return;
      event.preventDefault();
      if(layer)actions.layer(Number(layer[1])-1);else actions[action]();
    };
  }
};
