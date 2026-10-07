window.BrowserMCPServer = class BrowserMCPServer {
  constructor(bridge){this.bridge=bridge;this.protocolVersion="2025-06-18";}
  tools(){return this.bridge.manifest().tools.map(tool=>({name:tool.name,description:tool.description||tool.name,inputSchema:tool.inputSchema||{type:"object",properties:{}}}));}
  async request(message){
    const id=message?.id??null,ok=result=>({jsonrpc:"2.0",id,result}),fail=(code,message,data)=>({jsonrpc:"2.0",id,error:{code,message,...(data?{data}:{})}});
    if(message?.jsonrpc!=="2.0")return fail(-32600,"Invalid Request");
    if(message.method==="initialize")return ok({protocolVersion:this.protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:{name:"jiuzhou-strategy-browser",version:"1.0.0"}});
    if(message.method==="notifications/initialized")return null;
    if(message.method==="ping")return ok({});
    if(message.method==="tools/list")return ok({tools:this.tools()});
    if(message.method==="tools/call"){
      const name=message.params?.name,args=message.params?.arguments||{};
      if(!this.tools().some(tool=>tool.name===name))return fail(-32602,`Unknown tool: ${name}`);
      try{const value=this.bridge.call(name,args,"mcp-client"),isError=Boolean(value?.error);return ok({content:[{type:"text",text:JSON.stringify(value)}],structuredContent:value,isError})}catch(error){return fail(-32603,error.message)}
    }
    return fail(-32601,`Method not found: ${message.method}`);
  }
};
