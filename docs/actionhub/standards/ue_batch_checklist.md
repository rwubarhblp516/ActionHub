# UE 批处理检查清单（Retarget + 三视角输出）（v1）
生成日期：2026-01-08

本清单用于将“任意来源动作”批量变成 ActionHub 可用的 master/normalized/view/sprite/preview 输出。

## A. 接入（Ingest）
- [ ] 原始文件存入 `raw_actions/<vendor>/<pack>/files/`
- [ ] 记录 license / 订单号 / 条款到 `license.txt`
- [ ] 生成 `manifest.json`（动作列表、原文件名、初步分类）

## B. Retarget 到标准骨架（UE Manny）
- [ ] 源骨架 IK Rig 完成（骨链：spine、arms、legs）
- [ ] Manny IK Rig 完成（同骨链）
- [ ] IK Retargeter 参考姿势对齐（A/T pose 一致）
- [ ] 批量 retarget 输出到 `master_anims_ue/`
- [ ] 快速 QC：膝盖方向、手腕扭曲、骨盆高度、脚底穿地

## C. Normalize（规范化）
- [ ] fps 统一为 30（必要时保留 60 版本）
- [ ] 帧数归档到 8/12/16/24 档（按动作类型）
- [ ] loop 动作首尾连续（姿态 + 速度）
- [ ] locomotion 同时输出 in-place 与 root_motion（如需要）
- [ ] 写入/更新 `metadata/master/<action>.json`
- [ ] 标注关键事件帧（hit/footstep/whoosh 等）

## D. 三视角输出（View Bake）
- [ ] 渲染关卡 `L_ActionHub_Render` 中三套相机就位（SIDE/TOP/ISO45）
- [ ] 输出配置固定：分辨率、fps、背景、裁切规则
- [ ] 每个动作输出：
  - [ ] PNG 序列（用于 sprite）
  - [ ] MP4 预览（用于 catalog）
- [ ] 目录输出正确：`previews/VIEW_xxx/` 与 `sprites/sequences/VIEW_xxx/`

## E. Sprite 打包与元数据派生
- [ ] 计算/统一 pivot（脚底点或 bbox_bottom_center）
- [ ] 统一 trim/padding（避免边缘裁切引起闪烁）
- [ ] 打包 atlas（按视角/角色/动作组）
- [ ] 派生 `metadata/derived/<delivery>/<view>/<action>.json`

## F. Spine 交付
- [ ] 每个视角有独立 Spine 模板工程（骨骼、槽位、皮肤、事件命名一致）
- [ ] 动作复刻（短期）或自动写入（长期）
- [ ] 你的批量导出工具输出到 `spine/exports/`
- [ ] 校验：事件帧与 master 语义一致（hit/footstep 等）

## G. 发布与追溯
- [ ] 生成/更新 `catalog/index.html` 或 `catalog.json`
- [ ] 任何进入 production 的动作必须有 license 记录与来源可追溯
- [ ] “不可信素材”仅允许进入 `raw_untrusted/`，不得进入 production
