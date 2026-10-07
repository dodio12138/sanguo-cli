import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {FileSaveStore} from "../server/save-store.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const smokeTest=process.argv.includes("--smoke-test");
const noOpen=process.argv.includes("--no-open"),argumentValue=name=>{const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]:null};
const mime={".css":"text/css; charset=utf-8",".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".svg":"image/svg+xml",".webp":"image/webp"};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function localSetting(name,fallback){if(process.env[name]!=null)return process.env[name];try{const line=fs.readFileSync(path.join(root,".env"),"utf8").split(/\r?\n/).find(value=>new RegExp(`^\\s*${name}\\s*=`).test(value));if(line)return line.slice(line.indexOf("=")+1).trim().replace(/^(["'])(.*)\1$/,"$2")}catch{}return fallback}
async function isAiGatewayReady(port){try{const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});const health=await response.json();return health.service==="jiuzhou-ai-gateway"}catch{return false}}
const configuredSaveFile=localSetting("JIUZHOU_SAVE_FILE",path.join(root,".local","saves.json")),saveStore=new FileSaveStore(path.isAbsolute(configuredSaveFile)?configuredSaveFile:path.resolve(root,configuredSaveFile));
async function readJsonBody(req,limit=12*1024*1024){let size=0,body="";for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error("请求体超过 12 MB");body+=chunk}return JSON.parse(body||"{}")}

const server=http.createServer(async(req,res)=>{
  if(!["GET","HEAD","PUT","POST"].includes(req.method||"GET")){res.writeHead(405,{"Allow":"GET, HEAD, PUT, POST"}).end();return}
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url||"/","http://localhost").pathname)}catch{res.writeHead(400).end("Bad request");return}
  if(pathname==="/api/saves"&&req.method==="GET"){try{const value=await saveStore.read();res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}).end(JSON.stringify({ok:true,...value}))}catch(error){res.writeHead(500,{"Content-Type":"application/json; charset=utf-8"}).end(JSON.stringify({ok:false,error:error.message}))}return}
  const saveMatch=pathname.match(/^\/api\/saves\/([1-3])$/);if(saveMatch&&["PUT","POST"].includes(req.method||"")){try{const payload=await readJsonBody(req),slot=await saveStore.write(saveMatch[1],payload);res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}).end(JSON.stringify({ok:true,slot}))}catch(error){res.writeHead(/12 MB/.test(error.message)?413:400,{"Content-Type":"application/json; charset=utf-8"}).end(JSON.stringify({ok:false,error:error.message}))}return}
  if(!["GET","HEAD"].includes(req.method||"GET")){res.writeHead(405,{"Allow":"GET, HEAD"}).end();return}
  if(pathname.split("/").some(segment=>/^\.env(?:\.|$)/i.test(segment)||segment===".git"||segment===".local")){res.writeHead(403).end("Forbidden");return}
  if(pathname==="/")pathname="/index.html";
  const target=path.resolve(root,`.${pathname}`);
  if(target!==root&&!target.startsWith(`${root}${path.sep}`)){res.writeHead(403).end("Forbidden");return}
  try{
    const info=await fsp.stat(target);
    if(!info.isFile()){res.writeHead(404).end("Not found");return}
    res.writeHead(200,{"Content-Type":mime[path.extname(target)]||"application/octet-stream","Content-Length":info.size,"Cache-Control":"no-store"});
    if(req.method==="HEAD"){res.end();return}
    fs.createReadStream(target).on("error",()=>{if(!res.headersSent)res.writeHead(500);res.end()}).pipe(res);
  }catch{res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"}).end("Not found")}
});

async function listen(port){return new Promise((resolve,reject)=>{const onError=error=>{server.off("listening",onListening);reject(error)},onListening=()=>{server.off("error",onError);resolve(server.address().port)};server.once("error",onError);server.once("listening",onListening);server.listen(port,"127.0.0.1")})}
let port;const requestedPort=Number(argumentValue("port")||localSetting("JIUZHOU_GAME_PORT","0"));
if(smokeTest){port=await listen(0)}else if(requestedPort){port=await listen(requestedPort)}else{for(let candidate=8080;candidate<=8090;candidate++){try{port=await listen(candidate);break}catch(error){if(error.code!=="EADDRINUSE")throw error}}if(!port){try{port=await listen(0)}catch(error){throw new Error(`常用端口均被占用，系统空闲端口启动也失败：${error.message}`)}}}
const aiPort=Number(localSetting("JIUZHOU_AI_PORT","8787"));
const url=`http://127.0.0.1:${port}/?aiGatewayPort=${aiPort}`;

if(smokeTest){
  try{for(const asset of ["/","/css/ui-polish.css","/js/ui/app.js","/js/data/offline-data.generated.js","/game/data/common/game_rules.json"]){const response=await fetch(`http://127.0.0.1:${port}${asset}`);if(!response.ok)throw new Error(`${asset} 返回 HTTP ${response.status}`);const body=await response.text();if(asset==="/"&&(!body.includes("startScreen")||!body.includes("20260930-78")))throw new Error("主页未包含当前启动界面或脚本版本")}const saves=await fetch(`http://127.0.0.1:${port}/api/saves`).then(response=>response.json());if(!saves.ok||!saves.slots)throw new Error("持久存档 API 未正常响应");for(const asset of ["/.env","/server/.env.example","/.git/config","/.local/saves.json"]){const response=await fetch(`http://127.0.0.1:${port}${asset}`);if(response.status!==403)throw new Error(`${asset} 未被静态服务器拒绝（HTTP ${response.status}）`)}console.log(`启动器冒烟测试通过：主页、样式、游戏脚本、离线数据与存档 API 可访问，私有文件不可访问（${url}）`)}finally{server.closeAllConnections();server.close()}
}else{
  let aiGateway=null,stopping=false;
  if(await isAiGatewayReady(aiPort))console.log(`本地 AI 网关已在运行：http://127.0.0.1:${aiPort}`);
  else{
    aiGateway=spawn(process.execPath,[path.join(root,"server/ai-gateway.mjs")],{cwd:root,stdio:"inherit"});
    aiGateway.on("error",error=>console.error(`AI 网关未能启动：${error.message}；游戏仍可手动游玩。`));
    aiGateway.on("exit",(code,signal)=>{if(!stopping)console.error(`AI 网关已退出（${signal||code}）；游戏仍可手动游玩。`)});
    let ready=false;for(let attempt=0;attempt<20;attempt++){if(await isAiGatewayReady(aiPort)){ready=true;break}if(aiGateway.exitCode!==null)break;await delay(150)}
    if(!ready)console.warn(`AI 网关暂未就绪（端口 ${aiPort}）。游戏仍会正常打开，可检查 .env 或在 AI 设置中调整网关地址。`);
  }
  console.log(`九州棋局已启动：${url}`);console.log("游戏与本地 AI 网关由此启动器一并管理；保持窗口开启，按 Ctrl+C 可同时停止。");
    if(!noOpen){const browser=spawn("open",[url],{detached:true,stdio:"ignore"});browser.on("error",error=>console.error(`未能自动打开浏览器：${error.message}\n请手动访问 ${url}`));browser.unref()}
  const stop=()=>{if(stopping)return;stopping=true;if(aiGateway&&aiGateway.exitCode===null)aiGateway.kill("SIGTERM");server.close(()=>process.exit(0))};process.once("SIGINT",stop);process.once("SIGTERM",stop);
}
