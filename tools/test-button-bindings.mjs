import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),uiFiles=fs.readdirSync(path.join(root,"js/ui")).filter(name=>name.endsWith(".js")),source=uiFiles.map(name=>fs.readFileSync(path.join(root,"js/ui",name),"utf8")).join("\n"),buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)],failures=[];
const attr=(text,name)=>text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]||"";
for(const match of buttons){const attributes=match[1],label=match[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim(),id=attr(attributes,"id"),type=attr(attributes,"type"),data=[...attributes.matchAll(/\b(data-[\w-]+)(?:="([^"]*)")?/g)].map(item=>item[1]);if(type==="submit")continue;if(data.some(name=>["data-start-view","data-ledger","data-layer","data-close","data-rail-tab","data-chronicle-scope","data-resource-detail"].includes(name)))continue;if(!id){failures.push(`${label||"无文字按钮"}：缺少 id 或受支持的 data 行为`);continue}const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),bound=new RegExp(`(?:\\$\\(["']${escaped}["']\\)|getElementById\\(["']${escaped}["']\\))\\.(?:onclick|addEventListener|onchange)`).test(source)||new RegExp(`\\$\\(["']${escaped}["']\\)[^;\\n]{0,160}\\.(?:onclick|onchange)`).test(source);if(!bound)failures.push(`${id}（${label}）：未发现事件绑定`)}
for(const name of ["data-start-view","data-ledger","data-layer","data-close","data-rail-tab","data-chronicle-scope","data-resource-detail"])if(!source.includes(`[${name}]`))failures.push(`${name}：页面使用了该行为，但 UI 脚本没有统一绑定`);
if(failures.length)throw new Error(`静态按钮绑定审计失败（${failures.length}/${buttons.length}）：\n${failures.join("\n")}`);
console.log(`静态按钮绑定通过：${buttons.length} 个按钮均有 ID 事件、表单提交或统一 data 行为`);
