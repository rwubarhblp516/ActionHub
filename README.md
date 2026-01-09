# ActionHub

ActionHub 是一套面向 Spine 3.8 资产的 2D 动作生产与导出工具：支持实时预览、动画导出、模板化规范与换皮装配，并提供自动命名规范化、皮肤校验与可复现导出链路。

## 运行要求
- Node.js（建议 LTS）
- Spine 运行时：当前为 **Spine 3.8**（Spine 4.x 导出会报“不支持的 skeleton 数据”）

## 快速开始
1) 安装依赖：`npm install`
2) 如需 API Key：创建 `.env.local`，设置 `GEMINI_API_KEY=...`
3) 启动开发：`npm run dev`

## 常用脚本
- `npm run dev`：启动本地开发
- `npm run build`：生成生产构建到 `dist/`
- `npm run preview`：本地预览生产包

## 工具使用方法（完整）

### 1. 导入 Spine 资产
导入文件夹必须包含：
- `*.json` 或 `*.skel`（骨架）
- `*.atlas`（图集）
- `*.png`（贴图）

说明：
- 若 atlas 指向 `*-pma.png`，这是 **预乘透明**版本，请使用对应贴图。
- Spine 4.x 导出的资源需在 Spine 3.8 重新导出。

### 2. 预览面板与资产看板
- 预览面板支持「预览/看板」标签切换。
- 看板支持搜索、重命名、智能重命名、贴图高亮展示。
- 看板内贴图卡片高亮规则：
  - 原始未改：默认
  - 已规范化：黄色
  - 需手动处理：红色

### 3. 导出动画
在右侧「导出」面板配置：
- 格式：PNG/JPG 序列、MP4、WebM
- 精灵图打包：`sequence` 或 `atlas`
- 输出 `export_index.json` 与 `metadata/derived`（规范化命名开启时）

导出产物用于游戏引擎或动作库归档。

### 4. 模板制作（装配台）
用于“动作迁移/换皮”的模板化流程。

**模板生成**
1) 选择一个 Spine 资产
2) 填写 `模板ID / 版本号`
3) 点击「生成模板」

**附件命名规范（canonical_name）**
- 生成模板时会自动生成 canonical_name
- 可点击「自动规范化」重置规则
- 支持批量前缀/后缀
- 支持导出 canonical 清单
- 导出模板包前会强制校验并自动修复 canonical

**导出模板包**
- 点击「导出模板包」得到 zip  
- 包含：模板 JSON + Spine 运行时资产 + `index_entry.json`
- 可直接用于官方模板库

### 5. 官方模板库 / 本地模板库
**官方模板库**
- 放置路径：`public/template_packs/<template_id>/<version>/`
- 索引文件：`public/template_packs/index.json`
- `index_entry.json` 可直接复制进索引

**本地模板库**
- 在装配台点击「保存到本地模板库」
- 存储于浏览器 IndexedDB，不写入仓库

### 6. 皮肤包（换皮）
上传 PNG 文件夹（文件名必须匹配）：
- 优先使用 `canonical_name`
- 若存在冲突：使用 `slot__canonical` 命名

**智能重命名**
- 若命名不匹配，会提示建议
- 点击「智能重命名」自动修复（仅浏览器内存，不改本地文件）

**附件修复**
- 缺失附件：可单独上传补齐
- 问题附件（无透明/尺寸异常/近透明）：可替换
- 替换后会自动重新校验并刷新预览

### 7. 装配（微调对齐）
装配台支持附件级别微调：
- `offset_x / offset_y`
- `scale_x / scale_y`
- `rotation`
- 支持对称复制与恢复默认

适用于换皮后对不齐的部件。

## 常见问题
1) **Unsupported skeleton data**  
   说明资源是 Spine 4.x 导出，请用 Spine 3.8 重新导出。

2) **附件名冲突**  
   同名 attachment 出现在多个 slot 中。  
   解决方式：
   - 推荐：在 Spine 中改名确保唯一
   - 或使用 `slot__canonical` 命名方式

3) **-pma 贴图是什么**  
   `-pma` 是预乘透明贴图版本，atlas 指向哪个就用哪个。

## 项目结构
- `index.html`, `index.tsx`：入口
- `App.tsx`：主流程
- `components/`：面板与布局
- `services/`：导出、渲染、工具
- `constants.ts`, `types.ts`：常量与类型
- `public/`：静态资源

## 规范与文档
`docs/actionhub/`：
- 命名规范：`docs/actionhub/standards/naming_rules.md`
- 模板库指南：`docs/actionhub/standards/template_library_guide.md`
- 元数据结构：`docs/actionhub/schemas/metadata_schema.json`
- 事件字典：`docs/actionhub/schemas/events_dictionary.json`

## 备注
- 当前未配置自动化测试框架
- 本地配置请用 `.env.local`，不要提交密钥
