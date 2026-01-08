# ActionHub 命名映射清单（manifest）说明（v1）
生成日期：2026-01-08

本文件用于让 ActionHub 在导出时真正落地 `naming_rules.md` 的“可检索、可批处理、可追溯”的命名与目录结构。

## 1. 用途
- 当 Spine 动画名不等于规范动作名（例如动画名叫 `run`，但你希望落到 `locomotion/run_01`），用 manifest 做映射。
- 当你需要为特定动画指定 `dir/type/category/view`（或覆盖默认值），用 manifest 做映射。

## 2. 文件格式（JSON）

```json
{
  "version": "1.0",
  "defaults": {
    "view": "VIEW_SIDE",
    "category": "locomotion",
    "dir": "LR",
    "type": "loop"
  },
  "mappings": {
    "Hero::run": {
      "name": "locomotion/run_01",
      "type": "loop",
      "dir": "LR"
    },
    "Hero::atk_light": {
      "name": "combat/atk_light_01",
      "type": "once",
      "dir": "8dir"
    },
    "idle": {
      "name": "locomotion/idle_01",
      "type": "loop",
      "dir": "none"
    }
  }
}
```

### 2.1 mappings 的 key 规则（优先级从高到低）
1. `basePath::动画名`（推荐，避免同名资产冲突；basePath 来自导入文件夹的相对路径）
2. `资产名::动画名`
3. `资产名/动画名`
4. `动画名`（全局兜底）

### 2.2 mapping 字段
- `name`：必须。规范动作名（不含 delivery/view 前缀），例如：`locomotion/run_01`
- `category`：可选。覆盖 `name` 中的 category
- `dir`：可选。`LR | 4dir | 8dir | none`
- `type`：可选。`loop | once`
- `action` / `variant`：可选。用于把 `name` 的最后一段拆开重组（高级用法）

## 3. 不使用 manifest 的最小规则
- 如果 Spine 动画名本身就是 `locomotion/run_01` 这种 `category/action_variant` 形式，ActionHub 会直接使用它。
- 否则会使用 ExportPanel 里的 `Category Default` 拼成 `category/动画名`。
