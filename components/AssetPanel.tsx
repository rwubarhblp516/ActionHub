import React from 'react';
import { AnimationItem } from '../types';
import { FileCode, FileImage, FileText, Folder, CheckCircle, XCircle, FileBox } from 'lucide-react';

interface AssetPanelProps {
    activeItem: AnimationItem | null;
}

export const AssetPanel: React.FC<AssetPanelProps> = ({ activeItem }) => {
    if (!activeItem) {
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

    const { files } = activeItem;

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-transparent overflow-hidden">
            {/* Asset Header */}
            <div className="shrink-0 px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center gap-4 overflow-hidden">
                    <div className="p-2.5 rounded-2xl bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                        <Folder size={18} className="text-white" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[15px] font-black truncate text-white tracking-tight">{activeItem.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Runtime Version Protocol</span>
                            <div className="w-1 h-1 rounded-full bg-indigo-500/50" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">v3.8 Elite</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Verified Assets</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-12 custom-scrollbar relative min-h-0">
                {/* Core Pipeline Files */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 px-1">
                        <div className="w-1 h-3 rounded-full bg-indigo-500" />
                        <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">核心工程模型 (Pipeline)</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-[24px] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all group shadow-lg">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                    <FileCode size={20} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[12px] font-black truncate text-white group-hover:text-white transition-colors">Skeleton Map</span>
                                    <span className="text-[10px] text-white/30 font-mono truncate mt-0.5">{files.skeleton?.name || 'Missing Protocol'}</span>
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
                                    <span className="text-[12px] font-black truncate text-white group-hover:text-white transition-colors">Atlas Mapping</span>
                                    <span className="text-[10px] text-white/30 font-mono truncate mt-0.5">{files.atlas?.name || 'Missing Definition'}</span>
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
                            <h3 className="text-[10px] text-white/60 uppercase font-black tracking-[0.25em]">贴图图层 (Textures Canvas)</h3>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            <span className="text-[10px] font-mono text-white/40 font-black uppercase">
                                {files.images.filter(img => !['001.png', 'A1a.png'].includes(img.name)).length} Physical Layers
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {files.images
                            .filter(img => !['001.png', 'A1a.png'].includes(img.name))
                            .map((img, idx) => (
                                <div key={idx} className="flex flex-col gap-3 p-4 bg-white/[0.03] rounded-[28px] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all group relative overflow-hidden shadow-xl">
                                    <div className="aspect-square rounded-[20px] bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 shadow-inner relative z-10 group-hover:bg-black/20 transition-colors">
                                        <img
                                            src={URL.createObjectURL(img)}
                                            alt={img.name}
                                            className="max-w-[75%] max-h-[75%] object-contain group-hover:scale-125 transition-transform duration-700 ease-out drop-shadow-2xl"
                                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="flex flex-col gap-1 relative z-10">
                                        <div className="text-[11px] font-black truncate text-white/80 group-hover:text-white transition-colors">{img.name}</div>
                                        <div className="text-[9px] font-mono font-bold text-white/20 group-hover:text-indigo-400 transition-colors">{(img.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                    {/* Decorative background element */}
                                    <div className="absolute -right-3 -bottom-3 text-white/[0.03] rotate-12 group-hover:text-white/[0.08] transition-all">
                                        <FileImage size={48} />
                                    </div>
                                </div>
                            ))}
                    </div>
                </section>
            </div>


        </div>
    );
};
