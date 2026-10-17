# 《终端三国》Godot 全面移植指南

本文指导把现有浏览器版（原生 HTML/CSS/JS，无构建）完整移植到 Godot 4，范围包括规则引擎、数据、存档、舆图、全部窗口与交互。目标是**同一剧本、同一命令序列、同一随机种子下，与网页版逐日结果一致**，界面与操作在功能上一一对应。

文中引用的文件、函数均以 2026-10-17 的仓库为准（存档版本 `GameState.SAVE_VERSION = 19`）。移植期间网页版仍会继续开发，凡本文与代码不一致处以代码为准，并同步修订本文。

---

## 0. 先读结论

| 决策 | 选择 | 理由 |
|---|---|---|
| 引擎版本 | Godot 4.x .NET 版（≥ 4.3） | 需要 C# |
| 规则引擎语言 | **C#，纯类库（不引用 Godot API）** | 现引擎约 88 万字符 JS，网页版逐日结算平均约 60ms（V8），GDScript 会慢一个数量级；C# 的数值、集合语义与 JS 最接近，可在 `dotnet test` 中脱离 Godot 跑一致性测试 |
| 界面语言 | C#（与引擎同语言，免跨语言封送）；简单场景脚本可用 GDScript | — |
| 数据来源 | 先用 Node 把**已加载完成的剧本**导出为 JSON（"烘焙数据"），Godot 直接读；DataLoader 的移植放到后期 | DataLoader 的合并、补录、任官逻辑繁多，先绕开可尽早跑通引擎 |
| 正确性保证 | **黄金样本差分测试**：Node 跑网页版引擎逐日导出状态摘要，C# 跑同样流程逐日比对 | 唯一可靠的"全方位复刻"验收手段 |
| 存档 | 与网页版存档格式**双向兼容**（同一 JSON 结构与版本号） | 可用网页存档直接复现问题，也是差分测试的输入 |
| Web 导出 | 若必须出网页版，开工前先确认当时 Godot 的 C# Web 导出是否可用；不可用则 Godot 版只发桌面/移动，网页继续用现有版本 | Godot 4 早期版本不支持 C# 导出 Web |

---

## 1. 现状盘点

### 1.1 代码规模

| 部分 | 体量 | 说明 |
|---|---|---|
| `js/core/*.js` + `js/core/engine/*.js` | 约 88 万字符 | 领域层与规则引擎（不含生成数据） |
| `js/ui/*.js` + `js/ui/app/*.js` | 约 78 万字符 | 表现层：舆图、窗口、各面板标记生成 |
| `css/*.css` | 约 16 万字符 | 9 个样式表 |
| `js/data/offline-data.generated.js` | 约 4.8MB | 由 `tools/build-offline-data.mjs` 从 `game/data/` 生成的浏览器镜像 |
| `tools/test-*.mjs` | 133 个 | 回归测试，可直接作为移植的行为规格 |

代码风格：浏览器全局脚本，大量一行多语句、长箭头函数链。移植时**按函数逐个翻译**，不要整体重写或"顺手优化"规则，否则差分测试无法收敛。

### 1.2 模块地图

**领域层 `js/core/`**

| 文件 | 职责 | 移植优先级 |
|---|---|---|
| `game-clock.js` | 历法：日／旬／月末／季末判定、`next(date)`、年号干支、旧旬制存档迁移 | P0 |
| `game-state.js` | 状态容器（继承 `EventTarget`）、`endTurn`、随机数、存档打包／解包、自动存档、迁移 | P0 |
| `rule-engine.js` | 引擎核心：`resolve`／`resolveDay` 每日管线、`monthlyDue`、索引缓存、命令解析 | P0 |
| `engine/*.js`（22 个） | 以 mixin 并入 `RuleEngine.prototype` 的分模块，见 §4.2 | P0–P2 |
| `fiscal-system.js` | 府库、车队（shipments）、按日征收、粮饷结算 | P0 |
| `map-grid.js` | 格网编解码（RLE）、地形／州／郡查询、河流、道路编码、寻路、地面距离 | P0 |
| `data-loader.js` | 读 `game/data`、套剧本、补录人物、任官表、家族目录、Mod 合并与校验 | P2（先用烘焙数据） |
| `simulation-clock.js` | 自动推进的单线程日循环（暂停／恢复／速度） | P1 |
| `save-library.js` | 浏览器存档库（IndexedDB + localStorage） | P1，改为 `user://` 文件 |
| `ai-bridge.js`、`mcp-adapter.js`、`ai-controller.js` | 可选 LLM 军师：工具清单、审计、托管 | P3 |
| `map-editor-drafts.js`、`scenario-map-store.js`、`scenario-officer-store.js` | 编辑器草稿与剧本覆盖存储 | P3 |

**表现层 `js/ui/`**：见 §7、§8。

### 1.3 数据形态（`SANGUO_DATA` 顶层）

```text
scenario  map  mapLayouts  terrainDefs  unitTypes  items  rules  events
officerRelationships  combatDoctrines  cityResourceProfiles  administrativeDivisions
routeNetwork  hanCourt  clans(134)  genealogies  officerPostings  officerSupplement
forces(16)  cities(380)  officers(1304)  armies  commandCatalog(111 条命令)  counties(268)
```

关键记录（节选字段）：

- **city**：`id name type x y force province commandery population garrison governor level commerce agriculture order counties[] administration{*Id} …`
- **county**：`id name commandery capital x y province jurisdictionCityId cityId force population agriculture commerce order developmentProgress lastIncome`
- **officer**：`id name command war intelligence politics charm aptitude{} birthYear deathYear debutYear force city status loyalty merit office officeRank skills[] …`
- **army**：`id name force city commander soldiers units{infantry,cavalry,archers} morale training deputyOfficerIds[] formation tactic route? fieldPosition? siegeTarget? postId? …`
- **map**：100×100 方格；`terrain`、`provinces`、`commanderies` 为**行程编码字符串**（`plains*5,hills*2,…`，空值写作 `*n`），由 `MapGrid.decode/decodeLayer` 展开；`roads[].path` 为 `"x,y:EESE…"` 方向串（`MapGrid.decodeRoadPath`）；`waterways[].points` 以格角为锚点。
- **rules**：`calendar`、`balance`、`buildings`、`technology_tree`、`battle`、`movement`、`city_graph`（城邑邻接表）、`edge_modifiers`（`"a:b": "river"` 等）。

---

## 2. 不可违背的项目约束（移植后同样适用）

摘自 `AGENTS.md` 与已确认的产品要求，Godot 版必须保持：

1. **海陆与海岸线已定稿**：任何自动流程不得改动陆海格；地形层是陆海判定唯一依据。地图编辑器保留用户手动改地形与撤销的能力。
2. **州域由郡合成**：只存在郡域格；州界由 `map.commandery_provinces` 的郡属州关系自动合成，州属调整以整郡为单位，不得出现第二套州界。
3. **人物名册**合并《三国演义》与《三国志》，不得删去虚构人物。
4. 存档、浏览器草稿、仓库默认地图是不同版本，导入导出时不得互相覆盖。
5. 现有的每一个生成脚本（`tools/build-*.mjs`、`freeze-map-layout.mjs` 等）都不在移植范围内，Godot 版只读成品数据。

---

## 3. 总体架构

```text
godot/
├── project.godot
├── Sanguo.Core/                 # C# 类库，零 Godot 依赖（netstandard / net8）
│   ├── Data/                    # 数据模型 + 烘焙 JSON 读取
│   ├── Clock/GameClock.cs
│   ├── State/GameState.cs       # 状态、事件、存档打包
│   ├── Engine/RuleEngine*.cs    # partial class，按 js/core/engine 分文件
│   ├── Fiscal/FiscalSystem.cs
│   ├── Map/MapGrid.cs
│   └── Js/                      # JS 语义兼容层（见 §4.4）
├── Sanguo.Core.Tests/           # xUnit：移植自 tools/test-*.mjs + 黄金样本比对
├── data/                        # 烘焙剧本 JSON、字体、图标
├── scenes/
│   ├── Main.tscn                # 应用壳（顶栏、导航、工作区）
│   ├── StartScreen.tscn
│   ├── map/MapView.tscn
│   ├── windows/*.tscn           # 每个对话框一个场景
│   └── common/*.tscn            # 终端卡片、数据行、按钮等复用控件
├── ui/                          # 界面 C# 脚本
└── theme/sanguo_theme.tres
```

**分层原则**

- `Sanguo.Core` 对应 `js/core/`，只做规则与状态；不得出现 `Node`、`Control`、`GD.Print`。
- 界面层只通过三种途径接触状态：读 `GameState`／`RuleEngine` 的查询方法；调用与网页版相同的命令接口（`addOrder`、`assignCityAdministration`、`createPost` 等）；订阅 `GameState` 事件（`turn`、`orders`、`layer`、`selection`、`restore`、`persistence`）。
- 每日结算放在**后台线程**执行（网页版月末最重约 155–300ms），完成后回到主线程发出 `turn` 事件；结算期间界面只读快照或禁止写操作，与网页 `SimulationClock.busy` 语义一致。

---

## 4. 规则引擎移植

### 4.1 结构对应

JS 用 `Object.assign(RuleEngine.prototype, {...})` 把 22 个模块混入一个类。C# 用 `public partial class RuleEngine`，一个 JS 文件对应一个 `.cs` 文件，方法名保持驼峰原名（或统一 Pascal 化，但须有对照表）。

模块加载顺序（`RuleEngine.PARTS`，同名方法后者覆盖前者，移植时必须核对有无重名覆盖）：

```text
movement siege diplomacy events ai administration offices projects office-effects
army-offices court court-edicts court-crisis battle logistics skirmish population
clans families family-migration family-dynamics command
```

注意 `index.html` 中 `offices.js` 在 `army-offices.js` 之后、`family-dynamics.js` 在 `families.js` 之前载入，与 PARTS 顺序不完全一致；**以浏览器实际载入顺序为准**判断重名覆盖。

| 模块 | 内容 |
|---|---|
| movement | 行军、`routeAdjacency`、Dijkstra `routeSearchCore`／`routeTree`、野径图（offroad）空间索引、`logisticsPath` |
| siege | 围城、多旬攻城、突围 |
| diplomacy | 势力关系、条约、附庸、联军、世界外交（每月 15 日） |
| events | 史实事件、里程碑、随机事件与选项 |
| ai | 诸侯 AI（`runRivalAI`、`runFieldAI`、霸主判定、战争计划） |
| administration | 郡县官署、行政负荷、`resolveAdministration`（每旬）与 `resolveAdministrationShare`（每日一桶城）、开局补任 `openingStaff`、AI 补任 |
| offices | 官署地图、职司评分与缓存（`cityBucket`、`cityCached`）、`aiStaffOffices`、`organizeProvinces` |
| projects | 城建项目 |
| office-effects | 各职专属效果（车队日程、济粮、离都、司马、主簿……） |
| army-offices | 出征军职：主将、副将、军师、军需、军司马、部将 |
| court / court-edicts / court-crisis | 汉庭官制、诏令、朝局剧变 |
| battle / skirmish | 野战结算、阵型战法、小队逐格行动 |
| logistics | 粮道、仓储、车队 |
| population | 户口、人口地点（`popPlace`） |
| clans / families / family-migration / family-dynamics | 世家、家族、庄园迁徙、家势月结 |
| command | 幕府方面（`dudu`／`zhou`／`jun`）、州郡县整编、郡守方面同步、方面汇报 |

### 4.2 每日管线（必须逐项照搬顺序）

`GameState.endTurn()` → `engine.resolve(state, orders)`（置 `_rolling = true`）→ `resolveDay`：

```text
syncAllArmyOfficerLocations
清理过期条约；占领管制倒计时
resolveEconomies
[旬末] applyStrategicSystems, runBorderScouting
auditSupplyRoutes
adjustCommonEnemyRelations, releaseLateVassals, resolveWorldDiplomacy
[非决战阶段] resolveWorldVassals
runCoalitions
resolveCourt, resolveCourtEdicts, resolveCourtCrisis
for order in orders: resolveOrder
auditSieges
resolveAdministrationShare                  # 每日 1/10 城（cityBucket = hash % 10）
[旬末] resolveAdministration(rolling), recoverIdleArmies, aiSiegeResponses,
       resolveSieges, resolveOfficerDynamics
runFieldAI, runRivalAI, resolveForceCommand
[monthlyDue(5)] runCentralAI
advanceArmies, advanceConvoys, resolveDepots, consumeLocalSupplies
resolveArmyCohesion, resolveArmyMedical, resolvePrisoners
resolvePopulation, advanceFamilyHouseholds
runMilestone, runWorldEvents, runEvent, evaluateGameOver
syncAllArmyOfficerLocations
```

之后 `endTurn` 依次：生成旬报（`reports.unshift`）→ `pruneReports` → 清空命令 → `turn += 1` → 判定自动存档期 → `date = GameClock.next(date)` → `updateOfficerLifecycle` → 发出 `turn`、`orders` 事件 → 安排自动存档。

**月内分日**（`monthlyDue(state, day)`：逐日模式下 `date.day === day`，直接调用时为月末）：中枢 AI 5 日；外交 15 日；世家与家族月结 25 日；方面汇报与忠诚仍在月末；钱粮征收在月内分日进行（`FiscalSystem.collectDay`），粮仍在月末。

### 4.3 缓存与失效

引擎内大量记忆化缓存，移植时**语义要一致**（何时失效决定结果）：

- `cityById` 位置索引（数组替换或长度变化即重建）。
- `cityCached(kind, cityId, key, compute)`：按城分桶（`scores`／`governance`／`compliance`），`cityEpoch` 失效；`dropCityScores(forceIds)` 只丢指定势力。
- `invalidateDuties(keepScores)`、`_dutyBatch` 批处理模式（批内延迟同步任免、结束时统一 flush）。
- 寻路：`routeAdjacency` 按节点缓存，并以数组身份与长度校验；`_pathTreeScope` 在 `runRivalAI` 期间复用最短路树。
- `familyCountyOfficeCounts` 备忘、`clanChanged` 清空服从度缓存。

建议：第一版**完全照搬**缓存与失效时机；差分测试全绿后才允许改动实现。

### 4.4 JS → C# 语义陷阱（逐日一致性的关键）

| 陷阱 | JS 行为 | C# 对策 |
|---|---|---|
| 随机数 | `GameState.random()`：xorshift32，`rngState` 初值 20000101，`x^=x<<13; x^=x>>>17; x^=x<<5; rngState=x>>>0; return rngState/4294967296` | 用 `uint` 实现，`x ^= x << 13; x ^= x >> 17; x ^= x << 5;` 结果 `/ 4294967296.0`；调用次数与顺序必须完全一致 |
| 数字 | 全为 double | 一律 `double`；仅在 JS 显式取整处（`Math.floor`、`|0`、`>>>0`）转整 |
| `Math.round` | 0.5 向 +∞ 舍入（`-2.5 → -2`） | 写 `JsMath.Round(x) => Math.Floor(x + 0.5)`，**禁用** `Math.Round`（银行家舍入） |
| `x|0`、`~~x` | 转 int32 截断 | `(int)(long)x` 并处理溢出；写成 `JsMath.ToInt32` |
| `%` | 结果符号随被除数 | C# `%` 相同，但对 double 用 `Math.IEEERemainder` 是错的，用 `%` |
| `Array.prototype.sort` | **稳定**排序；比较器返回 NaN／不一致时行为依引擎 | 用 `OrderBy`／稳定归并排序；比较器照抄 |
| 默认 `sort()` 无比较器 | 按字符串 UTF-16 码元排序 | `string.CompareOrdinal` |
| `localeCompare`（核心层 9 处） | 依赖 ICU 中文排序 | 用固定 culture `zh-CN` 的 `CompareInfo`，并用测试锁定几组样例；若有偏差，导出 Node 端排序结果做查表 |
| 对象键顺序 | 插入顺序，但**整数样式的键排在最前且按数值升序** | 用保序字典 `JsObject`（自定义）；核心层 `Object.entries/keys/values` 约 190 处，迭代顺序会影响结果 |
| `undefined` vs `null` vs 缺省 | `??`、`||`、`?.` 区分细微；`0`、`""` 为假 | 字段用可空类型；`||` 翻译为 `JsTruthy` 判断而非 `??` |
| `toFixed` | 报表文本 | 只影响文本，实现一致即可 |
| `Date.UTC` | `GameClock.daysInMonth`、`dayStem` | `DateTime` UTC 等价实现 |
| `Math.random` | 核心层仅用于命令 id 与存档库 id | 不参与规则，可用 `System.Random` |
| `structuredClone`、`JSON.stringify` 比较 | 多处以序列化字符串比较或做快照 | 序列化器需保证与 JS 相同的键顺序与数字格式（见 §5.3） |

建议在 `Sanguo.Core/Js/` 集中实现 `JsMath`、`JsObject`、`JsArray.StableSort`、`JsJson`，禁止在规则代码中直接使用 .NET 的同名 API。

### 4.5 数据模型：强类型还是动态？

记录对象上有大量运行时附加字段（如 `army.battleArtActive`、`city.occupiedUntil`、`officer.loyaltyCarry`、`unpaid`），且存档会保留未知字段。两种做法：

1. **强类型 + 扩展字典**：常用字段写成属性，其余进 `Dictionary<string, JsonNode> Extra`。类型安全、性能好，但翻译量大。
2. **动态对象**（`JsonObject`／自定义 `JsObject`）：翻译最快、最贴近 JS，但性能差、易错字。

推荐：**城、县、人物、军团、势力、方面（post）用强类型**（它们是热路径），规则表、事件、汉庭、世家等配置数据保留 `JsonNode`。所有类型都要能无损往返未知字段。

---

## 5. 数据与存档

### 5.1 烘焙数据（第一阶段）

新增 Node 脚本（建议名 `tools/export-godot-data.mjs`，尚未编写）：

1. 用与 `tools/test-yellow-turban-scenario.mjs` 相同的方式载入 `DataLoader` 与离线数据；
2. 对 `game/data/history/scenarios/index.json` 中每个剧本调用 `loader.loadScenario(id, {useSavedMap:false})`；
3. 把结果原样写成 `godot/data/scenarios/<id>.json`（仍是 `SANGUO_DATA` 形态，已套用剧本、任官表、人物补录、家族目录）。

这样 Godot 端无需移植 DataLoader 即可开局；`GameState` 构造函数里调用的 `DataLoader.prototype.applyFamilyCatalog` 仍需移植（它在构造时执行）。

### 5.2 DataLoader 移植（后期）

要支持 Mod、地图编辑器、人物编辑器时再移植：`load`、`loadScenario`、`finishScenario`、`applyOfficerPostings`、`buildScenarioOfficers`、`mergeOfficerSupplement`、`applyCityResources`、`assignCommanderySeatOwners`、`applyCountyResources`、`discoverMods`／`validateModManifest`／`applyPatch`、`diagnose`／`validate`。验收：对每个剧本，C# 载入结果与烘焙 JSON 逐字段相等。

### 5.3 存档格式

存档由 `GameState.serialize()` 生成，读档走 `migrateSave` → `applySave`。要点：

- `SAVE_VERSION = 19`；`migrateSave` 包含历次迁移（含旬制→日制 `GameClock.migrate`），必须全部移植，保证旧档可读。
- **瘦身**：开局即有的城、县、人物不保存从不改写的静态字段（`CITY_STATIC`、`COUNTY_STATIC`、`OFFICER_STATIC`），读档时由基础数据补回；小数统一保留四位（`compactValue`）。
- **集合打包**：`packCollections`／`unpackCollections`（`COLLECTION_FIELDS` 列式存储）、`packForceCommand`／`unpackForceCommand`（方面月报压缩字段名）。
- 汇报裁剪：`pruneReports`（`REPORT_FULL`、`REPORT_MAX`）。
- 存储位置：网页版用 IndexedDB 存档库 + localStorage 旧槽 + 本机启动器的 `/api/saves`。Godot 版改为 `user://saves/<id>.json`（可选 gzip），保留导入／导出网页版 JSON 的功能。
- 自动存档周期：日／旬／月／季（默认）／年，由 `autosaveBoundary()` 判定；到期在空闲时写入（Godot 用后台线程序列化，主线程只拿快照）。
- 删除存档：二次确认，正在进行的档案不可删。

验收：网页版导出的存档在 Godot 读入后再导出，与原文件语义相等（同字段同值；键顺序也应一致，便于 diff）。

---

## 6. 一致性验证（移植的核心工程）

### 6.1 黄金样本

新增 Node 脚本（建议名 `tools/golden-trace.mjs`）：

```text
输入：剧本 id、玩家势力、observerMode、天数 N、可选命令脚本（第几天提交什么命令）
过程：new GameState(...) → 逐日 endTurn()
输出（每日一行 JSONL）：
  { day, date, rngState,
    hash: { cities, counties, officers, armies, forces, diplomacy, court, forceCommand, fiscal, clans },
    events: [ {phase, text} ... ] }
另存：第 1、30、90、360 天的完整 serialize() 快照
```

`hash` 用对各子树做稳定序列化后的 SHA-1。C# 测试以同样参数运行，逐日比对：

1. 先比 `rngState`——最早发散处往往就是调用顺序或条件分支的翻译错误；
2. 再比各子树哈希，定位到模块；
3. 发散日加载两边完整快照做字段级 diff。

建议样本：13 个剧本 × 观察者模式 × 360 天；另加 3–5 条带玩家命令的脚本（攻城、调粮、任免、外交、幕府设方面）。

### 6.2 回归测试移植

`tools/test-*.mjs`（133 个）是现成的行为规格。按模块移植成 xUnit 测试，断言与提示文本照抄（中文提示便于对照）。长测名单见 `tools/test-tiers.json`，在 CI 中单独跑。

### 6.3 性能基线

网页版参考（2026-10 实测）：逐日平均约 60ms、月末约 155ms、最重日约 255–300ms；AI 最重约 40ms。Godot 版目标：桌面平台不慢于此。用黄金样本的 360 天跑分作为基准。

---

## 7. 界面移植

### 7.1 视觉语言

终端风格：深墨绿底、细线框、琥珀色标题、等宽字体，加扫描线叠层。CSS 变量（`css/style.css` 的 `:root`）转为 Godot `Theme`：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--bg` | `#0b0f0c` | 全局背景（另有自上而下径向、线性渐变） |
| `--panel` / `--panel2` | `#101710` / `#151d14` | 卡片底 |
| `--line` / `--line-dim` | `#536044` / `#30392c` | 边框、分隔线（虚线分隔用 `line-dim`） |
| `--text` | `#d5d0a6` | 正文 |
| `--muted` | `#85866e` | 次要文字 |
| `--green` | `#91a66c` | 正值、可操作 |
| `--amber` | `#c6a15b` | 标题、强调、主按钮底色 |
| `--red` | `#b76655` | 告警、负值 |
| `--cyan` | `#73a8a0` | 辅助强调 |

- 字体：正文等宽（SFMono / Consolas / Noto Sans Mono CJK SC），标题用衬线；开局画面用 `assets/fonts/start-wenyue.woff2`、`start-daofeng.woff2`（Godot 4 可直接导入 WOFF2）。CJK 需配置字体回退，确保全部人名、生僻字（如"彧""邈"）可显示。
- 扫描线：全屏 `ColorRect` + shader（每 4px 一条黑线，透明度 0.16），`mouse_filter = Ignore`。
- 卡片标题：前缀"◆"，琥珀色，下有一条 `line-dim` 分隔线。主导航激活项前缀"> "。
- 图标：`assets/icons/*.svg`（21 个）直接导入。
- 动效：遵循"减少动态效果"设置（网页版 `gameUiMotion` 与 `prefers-reduced-motion`）。

### 7.2 应用壳（对应 `index.html` 与 `js/ui/app.js`）

```text
顶栏 topbar：品牌 | 历法（日期、旬与日格、干支年号） | 资源
主导航：舆图 汉庭 汉庭官制 幕府 世家 战报 旬报 消息中心(未读数) | 观察者控制 速度 | 存档 读档 设置 退出 帮助
工作区（三栏，230px | 弹性 | 290px）：
  左栏：本势力（君主印、城／将／兵统计）、选中区域、天下大势（势力列表 / 旬报两页签）
  中栏：战略舆图（标题栏、图层页签、缩放/居中、画布、图例、页脚）
  右栏：军令（终端日志、命令输入、命令书按钮、控制模式、问军师）、命令队列（清空、结束本日）
```

响应式断点：≤1050px 隐藏左栏；≤720px 改为上下布局（舆图约 58%，命令区约 42%），图层页签两列。Godot 用 `Container` 嵌套，并在窗口尺寸变化时切换布局。

### 7.3 窗口系统（对应 `os-window-manager.js`）

网页版把常驻面板做成可拖动、可吸附、可最小化／最大化的"桌面窗口"，带任务栏、布局记忆（localStorage `sanguo.os-window-layout.v3`）与布局预设。

常驻窗口：府库、历法、战略舆图、本势力、选中区域、天下大势、军令。

Godot 实现：

- 自定义 `OsWindow`（`PanelContainer`）：标题栏拖动、边缘缩放、吸附（5px 内对齐其他窗口边或工作区边）、置顶 z 序、最小化到任务栏、最大化；布局存 `user://ui_layout.json`。
- 窄屏（≤1000px）切换为纵向滚动堆叠，激活窗口时滚动到可见处（`revealWindow`）。
- 不要用 Godot 原生 `Window`（嵌入子窗口）来做常驻面板，自绘更容易还原样式与吸附行为。

### 7.4 对话框清单

网页版的 `<dialog>` 一律成为 `OsWindow` 的"托管对话框"（可拖动、可同时打开多个）。每个对应一个场景：

| 网页 id | 内容 | 网页模块 | 标记生成器 |
|---|---|---|---|
| `startScreen` | 开局：主菜单、剧本→势力（含开局小地图）→设置三步、读档、设置、退出 | `app/start-screen.js` | — |
| `saveManagerDialog` | 存档管理（保存、另存、删除） | `app.js` | — |
| `gameSettingsDialog` | 游戏设置（速度、确认结束、紧急暂停、动效、史官、自动存档周期） | `app.js` | — |
| `confirmTurnDialog` | 结束本日确认与预估 | `app/resources.js` | — |
| `helpDialog` | 帮助、回合图、Mod 工具入口 | `app.js` | — |
| `resourceDetailDialog` | 府库收支明细、本旬预估 | `app/resources.js` | `FiscalUI` |
| `detailDialog` | 据点档案（他方按情报；己方含官署三栏、户口、粮道、战俘） | `app/city-detail.js` | `PopulationUI` |
| `commanderyDialog` | 郡府档案 | `app/commandery-detail.js` | — |
| `armyDetailDialog` | 军团档案、军职任免 | `app/army-detail.js` | — |
| `battleDetailDialog` | 围城、野战战况 | `app/battle-detail.js` | — |
| `officerDetailDialog` | 人物档案、能力、列传 | `app/officers.js` | — |
| `genealogyDialog` / `clanDialog` | 世家、族谱 | `app/clan-window.js` | `ClanUI` |
| `reportDialog` / `chronicleDialog` | 旬报、史官编年（本势力／天下） | `app/reports.js` | — |
| `battleReportDialog` | 战报 | `app/reports.js` | — |
| `courtDialog` / `courtChartDialog` | 汉庭、汉庭官制图 | `app/court-windows.js` | `CourtUI` |
| `forceCommandDialog` | 幕府：方面页（编辑）与官制图（展示）同源 | `app/force-command-window.js` | `CommandUI`、`AdminChartUI` |
| `ledgerDialog` | 档案：军政、内治、外交关系网、情报、战争与防御计划、人物、国策 | `app/ledgers.js` | — |
| `commandDialog` | 命令书：分类 + 命令卡片两栏 | `app/command-book.js` | `CommandPlanner` |
| `plannerDialog` | 规划器：建筑、编军、官署、职司、突围、整编、增援、行军 | `app/planners.js` | `CommandPlanner` |
| 事件对话框 | 史实事件与选项 | `app/reports.js` | — |
| 游戏结束 | 结局统计 | `app.js` | — |
| 调试／Mod 工具 | 诊断、模组开关、剧本 JSON、存档导入导出 | `app/mod-tools.js` | — |
| AI 设置／军师 | 连接、建议、审计、托管 | `app/ai-panel.js` | — |

### 7.5 "标记生成器"的移植方式

网页版面板类（`CourtUI`、`CommandUI`、`ClanUI`、`FiscalUI`、`PopulationUI`、`CommandPlanner`、`AdminChartUI`）只负责**输出 HTML 字符串**，交互由 `data-*` 属性加事件代理完成，例如：

- `data-officer-open`、`data-city-open`、`data-clan-open`：全局链接，点击打开对应档案；
- `data-post-select`、`data-chart-fold`、`data-cmd-field`、`data-cmd-action`：幕府页的选择、折叠、表单字段与动作。

Godot 移植分两层：

1. **视图模型**：把各生成器里"算出要显示什么"的部分抽成纯函数，输出结构化数据（行、列、节点树、按钮动作）。这部分可放在 `Sanguo.Core` 之外的 `Sanguo.UiModel` 并写单元测试，用网页版生成器的输出做对照。
2. **控件渲染**：
   - 长文本、内联链接：`RichTextLabel`（BBCode `[url=officer:koei11_7]于禁[/url]`），统一处理 `meta_clicked` 分派到"打开人物／城／世家"；
   - 表格（档案、名册）：`Tree`（多列、可排序、可点击行）或自绘虚拟列表（大名册 1300+ 行时）；
   - 组织图（汉庭官制图、幕府官制图）：自定义 `Control`，节点框 + 连线，展开／收起条在节点框底部通栏（与汉庭官制图一致）；
   - 表单：`LineEdit`、`OptionButton`、`SpinBox`。

**幕府界面的一致性要求**：方面页（编辑）与官制图（展示）是"一体两面"，必须由同一份数据生成：每城按 `postOfCity` 归入唯一方面，直辖各城按所属郡府分组，主公直辖按州分组；不得出现两边不一致的情况。

### 7.6 其他交互

- **键盘快捷键**（`keyboard-shortcuts.js`）：照搬键位表，用 `InputMap` 注册。
- **桌面右键菜单**（`desktop-context-menu.js`）：`PopupMenu`。
- **按钮反馈**（`button-feedback.js`）：按下态、忙碌态、禁用原因提示。
- **消息中心**（`message-center.js`）：未读计数、分级、点击定位。
- **日度简报**（`buildTurnBriefing`／`showTurnBriefing`）：结算后的摘要弹层。
- **吐司**：底部居中，0.2s 淡入。
- **模拟速度**（`simulation-speed-control.js`）：暂停／恢复，速度档对应日间隔（最低 250ms，默认 3000ms）；遇紧急事件可自动暂停。
- **界面刷新节流**：网页版用 `SanguoApp.refreshLater(key, fn, 900)` 合并刷新、`setHtml` 内容不变则不重绘。Godot 版同样要求：每日 `turn` 事件后，打开着的窗口按 key 去重、900ms 节流刷新；内容哈希不变就不重建控件树。

---

## 8. 舆图移植（对应 `js/ui/map-view.js`，约 10.7 万字符）

### 8.1 基本模型

- 100×100 方格，`image-rendering: pixelated`；格内同色相邻不画边线。
- 图层（工具栏页签）：地形 `terrain`、势力 `political`、军事 `military`、州域 `province`、郡域 `commandery`、补给 `supply`、情报 `intel`、关系 `relation`、粮食 `food`、武将 `officers`、幕府 `mufu`、行政 `admin`。
- 图例可点击隐藏某类元素（`hiddenLegendItems`），影响着色缓存键。

### 8.2 分层渲染（必须保留，性能来源）

网页版经过优化后分三层：

| 层 | 内容 | 何时重绘 |
|---|---|---|
| 静态层 | 每格底色（`cellBitmap` 按图层着色）、州郡边线、河流、道路、城邑符号 | 图层切换、势力归属变化（`ownershipKey`）、着色缓存键变化（回合、视角、图例、幕府模型戳） |
| 动态层 | 军团、行军路线、车队、围城标记、选中高亮 | 每日结算后、选择变化 |
| 悬停层 | 悬停格与悬停对象高亮 | 鼠标移动 |

Godot 对应：

- 静态层：每图层一张 100×100 `Image` → `ImageTexture`，`TextureRect`（`texture_filter = Nearest`）放大；边线、道路、河流画在同一 `SubViewport` 中并缓存为纹理，只在失效时重绘。
- 拖动与缩放只改 `Camera2D`（或父节点 transform），**不重绘**（对应网页 `paintFromCache`／`dragCache`）。滚轮缩放合并同一帧内的多次输入。
- 动态层：`Node2D._draw()`；军团在"军事"图层用独立布局（`militaryArmyLayout`，兵力条与组织度）。
- 悬停层：独立 `Node2D`，只画高亮。
- 提示框（`mapTooltip`）：跟随鼠标的 `PanelContainer`，琥珀色边框。

### 8.3 地理数据解码

- RLE 图层：`MapGrid.decodeLayer`（移植并单测：解码后再编码应得原串）。
- 道路：`roads[].path` = `"x,y:方向串"`，方向字符 N/E/S/W（含斜向时见 `decodeRoadPath`）；种类 `main` 等决定线宽颜色。
- 河流：`waterways[].points` 以**格角**为锚，`riverCorners`／`riverEdgeCells`／`riverCrossings` 决定渡河与河流边。
- 郡治、县治标注：`map.commanderySeats`、`administrativeDivisions.county_seats`。
- 城邑：`cities[].x/y`；县邑与关隘、渡口的符号按 `MapGrid.nodeKind`／`nodeRank`。

### 8.4 交互

点选城／军（`armyAt` 有 10px 拾取半径；军事层按矩形拾取）、拖动平移、滚轮缩放、居中、悬停提示、行军路线预览、车队焦点（`shipmentFocusId`）、小队逐格行动（突击、阻击、袭扰）的目标选择。触屏：单指拖动、双指缩放。

### 8.5 小地图

开局势力选择页有小地图（`campaignMinimapCanvas`），用静态层纹理缩小绘制，悬停显示势力提示。

---

## 9. 编辑器（后期）

- **地图编辑器**（`map-editor.js` 约 11.7 万字符、`map-editor-reference.js`）：地形、郡域、道路、河流、城池编辑，参考图叠加、草稿、撤销、导出。必须遵守 §2：郡域只存在于陆地格；州域由郡属州关系合成；海陆只由用户手动修改。业务约定见 `docs/MAP_EDITOR.md`。
- **人物编辑器**（`officer-editor.js`）：剧本人物覆盖。

这两项依赖 DataLoader 移植（§5.2），放在最后阶段。

---

## 10. 可选模块

- **AI 军师／史官**（`ai-bridge.js`、`mcp-adapter.js`、`ai-controller.js`，配置见 `docs/AI_API.md`）：工具清单（`list_commands`、`inspect_*`、`submit_orders` 等）把 LLM 的调用转为普通命令进入同一队列，并记审计。Godot 版用 `HTTPRequest` 访问本地网关（`server/ai-gateway.mjs`）或兼容接口；客户端不得保存密钥。
- **Mod**（`mods/`、`docs/MODDING.md`）：同 id 后加载覆盖，数组整体替换，显式 patch 局部合并。依赖 DataLoader 移植。

---

## 11. 分阶段计划与验收

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **M0 准备** | 建 C# 解决方案与 Godot 工程；编写 `export-godot-data.mjs`、`golden-trace.mjs`；实现 `Js/` 兼容层并单测 | 13 个剧本烘焙 JSON 可读入；黄金样本生成完毕；`JsMath.Round`、稳定排序、键顺序有测试 |
| **M1 状态与时钟** | `GameClock`、`GameState`（构造、hydrate、random、事件）、`MapGrid` 解码与距离、存档打包与读档迁移 | 构造后第 0 天快照与 JS 一致；网页存档读入再导出语义相等 |
| **M2 引擎主干** | 每日管线骨架 + economy／fiscal／movement／siege／battle／logistics／population | 观察者模式 30 天内 `rngState` 与主要子树哈希一致 |
| **M3 引擎全量** | 外交、事件、AI、官署、幕府、汉庭三模块、世家家族、军职、城建、小队 | 13 剧本 × 360 天逐日哈希全部一致；移植的回归测试全绿；性能不低于网页版 |
| **M4 舆图** | 三层渲染、12 图层、拾取、拖动缩放、提示、图例 | 与网页版同存档截图对比，各图层着色一致；拖动／缩放帧时间 < 4ms |
| **M5 应用壳与常驻窗口** | 主题、顶栏、导航、三栏、窗口管理、命令输入与队列、模拟时钟、自动存档 | 可完整开局→推进→存读档 |
| **M6 全部对话框** | §7.4 全表，视图模型 + 控件 | 网页版 `tools/qa-all-buttons.mjs` 覆盖的每个按钮在 Godot 版都有对应且可用 |
| **M7 编辑器与可选模块** | DataLoader、Mod、地图／人物编辑器、AI 军师 | 编辑器保存的地图与网页版互通；遵守 §2 |
| **M8 发布** | 桌面导出（macOS／Windows／Linux），图标、字体子集、存档迁移说明 | 安装包可离线运行；网页存档可导入 |

每个阶段结束都跑一次完整差分测试；网页版继续迭代时，重新生成黄金样本并把增量改动同步移植（以网页仓库提交为单位记录对照）。

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| 网页版持续开发，移植追不上 | 冻结一个基线提交作为 M3 目标；之后按提交逐个移植，`DEVELOPMENT.md` 的 P 编号作为对照索引 |
| 逐日结果发散难以定位 | 黄金样本逐日记 `rngState`；为每个管线步骤加可选的子步骤哈希（两边同开关） |
| 中文排序、键顺序等语义差异 | 集中在 `Js/` 兼容层并加测试；禁止规则代码直接用 .NET 排序与字典遍历 |
| UI 量大（约 78 万字符的标记生成） | 先抽视图模型并以网页输出做对照测试，再做控件；优先常用窗口（据点、军团、人物、府库、命令书、幕府） |
| C# Web 导出不可用 | 网页端继续用现有 JS 版本；Godot 版定位桌面与移动 |
| 大名册、长报表卡顿 | 虚拟列表；报表分页；与网页一样节流刷新 |
| 存档体积（网页版上限约 1.4MB） | 保持相同瘦身规则；Godot 端可加 gzip |

---

## 13. 参考文档

- `docs/DEVELOPMENT.md`：开发设计与各轮（P1–P121）改动记录，是规则意图的主要说明
- `docs/PROJECT_LESSONS.md`：已确认的产品要求与防复发约定
- `docs/MAP_EDITOR.md`、`docs/MAP_SOURCES.md`：地图编辑与来源
- `docs/ADMINISTRATION_REFORM_PLAN.md`、`docs/FORCE_COMMAND_PLAN.md`、`docs/HAN_COURT_PLAN.md`：官署、幕府、汉庭
- `docs/FAMILY_SYSTEM.md`、`docs/POP_CLAN_PLAN.md`：家族与户口
- `docs/WARFARE_LOGISTICS_PLAN.md`、`docs/GRAIN_AND_ARMY_FARMING.md`、`docs/SKIRMISH_GAMEPLAY.md`：战争与后勤
- `docs/PERFORMANCE_2026-10-15.md`、`docs/OPTIMIZATION_PLAN.md`：性能基线与已做优化
- `docs/AI_API.md`、`docs/MODDING.md`：AI 接入与 Mod
