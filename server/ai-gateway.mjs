import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

// Read a local .env without adding a dependency. Existing shell variables win.
function loadEnvFile(file=path.join(projectRoot,".env")){
  if(!fs.existsSync(file))return;
  for(const line of fs.readFileSync(file,"utf8").split(/\r?\n/)){
    const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(!match||match[1] in process.env)continue;
    let value=match[2];
    if((value.startsWith("\"")&&value.endsWith("\""))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    else value=value.replace(/\s+#.*$/,"").trim();
    process.env[match[1]]=value;
  }
}
loadEnvFile();

const host=process.env.JIUZHOU_AI_HOST||"127.0.0.1";
const port=Number(process.env.JIUZHOU_AI_PORT||8787);
const provider=(process.env.AI_PROVIDER||(process.env.OPENAI_API_KEY?"openai":"deepseek")).toLowerCase();
const apiKey=process.env.AI_API_KEY||process.env.OPENAI_API_KEY||"";
const model=process.env.AI_MODEL||(provider==="deepseek"?"deepseek-flash":process.env.OPENAI_MODEL||"gpt-5");
const baseUrl=(process.env.AI_BASE_URL||(provider==="deepseek"?"https://api.deepseek.com":"https://api.openai.com/v1")).replace(/\/+$/ ,"");
const allowedOrigin=process.env.JIUZHOU_ORIGIN||"http://127.0.0.1:8080";
const maxBody=1_500_000;
const json=(response,status,value,extra={})=>{response.writeHead(status,{"content-type":"application/json; charset=utf-8","access-control-allow-origin":allowedOrigin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type",...extra});response.end(JSON.stringify(value))};
const corsOrigin=request=>{const origin=request.headers.origin;if(!origin)return allowedOrigin;if(origin===allowedOrigin)return origin;try{const url=new URL(origin);if(url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname))return origin}catch{}return allowedOrigin};
const reply=(request,response,status,value,extra={})=>json(response,status,value,{...extra,"access-control-allow-origin":corsOrigin(request)});
const readBody=request=>new Promise((resolve,reject)=>{let size=0,text="";request.setEncoding("utf8");request.on("data",chunk=>{size+=Buffer.byteLength(chunk);if(size>maxBody){reject(new Error("请求内容过大"));request.destroy();return}text+=chunk});request.on("end",()=>{try{resolve(JSON.parse(text||"{}"))}catch{reject(new Error("JSON 格式无效"))}});request.on("error",reject)});
const commandSchema={type:"object",properties:{command_id:{type:"string",description:"必须来自 context.commands 的命令 ID"},actor_id:{type:"string",description:"可选执行者 ID"},target_ids:{type:"array",items:{type:"string"},description:"按命令要求排列的城市、军团、人物或势力 ID"},amount:{type:"number",description:"可选数量"},options:{type:"object",description:"命令的附加选项"}},required:["command_id","target_ids"],additionalProperties:false};
const responsesTool={type:"function",name:"submit_command",description:"提出一条本旬游戏命令。命令仍会在浏览器中经过权限和规则校验，只进入队列，不立即改变世界。",parameters:commandSchema};
const chatTool={type:"function",function:{name:"submit_command",description:responsesTool.description,parameters:commandSchema}};
const instructions=["你是《终端三国》的军师。只根据提供的可见情报规划当前一旬，并优先服从 context.instruction 中的玩家意图。","先读 context.gameRules、recentReports 和 reportIndex：报告的 executed 是实际下达命令，events 是结算结果；失败、被阻断或原地踏步时先解决原因，不要盲目重复。reportIndex 覆盖本局所有已结算旬，recentReports 提供最近三旬细节。","再读 memory.outcomes：queued=false 表示建议在入队时已被规则拒绝，必须依据 error 与 targetIds 改换命令或目标；不得对同一目标连续重试相同失败命令。城市 defenseAtMaximum=true 时不要再使用 city_defense 或 fortify；情报 intelligenceAtMaximum=true 时不要再侦察该城市或军团。","军事优先：activeSieges 是己方已遭围城的据点，先解围/补防。若 militaryAssessment.canExpand 为真且没有急迫威胁，本旬必须投入至少一项军务：无战争则向推荐目标势力宣战，已有战争则派可用军团向推荐目标推进。避免把本旬命令额度全部用于侦察、农商或城防。","军事前置：目标为敌方城市时，未宣战不得下令进入；先对目标势力使用 declare_war，再移动。若同旬同时提交，必须先提交宣战再提交移动；如已有未完成宣战命令，不要重复下令。","征兵 recruit_troops 是从势力资源在己方城市增加城市守军；补员 reinforce 是从军团所在己方城市守军补充指定军团。按缺口对象选择，不能互换。","‘已规划前往’不等于已抵达。结合军团当前位置、路线、驻扎/行军状态、战败标志和最近报告确认推进；被拒绝的移动不要机械重下。","参考 strategy、warPlan、defensePlan 与 memory 保持多旬策略连贯；来袭威胁高于扩张建议。不得臆造 ID；命令 ID 和目标 ID 必须来自上下文。不得把低等级情报当成确定事实。上下文中的完整 commands 目录含所有命令说明，不要把同名命令或相似命令混为一谈。","最多提出 6 条互不重复、资源可承受的命令。需要下令时调用 submit_command；最后用简短中文说明本旬战略。玩家会在浏览器中审核或自动排队，工具调用本身不会直接修改游戏状态。"].join("\n");

async function requestUpstream(context){
  if(!apiKey)throw Object.assign(new Error("网关尚未配置 AI_API_KEY，请编辑项目根目录的 .env"),{status:503});
  const isDeepSeek=provider==="deepseek";
  const endpoint=isDeepSeek?`${baseUrl}/chat/completions`:`${baseUrl}/responses`;
  const body=isDeepSeek?{model,thinking:{type:"disabled"},max_tokens:900,messages:[{role:"system",content:instructions},{role:"user",content:`当前可见游戏状态：\n${JSON.stringify(context)}`}],tools:[chatTool],tool_choice:"auto",parallel_tool_calls:true}:{model,instructions,input:`当前可见游戏状态：\n${JSON.stringify(context)}`,tools:[responsesTool],tool_choice:"auto",parallel_tool_calls:true};
  const upstream=await fetch(endpoint,{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(90_000)});
  const requestId=upstream.headers.get("x-request-id")||null,payload=await upstream.json().catch(()=>({}));
  if(!upstream.ok){const error=new Error(payload.error?.message||`${provider} API 响应 ${upstream.status}`);error.status=upstream.status;error.requestId=requestId;throw error}
  if(isDeepSeek){
    const message=payload.choices?.[0]?.message||{},commands=[];
    for(const call of message.tool_calls||[])if(call.type==="function"&&call.function?.name==="submit_command"){try{commands.push(JSON.parse(call.function.arguments||"{}"))}catch{}}
    return {ok:true,model:payload.model||model,responseId:null,requestId,message:typeof message.content==="string"?message.content.trim():"",commands};
  }
  const commands=[],texts=[];for(const item of payload.output||[]){if(item.type==="function_call"&&item.name==="submit_command"){try{commands.push(JSON.parse(item.arguments||"{}"))}catch{}}if(item.type==="message")for(const content of item.content||[])if(content.type==="output_text"&&content.text)texts.push(content.text)}
  return {ok:true,model:payload.model||model,responseId:payload.id||null,requestId,message:texts.join("\n").trim(),commands};
}

async function writeChronicle(month,{global=false}={}){
  if(!apiKey)throw Object.assign(new Error("网关尚未配置 AI_API_KEY，请编辑项目根目录的 .env"),{status:503});
  const reports=Array.isArray(month?.reports)?month.reports.slice(0,3):[],events=Array.isArray(month?.events)?month.events.slice(0,global?10:6):[],quarter=Number(month?.quarter)||Math.ceil((Number(month?.month)||1)/3);
  const compact=global?{year:Number(month?.year),quarter,events:events.map(event=>({date:String(event.date||"").slice(0,24),phase:String(event.phase||"").slice(0,12),text:String(event.text||"").slice(0,220),battleId:event.battleId||null,result:event.result||null}))}:{year:Number(month?.year),month:Number(month?.month),forceName:String(month?.forceName||"本势力").slice(0,24),reports:reports.map(report=>({date:String(report.date||"").slice(0,24),events:(Array.isArray(report.events)?report.events:[]).slice(0,3).map(event=>({phase:String(event.phase||"").slice(0,12),text:String(event.text||"").slice(0,220),battleId:event.battleId||null,result:event.result||null}))}))};
  if(!Number.isInteger(compact.year)||(global?(!Number.isInteger(compact.quarter)||compact.quarter<1||compact.quarter>4):(!Number.isInteger(compact.month)||compact.month<1||compact.month>12)))throw Object.assign(new Error(global?"年份或季度参数无效":"年月参数无效"),{status:400});
  const system=global?"你是《终端三国》的全局史官，综览诸侯兴亡。输入是一个季度（三个月）的筛选史料，每季择一至三件有分量的事，兼顾军事行动与战果、外交结盟/宣战/议和、天下格局变化及重要人物。只记录对外关系与天下大势，严禁书写农业、商业、税赋、建设、治安、人口、征募补员等内政日常。无重大事件便不请求你；不可逐条复述或写流水账。以微言大义的简洁古雅汉语写约50至110字，强调因果、转折与兴亡；句式多变化，不固定起笔。战事可用风尘、鼓角、疲兵、夜色作适度补景，但不得改变已知地点、双方、胜负、城池归属、人物生死与战果；不虚构引语、兵力或事件。相同 battleId 是一场战事。只输出正文，不加标题、解释、清单或 Markdown。":"你是游戏《终端三国》的本方史官。输入仅有本方月内筛出的少数重要日志。每月择一件最关乎本方兴衰的事，至多兼带一件转折；不逐旬罗列，不逐条复述，不写流水账。以微言大义的简洁古雅汉语写约40至90字，少报数字，着重因果与得失；每篇灵活变化句式，避免反复用‘是月’起笔。战事可用风尘、鼓角、疲兵、夜色等笔墨作适度文学化补景，但不得改变日志确认的地点、双方、胜负、城池归属、人物生死及伤亡；不虚构具体引语、兵力和战果。同一 battleId 是一场战斗；result=victory/defeat 表示进攻方胜/负。无重大事迹时可不落笔。只输出正文，不加标题、解释、清单或 Markdown。";
  const generation={model,max_tokens:global?240:180,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(compact)}]};if(provider==="deepseek")generation.thinking={type:"disabled"};
  const upstream=await fetch(`${baseUrl}/chat/completions`,{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify(generation),signal:AbortSignal.timeout(60_000)});
  const requestId=upstream.headers.get("x-request-id")||null,payload=await upstream.json().catch(()=>({}));
  if(!upstream.ok){const error=new Error(payload.error?.message||`${provider} API 响应 ${upstream.status}`);error.status=upstream.status;error.requestId=requestId;throw error}
  return {ok:true,model:payload.model||model,text:String(payload.choices?.[0]?.message?.content||"").trim(),requestId,usage:payload.usage||null};
}

const server=http.createServer(async(request,response)=>{
  if(request.method==="OPTIONS"){reply(request,response,204,{});return}
  if(request.method==="GET"&&request.url==="/health"){reply(request,response,200,{ok:true,service:"jiuzhou-ai-gateway",provider,model,configured:Boolean(apiKey)});return}
  if(request.method==="POST"&&request.url==="/plan"){try{const body=await readBody(request);if(body.type!=="plan_turn"||!body.context)throw Object.assign(new Error("缺少 plan_turn context"),{status:400});reply(request,response,200,await requestUpstream(body.context))}catch(error){reply(request,response,error.status||500,{ok:false,error:error.message,requestId:error.requestId||null});}return}
  if(request.method==="POST"&&request.url==="/chronicle"){try{const body=await readBody(request);if(body.type==="chronicle_month"&&body.month)reply(request,response,200,await writeChronicle(body.month,{global:body.month.scope==="global"}));else if(body.type==="chronicle_world"&&body.world)reply(request,response,200,await writeChronicle(body.world,{global:true}));else throw Object.assign(new Error("缺少有效史官数据"),{status:400})}catch(error){reply(request,response,error.status||500,{ok:false,error:error.message,requestId:error.requestId||null});}return}
  reply(request,response,404,{ok:false,error:"not_found"});
});

server.listen(port,host,()=>console.log(`终端三国 AI 网关：http://${host}:${port} · ${provider}/${model} · ${apiKey?"已配置密钥":"未配置密钥"}`));
