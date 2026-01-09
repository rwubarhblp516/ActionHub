import React, { useMemo, useState } from 'react';
import { AnimationItem, LocalTemplateSummary, OfficialTemplateIndexEntry, SkinOverrideEntry, SkinOverrides, SkinValidationReport, TemplatePack } from '../types';
import { SkinMatch } from '../services/skinValidator';
import { AlertTriangle, CheckCircle, Copy, Database, FileDown, FolderOpen, RefreshCw, Save, X } from 'lucide-react';

interface AssemblyPanelProps {
  items: AnimationItem[];
  activeItem: AnimationItem | null;
  templatePack: TemplatePack | null;
  templateAssetId: string | null;
  templateId: string;
  templateVersion: string;
  templateBuildStatus: 'idle' | 'building' | 'error';
  templateBuildError: string | null;
  attachmentConflicts: Array<{ attachment_name: string; slots: string[] }>;
  officialTemplates: OfficialTemplateIndexEntry[];
  officialTemplatesStatus: 'idle' | 'loading' | 'error';
  officialTemplatesError: string | null;
  localTemplates: LocalTemplateSummary[];
  localTemplatesError: string | null;
  skinFiles: File[];
  skinValidation: SkinValidationReport | null;
  skinMatches: SkinMatch[];
  skinOverrides: SkinOverrides | null;
  previewEnabled: boolean;
  onRefreshOfficialTemplates: () => void;
  onRefreshLocalTemplates: () => void;
  onLoadOfficialTemplate: (entry: OfficialTemplateIndexEntry) => void;
  onLoadLocalTemplate: (key: string) => void;
  onSaveLocalTemplate: () => void;
  onExportTemplatePack: () => void;
  onApplySmartRename: () => void;
  onAutoCanonicalize: () => void;
  onUpdateCanonicalName: (slot: string, attachment: string, canonical: string) => void;
  onExportCanonicalList: () => void;
  onApplyCanonicalBatch: (prefix: string, suffix: string) => void;
  onTemplateIdChange: (value: string) => void;
  onTemplateVersionChange: (value: string) => void;
  onBuildTemplateFromActive: () => void;
  onClearTemplate: () => void;
  onUploadSkinFolder: (files: FileList) => void;
  onClearSkin: () => void;
  onDownloadValidation: () => void;
  onSaveOverrides: () => void;
  onUpdateOverride: (key: string, patch: Partial<SkinOverrideEntry>) => void;
  onResetOverride: (key: string) => void;
  onCopyMirror: (key: string) => void;
  onTogglePreview: (enabled: boolean) => void;
}

const buildKey = (slot: string, attachment: string) => `${slot}::${attachment}`;

const findMirrorKey = (key: string) => {
  const [slot, attachment] = key.split('::');
  if (!attachment) return null;
  const candidates = [
    [/_l$/i, '_r'],
    [/_r$/i, '_l'],
    [/-l$/i, '-r'],
    [/-r$/i, '-l'],
    [/\.l$/i, '.r'],
    [/\.r$/i, '.l'],
    [/left$/i, 'right'],
    [/right$/i, 'left'],
  ] as const;
  for (const [pattern, replacement] of candidates) {
    if (pattern.test(attachment)) {
      return buildKey(slot, attachment.replace(pattern, replacement));
    }
  }
  return null;
};

export const AssemblyPanel: React.FC<AssemblyPanelProps> = ({
  items,
  activeItem,
  templatePack,
  templateAssetId,
  templateId,
  templateVersion,
  templateBuildStatus,
  templateBuildError,
  attachmentConflicts,
  officialTemplates,
  officialTemplatesStatus,
  officialTemplatesError,
  localTemplates,
  localTemplatesError,
  skinFiles,
  skinValidation,
  skinMatches,
  skinOverrides,
  previewEnabled,
  onRefreshOfficialTemplates,
  onRefreshLocalTemplates,
  onLoadOfficialTemplate,
  onLoadLocalTemplate,
  onSaveLocalTemplate,
  onExportTemplatePack,
  onApplySmartRename,
  onAutoCanonicalize,
  onUpdateCanonicalName,
  onExportCanonicalList,
  onApplyCanonicalBatch,
  onTemplateIdChange,
  onTemplateVersionChange,
  onBuildTemplateFromActive,
  onClearTemplate,
  onUploadSkinFolder,
  onClearSkin,
  onDownloadValidation,
  onSaveOverrides,
  onUpdateOverride,
  onResetOverride,
  onCopyMirror,
  onTogglePreview,
}) => {
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [canonicalPrefix, setCanonicalPrefix] = useState<string>('');
  const [canonicalSuffix, setCanonicalSuffix] = useState<string>('');

  const matchedKeys = useMemo(() => new Set(skinMatches.map(m => m.key)), [skinMatches]);
  const entries = templatePack?.attachment_manifest.entries || [];
  const selectedEntry = entries.find(e => buildKey(e.slot_name, e.attachment_name) === selectedKey);
  const selectedOverride = selectedKey && skinOverrides?.overrides?.[selectedKey];
  const mirrorKey = selectedKey ? findMirrorKey(selectedKey) : null;
  const mirrorAvailable = mirrorKey && entries.some(e => buildKey(e.slot_name, e.attachment_name) === mirrorKey);

  const canonicalIssues = useMemo(() => {
    const duplicateSet = new Set<string>();
    const missingSet = new Set<string>();
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      const canonical = (entry.canonical_name || '').trim();
      if (!canonical) {
        missingSet.add(buildKey(entry.slot_name, entry.attachment_name));
        return;
      }
      counts.set(canonical, (counts.get(canonical) || 0) + 1);
    });
    counts.forEach((count, name) => {
      if (count > 1) duplicateSet.add(name);
    });
    return { duplicateSet, missingSet };
  }, [entries]);

  const summary = useMemo(() => {
    if (!skinValidation) return null;
    return {
      errors: skinValidation.errors.length,
      warnings: skinValidation.warnings.length,
      coverage: skinValidation.coverage_score,
    };
  }, [skinValidation]);

  return (
    <div className="w-full h-full bg-transparent flex flex-col">
      <div className="flex flex-col gap-1 px-6 border-l-4 border-indigo-500 mb-6 shrink-0">
        <span className="text-[10px] text-indigo-400 uppercase font-black tracking-[0.25em]">动作迁移</span>
        <h2 className="text-2xl font-black text-white tracking-tighter">装配台</h2>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="flex flex-col gap-8 px-6 pb-10">
          <section className="flex flex-col gap-4 p-4 rounded-3xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">模板包</span>
                <span className="text-[9px] text-white/40 font-bold">VIEW_SIDE / LR / 30fps 固定</span>
              </div>
              <button
                onClick={onBuildTemplateFromActive}
                disabled={!activeItem || templateBuildStatus === 'building'}
                className="px-3 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw size={14} />
                生成模板
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">模板ID</span>
                <input
                  value={templateId}
                  onChange={(e) => onTemplateIdChange(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-[12px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  placeholder="template_id"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">版本号</span>
                <input
                  value={templateVersion}
                  onChange={(e) => onTemplateVersionChange(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-[12px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  placeholder="1.0.0"
                />
              </div>
            </div>

            {templatePack && (
              <div className="flex flex-col gap-2 text-[10px] text-white/60 font-bold">
                <div>模板资产: <span className="text-white/80">{templateAssetId ? items.find(i => i.id === templateAssetId)?.name || '-' : '-'}</span></div>
                <div>附件数: <span className="text-white/80">{templatePack.attachment_manifest.entries.length}</span></div>
                <div>动作数: <span className="text-white/80">{templatePack.action_manifest.actions.length}</span></div>
              </div>
            )}

            {templateBuildError && (
              <div className="text-[10px] font-bold text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                模板生成失败: {templateBuildError}
              </div>
            )}

            {attachmentConflicts.length > 0 && (
              <div className="text-[10px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                发现附件名冲突（需调整模板以保证唯一）:
                {attachmentConflicts.map((c) => (
                  <div key={c.attachment_name}>{c.attachment_name} → {c.slots.join(', ')}</div>
                ))}
              </div>
            )}

            {templatePack && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onSaveLocalTemplate}
                  className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  <Database size={14} />
                  保存到本地模板库
                </button>
                <button
                  onClick={onExportTemplatePack}
                  className="px-3 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/25 transition-all flex items-center gap-2"
                >
                  <FileDown size={14} />
                  导出模板包
                </button>
                <button
                  onClick={onClearTemplate}
                  className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
                >
                  清除模板
                </button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4 p-4 rounded-3xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">附件命名规范</span>
                <span className="text-[9px] text-white/40 font-bold">canonicalName 用于皮肤包命名与校验</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onExportCanonicalList}
                  disabled={!templatePack}
                  className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  导出清单
                </button>
                <button
                  onClick={onAutoCanonicalize}
                  disabled={!templatePack}
                  className="px-3 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  自动规范化
                </button>
              </div>
            </div>

            {!templatePack && (
              <div className="py-6 text-center text-white/30 text-[11px] font-black uppercase tracking-widest border border-white/10 rounded-[24px] bg-white/[0.02]">
                请先生成或加载模板包
              </div>
            )}

            {templatePack && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={canonicalPrefix}
                    onChange={(e) => setCanonicalPrefix(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    placeholder="批量前缀（可选）"
                  />
                  <input
                    value={canonicalSuffix}
                    onChange={(e) => setCanonicalSuffix(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    placeholder="批量后缀（可选）"
                  />
                </div>
                <button
                  onClick={() => onApplyCanonicalBatch(canonicalPrefix, canonicalSuffix)}
                  className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all"
                >
                  批量应用前缀/后缀
                </button>

              <div className="flex flex-col gap-2 max-h-[260px] overflow-auto custom-scrollbar pr-2">
                {entries.map((entry) => {
                  const key = buildKey(entry.slot_name, entry.attachment_name);
                  const canonical = entry.canonical_name || entry.attachment_name;
                  const isDuplicate = canonicalIssues.duplicateSet.has(canonical);
                  const isMissing = canonicalIssues.missingSet.has(key);
                  const isChanged = canonical !== entry.attachment_name;
                  const inputClass = isMissing || isDuplicate
                    ? 'border-red-500/40 focus:ring-red-400/40'
                    : (isChanged ? 'border-amber-400/40 focus:ring-amber-400/40' : 'border-white/10 focus:ring-indigo-500/50');
                  return (
                    <div key={`canon-${key}`} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-white truncate">{entry.attachment_name}</div>
                        <div className="text-[9px] text-white/40 font-mono truncate">{entry.slot_name}</div>
                      </div>
                      <input
                        value={canonical}
                        onChange={(e) => onUpdateCanonicalName(entry.slot_name, entry.attachment_name, e.target.value)}
                        className={`flex-1 bg-black/40 border rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none ${inputClass}`}
                        placeholder="canonical_name"
                      />
                      {(isMissing || isDuplicate) && (
                        <span className="text-[9px] text-red-300 font-black uppercase tracking-widest">需处理</span>
                      )}
                      {!isMissing && !isDuplicate && isChanged && (
                        <span className="text-[9px] text-amber-300 font-black uppercase tracking-widest">已规范</span>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-5 p-4 rounded-3xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">模板库</span>
                <span className="text-[9px] text-white/40 font-bold">官方模板 & 本地模板</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300">官方模板</div>
                <button
                  onClick={onRefreshOfficialTemplates}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  <RefreshCw size={12} />
                  刷新
                </button>
              </div>

              {officialTemplatesStatus === 'loading' && (
                <div className="text-[10px] text-white/40 font-bold">正在加载官方模板...</div>
              )}

              {officialTemplatesError && (
                <div className="text-[10px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                  官方模板加载失败: {officialTemplatesError}
                </div>
              )}

              {officialTemplatesStatus !== 'loading' && officialTemplates.length === 0 && (
                <div className="text-[10px] text-white/30 font-bold">
                  未发现官方模板，请在 public/template_packs/index.json 中添加。
                </div>
              )}

              {officialTemplates.map((entry) => (
                <div
                  key={`${entry.template_id}@${entry.version}`}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10"
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-white">{entry.name || entry.template_id}</span>
                    <span className="text-[9px] text-white/40 font-mono">{entry.template_id}@{entry.version}</span>
                    {entry.description && (
                      <span className="text-[9px] text-white/40 mt-1">{entry.description}</span>
                    )}
                  </div>
                  <button
                    onClick={() => onLoadOfficialTemplate(entry)}
                    className="px-3 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/25 transition-all"
                  >
                    加载
                  </button>
                </div>
              ))}
            </div>

            <div className="h-px bg-white/10" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">本地模板</div>
                <button
                  onClick={onRefreshLocalTemplates}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  <RefreshCw size={12} />
                  刷新
                </button>
              </div>

              {localTemplatesError && (
                <div className="text-[10px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                  本地模板读取失败: {localTemplatesError}
                </div>
              )}

              {localTemplates.length === 0 && (
                <div className="text-[10px] text-white/30 font-bold">本地模板库为空。</div>
              )}

              {localTemplates.map((entry) => (
                <div
                  key={entry.key}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10"
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-white">{entry.name || entry.template_id}</span>
                    <span className="text-[9px] text-white/40 font-mono">{entry.template_id}@{entry.version}</span>
                    <span className="text-[9px] text-white/40 mt-1">附件 {entry.attachment_count} / 动作 {entry.action_count}</span>
                  </div>
                  <button
                    onClick={() => onLoadLocalTemplate(entry.key)}
                    className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  >
                    加载
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4 p-4 rounded-3xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">皮肤包</span>
                <span className="text-[9px] text-white/40 font-bold">PNG 文件夹，文件名需匹配附件</span>
              </div>
              <label className="px-3 py-2 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2">
                <FolderOpen size={14} />
                上传文件夹
                <input
                  type="file"
                  className="hidden"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      onUploadSkinFolder(e.target.files);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>
            </div>

            {skinValidation && (
              <div className="grid grid-cols-3 gap-3 text-[10px] font-black text-white/70">
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                  错误: <span className="text-red-300">{summary?.errors}</span>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                  警告: <span className="text-amber-300">{summary?.warnings}</span>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                  覆盖率: <span className="text-emerald-300">{summary?.coverage}%</span>
                </div>
              </div>
            )}

            {skinValidation && skinValidation.errors.length > 0 && (
              <div className="text-[10px] font-bold text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                {skinValidation.errors.slice(0, 5).map((msg) => (
                  <div key={msg}>{msg}</div>
                ))}
                {skinValidation.errors.length > 5 && <div>… 还有 {skinValidation.errors.length - 5} 条错误</div>}
              </div>
            )}

            {skinValidation && skinValidation.name_mismatch_suggestions.length > 0 && (
              <div className="text-[10px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                <div className="mb-2">发现命名问题，建议如下：</div>
                {skinValidation.name_mismatch_suggestions.slice(0, 4).map((suggestion) => (
                  <div key={`${suggestion.input}-${suggestion.suggestion}`}>
                    {suggestion.input} → {suggestion.suggestion}
                  </div>
                ))}
                {skinValidation.name_mismatch_suggestions.length > 4 && (
                  <div>… 还有 {skinValidation.name_mismatch_suggestions.length - 4} 条建议</div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={onDownloadValidation}
                disabled={!skinValidation}
                className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FileDown size={14} />
                导出校验报告
              </button>
              <button
                onClick={onApplySmartRename}
                disabled={!skinValidation || skinValidation.name_mismatch_suggestions.length === 0}
                className="px-3 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest text-amber-100 hover:bg-amber-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                智能重命名
              </button>
              <button
                onClick={onClearSkin}
                disabled={skinFiles.length === 0}
                className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <X size={14} />
                清空皮肤
              </button>
              <div className="flex-1" />
              <button
                onClick={() => onTogglePreview(!previewEnabled)}
                disabled={!templatePack || !skinValidation || (skinValidation.errors.length > 0)}
                className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${previewEnabled
                  ? 'bg-indigo-500 text-white border-indigo-400'
                  : 'bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                title={skinValidation?.errors.length ? '请先修复校验错误' : '启用预览'}
              >
                {previewEnabled ? '预览中' : '启用预览'}
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4 p-4 rounded-3xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/70 font-black uppercase tracking-widest">附件装配</span>
                <span className="text-[9px] text-white/40 font-bold">选中附件后编辑偏移/缩放/旋转</span>
              </div>
              <button
                onClick={onSaveOverrides}
                disabled={!skinOverrides}
                className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save size={14} />
                保存覆盖参数
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2 max-h-[360px] overflow-auto custom-scrollbar pr-2">
                {entries.length === 0 && (
                  <div className="py-10 text-center text-white/30 text-[11px] font-black uppercase tracking-widest border border-white/10 rounded-[24px] bg-white/[0.02]">
                    请先生成模板与校验皮肤
                  </div>
                )}
                {entries.map((entry) => {
                  const key = buildKey(entry.slot_name, entry.attachment_name);
                  const matched = matchedKeys.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      className={`p-3 rounded-2xl text-left border transition-all ${selectedKey === key
                        ? 'bg-white/15 border-white/30'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-white">{entry.attachment_name}</span>
                          <span className="text-[9px] text-white/40 font-mono">{entry.slot_name}</span>
                        </div>
                        {matched ? (
                          <CheckCircle size={14} className="text-emerald-400" />
                        ) : (
                          <AlertTriangle size={14} className={entry.required ? 'text-red-400' : 'text-amber-300'} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3">
                {selectedEntry ? (
                  <>
                    <div className="text-[11px] font-black text-white">编辑附件: {selectedEntry.attachment_name}</div>
                    {(['offset_x', 'offset_y', 'scale_x', 'scale_y', 'rotation'] as const).map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="text-[9px] text-white/50 font-black uppercase tracking-widest w-16">{field}</span>
                        <input
                          type="number"
                          value={selectedOverride?.[field] ?? (field.startsWith('scale') ? 1 : 0)}
                          onChange={(e) => onUpdateOverride(selectedKey, { [field]: parseFloat(e.target.value) || 0 } as Partial<SkinOverrideEntry>)}
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                        />
                      </div>
                    ))}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onResetOverride(selectedKey)}
                        className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all"
                      >
                        恢复默认
                      </button>
                      <button
                        onClick={() => mirrorAvailable && onCopyMirror(selectedKey)}
                        disabled={!mirrorAvailable}
                        className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Copy size={12} />
                        复制到对称
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-10 text-center text-white/30 text-[11px] font-black uppercase tracking-widest border border-white/10 rounded-[24px] bg-white/[0.02]">
                    选择一个附件以编辑
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
