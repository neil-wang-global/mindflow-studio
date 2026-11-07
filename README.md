# MindFlow Studio

**把 [MindFlow](https://github.com/neil-wang-global/MindFlow) 的 Runtime Root 变成一个可操作的工作台。**

> 相关仓库
> - [MindFlow](https://github.com/neil-wang-global/MindFlow) —— 协议本体（Studio 只读它，不写它）
> - [neil-skills /mindflow](https://github.com/neil-wang-global/neil-skills/blob/main/skills/mindflow/SKILL.md) —— 在任意目录跑一遍完整的 MindFlow 流程

一个 DSH（DeepSeek Harness）Web 插件：看任务跑到哪一步、新建任务、维护 Soul、浏览知识与能力。

> 不需要重启也能用命令行读数据 —— 但面板本身需要 DSH 重启后才会出现。

---

## 它解决什么

MindFlow 把状态存在一堆 Markdown 文件里（`state.md`、`kb-*.md`、`cap-*.md`），
好处是你能随时手工改；代价是**不看文件就不知道任务跑到哪了**。

Studio 把这些文件读成界面：阶段条、步骤状态、产物列表、知识库分类、能力清单。
并且它不会替你编造状态 —— 文件里没有的，界面也不假装有。

## 四条设计约束

| 约束 | 为什么 |
|---|---|
| **状态只读文件，不推导** | 阶段 = `state.md §Current Phase`，不另造状态机 |
| **运行中判定以 agent 注册表为准** | `state.md` 停在 `running` 但进程已死 → 显示 **Stalled**，不假装在跑 |
| **只有 Soul 可编辑** | 知识库有 `INDEX.md` 与 `kb-*.md` 的一致性契约，直接改容易破坏 |
| **任务经 DSH 会话执行** | 起一个会话跑 `/mindflow <task>`，协议只有一份实现 |

## 面板

```
┌────────────┬──────────────────────────────────────┐
│ MindFlow   │ task-id                  [Running]   │
│ Studio     │ L(Read) ▶ Recog ▶ Anal ▶ Exec ▶ …   │
│            │──────────────────────────────────────│
│ Tasks      │ Runtime Root / Current Step / …      │
│ New task   │──────────────────────────────────────│
│ Soul       │ Steps   Step 1: completed …          │
│ Knowledge  │ Artifacts  _output/report.md         │
│ Capabilit. │                                      │
│            │                                      │
│ ─────────  │                                      │
│ 任务列表    │                                      │
│ 2026..demo │                                      │
│  [Running] │                                      │
└────────────┴──────────────────────────────────────┘
```

- **Tasks** —— 左侧任务列表，右侧详情：信息条、阶段条、步骤、产物
- **New task** —— 轻量表单（Goal / 类型 / 素材 / 产出 / 约束），提交后起会话跑 `/mindflow`
- **Soul** —— 八个字段逐项编辑，直接写 `{runtime}/mind/soul/core.md`
- **Knowledge** —— 按协议已有的 `Type`（concept / method / domain / self）分组，可切 approved / drafts / archived
- **Capabilities** —— 按「有无待处理变更（`cu-*.md`）」与「已定义」分组

## 快速开始

三步，五分钟。把 `<profile>` 换成你的 profile 名（`web`、`desktop` 等）。

### 1. 先让 MindFlow 能跑

Studio 是 MindFlow 的观察窗口，它不自己创建运行态。所以先装技能并跑一次：

```bash
claude plugin marketplace add neil-wang-global/neil-skills
claude plugin install neil-skills@neil-skills
```

然后在任意目录执行一次 `/mindflow <随便一个任务>`。这一步会 clone 协议到
`~/.mindflow/MindFlow`、初始化 Runtime Root、并和你一起填好 Soul。
**跳过这步 Studio 会显示「没有运行态」。**

### 2. 安装 Studio

```bash
git clone https://github.com/neil-wang-global/mindflow-studio.git
cd mindflow-studio
npm install
dsh plugin --profile <profile> add link:$PWD
```

`add` 一步就够了：它会把包装进 profile，并**自动把这个包登记为 profile 的 bundle**
（因为 `package.json` 里声明了 `dsh.bundle`）。不需要再 `install`，也不需要手工改配置。

### 3. 重启并确认

```bash
dsh web        # 或你的 profile 名
```

侧边栏的「全局面板」区域会出现 **MindFlow Studio**，点开就是工作台。

**确认安装成功**（可选）：

```bash
curl http://127.0.0.1:3080/mindflow/runtime
```

返回 JSON 就说明 host 侧已挂载；还是 404 说明要么没重启，要么 bundle 没登记。

### 卸载

```bash
dsh plugin --profile <profile> remove mindflow-studio
```

## 它读哪个目录

Studio 不猜路径，解析顺序和 MindFlow 协议完全一致：

1. 环境变量 `MINDFLOW_RUNTIME_ROOT`
2. `<协议仓库>/runtime/`（默认，即 `~/.mindflow/MindFlow/runtime`）
3. 调用方显式指定

想「一个项目一个运行态」，就给不同项目设不同的 `MINDFLOW_RUNTIME_ROOT`，
Studio 会跟着切。每个任务解析出的实际路径记录在它的 `state.md §Runtime Root` 里。

## 开发

```bash
npm run build          # 生成 lib/index.js（host）与 lib/client.js（面板）
npm test               # 构建 + 10 个套件
```

`lib/` 下两个入口都是**构建产物**，改了 `src/` 必须重新 build——手写的入口曾经
因为 import 路径指向错误目录，导致 DSH 静默跳过整个插件（没报错、没面板、路由全 404）。
现在 `build-host.mjs` 会逐条校验 import 能否解析，路径错了构建直接失败。

测试锁住的真实 bug：

- `render-liveness.mjs` —— **stalled 判定**：文件说 running 但 agent 已死时必须显示 Stalled
- `parse-state.mjs` —— `running` 被误当模板占位符、`learning-acquire` 导致阶段条全灰
- `host.mjs` —— **路径穿越**：`taskId=../../../etc` 曾能读到运行态之外的文件
- `markdown.mjs` —— XSS：产物里的 `<script>` 必须当文本、`javascript:` 链接不成为锚点

## 结构

```
src/shared/parse-state.js    state.md → 结构化事实（前端与测试共用）
src/host/
  runtime-root.js            Runtime Root 解析、任务扫描、产物读取（含路径穿越防护）
  soul.js                    Soul 读写的唯一写入点
  knowledge.js               知识库只读列表
  capabilities.js            能力只读列表
  sessions.js                taskId → sessionId 绑定
  task-launcher.js           表单转任务陈述、起会话、注入追问
src/client/panel.js          面板（五视图 + 原生样式）
lib/                         构建产物与 host 入口
```

## 三个核心能力

**原生会话停靠** —— 任务详情右侧的对话区**就是该任务的 DSH 会话本身**。
不重写聊天，而是量出面板里的占位盒，用 `position: fixed` 把宿主
`[data-conversation-scroll]` 的父节点挪过去；元素不出现在 React 树里移动，
面板关闭时原样式还原。所以你打字就是那个会话的正常一轮对话。

**产物浏览** —— 点文件名即可预览。Markdown 用自建渲染器
（标题/列表/代码块/表格/引用/行内样式），全程 `React.createElement`，
没有 `dangerouslySetInnerHTML`，产物里的原始 HTML 只会当文本显示。

**文件监视推送** —— `fs.watch` 监听 `tasks/`、`mind/`、`capabilities/`，
变化后经 SSE 推到面板，延迟从最多 1.5s 降到接近即时。
watcher 只当"触发器"用：收到事件就重读文件，所以漏一个事件最多晚一点，
不会读错。流断了自动退回慢轮询。

## Plan 展示

`Plan` 是 Task 的核心产物——它定义 Step、每个 Step 调什么 Capability、
能不能并行。`state.md` 只记录每步跑到哪了，所以把 Plan 读出来才能看懂进度。

`SYSTEM.md §Runtime Roles` 的层级：
`Task`（入口，`tasks/{task-id}/`）→ `Plan`（`plan.md`）→ `Step` → `Capability`。

## 和另外两个仓库的关系

```
MindFlow（协议）          ← Studio 只读协议树的 SYSTEM.md / 模块 README
  ├── /mindflow 技能      ← 在任意目录跑完整流程（同步仓库、Soul、Recovery、主流程）
  └── MindFlow Studio     ← 这个插件：看进度、聊任务、看产物、改 Soul、看知识能力
```

- **协议**决定「怎么跑」：Studio 不重新实现任何规则，全部以同步下来的 `SYSTEM.md` 为准
- **技能**决定「谁去跑」：一个 DSH 会话执行 `/mindflow <task>`
- **Studio** 决定「你怎么看」：读同一个 Runtime Root，经会话通道下指令

所以三者不重复：去掉技能，Studio 就没有东西可跑；去掉 Studio，技能照样在终端里工作。

## License

MIT
