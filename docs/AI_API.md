# AI / MCP 接入契约 v1.0

浏览器端由 `AIBridge` 固定权限边界，由 `BrowserMCPServer` 提供 JSON-RPC 适配，由可选的本地网关连接模型。纯手动模式不启动任何 AI 请求。

## 原则

1. AI 读取的是经过筛选的城市、军团和外交状态。
2. 只读工具可以立即返回结果。
3. 写入工具只能生成普通游戏命令，进入本旬队列。
4. 写入命令与玩家命令使用同一个旬末结算器。
5. 每次工具调用记录操作者、回合、参数、状态和结果。
6. 模型密钥不得保存在浏览器中；正式接入必须经过本地服务或服务端网关。

## 工具

| 工具 | 类型 | 必需参数 |
|---|---|---|
| `list_commands` | 读取 | 可选 `category_id` |
| `inspect_command` | 读取 | `command_id` |
| `inspect_turn_reports` | 读取 | 无；可选 `turn`、`from_turn`、`to_turn`、`limit` |
| `inspect_city` | 读取 | `city_id` |
| `inspect_army` | 读取 | `army_id` |
| `inspect_officer` | 读取 | `officer_id` |
| `submit_command` | 写入队列 | `command_id`, `target_ids`，可选 `actor_id`, `amount`, `options` |

`list_commands` 与 `submit_command` 读取和校验同一份 `commands.json`。增加 Mod 命令时不需要为 AI 另写一套工具定义。

命令目录会把每条命令的 ID、分类、状态、参数约定和简短功能说明提供给 AI；不确定具体作用时可用 `inspect_command` 查询。`inspect_turn_reports` 可按旬号或回合范围查询本局历史旬报，报告保留当旬实际下达的命令及结算事件，支持最多 30 旬分页。AI 每次规划也会收到最近三旬的完整精简报告，以及覆盖全局的短 `reportIndex`，因此不用把整局冗长战报都重复发送给模型。该查询是只读的，存档中不存在的报告不会补造。

托管模式额外计算一份基于己方闲置军团、道路可达性、已掌握城池情报与战力估算的 `militaryAssessment`。如果存在优势目标（评估比值至少 1.2）且己方城市未被围攻，AI 漏掉军务时会走同一命令队列兜底：本旬先宣战，后续旬再排入战争计划；一旦已有战争，只考虑继续现有战线，避免无谓多线开战。辅助模式只给建议，不触发该兜底。满级城池/军团侦察和满级城防命令会被拒绝，避免浪费行动额度。

事件阶段提供 `get_pending_event` 与 `choose_event`。AI 可以读取待决事件及可选项，但只能通过选项 ID 提交决定，不能直接写入资源或城市状态；纯手动模式仍由玩家在事件窗口选择。

人物关系由 `inspect_relationships` 提供只读查询，包括性格、派系、野心、忠诚、结义、婚姻、举荐人与已建立的人际关系。敌方人物仍受既有情报等级限制。

`inspect_diplomacy` 返回所有存续势力之间的公开外交状态，包括关系值、战争、同盟、互不侵犯、停战与附庸关系。AI 仍须使用正式外交命令改变玩家侧关系。

己方军团的 `inspect_army` 结果包含 `combat` 战力分解：主将统武智、副将、地形、兵种基础战力，以及统率、武勇、谋略、特技和当前状态倍率。三级敌军情报也会显示该评估。

## 后续服务边界

```text
CLI 窗口 → AI 网关 → MCP / 游戏工具
                        ↓
                   命令验证器
                        ↓
                   本旬命令队列
                        ↓
                   确定性结算器
```

本地网关支持 DeepSeek Chat Completions 工具调用和 OpenAI Responses API。密钥从项目根目录 `.env` 读取；静态游戏服务器会拒绝访问 `.env`、`.env.*` 和 `.git` 路径。生产部署仍需增加用户会话鉴权、速率限制与持久化审计日志。

## MCP JSON-RPC

页面暴露 `window.jiuzhouMCP.request(message)`，支持：

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

工具输入使用 JSON Schema。写入工具仍由 `AIBridge` 校验，并只生成待执行命令。

## 浏览器适配器

页面暴露 `window.jiuzhouAI`，纯手动模式不需要调用它。外部本地服务可连接一个实现 `generate(context)` 的适配器：

```js
await jiuzhouAI.connect(new HttpAIProvider("http://127.0.0.1:8787"));
await jiuzhouAI.plan();
```

辅助模式只保存建议，不自动写入；托管模式会把返回的 `commands` 逐条交给 `submit_command`。城市、人物和军团查询均受玩家情报等级过滤。

## AI 史官

本方月录与全局天下纪事由设置中的两个独立开关控制，均默认关闭；与军师辅助/托管模式无关，只要求 AI 网关已连接。本方月录在每月下旬结算后异步请求；全局史官只在季度末结算后请求，并汇总该季度三个月的旬报，不阻塞旬结算、不使用工具调用，也不参与命令队列。全局史官可在观察者模式使用。全局候选会保留军事行动、战果、外交关系、天下格局与重要人物事件，优先纳入出兵、进军、驰援及新军编成，同一战事合并；农业、商业、税赋、建设、治安、人口、征募、补员等内政信息在发送前剔除。启用全局史官或重新连接 AI 时，会补查最近四个已结季度，跳过已完成季度与无重要事件的季度；当前季度等到季末。若季度内没有足够分量的日志，则不请求模型、不生成空泛纪事。客户端遇到旧版网关不识别 `chronicle_world` 时，会回退到兼容的 `chronicle_month` 负载。

史官要求简练、有因果与转折，并变化句式。全局季录写约 50–110 字，只记一至三件足以影响天下格局的事；本方月录约 40–90 字。战斗可以补入风尘、鼓角、疲兵等气氛；双方、地点、胜负、城池归属、人物生死和伤亡仍以日志为准，不得虚构引语、兵力或战果。全局纪事和本方月录分别显示在史官档案的“天下季录”和“本方月录”页签，连同失败状态一起保存在本地存档；失败记录可在相应卷册重试。旧版按月保存的全局条目仍可阅读。

## 配置与启动本地网关

项目根目录已经有本机专用 `.env`。将 DeepSeek API Key 填入 `AI_API_KEY=`，默认配置使用 `deepseek-flash` 和 `https://api.deepseek.com`。`.env` 已加入忽略规则，不要把它提交或发送给他人。

通常双击项目根目录 `启动游戏.command`（或运行 `node tools/start-game.mjs`）即可同时启动网页服务和 AI 网关，并在网页打开时自动检测、连接本地网关。若要单独调试网关，也可运行：

```bash
node server/ai-gateway.mjs
```

启动器窗口保持开启即可同时维持两个服务；结束窗口会停止本次由启动器创建的服务。网页 AI 设置可以修改并保存网关地址。`.env` 的常用项为 `AI_PROVIDER`（`deepseek` / `openai`）、`AI_API_KEY`、`AI_MODEL`、`AI_BASE_URL`；shell 中同名环境变量优先于 `.env`。切换到 OpenAI 时，将 `AI_PROVIDER=openai` 并设置相应模型和密钥。兼容旧配置 `OPENAI_API_KEY` / `OPENAI_MODEL`。

网关通过标准工具调用提交 `submit_command`，返回内容仍会进入游戏已有的权限校验和旬命令队列，不会让模型直接修改游戏状态。DeepSeek 网关关闭思考模式并将单次规划输出限制为 900 tokens；史官采用独立 `/chronicle` 端点，每次只发送筛选、裁切后的当月重要事件，输出限制为 180 tokens。DeepSeek 的 API Key、模型和兼容端点配置详见[官方 API 文档](https://api-docs.deepseek.com/)。
