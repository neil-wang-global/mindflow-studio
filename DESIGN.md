# MindFlow Studio

DSH 插件：把 MindFlow Runtime Root 变成一个可操作的工作台。

## 定稿决策（已确认）

| 议题 | 决定 |
|---|---|
| 起点 | 从零新建，不 fork pomasa-studio |
| 运行载体 | 起一个 DSH 会话跑 `/mindflow <task>`，Studio 记录 taskId→sessionId |
| 沟通形态 | 原生 `ConversationRoot` 视觉停靠进面板，不自己造聊天 |
| Soul | **唯一可编辑**的维护项，结构表单逐字段编辑 |
| 知识与能力 | **只展示**，不编辑 |
| 分组依据 | 用协议已有字段（知识 `Type`、能力 `Status`），不新增评级字段 |
| 新建任务 | 轻量表单，只放关键字段，运行时拼成自由文本 |

## 为什么是插件而不是页面

MindFlow 的状态在文件里，DSH 已有 sessions / 文件服务 / 原生对话，
插件只是把两者接起来。不造聊天、不造 agent 调度。

## 边界（三条铁律）

**1. 只读文件事实，不推导状态**

| 展示项 | 权威来源 |
|---|---|
| 当前阶段 | `state.md §Current Phase` |
| 步骤状态 | `state.md §Step Status Map` |
| 总体状态 | `state.md §Overall Status` |
| 运行中判定 | DSH agent 注册表 `ctx.get('agents').get(sid)?.status` |

`state.md` 停在 `running` 而 agent 已死 → 判 `stalled`，绝不恒显"运行中"。

**2. 只经会话通道下指令**

除 Soul 表单外，Studio 不直接写运行态产物。知识库有 `INDEX.md` 与
`kb-*.md` 的一致性契约，直接改文件容易破坏契约。

**3. Soul 是唯一例外**

Soul 结构稳定（固定 8 字段）、无跨文件一致性契约、用户明确要求便捷维护，
所以用表单直接写 `{runtime}/mind/soul/core.md`。

## Soul 字段（表单项）

`Identity` / `Mission` / `Values` / `Taboos` /
`Methodology Preference` / `Decision Style` / `Aesthetic Preference` / `Learning Policy`

写回格式严格对齐 `templates/mind/soul/core.md`：

```markdown
# Soul

## Identity
- 内容

## Mission
- 内容
```

## 知识与能力展示

**知识**（`{runtime}/mind/learning/knowledge-base/approved/*.md`）
- 分组维度：`Type` = `concept / method / domain / self`
- 每项显示：标题、Type、摘要、来源任务、晋升时间
- 索引来自 `approved/INDEX.md`；缺失时回退为扫目录读 frontmatter
- 另有 `drafts/`（待审核）、`archived/`（归档）可切换查看

**能力**（`{runtime}/capabilities/cap-*.md`）

> **修正**：`cap-{name}.md` 的协议模板里**没有 `Status` 字段**，Status 只存在于
> `mind/learning/capability-updates/cu-*.md`（`proposed/approved/applied`）。
> 按「用协议已有字段」的原则，不能凭空读一个不存在的字段。

- 分组维度用协议真实表达的两件事：
  - **Pending change** — 有 open `cu-*.md` 指向它的能力
  - **Defined** — 有 `cap-{name}.md` 定义文件的能力
- 每项显示：名称、Purpose、Use When、关联的 `cu-*.md` 状态
- bootstrap 期 `capabilities/` 为空是正常状态（见 `capabilities/README.md §Bootstrap`），
  界面显示引导文案而非报错

## 运行载体

任务 = 一个 DSH 会话，跑 `/mindflow <task>`。
Studio 维护 `taskId → sessionId` 映射（存 `{runtime}/.studio/sessions.json`，
属 Studio 自己的元数据，不污染 MindFlow 协议结构）。

## 面板结构

```
┌────────────┬──────────────────────────────────────┐
│ 任务        │ task-id / phase / status 信息条        │
│  · 新建     │ 阶段条 L(Read)▶Recog▶Anal▶Plan▶…     │
│  · 列表     │──────────────────────────────────────│
│            │ 产物树(预览)   │ 原生对话停靠          │
│ 维护       │                │                      │
│  · Soul ✎  │──────────────────────────────────────│
│ 知识       │ 提问框 → 注入该任务会话                │
│  · 按 Type │                                      │
│ 能力       │                                      │
│  · 按 Status│                                     │
└────────────┴──────────────────────────────────────┘
```

## 阶段条映射

`state.md §Current Phase` 的取值域，不另造状态机：

```
learning-read → recognition → analysis → planning
  → execution-control → reflection → terminal-learning
条件态：learning-acquire（按需插入）
终态：completed / cancelled
```

## 与 pomasa-studio 的关键差异

| | pomasa-studio | MindFlow Studio |
|---|---|---|
| 数据根 | `~/.pomasa`，每 MAS 一目录 | 单个 Runtime Root，多 task |
| 运行单元 | unit(国家/日期) × task | 只有 task 一维 |
| 状态权威 | `run.json`（JSON） | `state.md`（Markdown） |
| 阶段数 | MAS 自定义 | 固定 8 段 |
| 沟通 | 原生会话停靠 | 同机制复用 |

**唯一需要新造的解析层**：`state.md` 是 Markdown 而非 JSON，
要写宽松的「`## 段标题` + 列表项」解析器。这是 P1 的核心验证点。

## 分期

- **P1** 骨架：面板壳 + Runtime Root 解析 + 任务列表 + `state.md` 解析 + 阶段条
- **P2** 沟通：原生会话停靠 + 提问注入 + 新建任务（起会话）
- **P3** 展示：知识库按 Type 分组 + 能力按 `cu-*.md` 分组 + 产物预览
- **P4** Soul 表单编辑 + 文件监视推送（替代轮询）

## 实施状态

| 项 | 状态 |
|---|---|
| P1 骨架（面板壳 / Runtime Root / 任务列表 / state.md 解析 / 阶段条） | ✅ |
| P2 提问注入接口 + 新建任务起会话 | ✅ |
| P2 原生会话停靠 | ✅ 宿主 ConversationRoot 视觉停靠 |
| P3 知识按 Type / 能力按 cu 分组 | ✅ |
| P3 产物预览（Markdown 渲染） | ✅ 自建渲染器，无 innerHTML |
| P4 Soul 表单编辑 | ✅ |
| P4 文件监视推送（SSE） | ✅ 带轮询兜底 |
| **新增：Plan 展示** | ✅ 解析 plan.md 的 Step |
| **新增：技能检测与一键安装** | ✅ 检测 `~/.dsh/skills`，按需 clone + 符号链接 |

### Studio 与 Skill 的边界

Studio 不内置技能副本（两份 SKILL.md 必然不同步），而是**检测 + 由用户点按钮安装**：

- 检测 `~/.dsh/skills/mindflow` 与 `~/.agents/skills/mindflow`，跟随符号链接判断 `SKILL.md` 可达
- 安装 = 浅 clone 到 `~/.mindflow/studio/skills/neil-skills` + 链进技能根
- **不由 Studio 自动安装**：一个静默写技能目录的插件，用户没法看见也没法归因
- 已验证：技能目录是实时扫描的，装完立即出现在 skill 列表里，无需重启

### Task 与 Plan 的层级（核对协议后的结论）

```
Task                        ← 入口单位，tasks/{task-id}/
 └─ Plan                    ← Task 内 Planning 的产物（plan.md）
     └─ Step                ← Plan 内的最小执行单位
```

`SYSTEM.md §Runtime Roles` 原文：`Mind: drives TASK through all stages`、
`Plan: formal OUTPUT of Planning`、`Step: smallest execution unit inside Plan`。
所以导航一级用 Task 是正确的，Plan 是 Task 详情里的一层。
