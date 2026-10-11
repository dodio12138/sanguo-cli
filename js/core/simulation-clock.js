/* A single serialized daily simulation loop. Pausing cancels future days. */
class SimulationClock {
  constructor({step,blocked=()=>false,onChange=()=>{},delay=3000,paused=true,setTimer=(fn,ms)=>window.setTimeout(fn,ms),clearTimer=id=>window.clearTimeout(id)}){Object.assign(this,{step,blocked,onChange,delay,paused,setTimer,clearTimer});this.timer=null;this.busy=false;this.generation=0}
  pause(){this.paused=true;this.generation++;this.clearTimer(this.timer);this.timer=null;this.onChange(this)}
  resume(){if(!this.paused)return;this.paused=false;this.onChange(this);this.schedule()}
  toggle(){this.paused?this.resume():this.pause()}
  setDelay(delay){this.delay=Math.max(250,Number(delay)||3000);this.generation++;this.clearTimer(this.timer);this.timer=null;this.schedule()}
  schedule(){if(this.paused||this.busy||this.timer!==null)return;const generation=this.generation;this.timer=this.setTimer(async()=>{this.timer=null;if(this.paused||generation!==this.generation)return;if(this.blocked()){this.pause();return}this.busy=true;try{await this.step();if(this.blocked())this.pause()}catch(error){this.pause();console.error("日模拟失败",error)}finally{this.busy=false;this.schedule()}},this.delay)}
}
window.SimulationClock=SimulationClock;
