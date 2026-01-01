import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MoreVertical } from 'lucide-react';

interface PanelProps {
    title: string;
    children: ReactNode;
    width?: number | string;
    height?: number | string;
    flex?: number;
    minWidth?: number;
    className?: string;
}

export const EditorPanel: React.FC<PanelProps> = ({
    title,
    children,
    width,
    height,
    flex,
    minWidth = 200,
    className = ""
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex flex-col bg-white/[0.02] backdrop-blur-[40px] border border-white/10 overflow-hidden rounded-[24px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] m-1.5 glass-morphism relative border-t-white/20 ${className}`}
            style={{
                width: width,
                height: height,
                flex: flex,
                minWidth: minWidth,
                display: 'flex'
            }}
        >
            {/* Inner Glow Border (Apple high-end trick) */}
            <div className="absolute inset-0 pointer-events-none rounded-[24px] border border-white/[0.05] z-0" />
            <div className="absolute inset-x-0 top-0 h-[100px] bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-0" />

            {/* Header */}
            <div className="h-14 bg-white/[0.08] border-b border-white/10 flex items-center justify-between px-6 shrink-0 select-none relative z-20 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-1.5 h-4 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)]" />
                    <span className="text-[11px] font-black text-white uppercase tracking-[0.3em] opacity-90">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="text-white/40 hover:text-white transition-all p-2 hover:bg-white/10 rounded-xl active:scale-90 group">
                        <MoreVertical size={16} className="group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={`flex-1 flex flex-col min-h-0 relative z-10 p-1 ${className}`}>
                {children}
            </div>
        </motion.div>
    );
};

// Resizable Divider
interface DividerProps {
    onDrag: (deltaX: number) => void;
    vertical?: boolean;
}

export const PanelDivider: React.FC<DividerProps> = ({ onDrag, vertical = false }) => {
    return (
        <div
            onMouseDown={(e) => {
                let lastPos = vertical ? e.clientY : e.clientX;
                const onMouseMove = (moveEvent: MouseEvent) => {
                    const currentPos = vertical ? moveEvent.clientY : moveEvent.clientX;
                    const delta = currentPos - lastPos;
                    onDrag(delta);
                    lastPos = currentPos;
                };
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            }}
            className={`
                ${vertical ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize'} 
                bg-[#13151a] hover:bg-[#478cbf]/30 transition-colors shrink-0 flex items-center justify-center
            `}
        >
            <div className={`${vertical ? 'w-12 h-1' : 'w-1 h-12'} bg-white/20 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.1)]`} />
        </div>
    );
};
