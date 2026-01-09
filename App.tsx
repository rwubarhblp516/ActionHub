import React, { useState, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { PreviewArea } from './components/PreviewArea';
import { ExportPanel } from './components/ExportPanel';
import { AssetPanel } from './components/AssetPanel';
import { EditorPanel, PanelDivider, PanelMenuItem } from './components/EditorPanel';
import { ActionTemplatePanel } from './components/ActionTemplatePanel';
import { AssemblyPanel } from './components/AssemblyPanel';
import { AnimationItem, ExportConfig, ExportProgress, LocalTemplateSummary, OfficialTemplateIndexEntry, SkinOverrideEntry, SkinOverrides, SkinValidationReport, TemplateContext, TemplatePack } from './types';
import { DEFAULT_CONFIG } from './constants';
import { groupFilesByDirectory } from './services/spineLoader';
import { SpineRenderer } from './services/spineRenderer';
import { CanvasRecorder } from './services/recorder';
import { ExportManager, OffscreenRenderTask } from './services/offscreenRenderer';
import { buildTemplatePackFromAsset } from './services/templatePack';
import { buildSkinAtlasFiles, SkinMatch, validateSkinFiles } from './services/skinValidator';
import { inferActionSpec } from './services/actionHubNaming';
import { fetchOfficialTemplateIndex, listLocalTemplates, loadLocalTemplate, loadOfficialTemplateFiles, saveLocalTemplate } from './services/templateLibrary';
import { exportTemplateZip } from './services/templateExporter';
import {
  Activity,
  Play,
  Square,
  RefreshCw,
  PanelsTopLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LAYOUT_STORAGE_KEY = 'actionhub.layout.v1';
const CONFIG_STORAGE_KEY = 'actionhub.config.v1';

type LayoutStateV1 = {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  showLeft: boolean;
  showRight: boolean;
  showBottom: boolean;
  assetDock: 'bottom' | 'right';
  assetInViewport: boolean;
  previewTab: 'preview' | 'asset';
  rightTab: 'export' | 'template' | 'assembly' | 'asset';
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const isRightTab = (v: unknown): v is LayoutStateV1['rightTab'] => v === 'export' || v === 'template' || v === 'assembly' || v === 'asset';
const isAssetDock = (v: unknown): v is LayoutStateV1['assetDock'] => v === 'bottom' || v === 'right';
const isPreviewTab = (v: unknown): v is LayoutStateV1['previewTab'] => v === 'preview' || v === 'asset';

type PersistedConfigV1 = {
  version: '1';
  config: ExportConfig;
};

const isExportFormat = (v: any): v is ExportConfig['format'] => [
  'webm-vp9',
  'webm-vp8',
  'mp4',
  'png-sequence',
  'jpg-sequence',
  'mp4-h264',
].includes(v);

const isViewId = (v: any) => v === 'VIEW_SIDE' || v === 'VIEW_TOP' || v === 'VIEW_ISO45';
const isDirectionSet = (v: any) => v === 'LR' || v === '4dir' || v === '8dir' || v === 'none';
const isTimingType = (v: any) => v === 'loop' || v === 'once';
const isSpritePackaging = (v: any) => v === 'sequence' || v === 'atlas';
const isTemplateContext = (v: any): v is TemplateContext =>
  v && typeof v.templateId === 'string' && typeof v.templateVersion === 'string';

const App: React.FC = () => {
  // --- Core State ---
  const [items, setItems] = useState<AnimationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_CONFIG);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  // --- Layout State ---
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);
  const [bottomHeight, setBottomHeight] = useState(240);
  const [rightTab, setRightTab] = useState<'export' | 'template' | 'assembly' | 'asset'>('export');
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [assetDock, setAssetDock] = useState<'bottom' | 'right'>('bottom');
  const [assetInViewport, setAssetInViewport] = useState(true);
  const [previewTab, setPreviewTab] = useState<'preview' | 'asset'>('preview');

  // --- Assembly State ---
  const [templatePack, setTemplatePack] = useState<TemplatePack | null>(null);
  const [templateAssetId, setTemplateAssetId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>('template_side');
  const [templateVersion, setTemplateVersion] = useState<string>('1.0.0');
  const [templateBuildStatus, setTemplateBuildStatus] = useState<'idle' | 'building' | 'error'>('idle');
  const [templateBuildError, setTemplateBuildError] = useState<string | null>(null);
  const [attachmentConflicts, setAttachmentConflicts] = useState<Array<{ attachment_name: string; slots: string[] }>>([]);
  const [officialTemplates, setOfficialTemplates] = useState<OfficialTemplateIndexEntry[]>([]);
  const [officialTemplatesStatus, setOfficialTemplatesStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [officialTemplatesError, setOfficialTemplatesError] = useState<string | null>(null);
  const [localTemplates, setLocalTemplates] = useState<LocalTemplateSummary[]>([]);
  const [localTemplatesError, setLocalTemplatesError] = useState<string | null>(null);
  const [skinFiles, setSkinFiles] = useState<File[]>([]);
  const [skinValidation, setSkinValidation] = useState<SkinValidationReport | null>(null);
  const [skinMatches, setSkinMatches] = useState<SkinMatch[]>([]);
  const [skinOverrides, setSkinOverrides] = useState<SkinOverrides | null>(null);
  const [assemblyPreviewEnabled, setAssemblyPreviewEnabled] = useState(false);
  const [assemblyItemId, setAssemblyItemId] = useState<string | null>(null);

  // Refs
  const rendererRef = useRef<SpineRenderer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const layoutHydratedRef = useRef(false);
  const configHydratedRef = useRef(false);
  const configPersistTimerRef = useRef<number | null>(null);
  const prevActiveItemIdRef = useRef<string | null>(null);

  // --- Handlers ---
  const handleFilesUpload = useCallback((files: FileList) => {
    const newItems = groupFilesByDirectory(files);
    setItems(prev => {
      const updated = [...prev, ...newItems];
      // 自动全选新导入的资产
      setSelectedIds(prevSelected => {
        const next = new Set(prevSelected);
        newItems.forEach(item => next.add(item.id));
        return next;
      });
      return updated;
    });
  }, []);

  const handleSelect = useCallback((id: string, multi: boolean) => {
    setActiveItemId(id);
    setSelectedIds(prev => {
      const newSet = new Set(multi ? prev : []);
      if (newSet.has(id) && multi) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(selectedIds.size === items.length ? new Set() : new Set(items.map(i => i.id)));
  }, [items, selectedIds]);

  const updateConfig = useCallback((cfg: Partial<ExportConfig>) => setConfig(prev => ({ ...prev, ...cfg })), []);

  const handleDelete = useCallback((id: string) => {
    const removed = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeItemId === id) setActiveItemId(null);
    if (removed?.kind === 'assembly') {
      setAssemblyPreviewEnabled(false);
      setAssemblyItemId(null);
      updateConfig({ templateContext: undefined });
    }
  }, [activeItemId, items, updateConfig]);

  const handleAnimationsLoaded = useCallback((itemId: string, animationNames: string[]) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const prevNames = item.animationNames || [];
      if (prevNames.length === animationNames.length && prevNames.every((v, i) => v === animationNames[i])) {
        return item;
      }
      return { ...item, animationNames };
    }));
  }, []);

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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buildOverridesStorageKey = (templateIdValue: string, skinIdValue: string) =>
    `actionhub.skinOverrides.v1.${templateIdValue}.${skinIdValue}`;

  const rebuildAssemblyPreview = useCallback((skinId: string, matches: SkinMatch[]) => {
    if (!templatePack || !templateAssetId) return;
    const templateItem = items.find(i => i.id === templateAssetId);
    if (!templateItem || !templateItem.files.skeleton) return;

    const { atlasFile, imageFiles } = buildSkinAtlasFiles({
      skinId,
      matches,
    });
    const assemblyId = `assembly:${templatePack.meta.template_id}:${skinId}`;
    const assemblyItem: AnimationItem = {
      id: assemblyId,
      name: `${templatePack.meta.template_id}_${skinId.slice(0, 6)}`,
      files: {
        skeleton: templateItem.files.skeleton,
        atlas: atlasFile,
        images: imageFiles,
        basePath: `assembly/${templatePack.meta.template_id}/${skinId}`,
      },
      animationNames: [],
      defaultAnimation: '',
      status: 'idle',
      kind: 'assembly',
      templateId: templatePack.meta.template_id,
      skinId,
    };
    setItems(prev => {
      const filtered = prev.filter(item => item.kind !== 'assembly' && item.id !== assemblyId);
      return [...filtered, assemblyItem];
    });
    setActiveItemId(assemblyId);
    setSelectedIds(new Set([assemblyId]));
    setAssemblyItemId(assemblyId);
    updateConfig({
      templateContext: {
        templateId: templatePack.meta.template_id,
        templateVersion: templatePack.meta.version,
        skinId,
        skeletonSignature: templatePack.meta.skeleton_signature,
      },
    });
  }, [items, templateAssetId, templatePack, updateConfig]);

  const revalidateSkinWithPack = useCallback(async (pack: TemplatePack) => {
    if (skinFiles.length === 0) return;
    const result = await validateSkinFiles({
      templateId: pack.meta.template_id,
      templateVersion: pack.meta.version,
      manifest: pack.attachment_manifest,
      files: skinFiles,
    });
    setSkinValidation(result.report);
    setSkinMatches(result.matches);
    if (skinOverrides) {
      const nextOverrides = {
        ...skinOverrides,
        skin_id: result.report.skin_id,
        generated_at: new Date().toISOString(),
      };
      setSkinOverrides(nextOverrides);
      try {
        const storageKey = buildOverridesStorageKey(nextOverrides.template_id, nextOverrides.skin_id);
        localStorage.setItem(storageKey, JSON.stringify(nextOverrides));
      } catch {
        // ignore
      }
    }
    if (assemblyPreviewEnabled && result.report.errors.length === 0) {
      rebuildAssemblyPreview(result.report.skin_id, result.matches);
    }
  }, [assemblyPreviewEnabled, rebuildAssemblyPreview, skinFiles, skinOverrides]);

  const getFileBase = (name: string) => {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
  };

  const getFileExt = (name: string) => {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(idx + 1) : '';
  };

  const normalizeAttachmentName = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    const replaced = trimmed.replace(/\s+/g, '_');
    const safe = replaced.replace(/[^a-zA-Z0-9_\-]/g, '');
    return safe || trimmed;
  };

  const collectCanonicalIssues = (entries: TemplatePack['attachment_manifest']['entries']) => {
    const missing: string[] = [];
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      const canonical = (entry.canonical_name || entry.attachment_name || '').trim();
      if (!canonical) {
        missing.push(`${entry.slot_name}::${entry.attachment_name}`);
        return;
      }
      counts.set(canonical, (counts.get(canonical) || 0) + 1);
    });
    const duplicates = Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    return { missing, duplicates };
  };

  const enforceUniqueCanonical = (entries: TemplatePack['attachment_manifest']['entries']) => {
    const seen = new Map<string, number>();
    return entries.map((entry) => {
      let canonical = (entry.canonical_name || entry.attachment_name || '').trim();
      if (!canonical) canonical = entry.attachment_name;
      const hits = seen.get(canonical) || 0;
      seen.set(canonical, hits + 1);
      if (hits === 0) return { ...entry, canonical_name: canonical };
      const suffix = String(hits + 1).padStart(2, '0');
      return { ...entry, canonical_name: `${canonical}_${suffix}` };
    });
  };

  const applyTemplateLoad = useCallback((item: AnimationItem, pack: TemplatePack) => {
    setItems(prev => {
      const filtered = prev.filter(existing => existing.id !== item.id);
      return [...filtered, item];
    });
    setSelectedIds(new Set([item.id]));
    setActiveItemId(item.id);
    setTemplatePack(pack);
    setTemplateAssetId(item.id);
    setTemplateId(pack.meta.template_id);
    setTemplateVersion(pack.meta.version);
    setTemplateBuildStatus('idle');
    setTemplateBuildError(null);
    setAttachmentConflicts([]);
    setSkinFiles([]);
    setSkinValidation(null);
    setSkinMatches([]);
    setSkinOverrides(null);
    setAssemblyPreviewEnabled(false);
    setAssemblyItemId(null);
    updateConfig({
      fps: 30,
      naming: { ...config.naming, view: 'VIEW_SIDE', defaultDir: 'LR' },
      templateContext: undefined,
    });
  }, [config.naming, updateConfig]);

  const refreshOfficialTemplates = useCallback(async () => {
    setOfficialTemplatesStatus('loading');
    setOfficialTemplatesError(null);
    try {
      const list = await fetchOfficialTemplateIndex();
      setOfficialTemplates(list);
      setOfficialTemplatesStatus('idle');
    } catch (e) {
      setOfficialTemplatesStatus('error');
      setOfficialTemplatesError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshLocalTemplates = useCallback(async () => {
    setLocalTemplatesError(null);
    try {
      const list = await listLocalTemplates();
      setLocalTemplates(list);
    } catch (e) {
      setLocalTemplatesError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // --- Persist Layout ---
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const next: LayoutStateV1 = {
        leftWidth: clampNumber(parsed.leftWidth, 180, 800, 260),
        rightWidth: clampNumber(parsed.rightWidth, 200, 900, 300),
        bottomHeight: clampNumber(parsed.bottomHeight, 100, 600, 240),
        showLeft: Boolean(parsed.showLeft),
        showRight: Boolean(parsed.showRight),
        showBottom: Boolean(parsed.showBottom),
        assetDock: isAssetDock(parsed.assetDock) ? parsed.assetDock : 'bottom',
        assetInViewport: typeof parsed.assetInViewport === 'boolean' ? parsed.assetInViewport : true,
        previewTab: isPreviewTab(parsed.previewTab) ? parsed.previewTab : 'preview',
        rightTab: isRightTab(parsed.rightTab) ? parsed.rightTab : 'export',
      };
      if (next.assetDock !== 'right' && next.rightTab === 'asset') {
        next.rightTab = 'export';
      }

      setLeftWidth(next.leftWidth);
      setRightWidth(next.rightWidth);
      setBottomHeight(next.bottomHeight);
      setShowLeft(next.showLeft);
      setShowRight(next.showRight);
      setAssetDock(next.assetDock);
      setAssetInViewport(next.assetInViewport);
      setPreviewTab(next.previewTab);
      setRightTab(next.rightTab);

      // 兼容：如果看板停靠到右侧，底部栏应隐藏
      if (next.assetInViewport) {
        setShowBottom(false);
      } else {
        setShowBottom(next.assetDock === 'right' ? false : next.showBottom);
      }
    } catch (e) {
      console.warn('布局缓存读取失败，将使用默认布局:', e);
    } finally {
      // 避免首次 mount 时把默认布局写回覆盖缓存：推迟到本轮 effects 之后再允许写入
      Promise.resolve().then(() => { layoutHydratedRef.current = true; });
    }
  }, []);

  React.useEffect(() => {
    if (!layoutHydratedRef.current) return;
    try {
      const payload: LayoutStateV1 = {
        leftWidth,
        rightWidth,
        bottomHeight,
        showLeft,
        showRight,
        showBottom,
        assetDock,
        assetInViewport,
        previewTab,
        rightTab,
      };
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 忽略：隐身窗口/存储不可用等情况
    }
  }, [leftWidth, rightWidth, bottomHeight, showLeft, showRight, showBottom, assetDock, assetInViewport, previewTab, rightTab]);

  React.useEffect(() => {
    refreshOfficialTemplates();
    refreshLocalTemplates();
  }, [refreshOfficialTemplates, refreshLocalTemplates]);

  const persistConfigNow = useCallback((next: ExportConfig) => {
    try {
      const payload: PersistedConfigV1 = { version: '1', config: next };
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedConfigV1;
      if (!parsed || parsed.version !== '1' || !parsed.config) return;
      const c = parsed.config as any;

      const next: ExportConfig = {
        ...DEFAULT_CONFIG,
        width: clampNumber(c.width, 64, 8192, DEFAULT_CONFIG.width),
        height: clampNumber(c.height, 64, 8192, DEFAULT_CONFIG.height),
        fps: clampNumber(c.fps, 1, 240, DEFAULT_CONFIG.fps),
        format: isExportFormat(c.format) ? c.format : DEFAULT_CONFIG.format,
        duration: clampNumber(c.duration, 0, 3600, DEFAULT_CONFIG.duration),
        scale: clampNumber(c.scale, 0.1, 5.0, DEFAULT_CONFIG.scale),
        backgroundColor: typeof c.backgroundColor === 'string' ? c.backgroundColor : DEFAULT_CONFIG.backgroundColor,
        spritePackaging: isSpritePackaging(c.spritePackaging) ? c.spritePackaging : DEFAULT_CONFIG.spritePackaging,
        atlasMaxSize: clampNumber(c.atlasMaxSize, 256, 8192, DEFAULT_CONFIG.atlasMaxSize),
        atlasPadding: clampNumber(c.atlasPadding, 0, 64, DEFAULT_CONFIG.atlasPadding),
        atlasTrim: typeof c.atlasTrim === 'boolean' ? c.atlasTrim : DEFAULT_CONFIG.atlasTrim,
        naming: {
          ...DEFAULT_CONFIG.naming,
          ...(c.naming || {}),
          enabled: Boolean(c.naming?.enabled),
          view: isViewId(c.naming?.view) ? c.naming.view : DEFAULT_CONFIG.naming.view,
          defaultCategory: typeof c.naming?.defaultCategory === 'string' ? c.naming.defaultCategory : DEFAULT_CONFIG.naming.defaultCategory,
          defaultDir: isDirectionSet(c.naming?.defaultDir) ? c.naming.defaultDir : DEFAULT_CONFIG.naming.defaultDir,
          defaultType: isTimingType(c.naming?.defaultType) ? c.naming.defaultType : DEFAULT_CONFIG.naming.defaultType,
          manifest: (c.naming?.manifest && typeof c.naming.manifest === 'object') ? c.naming.manifest : undefined,
        },
        templateContext: isTemplateContext(c.templateContext) ? c.templateContext : undefined,
      };

      setConfig(next);
    } catch (e) {
      console.warn('导出配置缓存读取失败，将使用默认配置:', e);
    } finally {
      Promise.resolve().then(() => { configHydratedRef.current = true; });
    }
  }, []);

  React.useEffect(() => {
    if (!configHydratedRef.current) return;
    if (configPersistTimerRef.current) window.clearTimeout(configPersistTimerRef.current);
    configPersistTimerRef.current = window.setTimeout(() => {
      persistConfigNow(config);
    }, 250);
    return () => {
      if (configPersistTimerRef.current) window.clearTimeout(configPersistTimerRef.current);
    };
  }, [config, persistConfigNow]);

  const handleBuildTemplateFromActive = useCallback(async () => {
    const current = items.find(i => i.id === activeItemId) || null;
    if (!current) {
      alert('请先选择一个模板资产。');
      return;
    }
    setTemplateBuildStatus('building');
    setTemplateBuildError(null);
    try {
      const id = (templateId || current.name || 'template').trim();
      const version = (templateVersion || '1.0.0').trim();
      const result = await buildTemplatePackFromAsset({
        item: current,
        naming: config.naming,
        exportConfig: config,
        templateId: id,
        version,
      });
      setTemplatePack(result.pack);
      setTemplateAssetId(current.id);
      setAttachmentConflicts(result.attachmentNameConflicts);
      setTemplateBuildStatus('idle');
      setSkinFiles([]);
      setSkinValidation(null);
      setSkinMatches([]);
      setSkinOverrides(null);
      setAssemblyPreviewEnabled(false);
      setAssemblyItemId(null);
      updateConfig({
        fps: 30,
        naming: { ...config.naming, view: 'VIEW_SIDE', defaultDir: 'LR' },
      });
    } catch (e) {
      setTemplateBuildStatus('error');
      setTemplateBuildError(e instanceof Error ? e.message : String(e));
    }
  }, [activeItemId, config, items, templateId, templateVersion, updateConfig]);

  const handleClearTemplate = useCallback(() => {
    setTemplatePack(null);
    setTemplateAssetId(null);
    setAttachmentConflicts([]);
    setSkinFiles([]);
    setSkinValidation(null);
    setSkinMatches([]);
    setSkinOverrides(null);
    setAssemblyPreviewEnabled(false);
    setAssemblyItemId(null);
    updateConfig({ templateContext: undefined });
  }, [updateConfig]);

  const buildCanonicalizedEntries = (entries: TemplatePack['attachment_manifest']['entries']) => {
    const counts = new Map<string, number>();
    const normalized = entries.map((entry) => {
      const base = normalizeAttachmentName(entry.attachment_name) || entry.attachment_name;
      counts.set(base, (counts.get(base) || 0) + 1);
      return { entry, base };
    });
    const drafts = normalized.map(({ entry, base }) => {
      const slotSafe = normalizeAttachmentName(entry.slot_name) || entry.slot_name;
      const canonical = (counts.get(base) || 0) > 1 ? `${slotSafe}__${base}` : base;
      return { ...entry, canonical_name: canonical };
    });
    const seen = new Map<string, number>();
    return drafts.map((entry) => {
      const canonical = (entry.canonical_name || entry.attachment_name || '').trim();
      const hits = seen.get(canonical) || 0;
      seen.set(canonical, hits + 1);
      if (hits === 0) return entry;
      const suffix = String(hits + 1).padStart(2, '0');
      return { ...entry, canonical_name: `${canonical}_${suffix}` };
    });
  };

  const handleAutoCanonicalize = useCallback(async () => {
    if (!templatePack) return;
    const nextEntries = buildCanonicalizedEntries(templatePack.attachment_manifest.entries);
    const nextPack: TemplatePack = {
      ...templatePack,
      attachment_manifest: {
        ...templatePack.attachment_manifest,
        entries: nextEntries,
      },
    };
    setTemplatePack(nextPack);
    await revalidateSkinWithPack(nextPack);
    const issues = collectCanonicalIssues(nextEntries);
    if (issues.duplicates.length > 0 || issues.missing.length > 0) {
      alert('自动规范化后仍存在冲突或空命名，请手动调整。');
    }
  }, [revalidateSkinWithPack, templatePack]);

  const handleUpdateCanonicalName = useCallback(async (slot: string, attachment: string, canonical: string) => {
    if (!templatePack) return;
    const nextEntries = templatePack.attachment_manifest.entries.map((entry) => {
      if (entry.slot_name === slot && entry.attachment_name === attachment) {
        const nextCanonical = canonical.trim() || entry.attachment_name;
        return { ...entry, canonical_name: nextCanonical };
      }
      return entry;
    });
    const nextPack: TemplatePack = {
      ...templatePack,
      attachment_manifest: {
        ...templatePack.attachment_manifest,
        entries: nextEntries,
      },
    };
    setTemplatePack(nextPack);
    await revalidateSkinWithPack(nextPack);
  }, [revalidateSkinWithPack, templatePack]);

  const handleApplyCanonicalBatch = useCallback(async (prefix: string, suffix: string) => {
    if (!templatePack) return;
    const safePrefix = normalizeAttachmentName(prefix);
    const safeSuffix = normalizeAttachmentName(suffix);
    const nextEntries = templatePack.attachment_manifest.entries.map((entry) => {
      const base = (entry.canonical_name || entry.attachment_name).trim() || entry.attachment_name;
      const combined = `${safePrefix}${base}${safeSuffix}`;
      return { ...entry, canonical_name: combined };
    });
    const nextPack: TemplatePack = {
      ...templatePack,
      attachment_manifest: {
        ...templatePack.attachment_manifest,
        entries: enforceUniqueCanonical(nextEntries),
      },
    };
    setTemplatePack(nextPack);
    await revalidateSkinWithPack(nextPack);
    const issues = collectCanonicalIssues(nextPack.attachment_manifest.entries);
    if (issues.duplicates.length > 0 || issues.missing.length > 0) {
      alert('批量规则应用后仍存在冲突或空命名，请手动调整。');
    }
  }, [enforceUniqueCanonical, revalidateSkinWithPack, templatePack]);

  const handleExportCanonicalList = useCallback(() => {
    if (!templatePack) {
      alert('请先生成或加载模板包。');
      return;
    }
    const payload = {
      template_id: templatePack.meta.template_id,
      template_version: templatePack.meta.version,
      generated_at: new Date().toISOString(),
      entries: templatePack.attachment_manifest.entries.map(entry => ({
        slot_name: entry.slot_name,
        attachment_name: entry.attachment_name,
        canonical_name: entry.canonical_name || entry.attachment_name,
      })),
    };
    downloadJson(payload, `canonical_${templatePack.meta.template_id}_${templatePack.meta.version}.json`);
  }, [templatePack]);

  const handleApplySmartRename = useCallback(async () => {
    if (!templatePack || !skinValidation) {
      alert('请先生成模板并上传皮肤。');
      return;
    }
    if (skinValidation.name_mismatch_suggestions.length === 0) {
      alert('当前没有需要重命名的文件。');
      return;
    }
    const renameMap = new Map<string, string>();
    skinValidation.name_mismatch_suggestions.forEach((entry) => {
      if (!renameMap.has(entry.input)) renameMap.set(entry.input, entry.suggestion);
    });

    const usedNames = new Set<string>();
    const conflicts: string[] = [];
    const renamedFiles = skinFiles.map((file) => {
      const base = getFileBase(file.name);
      const ext = getFileExt(file.name);
      const suggestion = renameMap.get(base);
      const nextName = suggestion ? `${suggestion}${ext ? `.${ext}` : ''}` : file.name;
      if (usedNames.has(nextName)) {
        conflicts.push(nextName);
        return file;
      }
      usedNames.add(nextName);
      if (nextName === file.name) return file;
      return new File([file], nextName, { type: file.type, lastModified: file.lastModified });
    });

    if (conflicts.length > 0) {
      alert(`智能重命名存在冲突，已跳过: ${conflicts.slice(0, 4).join(', ')}${conflicts.length > 4 ? '...' : ''}`);
    }

    const result = await validateSkinFiles({
      templateId: templatePack.meta.template_id,
      templateVersion: templatePack.meta.version,
      manifest: templatePack.attachment_manifest,
      files: renamedFiles,
    });

    setSkinFiles(renamedFiles);
    setSkinValidation(result.report);
    setSkinMatches(result.matches);

    if (skinOverrides) {
      const nextOverrides = {
        ...skinOverrides,
        skin_id: result.report.skin_id,
        generated_at: new Date().toISOString(),
      };
      setSkinOverrides(nextOverrides);
      try {
        const storageKey = buildOverridesStorageKey(nextOverrides.template_id, nextOverrides.skin_id);
        localStorage.setItem(storageKey, JSON.stringify(nextOverrides));
      } catch {
        // ignore
      }
    }
    if (assemblyPreviewEnabled && result.report.errors.length === 0) {
      rebuildAssemblyPreview(result.report.skin_id, result.matches);
    }
  }, [assemblyPreviewEnabled, rebuildAssemblyPreview, skinFiles, skinOverrides, skinValidation, templatePack]);

  const handleReplaceSkinAttachment = useCallback(async (params: { slot: string; attachment: string; file: File }) => {
    if (!templatePack) {
      alert('请先生成模板包。');
      return;
    }
    const ext = getFileExt(params.file.name).toLowerCase();
    if (ext !== 'png') {
      alert('仅支持 PNG 文件，请重新选择。');
      return;
    }
    const conflictSet = new Set(attachmentConflicts.map(c => c.attachment_name));
    const baseName = conflictSet.has(params.attachment)
      ? `${params.slot}__${params.attachment}`
      : params.attachment;
    const renamedFile = new File([params.file], `${baseName}.png`, {
      type: params.file.type || 'image/png',
      lastModified: params.file.lastModified,
    });
    const key = `${params.slot}::${params.attachment}`;
    const existingMatch = skinMatches.find(match => match.key === key);

    let nextFiles = skinFiles.filter(file => file.name !== renamedFile.name);
    if (existingMatch) {
      nextFiles = nextFiles.filter(file => file.name !== existingMatch.file.name);
    }
    nextFiles.push(renamedFile);

    const result = await validateSkinFiles({
      templateId: templatePack.meta.template_id,
      templateVersion: templatePack.meta.version,
      manifest: templatePack.attachment_manifest,
      files: nextFiles,
    });
    setSkinFiles(nextFiles);
    setSkinValidation(result.report);
    setSkinMatches(result.matches);

    if (skinOverrides) {
      const nextOverrides = {
        ...skinOverrides,
        skin_id: result.report.skin_id,
        generated_at: new Date().toISOString(),
      };
      setSkinOverrides(nextOverrides);
      try {
        const storageKey = buildOverridesStorageKey(nextOverrides.template_id, nextOverrides.skin_id);
        localStorage.setItem(storageKey, JSON.stringify(nextOverrides));
      } catch {
        // ignore
      }
    }
    if (assemblyPreviewEnabled && result.report.errors.length === 0) {
      rebuildAssemblyPreview(result.report.skin_id, result.matches);
    }
  }, [assemblyPreviewEnabled, attachmentConflicts, rebuildAssemblyPreview, skinFiles, skinMatches, skinOverrides, templatePack]);

  const handleRenameSkinFile = useCallback(async (oldName: string, nextName: string) => {
    if (!templatePack) {
      alert('请先生成模板包。');
      return;
    }
    const target = skinFiles.find(file => file.name === oldName);
    if (!target) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;

    const ext = getFileExt(target.name);
    const providedExt = getFileExt(trimmed);
    const base = providedExt ? getFileBase(trimmed) : trimmed;
    const finalName = `${base}.${ext}`;

    if (finalName === oldName) return;
    if (skinFiles.some(file => file.name === finalName)) {
      alert(`已存在同名文件: ${finalName}`);
      return;
    }

    const renamed = new File([target], finalName, { type: target.type, lastModified: target.lastModified });
    const nextFiles = skinFiles.map(file => (file.name === oldName ? renamed : file));

    const result = await validateSkinFiles({
      templateId: templatePack.meta.template_id,
      templateVersion: templatePack.meta.version,
      manifest: templatePack.attachment_manifest,
      files: nextFiles,
    });
    setSkinFiles(nextFiles);
    setSkinValidation(result.report);
    setSkinMatches(result.matches);

    if (skinOverrides) {
      const nextOverrides = {
        ...skinOverrides,
        skin_id: result.report.skin_id,
        generated_at: new Date().toISOString(),
      };
      setSkinOverrides(nextOverrides);
      try {
        const storageKey = buildOverridesStorageKey(nextOverrides.template_id, nextOverrides.skin_id);
        localStorage.setItem(storageKey, JSON.stringify(nextOverrides));
      } catch {
        // ignore
      }
    }
    if (assemblyPreviewEnabled && result.report.errors.length === 0) {
      rebuildAssemblyPreview(result.report.skin_id, result.matches);
    }
  }, [assemblyPreviewEnabled, rebuildAssemblyPreview, skinFiles, skinOverrides, templatePack]);

  const handleLoadOfficialTemplate = useCallback(async (entry: OfficialTemplateIndexEntry) => {
    setTemplateBuildStatus('building');
    setTemplateBuildError(null);
    try {
      const { item, pack } = await loadOfficialTemplateFiles(entry);
      if (pack) {
        applyTemplateLoad(item, pack);
      } else {
        const built = await buildTemplatePackFromAsset({
          item,
          naming: config.naming,
          exportConfig: config,
          templateId: entry.template_id,
          version: entry.version,
        });
        applyTemplateLoad(item, built.pack);
        setAttachmentConflicts(built.attachmentNameConflicts);
      }
    } catch (e) {
      setTemplateBuildStatus('error');
      setTemplateBuildError(e instanceof Error ? e.message : String(e));
    }
  }, [applyTemplateLoad, config, loadOfficialTemplateFiles]);

  const handleLoadLocalTemplate = useCallback(async (key: string) => {
    setTemplateBuildStatus('building');
    setTemplateBuildError(null);
    try {
      const { item, pack } = await loadLocalTemplate(key);
      applyTemplateLoad(item, pack);
    } catch (e) {
      setTemplateBuildStatus('error');
      setTemplateBuildError(e instanceof Error ? e.message : String(e));
    }
  }, [applyTemplateLoad]);

  const handleSaveLocalTemplate = useCallback(async () => {
    if (!templatePack || !templateAssetId) {
      alert('请先生成或加载模板包。');
      return;
    }
    const item = items.find(i => i.id === templateAssetId);
    if (!item) {
      alert('模板资产丢失，请重新导入或加载模板。');
      return;
    }
    try {
      await saveLocalTemplate({
        item,
        pack: templatePack,
        name: item.name || templatePack.meta.template_id,
      });
      await refreshLocalTemplates();
      alert('已保存到本地模板库。');
    } catch (e) {
      alert(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [items, refreshLocalTemplates, templateAssetId, templatePack]);

  const handleExportTemplatePack = useCallback(async () => {
    if (!templatePack || !templateAssetId) {
      alert('请先生成或加载模板包。');
      return;
    }
    const item = items.find(i => i.id === templateAssetId);
    if (!item) {
      alert('模板资产丢失，请重新导入或加载模板。');
      return;
    }
    try {
      let packToExport = templatePack;
      const issues = collectCanonicalIssues(templatePack.attachment_manifest.entries);
      if (issues.duplicates.length > 0 || issues.missing.length > 0) {
        const nextEntries = buildCanonicalizedEntries(templatePack.attachment_manifest.entries);
        const nextIssues = collectCanonicalIssues(nextEntries);
        packToExport = {
          ...templatePack,
          attachment_manifest: {
            ...templatePack.attachment_manifest,
            entries: nextEntries,
          },
        };
        setTemplatePack(packToExport);
        if (nextIssues.duplicates.length > 0 || nextIssues.missing.length > 0) {
          alert('模板导出失败：存在重复或空的 canonical 名称，请手动修复后再导出。');
          return;
        }
        alert('已自动规范化附件命名，并同步到模板包。');
      }
      const { blob, filename } = await exportTemplateZip({ pack: packToExport, item });
      downloadBlob(blob, filename);
    } catch (e) {
      alert(`导出模板包失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [items, templateAssetId, templatePack]);

  const handleUploadSkinFolder = useCallback(async (files: FileList) => {
    if (!templatePack) {
      alert('请先生成模板包。');
      return;
    }
    const fileList = Array.from(files);
    setSkinFiles(fileList);
    const result = await validateSkinFiles({
      templateId: templatePack.meta.template_id,
      templateVersion: templatePack.meta.version,
      manifest: templatePack.attachment_manifest,
      files: fileList,
    });
    setSkinValidation(result.report);
    setSkinMatches(result.matches);

    const key = buildOverridesStorageKey(templatePack.meta.template_id, result.report.skin_id);
    let overrides: SkinOverrides = {
      version: '1.0',
      template_id: templatePack.meta.template_id,
      template_version: templatePack.meta.version,
      skin_id: result.report.skin_id,
      generated_at: new Date().toISOString(),
      overrides: {},
    };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as SkinOverrides;
        if (parsed && parsed.skin_id === result.report.skin_id) {
          overrides = parsed;
        }
      }
    } catch {
      // ignore
    }
    setSkinOverrides(overrides);
  }, [templatePack]);

  const handleClearSkin = useCallback(() => {
    setSkinFiles([]);
    setSkinValidation(null);
    setSkinMatches([]);
    setSkinOverrides(null);
    setAssemblyPreviewEnabled(false);
    setAssemblyItemId(null);
    updateConfig({ templateContext: undefined });
  }, [updateConfig]);

  const updateSkinOverrides = useCallback((key: string, patch: Partial<SkinOverrideEntry>) => {
    setSkinOverrides(prev => {
      if (!prev) return prev;
      const next: SkinOverrides = {
        ...prev,
        overrides: {
          ...prev.overrides,
          [key]: {
            offset_x: 0,
            offset_y: 0,
            scale_x: 1,
            scale_y: 1,
            rotation: 0,
            ...prev.overrides[key],
            ...patch,
          },
        },
      };
      try {
        const storageKey = buildOverridesStorageKey(prev.template_id, prev.skin_id);
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const resetSkinOverride = useCallback((key: string) => {
    setSkinOverrides(prev => {
      if (!prev) return prev;
      const nextOverrides = { ...prev.overrides };
      delete nextOverrides[key];
      const next: SkinOverrides = { ...prev, overrides: nextOverrides };
      try {
        const storageKey = buildOverridesStorageKey(prev.template_id, prev.skin_id);
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleCopyMirror = useCallback((key: string) => {
    if (!skinOverrides) return;
    const [slot, attachment] = key.split('::');
    if (!attachment) return;
    const mirror = (() => {
      const patterns: Array<[RegExp, string]> = [
        [/_l$/i, '_r'],
        [/_r$/i, '_l'],
        [/-l$/i, '-r'],
        [/-r$/i, '-l'],
        [/\.l$/i, '.r'],
        [/\.r$/i, '.l'],
        [/left$/i, 'right'],
        [/right$/i, 'left'],
      ];
      for (const [pattern, replacement] of patterns) {
        if (pattern.test(attachment)) return `${slot}::${attachment.replace(pattern, replacement)}`;
      }
      return '';
    })();
    if (!mirror) return;
    const src = skinOverrides.overrides[key];
    if (!src) return;
    updateSkinOverrides(mirror, { ...src });
  }, [skinOverrides, updateSkinOverrides]);

  const handleTogglePreview = useCallback((enabled: boolean) => {
    if (!enabled) {
      setAssemblyPreviewEnabled(false);
      setAssemblyItemId(null);
      setItems(prev => prev.filter(item => item.kind !== 'assembly'));
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (assemblyItemId) next.delete(assemblyItemId);
        return next;
      });
      if (prevActiveItemIdRef.current) {
        setActiveItemId(prevActiveItemIdRef.current);
      }
      updateConfig({ templateContext: undefined });
      return;
    }
    if (!templatePack || !skinValidation || skinValidation.errors.length > 0) return;
    const templateItem = items.find(i => i.id === templateAssetId);
    if (!templateItem || !templateItem.files.skeleton) {
      alert('模板资产丢失，请重新导入。');
      return;
    }

    const { atlasFile, imageFiles } = buildSkinAtlasFiles({
      skinId: skinValidation.skin_id,
      matches: skinMatches,
    });
    const assemblyId = `assembly:${templatePack.meta.template_id}:${skinValidation.skin_id}`;
    const assemblyItem: AnimationItem = {
      id: assemblyId,
      name: `${templatePack.meta.template_id}_${skinValidation.skin_id.slice(0, 6)}`,
      files: {
        skeleton: templateItem.files.skeleton,
        atlas: atlasFile,
        images: imageFiles,
        basePath: `assembly/${templatePack.meta.template_id}/${skinValidation.skin_id}`,
      },
      animationNames: [],
      defaultAnimation: '',
      status: 'idle',
      kind: 'assembly',
      templateId: templatePack.meta.template_id,
      skinId: skinValidation.skin_id,
    };
    setItems(prev => {
      const filtered = prev.filter(item => item.kind !== 'assembly' && item.id !== assemblyId);
      return [...filtered, assemblyItem];
    });
    prevActiveItemIdRef.current = activeItemId;
    setActiveItemId(assemblyId);
    setSelectedIds(new Set([assemblyId]));
    setAssemblyPreviewEnabled(true);
    setAssemblyItemId(assemblyId);
    updateConfig({
      templateContext: {
        templateId: templatePack.meta.template_id,
        templateVersion: templatePack.meta.version,
        skinId: skinValidation.skin_id,
        skeletonSignature: templatePack.meta.skeleton_signature,
      },
    });
  }, [
    activeItemId,
    assemblyItemId,
    items,
    skinMatches,
    skinValidation,
    templateAssetId,
    templatePack,
    updateConfig,
  ]);

  const processExportQueue = async () => {
    const selectedItems = assemblyPreviewEnabled && assemblyItemId
      ? items.filter(i => i.id === assemblyItemId)
      : items.filter(i => selectedIds.has(i.id));
    if (selectedItems.length === 0) return;

    if (assemblyPreviewEnabled && templatePack) {
      if (!skinValidation || skinValidation.errors.length > 0) {
        alert('皮肤校验未通过，请先修复错误。');
        return;
      }
      if (config.fps !== 30) {
        alert('动作迁移模式下帧率固定为 30fps。');
        return;
      }
      if (config.naming.view !== 'VIEW_SIDE') {
        alert('动作迁移模式下视角固定为 VIEW_SIDE。');
        return;
      }
      if (config.naming.defaultDir !== 'LR') {
        alert('动作迁移模式下方向集固定为 LR。');
        return;
      }

      const activeAssembly = selectedItems[0];
      const actionSet = new Set(templatePack.action_manifest.actions.map(a => a.canonicalName));
      const derivedSet = new Set<string>();
      (activeAssembly.animationNames || []).forEach((anim) => {
        const spec = inferActionSpec({
          assetName: activeAssembly.name,
          assetKey: activeAssembly.files.basePath || activeAssembly.name,
          animationName: anim,
          naming: config.naming,
        });
        derivedSet.add(spec.canonicalName);
      });
      const missingActions = Array.from(actionSet).filter(name => !derivedSet.has(name));
      if (missingActions.length > 0) {
        alert(`动作迁移校验失败，缺少动作: ${missingActions.slice(0, 6).join(', ')}${missingActions.length > 6 ? '...' : ''}`);
        return;
      }
    }

    setIsExporting(true);
    abortControllerRef.current = new AbortController();

    try {
      const { processExportWithOffscreen } = await import('./services/exportProcessor');

      await processExportWithOffscreen(
        selectedItems,
        config,
        {
          onProgress: (current, total, currentName) => {
            setProgress({ current, total, currentName });
          },
          onItemStatusChange: (itemId, status) => {
            setItems(prev => prev.map(item =>
              item.id === itemId ? { ...item, status } : item
            ));
          }
        },
        abortControllerRef.current.signal
      );
    } catch (error) {
      console.error("导出失败:", error);
      alert(`渲染失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const activeItem = items.find(i => i.id === activeItemId) || null;
  const assemblyItem = assemblyItemId ? items.find(i => i.id === assemblyItemId) || null : null;
  const previewItem = assemblyPreviewEnabled && assemblyItem ? assemblyItem : activeItem;

  const resetLayout = () => {
    setLeftWidth(260);
    setRightWidth(300);
    setBottomHeight(240);
    setShowLeft(true);
    setShowRight(true);
    setShowBottom(true);
    setAssetDock('bottom');
    setAssetInViewport(true);
    setPreviewTab('preview');
    setRightTab('export');
  };

  const focusPreview = () => {
    setShowLeft(false);
    setShowRight(false);
    setShowBottom(false);
  };

  const dockAssetToRight = () => {
    setAssetInViewport(false);
    setAssetDock('right');
    setShowBottom(false);
    setShowRight(true);
    setRightTab('asset');
  };

  const dockAssetToBottom = () => {
    setAssetInViewport(false);
    setAssetDock('bottom');
    setShowBottom(true);
    if (rightTab === 'asset') setRightTab('export');
  };

  const toggleAssetInViewport = () => {
    setAssetInViewport(prev => {
      const next = !prev;
      if (next) {
        setShowBottom(false);
        if (rightTab === 'asset') setRightTab('export');
        if (previewTab !== 'preview') setPreviewTab('preview');
      } else {
        setShowBottom(true);
      }
      return next;
    });
  };

  const rightPanelMenuItems: PanelMenuItem[] = [
    { label: '隐藏右侧栏', onClick: () => setShowRight(false) },
    { label: assetInViewport ? '看板分离出预览' : '看板并入预览', onClick: toggleAssetInViewport },
    ...(!assetInViewport
      ? (assetDock === 'right'
        ? [{ label: '还原看板到底部', onClick: dockAssetToBottom }]
        : [{ label: '合并看板到右侧', onClick: dockAssetToRight }])
      : []),
    { label: '专注预览', onClick: focusPreview },
    { label: '重置布局', onClick: resetLayout },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0a0b14] text-gray-200 font-sans overflow-hidden select-none relative">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90%] h-[50%] bg-indigo-500/10 blur-[150px] rounded-full opacity-50" />
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/15 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[120px] rounded-full"
        />
      </div>

      {/* Toolbar */}
      <div className="h-16 z-20 bg-black/60 backdrop-blur-3xl border-b border-white/10 flex items-center px-8 justify-between shrink-0 shadow-2xl">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-500 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              <Activity size={22} className="text-black" strokeWidth={3} />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-black uppercase tracking-[0.2em] text-white leading-none">骨骼动画工作台</span>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.25em] mt-1.5">专业生产线</span>
            </div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <button onClick={resetLayout} className="group flex items-center gap-2.5 text-[10px] text-white/60 hover:text-white transition-all uppercase font-black tracking-widest">
            <RefreshCw size={13} className="text-indigo-400 group-hover:rotate-180 transition-transform duration-700" />
            重置空间
          </button>
          <button
            onClick={focusPreview}
            className="group flex items-center gap-2.5 text-[10px] text-white/60 hover:text-white transition-all uppercase font-black tracking-widest"
            title="隐藏左右与底部面板，专注预览"
          >
            <PanelsTopLeft size={13} className="text-indigo-400" />
            专注预览
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl p-1.5">
            <button
              onClick={() => setShowLeft(v => !v)}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showLeft ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title={showLeft ? '隐藏左侧栏' : '显示左侧栏'}
            >
              左
            </button>
            <button
              onClick={() => {
                if (assetDock === 'right') {
                  dockAssetToBottom();
                } else {
                  setShowBottom(v => !v);
                }
              }}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showBottom ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title={assetDock === 'right' ? '还原看板到底部' : (showBottom ? '隐藏底部栏' : '显示底部栏')}
            >
              底
            </button>
            <button
              onClick={() => setShowRight(v => !v)}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showRight ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title={showRight ? '隐藏右侧栏' : '显示右侧栏'}
            >
              右
            </button>
          </div>
          <AnimatePresence mode="wait">
            {isExporting ? (
              <motion.button
                key="stop"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={() => abortControllerRef.current?.abort()}
                className="flex items-center gap-3 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl shadow-red-500/20"
              >
                <Square size={14} fill="currentColor" />
                停止渲染
              </motion.button>
            ) : (
              <motion.button
                key="play"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={processExportQueue}
                disabled={selectedIds.size === 0}
                className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl ${selectedIds.size === 0 ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' : 'bg-white text-black hover:bg-gray-100 hover:scale-[1.05] active:scale-95 shadow-white/10'
                  }`}
              >
                <Play size={14} fill="currentColor" className={selectedIds.size === 0 ? '' : 'text-indigo-600'} />
                批量渲染输出 ({selectedIds.size})
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 relative z-10">
        {/* Left Sidebar */}
        {showLeft && (
          <>
            <div className="flex flex-col shrink-0 min-h-0" style={{ width: leftWidth }}>
              <EditorPanel
                title="项目资产"
                flex={1}
                minWidth={180}
                menuItems={[
                  { label: '隐藏左侧栏', onClick: () => setShowLeft(false) },
                  { label: '专注预览', onClick: focusPreview },
                  { label: '重置布局', onClick: resetLayout },
                ]}
              >
                <Sidebar
                  items={items}
                  activeId={activeItemId}
                  selectedIds={selectedIds}
                  onSelect={handleSelect}
                  onSelectAll={handleSelectAll}
                  onImport={handleFilesUpload}
                  onDelete={handleDelete}
                />
              </EditorPanel>
            </div>

            <PanelDivider onDrag={(dx) => setLeftWidth(prev => Math.max(180, prev + dx))} />
          </>
        )}

        {/* Middle Column */}
          <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* Viewport */}
            <div className="flex-1 flex flex-col min-h-0 relative group">
              <EditorPanel
              title="实时渲染视口"
              flex={1}
              menuItems={[
                { label: showLeft ? '隐藏左侧栏' : '显示左侧栏', onClick: () => setShowLeft(v => !v) },
                { label: showRight ? '隐藏右侧栏' : '显示右侧栏', onClick: () => setShowRight(v => !v) },
                { label: assetInViewport ? '看板分离出预览' : '看板并入预览', onClick: toggleAssetInViewport },
                {
                  label: assetDock === 'right'
                    ? '还原看板到底部'
                    : (showBottom ? '隐藏底部栏' : '显示底部栏'),
                  onClick: () => {
                    if (assetInViewport) return;
                    if (assetDock === 'right') dockAssetToBottom();
                    else setShowBottom(v => !v);
                  },
                  disabled: assetInViewport,
                },
                { label: '专注预览', onClick: focusPreview },
                { label: '重置布局', onClick: resetLayout },
              ]}
            >
              <div className="flex-1 flex flex-col min-h-0">
                {assetInViewport && (
                  <div className="flex items-center gap-2 px-6 pt-4 pb-2">
                    <button
                      onClick={() => setPreviewTab('preview')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${previewTab === 'preview'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      预览
                    </button>
                    <button
                      onClick={() => setPreviewTab('asset')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${previewTab === 'asset'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      看板
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  {!assetInViewport || previewTab === 'preview' ? (
                    <PreviewArea
                      activeItem={previewItem}
                      config={config}
                      onUpdateConfig={updateConfig}
                      onRendererReady={(r) => { rendererRef.current = r; }}
                      onAnimationsLoaded={handleAnimationsLoaded}
                      attachmentOverrides={assemblyPreviewEnabled ? skinOverrides?.overrides : undefined}
                    />
                  ) : (
                    <AssetPanel
                      activeItem={previewItem}
                      skinValidation={skinValidation}
                      skinFiles={skinFiles}
                      skinMatches={skinMatches}
                      templatePack={templatePack}
                      onApplySmartRename={handleApplySmartRename}
                      onRenameSkinFile={handleRenameSkinFile}
                      onReplaceSkinAttachment={handleReplaceSkinAttachment}
                    />
                  )}
                </div>
              </div>

              {/* Floating Overlay Info */}
              <div className={`absolute bottom-6 right-6 pointer-events-none transition-all duration-500 translate-y-2 group-hover:translate-y-0 z-30 ${(!assetInViewport || previewTab === 'preview') ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}>
                <div className="bg-[#0b0c10]/90 backdrop-blur-2xl px-6 py-4 rounded-3xl border border-white/10 shadow-2xl flex items-center gap-5">
                  <div className="w-1 h-12 bg-indigo-500 rounded-full" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">渲染核心参数</span>
                    <span className="text-[14px] text-white font-mono font-medium">{config.width}x{config.height} <span className="text-white/40 px-1">/</span> {config.fps} 帧/秒</span>
                    <span className="text-[10px] text-white/50 mt-1 uppercase font-bold tracking-tighter">实时渲染管线</span>
                  </div>
                </div>
              </div>
            </EditorPanel>
          </div>

          {showBottom && !assetInViewport && (
            <>
              <PanelDivider vertical onDrag={(dy) => setBottomHeight(prev => Math.max(100, prev - dy))} />

              {/* Bottom Asset Inspector */}
              <div style={{ height: bottomHeight }} className="shrink-0 flex flex-col min-h-0">
                <EditorPanel
                  title="资产看板 / 依赖映射"
                  flex={1}
                  menuItems={[
                    { label: '隐藏底部栏', onClick: () => setShowBottom(false) },
                    { label: '合并到右侧栏', onClick: dockAssetToRight },
                    { label: '重置布局', onClick: resetLayout },
                  ]}
                >
                  <AssetPanel
                    activeItem={previewItem}
                    skinValidation={skinValidation}
                    skinFiles={skinFiles}
                    skinMatches={skinMatches}
                    templatePack={templatePack}
                    onApplySmartRename={handleApplySmartRename}
                    onRenameSkinFile={handleRenameSkinFile}
                    onReplaceSkinAttachment={handleReplaceSkinAttachment}
                  />
            </EditorPanel>
          </div>
            </>
          )}
        </div>

        {showRight && (
          <>
            <PanelDivider onDrag={(dx) => setRightWidth(prev => Math.max(200, prev - dx))} />

            {/* Right Sidebar */}
            <div className="flex flex-col shrink-0 min-h-0" style={{ width: rightWidth }}>
              <EditorPanel
                title={rightTab === 'export'
                  ? '输出属性与参数'
                  : rightTab === 'template'
                    ? '动作模板制作'
                    : rightTab === 'assembly'
                      ? '装配台'
                      : '资产看板'}
                flex={1}
                minWidth={200}
                menuItems={rightPanelMenuItems}
              >
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="px-6 pt-4 pb-3 flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRightTab('export')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'export'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      导出
                    </button>
                    <button
                      onClick={() => setRightTab('template')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'template'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      模板
                    </button>
                    <button
                      onClick={() => setRightTab('assembly')}
                      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'assembly'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                    >
                      装配
                    </button>
                    {!assetInViewport && (
                      <button
                        onClick={() => {
                          if (assetDock !== 'right') dockAssetToRight();
                          else setRightTab('asset');
                        }}
                        className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${rightTab === 'asset'
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white'
                          }`}
                        title={assetDock === 'right' ? '查看资产看板' : '合并资产看板到右侧'}
                      >
                        看板
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col">
                    {rightTab === 'export' ? (
                      <ExportPanel
                        config={config}
                        onUpdate={updateConfig}
                        selectedCount={selectedIds.size}
                        isExporting={isExporting}
                        onStartExport={processExportQueue}
                        onCancelExport={() => abortControllerRef.current?.abort()}
                        totalItems={items.length}
                      />
                    ) : rightTab === 'template' ? (
	                      <ActionTemplatePanel
	                        activeItem={activeItem}
	                        animationNames={activeItem?.animationNames || []}
	                        manifest={config.naming.manifest}
	                        defaults={{
	                          view: config.naming.view,
	                          category: config.naming.defaultCategory,
	                          dir: config.naming.defaultDir,
	                          type: config.naming.defaultType,
	                        }}
	                        disabled={isExporting}
	                        onUpdateManifest={(m) => updateConfig({ naming: { ...config.naming, manifest: m } })}
	                        onSaveToLocal={() => persistConfigNow(config)}
	                      />
                    ) : rightTab === 'assembly' ? (
                      <AssemblyPanel
                        items={items}
                        activeItem={activeItem}
                        templatePack={templatePack}
                        templateAssetId={templateAssetId}
                        templateId={templateId}
                        templateVersion={templateVersion}
                        templateBuildStatus={templateBuildStatus}
                        templateBuildError={templateBuildError}
                        attachmentConflicts={attachmentConflicts}
                        officialTemplates={officialTemplates}
                        officialTemplatesStatus={officialTemplatesStatus}
                        officialTemplatesError={officialTemplatesError}
                        localTemplates={localTemplates}
                        localTemplatesError={localTemplatesError}
                        skinFiles={skinFiles}
                        skinValidation={skinValidation}
                        skinMatches={skinMatches}
                        skinOverrides={skinOverrides}
                        previewEnabled={assemblyPreviewEnabled}
                        onRefreshOfficialTemplates={refreshOfficialTemplates}
                        onRefreshLocalTemplates={refreshLocalTemplates}
                        onLoadOfficialTemplate={handleLoadOfficialTemplate}
                        onLoadLocalTemplate={handleLoadLocalTemplate}
                        onSaveLocalTemplate={handleSaveLocalTemplate}
                        onExportTemplatePack={handleExportTemplatePack}
                        onApplySmartRename={handleApplySmartRename}
                        onAutoCanonicalize={handleAutoCanonicalize}
                        onUpdateCanonicalName={handleUpdateCanonicalName}
                        onExportCanonicalList={handleExportCanonicalList}
                        onApplyCanonicalBatch={handleApplyCanonicalBatch}
                        onTemplateIdChange={setTemplateId}
                        onTemplateVersionChange={setTemplateVersion}
                        onBuildTemplateFromActive={handleBuildTemplateFromActive}
                        onClearTemplate={handleClearTemplate}
                        onUploadSkinFolder={handleUploadSkinFolder}
                        onClearSkin={handleClearSkin}
                        onDownloadValidation={() => {
                          if (skinValidation) {
                            downloadJson(skinValidation, `validation_${skinValidation.skin_id}.json`);
                          }
                        }}
                        onSaveOverrides={() => {
                          if (skinOverrides) {
                            downloadJson(skinOverrides, `skin_overrides_${skinOverrides.skin_id}.json`);
                          }
                        }}
                        onUpdateOverride={updateSkinOverrides}
                        onResetOverride={resetSkinOverride}
                        onCopyMirror={handleCopyMirror}
                        onTogglePreview={handleTogglePreview}
                      />
                    ) : (
                      <AssetPanel
                        activeItem={previewItem}
                        skinValidation={skinValidation}
                        skinFiles={skinFiles}
                        skinMatches={skinMatches}
                        templatePack={templatePack}
                        onApplySmartRename={handleApplySmartRename}
                        onRenameSkinFile={handleRenameSkinFile}
                        onReplaceSkinAttachment={handleReplaceSkinAttachment}
                      />
                    )}
                  </div>
                </div>
              </EditorPanel>
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-10 bg-black/60 backdrop-blur-3xl border-t border-white/10 flex items-center px-8 justify-between shrink-0 z-20">
        <div className="flex items-center gap-6 text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>核心环境就绪</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <span>队列总数: {items.length}</span>
          <span>已选: {selectedIds.size}</span>
        </div>

        <AnimatePresence>
          {isExporting && progress && (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="flex items-center gap-6"
            >
              <span className="text-[10px] font-black text-white/90 uppercase tracking-[0.2em] animate-pulse">正在处理: {progress.currentName}</span>
              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden p-[2px]">
                <motion.div
                  className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-white/60">{progress.current} / {progress.total}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
