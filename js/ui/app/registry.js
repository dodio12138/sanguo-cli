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
  mount(names,app){for(const name of names){const factory=this.parts.get(name);if(!factory)throw new Error(`界面模块未载入：${name}（检查 index.html 的脚本顺序）`);
    const exported=factory(app)||{};for(const [key,value] of Object.entries(exported)){if(Object.prototype.hasOwnProperty.call(app,key))throw new Error(`界面模块 ${name} 的导出与已有名字冲突：${key}`);app[key]=value}}
    return app}
};
