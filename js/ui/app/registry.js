// 界面模块注册表。js/ui/app.js 是启动壳（开局、建状态与舆图、主循环、全局快捷键），
// 各功能面板写在 js/ui/app/*.js，用 SanguoApp.define(名, app=>{…; return {导出}}) 登记；
// 壳在依赖就绪处调用 SanguoApp.mount([名…], app) 实例化，导出函数挂回 app 供壳与其他模块调用。
// app 上下文：壳内稳定的函数与常量（state、map、esc、toast…）可在模块顶部解构；
// 会被重新赋值的状态（data、userSettings、pendingTurnBriefing…）与其他模块的导出须写 app.名 按需取用。
// 说明见 docs/DEVELOPMENT.md「界面模块」。
window.SanguoApp={
  parts:new Map(),
  define(name,factory){if(this.parts.has(name))throw new Error(`界面模块重复登记：${name}`);this.parts.set(name,factory)},
  // 上下文对象原样使用：其中的 getter 指向壳内尚未初始化的变量，复制会提前求值
  context(base){return base},
  // 每日刷新节流：模拟每过一日，开着的窗口不立即整窗重绘，而是合并到浏览器空闲时执行，同一窗口两次刷新至少相隔 interval 毫秒
  // （高速模拟时约一秒一次）。任免、读档等仍立即刷新。
  refreshLater(key,fn,interval=900){if(typeof globalThis.setTimeout!=="function"){fn();return}const rows=this.refreshRows??=new Map;let row=rows.get(key);if(!row)rows.set(key,row={last:-Infinity,timer:0});if(row.timer)return;const now=globalThis.performance?.now?.()??Date.now(),wait=Math.max(0,interval-(now-row.last));
    row.timer=setTimeout(()=>{const run=()=>{row.timer=0;row.last=globalThis.performance?.now?.()??Date.now();fn()};if(globalThis.requestIdleCallback)requestIdleCallback(run,{timeout:400});else run()},wait)},
  // 内容与上次相同时不替换节点（免得每日重建上千节点、重排版，也保留展开、输入与焦点）。
  setHtml(el,html){if(!el)return false;if(el.__lastHtml===html&&el.innerHTML.length)return false;el.innerHTML=html;el.__lastHtml=html;return true},
  mount(names,app){for(const name of names){const factory=this.parts.get(name);if(!factory)throw new Error(`界面模块未载入：${name}（检查 index.html 的脚本顺序）`);
    const exported=factory(app)||{};for(const [key,value] of Object.entries(exported)){if(Object.prototype.hasOwnProperty.call(app,key))throw new Error(`界面模块 ${name} 的导出与已有名字冲突：${key}`);app[key]=value}}
    return app}
};
