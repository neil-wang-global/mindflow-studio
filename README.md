# MindFlow Studio

**把 [MindFlow](https://github.com/neil-wang-global/MindFlow) 的 Runtime Root 变成一个可操作的工作台。**

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

## 安装

```bash
cd /Users/neil/Workspace/mine_craft/mindflow-studio
npm install
npm run build:client

dsh plugin --profile web add link:$PWD
dsh plugin --profile web install
# 重启 dsh web 后，侧边栏出现 MindFlow Studio
```

## 前提

- MindFlow 协议已 clone 到 `~/.mindflow/MindFlow`（跑一次 `/mindflow` 即可）
- Runtime Root 已初始化（技能第一次运行时会从 `templates/` 复制）

Runtime Root 解析顺序与 MindFlow 一致：
`MINDFLOW_RUNTIME_ROOT` → `<protocolRoot>/runtime/` → 调用方显式路径。

## 开发

```bash
npm run build:client   # 把 src/client/panel.js 建成 lib/client.js
npm test               # 7 个套件：解析、host、Soul、表单、三个渲染测试
```

测试里值得注意的两点：

- `render-liveness.mjs` 专门锁住 **stalled 判定** —— 文件说 running 但 agent 已死时必须显示 Stalled。
  这个 bug 在开发时真实出现过（`live` 参数没传下去），现在有回归保护。
- `parse-state.mjs` 锁住两个真实修过的 bug：`running` 被误当模板占位符、
  `learning-acquire` 不在主序列导致阶段条全灰。

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

## 尚未实现

- **原生会话停靠**：pomasa-studio 用 `position: fixed` 把宿主 `ConversationRoot` 停靠进面板，
  Studio 目前只有"注入追问"的数据接口（`POST /mindflow/task.interject`），尚未把对话区画进面板。
- **文件监视推送**：现在 1.5s 轮询任务列表；数据量大时应换成 SSE。
- **产物预览**：只列文件名，未渲染 Markdown。

## License

MIT
