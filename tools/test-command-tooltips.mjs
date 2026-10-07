globalThis.window=globalThis;
await import("../js/data/command-catalog.js");
const catalog=window.SANGUO_COMMAND_CATALOG;
const missing=catalog.commands.filter(command=>!command.description||command.description.length<15||command.description.includes("行动，加入本旬命令后于旬末结算"));
if(missing.length)throw new Error(`缺少命令简介：${missing.map(command=>command.id).join(", ")}`);
if(new Set(catalog.commands.map(command=>command.id)).size!==catalog.commands.length)throw new Error("命令 ID 重复");
if(new Set(catalog.commands.map(command=>command.description)).size!==catalog.commands.length)throw new Error("存在重复的通用命令简介");
console.log(`命令说明通过：${catalog.commands.length} 条命令均有独立、具体的功能介绍`);
