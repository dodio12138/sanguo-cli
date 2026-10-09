window.SimulationSpeedControl = {
  speeds:Object.freeze([3000,1000,500]),
  normalize(delay){return this.speeds.includes(Number(delay))?Number(delay):3000},
  prepare(document){
    for(const id of ["observerSpeed","observerDefaultSpeed","gameObserverSpeed"]){
      const select=document.getElementById(id);if(!select)continue;
      const value=this.normalize(select.value);
      select.innerHTML=this.speeds.map(delay=>`<option value="${delay}">${delay/1000} 秒/日</option>`).join("");
      select.value=String(value);window.TerminalSelect?.refresh(select);
    }
  },
  bind({document,paused}){
    const select=document.getElementById("observerSpeed"),button=document.getElementById("simulationSpeedButton"),toggle=document.getElementById("observerToggle");
    const refresh=()=>{
      const delay=this.normalize(select.value),stopped=paused(),count=this.speeds.indexOf(delay)+1;
      toggle.innerHTML=`<svg viewBox="0 0 24 16" aria-hidden="true">${stopped?'<path d="M9 3L17 8L9 13Z"/>':'<path d="M8 3H11V13H8Z M14 3H17V13H14Z"/>'}</svg>`;
      toggle.dataset.tip=stopped?"继续模拟（空格）":"暂停模拟（空格）";
      toggle.setAttribute("aria-label",stopped?"继续模拟":"暂停模拟");
      toggle.setAttribute("aria-pressed",String(!stopped));
      button.innerHTML=`<svg viewBox="0 0 24 16" aria-hidden="true">${Array.from({length:count},(_,index)=>{const x=(24-count*7)/2+index*7;return `<path d="M${x} 3L${x+6} 8L${x} 13Z"/>`}).join("")}</svg>`;
      button.dataset.tip=`${delay/1000} 秒/日 · 单击切换速度${stopped?" · 已暂停":""}`;
      button.setAttribute("aria-label",`切换模拟速度，当前 ${delay/1000} 秒/日`);
    };
    document.getElementById("simulationSpeedButton").onclick=()=>{
      select.value=String(this.speeds[(this.speeds.indexOf(this.normalize(select.value))+1)%this.speeds.length]);
      select.dispatchEvent(new Event("change",{bubbles:true}));
    };
    select.addEventListener("change",refresh);refresh();
    return {refresh};
  }
};
