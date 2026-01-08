import React, { useMemo, useRef, useState } from 'react';
import { AnimationItem, ActionHubNamingManifest, DirectionSet, ActionTimingType } from '../types';
import { normalizeCanonicalName } from '../services/actionHubNaming';
import { FileDown, FileUp, Trash2, Wand2, AlertTriangle, Search, X } from 'lucide-react';

interface ActionTemplatePanelProps {
  activeItem: AnimationItem | null;
  animationNames: string[];
  manifest: ActionHubNamingManifest | undefined;
  defaults: {
    view: string;
    category: string;
    dir: DirectionSet;
    type: ActionTimingType;
  };
  disabled?: boolean;
  onUpdateManifest: (manifest: ActionHubNamingManifest | undefined) => void;
}

const buildAssetKey = (item: AnimationItem) => item.files.basePath || item.name;

const getMappingsCount = (manifest?: ActionHubNamingManifest) => Object.keys(manifest?.mappings || {}).length;

const downloadJson = (data: any, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const parseManifest = async (file: File): Promise<ActionHubNamingManifest> => {
  const text = await file.text();
  return JSON.parse(text);
};

export const ActionTemplatePanel: React.FC<ActionTemplatePanelProps> = ({
  activeItem,
  animationNames,
  manifest,
  defaults,
  disabled = false,
  onUpdateManifest,
}) => {
  const [search, setSearch] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const assetKey = activeItem ? buildAssetKey(activeItem) : '';
  const baseMappings = manifest?.mappings || {};

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = animationNames.filter(a => a.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => a.localeCompare(b, 'zh-CN'));

    return sorted
      .map(anim => {
        const key = `${assetKey}::${anim}`;
        const m = baseMappings[key];
        const canonicalName = m?.name || '';
        const effectiveName = canonicalName || normalizeCanonicalName(anim.includes('/') ? anim : `${defaults.category}/${anim}`);
        const effectiveDir = (m?.dir || defaults.dir) as DirectionSet;
        const effectiveType = (m?.type || defaults.type) as ActionTimingType;
        const isMapped = Boolean(m?.name || m?.dir || m?.type || m?.category || m?.variant || m?.action);

        return {
          anim,
          key,
          mapping: m,
          effectiveName,
          effectiveDir,
          effectiveType,
          isMapped,
        };
      })
      .filter(r => (onlyUnmapped ? !r.isMapped : true));
  }, [animationNames, assetKey, baseMappings, defaults.category, defaults.dir, defaults.type, onlyUnmapped, search]);

  const validation = useMemo(() => {
    const warnings: Array<{ key: string; message: string }> = [];
    const nameToKeys = new Map<string, string[]>();

    rows.forEach(r => {
      const name = r.mapping?.name;
      if (name !== undefined) {
        const normalized = normalizeCanonicalName(name);
        if (normalized !== name) {
          warnings.push({ key: r.key, message: `name 建议规范化为 "${normalized}"` });
        }
        if (!normalized.includes('/')) {
          warnings.push({ key: r.key, message: 'name 必须包含 category/action_variant（至少包含一个“/”）' });
        }
        nameToKeys.set(normalized, [...(nameToKeys.get(normalized) || []), r.key]);
      }
    });

    nameToKeys.forEach((keys, name) => {
      if (keys.length > 1) {
        warnings.push({ key: keys[0], message: `重复 name: "${name}"（共 ${keys.length} 条）` });
      }
    });

    return { warnings };
  }, [rows]);

  const ensureManifest = (): ActionHubNamingManifest => {
    if (manifest) return manifest;
    return {
      version: '1.0',
      generated_date: new Date().toISOString(),
      defaults: {
        view: defaults.view as any,
        category: defaults.category,
        dir: defaults.dir,
        type: defaults.type,
      },
      mappings: {},
    };
  };

  const upsertMapping = (key: string, patch: any) => {
    const next = ensureManifest();
    const prev = next.mappings?.[key] || {};
    next.mappings = { ...(next.mappings || {}), [key]: { ...prev, ...patch } };
    onUpdateManifest(next);
  };

  const deleteMapping = (key: string) => {
    if (!manifest?.mappings?.[key]) return;
    const next = ensureManifest();
    const { [key]: _removed, ...rest } = next.mappings || {};
    next.mappings = rest;
    onUpdateManifest(next);
  };

  const clearAssetMappings = () => {
    if (!manifest?.mappings || !activeItem) return;
    const prefix = `${assetKey}::`;
    const next = ensureManifest();
    const rest: Record<string, any> = {};
    Object.entries(next.mappings || {}).forEach(([k, v]) => {
      if (!k.startsWith(prefix)) rest[k] = v;
    });
    next.mappings = rest;
    onUpdateManifest(next);
  };

  const generateDefaultsForAsset = () => {
    if (!activeItem) return;
    const next = ensureManifest();
    const newMappings: Record<string, any> = { ...(next.mappings || {}) };
    animationNames.forEach(anim => {
      const key = `${assetKey}::${anim}`;
      if (!newMappings[key]) newMappings[key] = {};
      const suggested = normalizeCanonicalName(anim.includes('/') ? anim : `${defaults.category}/${anim}`);
      newMappings[key] = { ...newMappings[key], name: suggested };
    });
    next.mappings = newMappings;
    onUpdateManifest(next);
  };

  const exportManifest = () => {
    const out = ensureManifest();
    out.generated_date = new Date().toISOString();
    const filename = activeItem ? `manifest_${sanitizeFilename(activeItem.name)}.json` : 'manifest.json';
    downloadJson(out, filename);
  };

  const importManifest = async (file: File) => {
    setError(null);
    try {
      const next = await parseManifest(file);
      onUpdateManifest(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const applyBatch = (patch: { dir?: DirectionSet; type?: ActionTimingType }) => {
    if (!activeItem) return;
    const next = ensureManifest();
    const newMappings: Record<string, any> = { ...(next.mappings || {}) };
    rows.forEach(r => {
      const prev = newMappings[r.key] || {};
      newMappings[r.key] = { ...prev, ...patch };
    });
    next.mappings = newMappings;
    onUpdateManifest(next);
  };

  const manifestCount = getMappingsCount(manifest);

  return (
    <div className="w-full h-full bg-transparent flex flex-col">
      <div className="flex flex-col gap-1 px-6 border-l-4 border-indigo-500 mb-6 shrink-0">
        <span className="text-[10px] text-indigo-400 uppercase font-black tracking-[0.25em]">动作模板</span>
        <h2 className="text-2xl font-black text-white tracking-tighter">映射与校验</h2>
      </div>

      <div className="px-6 flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-2xl px-3 py-2">
          <Search size={14} className="text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索动画名…"
            className="bg-transparent text-white/80 text-[12px] font-mono font-bold w-full focus:outline-none"
            disabled={disabled || !activeItem}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
              title="清空"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setOnlyUnmapped(v => !v)}
          disabled={disabled || !activeItem}
          className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${onlyUnmapped
            ? 'bg-indigo-500 text-white border-indigo-400'
            : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          title="只显示未映射项"
        >
          未映射
        </button>
      </div>

      <div className="px-6 flex items-center justify-between gap-3 mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/50">
          {activeItem ? (
            <>
              当前资产: <span className="text-white/80">{activeItem.name}</span>
              <span className="text-white/20 px-2">/</span>
              动画: <span className="text-white/80">{animationNames.length}</span>
              <span className="text-white/20 px-2">/</span>
              manifest mappings: <span className="text-indigo-400">{manifestCount}</span>
            </>
          ) : (
            <>请选择一个资产以编辑动作模板</>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importManifest(f);
              e.currentTarget.value = '';
            }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            title="导入 manifest.json"
          >
            <FileUp size={14} className="text-indigo-400" />
            导入
          </button>

          <button
            onClick={exportManifest}
            disabled={disabled}
            className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            title="导出 manifest.json"
          >
            <FileDown size={14} className="text-indigo-400" />
            导出
          </button>
        </div>
      </div>

      <div className="px-6 flex items-center gap-2 mb-4">
        <button
          onClick={generateDefaultsForAsset}
          disabled={disabled || !activeItem}
          className="px-3 py-2 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          title="为该资产所有动画生成默认 name 映射"
        >
          <Wand2 size={14} />
          生成映射
        </button>

        <button
          onClick={() => applyBatch({ dir: defaults.dir })}
          disabled={disabled || !activeItem || rows.length === 0}
          className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title="批量设置 dir 为默认值"
        >
          批量Dir=默认
        </button>

        <button
          onClick={() => applyBatch({ type: defaults.type })}
          disabled={disabled || !activeItem || rows.length === 0}
          className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title="批量设置 type 为默认值"
        >
          批量Type=默认
        </button>

        <div className="flex-1" />

        <button
          onClick={clearAssetMappings}
          disabled={disabled || !activeItem || !manifest?.mappings}
          className="px-3 py-2 rounded-2xl bg-red-500/10 border border-red-500/20 text-[10px] font-black uppercase tracking-widest text-red-200 hover:bg-red-500/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          title="清空该资产的所有映射"
        >
          <Trash2 size={14} />
          清空资产映射
        </button>
      </div>

      {error && (
        <div className="mx-6 mb-4 text-[10px] font-bold text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
          manifest 解析失败: {error}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="mx-6 mb-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
          <AlertTriangle size={16} className="text-amber-300" />
          <span>发现 {validation.warnings.length} 条可改进项（导出仍可继续）</span>
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar px-6 pb-10">
        <div className="grid grid-cols-1 gap-2">
          {rows.length === 0 && (
            <div className="py-16 text-center text-white/30 text-[11px] font-black uppercase tracking-widest border border-white/10 rounded-[32px] bg-white/[0.02]">
              {activeItem ? '暂无匹配动画' : '未选择资产'}
            </div>
          )}

          {rows.map(r => {
            const rowWarnings = validation.warnings.filter(w => w.key === r.key);
            const hasWarn = rowWarnings.length > 0;

            return (
              <div
                key={r.key}
                className={`p-4 rounded-[28px] border transition-all ${hasWarn ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex flex-col min-w-0 flex-1 gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-black text-white truncate">{r.anim}</div>
                        <div className="text-[9px] font-mono font-bold text-white/40 truncate">{r.key}</div>
                      </div>

                      <button
                        onClick={() => deleteMapping(r.key)}
                        disabled={disabled || !manifest?.mappings?.[r.key]}
                        className="p-2 rounded-xl text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                        title="删除此条映射（回到默认推断）"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 flex flex-col gap-2">
                        <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">name（规范动作ID）</span>
                        <input
                          value={r.mapping?.name || ''}
                          onChange={(e) => upsertMapping(r.key, { name: e.target.value })}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            upsertMapping(r.key, { name: normalizeCanonicalName(v) });
                          }}
                          disabled={disabled}
                          className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-[12px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-30"
                          placeholder={r.effectiveName}
                        />
                        <div className="text-[9px] text-white/30 font-bold">
                          预览（无显式映射时）: <span className="font-mono text-white/50">{r.effectiveName}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">dir</span>
                          <select
                            value={(r.mapping?.dir || '') as any}
                            onChange={(e) => {
                              const v = e.target.value;
                              upsertMapping(r.key, { dir: (v || undefined) as any });
                            }}
                            disabled={disabled}
                            className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-30"
                          >
                            <option value="">(默认: {r.effectiveDir})</option>
                            <option value="none">none</option>
                            <option value="LR">LR</option>
                            <option value="4dir">4dir</option>
                            <option value="8dir">8dir</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">type</span>
                          <select
                            value={(r.mapping?.type || '') as any}
                            onChange={(e) => {
                              const v = e.target.value;
                              upsertMapping(r.key, { type: (v || undefined) as any });
                            }}
                            disabled={disabled}
                            className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 disabled:opacity-30"
                          >
                            <option value="">(默认: {r.effectiveType})</option>
                            <option value="once">once</option>
                            <option value="loop">loop</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {hasWarn && (
                      <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                        {rowWarnings.map(w => (
                          <div key={w.message}>{w.message}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function sanitizeFilename(name: string) {
  return (name || 'asset').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'asset';
}

