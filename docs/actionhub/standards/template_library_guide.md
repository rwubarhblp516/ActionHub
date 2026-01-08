# ActionHub 基础动作模板库搭建指南（v1）
生成日期：2026-01-08

本指南用于搭建一套“可控、可规模化、可复用”的基础动作模板库：用最小集合（P0）先跑通命名、元数据、视角与交付，再按优先级扩展到 P1/P2。

## 1. 目标与原则

### 1.1 目标
- 建立最小可用的动作集合（P0），让任意新角色/新资产可以快速对齐、批量导出、稳定交付。
- 支持逐步扩展到多视角（SIDE/TOP/ISO45）与多交付（preview/sprite/spine）。
- 让“动作语义”与“视角/交付”解耦：动作只维护一份语义定义，视角与交付在下游派生。

### 1.2 原则（建议）
- **先单视角闭环**：优先 `VIEW_SIDE`（LR 镜像）跑通资产治理；再扩 `VIEW_TOP/VIEW_ISO45`。
- **动作语义优先**：事件、命名、帧率与帧数档位固定，便于程序侧消费。
- **先通用后风格化**：P0 动作不追求“最炫”，追求“可复用、可替换、可批处理”。

## 2. 视角与方向：建议起步方案

### 2.1 P0（建议）
- `VIEW_SIDE`：`LR`（左右镜像）  
  - 优点：产能最高、模板复用最强，适合横版/战斗侧视。
  - 注意：明显不对称（盾/单手武器）再追加“不镜像”变体（可在 metadata 标注）。

### 2.2 P1（可选扩展）
- `VIEW_TOP`：`8dir`（最低可先 `4dir`）
- `VIEW_ISO45`：`8dir`

方向编码建议（8dir）：`N, NE, E, SE, S, SW, W, NW`（命名里仍用 `8dir`，具体方向可放到派生产物目录或 index 中）。

## 3. 基础动作清单（推荐）

说明：
- `P0` = 必备（先做这些即可形成可用库）
- `P1` = 常用扩展（第二阶段）
- 命名以 `docs/actionhub/standards/naming_rules.md` 的 `category/action_variant` 为基底。

### 3.1 locomotion（移动）
| 优先级 | 动作ID（name）示例 | loop/once | 备注 |
|---|---|---|---|
| P0 | `locomotion/idle_01` | loop | 默认待机 |
| P0 | `locomotion/walk_01` | loop | 通用移动（8dir 时每向一致） |
| P0 | `locomotion/run_01` | loop | 可选：若项目有跑步概念 |
| P1 | `locomotion/turn_180_01` | once | SIDE 常见；TOP/ISO45可用“转向”代替 |
| P1 | `locomotion/stop_01` | once | 从移动到 idle 的收势 |
| P1 | `locomotion/start_01` | once | 从 idle 到移动的起步 |

### 3.2 combat（战斗）
| 优先级 | 动作ID（name）示例 | loop/once | 备注 |
|---|---|---|---|
| P0 | `combat/atk_light_01` | once | 轻击（决定 hit/cancel 事件模板） |
| P0 | `combat/atk_heavy_01` | once | 重击/蓄力击（二选一也可） |
| P0 | `combat/dodge_01` | once | 闪避/翻滚（二选一也可） |
| P1 | `combat/block_01` | loop | 持续格挡（若有） |
| P1 | `combat/parry_01` | once | 弹反（若有） |
| P1 | `combat/cast_01` | once | 施法/读条起手（若有法术体系） |

### 3.3 hit（受击/状态）
| 优先级 | 动作ID（name）示例 | loop/once | 备注 |
|---|---|---|---|
| P0 | `hit/react_front_01` | once | 前受击 |
| P0 | `hit/react_back_01` | once | 后受击（SIDE 常用；TOP/ISO45 可选） |
| P0 | `hit/death_01` | once | 死亡（用于完整流程验证） |
| P1 | `hit/knockdown_01` | once | 击倒 |
| P1 | `hit/getup_01` | once | 起身 |

### 3.4 interaction / emote（交互/表情）
这些不是“战斗闭环必需”，但对验证模板复用与内容扩容很有价值。
| 优先级 | 动作ID（name）示例 | loop/once | 备注 |
|---|---|---|---|
| P1 | `interaction/use_01` | once | 使用/交互 |
| P1 | `emote/wave_01` | once | 打招呼 |

## 4. 帧率、帧数与档位（建议）

与 `docs/actionhub/standards/ue_batch_checklist.md` 对齐：
- FPS：优先 30（必要时保留 60 版本）
- 建议帧数档位（按动作类型挑其中一个档位，不要每个动作都随意变化）：
  - loop（idle/walk/run）：12/16/24
  - once（attack/hit）：8/10/12/16
- loop 动作必须首尾连续（姿态 + 速度），否则模板不可复用。

## 5. 命名与元数据落地（ActionHub 工作流）

### 5.1 动作ID（canonical name）
- 以 `metadata_schema.json` 的 `name` 为主：`<category>/<action>_<variant>`  
  例如：`locomotion/run_01`

### 5.2 ActionHub 导出命名（派生）
导出时 ActionHub 会派生成：
`<delivery>/<view>/<category>/<action>_<variant>_<dir>_<type>_<fps>fps_<frames>f`

示例：
- `sprite/VIEW_SIDE/locomotion/run_01_LR_loop_30fps_24f/...png`
- `preview/VIEW_SIDE/combat/atk_light_01_LR_once_30fps_12f.mp4`
- 并写入 `metadata/derived/<delivery>/<view>/<category>/<action>_<variant>.json`

### 5.3 manifest（动作模板清单）
当 Spine 动画名与规范动作ID不一致时，使用 `docs/actionhub/standards/naming_manifest.md`：
- 推荐 key：`basePath::动画名`
- mapping：`{ "name": "locomotion/run_01", "dir": "LR", "type": "loop" }`

## 6. 事件模板（建议先做最少）

对齐 `docs/actionhub/schemas/events_dictionary.json`，P0 建议至少覆盖：
- `combat/*`：`hit` 或 `hit_window`，`cancel`（如果有连招/取消体系）
- `locomotion/*`：`footstep`（walk/run）

说明：事件语义与视角/交付无关，派生时只做“帧索引映射”，不改语义。

## 7. 验收清单（P0）

每个 P0 动作至少通过以下检查：
- 命名：能映射到规范 `name`（无冲突、可检索）
- 帧率/帧数：符合档位（30fps + 合理 frames）
- loop：首尾连续（视觉与运动趋势都连续）
- pivot：稳定（脚底点/底边中心，避免上下跳）
- 导出：能稳定导出 `preview` 与 `sprite`，并生成 `metadata/derived`

## 8. 推荐落地顺序（最小闭环）

1) 先做 `VIEW_SIDE + LR` 的 P0 动作集合（`idle/walk/run/atk_light/react_front/death`）
2) 补齐 manifest 映射与基础事件（hit/footstep）
3) 跑通批量导出与目录/元数据一致性（ActionHub）
4) 扩展 P1 动作
5) 再扩 `VIEW_TOP/VIEW_ISO45`（优先 locomotion，再 combat/hit）

