# ActionHub 命名规则与目录规范（v1）
生成日期：2026-01-08

本规范用于“3D 动作中台 → 多视角 → 多交付（Spine / 精灵图）”的长期资产治理。目标是：
- 动作主资产只维护一份（Master Animation on Standard Skeleton）
- 视角（Side/Top/Iso45）与交付（Spine/Sprite/Preview/Pose）全部下游自动分叉
- 任意动作可检索、可批处理、可追溯授权

## 1. 关键词定义

- **Master**：在标准骨架（推荐 UE Manny）上的主动画，不含视角与交付差异。
- **View**：视角配置。固定相机与投影规则。推荐 3 套：
  - `VIEW_SIDE`：横版侧视
  - `VIEW_TOP`：俯视
  - `VIEW_ISO45`：45°等距/伪等距
- **Delivery**：交付配置：
  - `sprite`：PNG 序列 / Atlas + JSON
  - `spine`：Spine 工程 / Runtime 导出
  - `preview`：MP4/GIF 用于检索评审
  - `pose`：每帧 2D/3D 关节数据（可用于 ComfyUI / 自动化）

## 2. 动作命名（推荐）

统一采用路径式命名：  
`<delivery>/<view>/<category>/<action>_<variant>_<dir>_<type>_<fps>_<frames>`

### 字段解释
- `delivery`：`sprite` / `spine` / `preview` / `pose`
- `view`：`VIEW_SIDE` / `VIEW_TOP` / `VIEW_ISO45`
- `category`：`locomotion` / `combat` / `hit` / `interaction` / `emote` / `misc`
- `action`：动作主名（如 `run` / `atk_light` / `react_back`）
- `variant`：序号或细分（如 `01`、`sword`、`unarmed`）
- `dir`：方向集合
  - `LR`（左右镜像）用于横版侧视
  - `4dir` / `8dir` 用于俯视/等距
  - `none` 用于不区分方向的表演动作
- `type`：`loop` / `once`
- `fps`：如 `30fps`
- `frames`：如 `24f`

### 示例
- `sprite/VIEW_SIDE/locomotion/run_01_LR_loop_30fps_24f`
- `spine/VIEW_TOP/combat/atk_light_01_8dir_once_30fps_12f`
- `preview/VIEW_ISO45/hit/react_back_01_4dir_once_30fps_10f`

## 3. 视角变体（仅在必要时）
当某个动作在特定视角下投影表现异常（例如大幅扭转、绕身旋转斩），允许制作视角特供变体：

- 命名追加：`@TOP` / `@ISO45` / `@SIDE`
- 示例：`atk_spin_01@TOP`

规则：
- 变体仍需 retarget 到同一标准骨架（仅修改少量关节约束/幅度）
- 变体必须在元数据中声明 `view_variant_of`

## 4. 目录结构（建议）

```
ActionHub/
  standards/
    skeleton/UE_Manny_Standard.fbx
    bone_maps/
      src_to_manny_template.json
      manny_to_spine2d.json
    metadata_schema.json
    events_dictionary.json
    naming_rules.md
    ue_view_profiles.md
    ue_batch_checklist.md

  raw_actions/
    <vendor>/<pack>/
      files/*
      license.txt
      manifest.json

  master/
    ue_project/...
    exports_fbx/

  normalized_master/
    fbx/
    uassets/
  metadata/
    master/*.json
    derived/*.json

  previews/
    VIEW_SIDE/*.mp4
    VIEW_TOP/*.mp4
    VIEW_ISO45/*.mp4

  sprites/
    VIEW_SIDE/<category>/*.png
    VIEW_SIDE/<category>/*.json
    ...（TOP/ISO45 同结构）

  spine/
    templates/
      VIEW_SIDE_template.spine
      VIEW_TOP_template.spine
      VIEW_ISO45_template.spine
    projects/<character>/<VIEW_xxx>/
    exports/<character>/<VIEW_xxx>/
```

## 5. 方向资产的建议
- `VIEW_SIDE`：优先 `LR`（左右镜像），除非有明显不对称武器/盾牌需求。
- `VIEW_TOP`：通常 `8dir` 才自然；最低可先 `4dir`。
- `VIEW_ISO45`：多用 `8dir`，并固定伪等距角度与站位，避免比例漂移。
