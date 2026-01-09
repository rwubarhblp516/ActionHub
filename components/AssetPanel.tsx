import React, { useMemo, useRef, useState } from 'react';
import { AnimationItem, AttachmentManifestEntry, SkinValidationReport, TemplatePack } from '../types';
import { SkinMatch } from '../services/skinValidator';
import { AlertTriangle, FileCode, FileImage, FileText, Folder, CheckCircle, XCircle, FileBox, UploadCloud } from 'lucide-react';

interface AssetPanelProps {
    activeItem: AnimationItem | null;
    skinValidation?: SkinValidationReport | null;
    skinFiles?: File[];
    skinMatches?: SkinMatch[];
    templatePack?: TemplatePack | null;
    onApplySmartRename?: () => void;
    onRenameSkinFile?: (oldName: string, nextName: string) => void;
    onReplaceSkinAttachment?: (params: { slot: string; attachment: string; file: File }) => void;
}

export const AssetPanel: React.FC<AssetPanelProps> = ({
    activeItem,
    skinValidation,
    skinFiles = [],
    skinMatches = [],
    templatePack,
    onApplySmartRename,
    onRenameSkinFile,
    onReplaceSkinAttachment
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingKey, setPendingKey] = useState<string>('');
    const [searchText, setSearchText] = useState<string>('');
    const [editingFile, setEditingFile] = useState<string>('');
    const [draftName, setDraftName] = useState<string>('');

    const searchKey = searchText.trim().toLowerCase();
    const matchSearch = (name: string) => {
        if (!searchKey) return true;
        return name.toLowerCase().includes(searchKey);
    };

    const getBaseName = (name: string) => {
        const idx = name.lastIndexOf('.');
        return idx > 0 ? name.slice(0, idx) : name;
    };
    const getExt = (name: string) => {
        const idx = name.lastIndexOf('.');
        return idx > 0 ? name.slice(idx + 1) : '';
    };

    const matchedKeySet = useMemo(() => new Set(skinMatches.map(match => match.key)), [skinMatches]);
    const matchedFileSet = useMemo(() => new Set(skinMatches.map(match => match.file.name)), [skinMatches]);
    const matchByFile = useMemo(() => {
        const map = new Map<string, SkinMatch>();
        skinMatches.forEach(match => map.set(match.file.name, match));
        return map;
    }, [skinMatches]);

    const canonicalIssues = useMemo(() => {
        const duplicateSet = new Set<string>();
        const missingSet = new Set<string>();
        if (!templatePack) return { duplicateSet, missingSet };
        const counts = new Map<string, number>();
        templatePack.attachment_manifest.entries.forEach((entry) => {
            const canonical = (entry.canonical_name || '').trim();
            const key = `${entry.slot_name}::${entry.attachment_name}`;
            if (!canonical) {
                missingSet.add(key);
                return;
            }
            counts.set(canonical, (counts.get(canonical) || 0) + 1);
        });
        counts.forEach((count, name) => {
            if (count > 1) duplicateSet.add(name);
        });
        return { duplicateSet, missingSet };
    }, [templatePack]);

    const getExpectedBase = (entry: SkinMatch['entry']) => {
        const canonical = (entry.canonical_name || entry.attachment_name).trim();
        if (!canonical) return entry.attachment_name;
        if (canonicalIssues.duplicateSet.has(canonical)) {
            return `${entry.slot_name}__${canonical}`;
        }
        return canonical;
    };

    const getEntryStatus = (entry: SkinMatch['entry']) => {
        const canonical = (entry.canonical_name || '').trim();
        const key = `${entry.slot_name}::${entry.attachment_name}`;
        if (!canonical || canonicalIssues.missingSet.has(key) || canonicalIssues.duplicateSet.has(canonical)) {
            return 'manual';
        }
        if (canonical !== entry.attachment_name) return 'normalized';
        return 'original';
    };

    const matchSearchAny = (...values: Array<string | undefined>) => {
        if (!searchKey) return true;
        return values.some(value => (value || '').toLowerCase().includes(searchKey));
    };
    const missingEntries = useMemo(() => {
        if (!templatePack) return [];
        return templatePack.attachment_manifest.entries.filter(entry => {
            const key = `${entry.slot_name}::${entry.attachment_name}`;
            return !matchedKeySet.has(key);
        });
    }, [matchedKeySet, templatePack]);

    const issueSets = useMemo(() => {
        const noAlpha = new Set(skinValidation?.no_alpha || []);
        const sizeOutliers = new Set(skinValidation?.size_outliers || []);
        const empty = new Set(skinValidation?.empty_or_near_empty || []);
        return { noAlpha, sizeOutliers, empty };
    }, [skinValidation]);

    const isIssueMatch = (match: SkinMatch, set: Set<string>) => {
        const canonical = match.entry.canonical_name || match.attachmentName;
        return set.has(match.attachmentName) || set.has(canonical);
    };

    const issueMatches = useMemo(() => {
        return skinMatches.filter(match =>
            isIssueMatch(match, issueSets.noAlpha) ||
            isIssueMatch(match, issueSets.sizeOutliers) ||
            isIssueMatch(match, issueSets.empty)
        );
    }, [issueSets, skinMatches]);

    const handlePickReplace = (key: string) => {
        if (!onReplaceSkinAttachment) return;
        setPendingKey(key);
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!onReplaceSkinAttachment || !pendingKey) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const [slot, attachment] = pendingKey.split('::');
        if (!slot || !attachment) return;
        onReplaceSkinAttachment({ slot, attachment, file });
        e.currentTarget.value = '';
        setPendingKey('');
    };

    const handleStartRename = (fileName: string) => {
        if (!onRenameSkinFile) return;
        setEditingFile(fileName);
        setDraftName(getBaseName(fileName));
    };

    const handleCommitRename = () => {
        if (!onRenameSkinFile || !editingFile) return;
        const next = draftName.trim();
        if (!next) {
            setEditingFile('');
            setDraftName('');
            return;
        }
        onRenameSkinFile(editingFile, next);
        setEditingFile('');
        setDraftName('');
    };
    const files = activeItem?.files;
    const images = files?.images || [];
    const candidateMap = useMemo(() => {
        if (!templatePack) return null;
        const map = new Map<string, AttachmentManifestEntry[]>();
        templatePack.attachment_manifest.entries.forEach((entry) => {
            const canonical = (entry.canonical_name || entry.attachment_name || '').trim();
            const candidates = new Set<string>();
            if (entry.attachment_name) candidates.add(entry.attachment_name);
            if (canonical) candidates.add(canonical);
            if (canonical) candidates.add(`${entry.slot_name}__${canonical}`);
            if (entry.attachment_name) candidates.add(`${entry.slot_name}__${entry.attachment_name}`);
            candidates.forEach((name) => {
                const list = map.get(name) || [];
                list.push(entry);
                map.set(name, list);
            });
        });
        return map;
    }, [templatePack]);

    const imageEntries = useMemo(() => {
        return images
            .filter(img => !['001.png', 'A1a.png'].includes(img.name))
            .map((img) => {
                const base = getBaseName(img.name);
                const candidates = candidateMap?.get(base) || [];
                const entry = candidates.length === 1 ? candidates[0] : undefined;
                const ambiguous = candidates.length > 1;
                const displayName = entry ? getExpectedBase(entry) : base;
                const status = (!entry || ambiguous) ? 'manual' : getEntryStatus(entry);
                return { img, entry, displayName, status, ambiguous };
            });
    }, [candidateMap, images, getEntryStatus, getExpectedBase]);

    const filteredImages = imageEntries.filter((item) => {
        const entry = item.entry;
        return matchSearchAny(
            item.img.name,
            item.displayName,
            entry?.attachment_name,
            entry?.canonical_name,
            entry?.slot_name
        );
    });
    const totalImages = images.filter(img => !['001.png', 'A1a.png'].includes(img.name)).length;

    if (!activeItem || !files) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 text-white/30 gap-6">
                <div className="w-20 h-20 rounded-[40px] bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-inner backdrop-blur-md">
                    <FileBox size={40} strokeWidth={1} className="text-white/20" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <p className="text-[12px] font-black uppercase tracking-[0.3em] text-white/40">空资产链</p>
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">请从左侧管线选取动画以加载依赖</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
            {/* Asset Header */}
            <div className="shrink-0 px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center gap-4 overflow-hidden">
                    <div className="p-2.5 rounded-2xl bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                        <Folder size={18} className="text-white" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[15px] font-black truncate text-white tracking-tight">{activeItem.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">运行时版本协议</span>
                            <div className="w-1 h-1 rounded-full bg-indigo-500/50" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">版本 3.8（专业）</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">资产已验证</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-12 custom-scrollbar relative min-h-0">
                {onReplaceSkinAttachment && (
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,image/png"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                )}
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <input
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="搜索文件/附件名"
                        />
                    </div>
                    <div className="text-[9px] text-white/40 font-bold uppercase tracking-widest">
                        {searchKey ? '筛选中' : '全部'}
                    </div>
                </div>
                {skinValidation && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 rounded-full bg-amber-400" />
                                <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">问题诊断</h3>
                            </div>
                            <button
                                onClick={onApplySmartRename}
                                disabled={!onApplySmartRename || skinValidation.name_mismatch_suggestions.length === 0}
                                className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-200 uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                智能重命名
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-[10px] font-black text-white/70">
                            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                                错误: <span className="text-red-300">{skinValidation.errors.length}</span>
                            </div>
                            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                                警告: <span className="text-amber-300">{skinValidation.warnings.length}</span>
                            </div>
                            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                                覆盖率: <span className="text-emerald-300">{skinValidation.coverage_score}%</span>
                            </div>
                        </div>

                        {skinValidation.name_mismatch_suggestions.length > 0 && (
                            <div className="p-4 rounded-[24px] bg-amber-500/10 border border-amber-500/20 space-y-2">
                                <div className="flex items-center gap-2 text-[10px] font-black text-amber-100 uppercase tracking-widest">
                                    <AlertTriangle size={12} />
                                    命名建议
                                </div>
                                {skinValidation.name_mismatch_suggestions.slice(0, 5).map((suggestion) => (
                                    <div key={`${suggestion.input}-${suggestion.suggestion}`} className="text-[10px] text-amber-200 font-mono">
                                        {suggestion.input} → {suggestion.suggestion}
                                    </div>
                                ))}
                                {skinValidation.name_mismatch_suggestions.length > 5 && (
                                    <div className="text-[9px] text-amber-200/70">
                                        … 还有 {skinValidation.name_mismatch_suggestions.length - 5} 条建议
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {skinValidation && onReplaceSkinAttachment && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 px-1">
                            <div className="w-1 h-3 rounded-full bg-indigo-500" />
                            <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">附件修复</h3>
                        </div>

                        {missingEntries.length > 0 && (
                            <div className="p-4 rounded-[24px] bg-white/[0.03] border border-white/10 space-y-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-white/70">缺失附件</div>
                                {missingEntries
                                    .filter(entry => matchSearch(entry.canonical_name || entry.attachment_name))
                                    .slice(0, 6)
                                    .map((entry) => {
                                    const key = `${entry.slot_name}::${entry.attachment_name}`;
                                    const displayName = entry.canonical_name || entry.attachment_name;
                                    return (
                                        <div key={key} className="flex items-center justify-between text-[10px] text-white/70">
                                            <div className="flex flex-col">
                                                <span className="font-black text-white">{displayName}</span>
                                                <span className="text-white/40 font-mono">{entry.slot_name}</span>
                                            </div>
                                            <button
                                                onClick={() => handlePickReplace(key)}
                                                className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1"
                                            >
                                                <UploadCloud size={12} />
                                                上传补齐
                                            </button>
                                        </div>
                                    );
                                })}
                                {missingEntries.length > 6 && (
                                    <div className="text-[9px] text-white/40">… 还有 {missingEntries.length - 6} 个缺失附件</div>
                                )}
                            </div>
                        )}

                        {issueMatches.length > 0 && (
                            <div className="p-4 rounded-[24px] bg-white/[0.03] border border-white/10 space-y-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-white/70">问题附件</div>
                                {issueMatches
                                    .filter(match => matchSearch(match.entry.canonical_name || match.attachmentName))
                                    .slice(0, 6)
                                    .map((match) => {
                                    const key = `${match.slotName}::${match.attachmentName}`;
                                    const displayName = getExpectedBase(match.entry);
                                    const tags: string[] = [];
                                    if (isIssueMatch(match, issueSets.noAlpha)) tags.push('无透明通道');
                                    if (isIssueMatch(match, issueSets.sizeOutliers)) tags.push('尺寸异常');
                                    if (isIssueMatch(match, issueSets.empty)) tags.push('接近全透明');
                                    return (
                                        <div key={key} className="flex items-center justify-between text-[10px] text-white/70">
                                            <div className="flex flex-col">
                                                <span className="font-black text-white">{displayName}</span>
                                                <span className="text-white/40 font-mono">{match.slotName}</span>
                                                <span className="text-[9px] text-amber-200/80">{tags.join(' / ')}</span>
                                            </div>
                                            <button
                                                onClick={() => handlePickReplace(key)}
                                                className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black uppercase tracking-widest text-amber-100 hover:bg-amber-500/20 transition-all flex items-center gap-1"
                                            >
                                                <UploadCloud size={12} />
                                                替换
                                            </button>
                                        </div>
                                    );
                                })}
                                {issueMatches.length > 6 && (
                                    <div className="text-[9px] text-white/40">… 还有 {issueMatches.length - 6} 个问题附件</div>
                                )}
                            </div>
                        )}

                        {missingEntries.length === 0 && issueMatches.length === 0 && (
                            <div className="text-[10px] text-white/30 font-bold">未发现需要修复的附件。</div>
                        )}
                    </section>
                )}

                {skinFiles.length > 0 && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 rounded-full bg-emerald-500" />
                                <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">皮肤文件</h3>
                            </div>
                            <div className="text-[9px] text-white/40 font-mono uppercase">
                                {skinFiles.length} 个文件
                            </div>
                        </div>
                        <div className="space-y-2">
                            {skinFiles.filter(file => {
                                const match = matchByFile.get(file.name);
                                const display = match ? getExpectedBase(match.entry) : file.name;
                                return matchSearchAny(file.name, display, match?.attachmentName, match?.entry.canonical_name);
                            }).map((file) => {
                                const match = matchByFile.get(file.name);
                                const isMatched = matchedFileSet.has(file.name);
                                const ext = getExt(file.name) || 'png';
                                const displayName = match ? getExpectedBase(match.entry) : file.name;
                                const status = match ? getEntryStatus(match.entry) : 'manual';
                                const statusClass = status === 'manual'
                                    ? 'border-red-500/30 bg-red-500/10'
                                    : (status === 'normalized' ? 'border-amber-400/30 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]');
                                return (
                                    <div key={file.name} className={`flex items-center justify-between p-3 rounded-2xl border ${statusClass}`}>
                                        <div className="flex flex-col min-w-0">
                                            {editingFile === file.name ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={draftName}
                                                        onChange={(e) => setDraftName(e.target.value)}
                                                        onBlur={handleCommitRename}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleCommitRename();
                                                            if (e.key === 'Escape') {
                                                                setEditingFile('');
                                                                setDraftName('');
                                                            }
                                                        }}
                                                        className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-[11px] text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                                        autoFocus
                                                    />
                                                    <span className="text-[10px] text-white/40 font-mono">.{ext}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-[11px] font-black truncate text-white">{displayName}</span>
                                                    <span className="text-[9px] text-white/40 font-mono truncate">原始: {file.name}</span>
                                                </>
                                            )}
                                            <span className="text-[9px] text-white/40 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {status === 'manual' && (
                                                <span className="text-[9px] text-red-300 font-black uppercase tracking-widest">需手动</span>
                                            )}
                                            {status === 'normalized' && (
                                                <span className="text-[9px] text-amber-300 font-black uppercase tracking-widest">已规范</span>
                                            )}
                                            {status === 'original' && (
                                                <span className="text-[9px] text-white/50 font-black uppercase tracking-widest">原始</span>
                                            )}
                                            {isMatched ? (
                                                <span className="text-[9px] text-emerald-300 font-black uppercase tracking-widest">已匹配</span>
                                            ) : (
                                                <span className="text-[9px] text-amber-300 font-black uppercase tracking-widest">待匹配</span>
                                            )}
                                            {onRenameSkinFile && (
                                                <button
                                                    onClick={() => handleStartRename(file.name)}
                                                    className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all"
                                                >
                                                    重命名
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {skinMatches.length > 0 && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 rounded-full bg-indigo-500" />
                                <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">皮肤贴图预览</h3>
                            </div>
                            <div className="text-[9px] text-white/40 font-mono uppercase">
                                {skinMatches.length} 个附件
                            </div>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            {skinMatches
                                .filter(match => matchSearchAny(match.entry.canonical_name || match.attachmentName, match.attachmentName, match.slotName))
                                .map((match) => {
                                    const displayName = getExpectedBase(match.entry);
                                    const status = getEntryStatus(match.entry);
                                    const statusClass = status === 'manual'
                                        ? 'border-red-500/30 bg-red-500/10'
                                        : (status === 'normalized' ? 'border-amber-400/30 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]');
                                    return (
                                        <div key={match.key} className={`flex flex-col gap-3 p-4 rounded-[28px] border ${statusClass} transition-all relative overflow-hidden shadow-xl`}>
                                            <div className="aspect-square rounded-[20px] bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 shadow-inner relative z-10">
                                                <img
                                                    src={URL.createObjectURL(match.file)}
                                                    alt={displayName}
                                                    className="max-w-[80%] max-h-[80%] object-contain drop-shadow-2xl"
                                                    onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <div className="flex flex-col gap-1 relative z-10">
                                                <div className="text-[11px] font-black truncate text-white/80">{displayName}</div>
                                                <div className="text-[9px] font-mono font-bold text-white/30 truncate">原始: {match.file.name}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </section>
                )}
                {/* Core Files */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 px-1">
                        <div className="w-1 h-3 rounded-full bg-indigo-500" />
                        <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">核心工程文件</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-[24px] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all group shadow-lg">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                    <FileCode size={20} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[12px] font-black truncate text-white group-hover:text-white transition-colors">骨架文件</span>
                                    <span className="text-[10px] text-white/30 font-mono truncate mt-0.5">{files.skeleton?.name || '缺少骨架文件'}</span>
                                </div>
                            </div>
                            {files.skeleton
                                ? <CheckCircle size={16} className="text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]" strokeWidth={3} />
                                : <XCircle size={16} className="text-red-400" />
                            }
                        </div>

                        <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-[24px] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all group shadow-lg">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                                    <FileText size={20} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[12px] font-black truncate text-white group-hover:text-white transition-colors">图集文件</span>
                                    <span className="text-[10px] text-white/30 font-mono truncate mt-0.5">{files.atlas?.name || '缺少图集文件'}</span>
                                </div>
                            </div>
                            {files.atlas
                                ? <CheckCircle size={16} className="text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]" strokeWidth={3} />
                                : <XCircle size={16} className="text-red-400" />
                            }
                        </div>
                    </div>
                </section>

                {/* Textures Gallery */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-3">
                            <div className="w-1 h-3 rounded-full bg-indigo-500" />
                            <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">贴图图层</h3>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white/50">原始</span>
                            <span className="text-amber-300">已规范</span>
                            <span className="text-red-300">需手动</span>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            <span className="text-[10px] font-mono text-white/40 font-black uppercase">
                                {filteredImages.length}/{totalImages} 个贴图图层
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {filteredImages.map((item, idx) => {
                                const cardClass = item.status === 'manual'
                                    ? 'border-red-500/30 bg-red-500/10'
                                    : (item.status === 'normalized' ? 'border-amber-400/30 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]');
                                    const imgBlob = item.img instanceof Blob ? item.img : null;
                                    const imgUrl = imgBlob ? URL.createObjectURL(imgBlob) : '';
                                    return (
                                <div key={idx} className={`flex flex-col gap-3 p-4 rounded-[28px] border hover:border-white/20 transition-all group relative overflow-hidden shadow-xl ${cardClass}`}>
                                    <div className="aspect-square rounded-[20px] bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 shadow-inner relative z-10 group-hover:bg-black/20 transition-colors">
                                        {imgUrl ? (
                                            <img
                                                src={imgUrl}
                                                alt={item.displayName}
                                                className="max-w-[75%] max-h-[75%] object-contain group-hover:scale-125 transition-transform duration-700 ease-out drop-shadow-2xl"
                                                onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                                            />
                                        ) : (
                                            <div className="text-[10px] text-white/40 font-bold">无预览</div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="flex flex-col gap-1 relative z-10">
                                        <div className="text-[11px] font-black truncate text-white/90 group-hover:text-white transition-colors">{item.displayName}</div>
                                        <div className="text-[9px] font-mono font-bold text-white/30 truncate">原始: {item.img.name}</div>
                                        <div className="text-[9px] font-mono font-bold text-white/20 group-hover:text-indigo-400 transition-colors">{(item.img.size / 1024).toFixed(1)} 千字节</div>
                                    </div>
                                    {/* Decorative background element */}
                                    <div className="absolute -right-3 -bottom-3 text-white/[0.03] rotate-12 group-hover:text-white/[0.08] transition-all">
                                        <FileImage size={48} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>


        </div>
    );
};
