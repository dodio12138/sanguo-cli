globalThis.window=globalThis;
await import("../js/core/mcp-adapter.js");

const calls=[],bridge={manifest:()=>({tools:[{name:"inspect_city",description:"test",inputSchema:{type:"object",properties:{city_id:{type:"string"}},required:["city_id"]}}]}),call:(name,args,actor)=>{calls.push({name,args,actor});return {id:args.city_id,name:"许昌"}}};
const server=new BrowserMCPServer(bridge);
const initialized=await server.request({jsonrpc:"2.0",id:1,method:"initialize",params:{}});
const listed=await server.request({jsonrpc:"2.0",id:2,method:"tools/list",params:{}});
const called=await server.request({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"inspect_city",arguments:{city_id:"xuchang"}}});
if(!initialized.result?.capabilities?.tools||listed.result?.tools?.[0]?.name!=="inspect_city"||called.result?.structuredContent?.name!=="许昌"||calls[0]?.actor!=="mcp-client")throw new Error("MCP adapter test failed");
console.log("MCP 适配器通过：initialize / tools/list / tools/call");
