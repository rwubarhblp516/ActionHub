import React, { ReactNode } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { Minimize2, Maximize2 } from 'lucide-react';

interface WindowProps {
    id: string;
    title: string;
    children: ReactNode;
    initialPos: { x: number; y: number };
    size: { width: string | number; height: string | number };
    zIndex: number;
    onFocus: () => void;
    isVisible: boolean;
}

export const FloatingWindow: React.FC<WindowProps> = ({
    title,
    initialPos,
    size,
    zIndex,
    onFocus,
    isVisible,
    children
}) => {
    const dragControls = useDragControls();

    if (!isVisible) return null;

    return (
        <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            initial={{ x: initialPos.x, y: initialPos.y, scale: 0.95, opacity: 0 }}
            animate={{ x: initialPos.x, y: initialPos.y, scale: 1, opacity: 1 }}
            style={{
                position: 'absolute',
                zIndex,
                width: size.width,
                height: size.height,
            }}
            onPointerDown={onFocus}
            className="flex flex-col bg-gray-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden glass-morphism ring-1 ring-white/5"
        >
            {/* Header / Drag Handle */}
            <div
                className="h-12 bg-white/5 border-b border-white/5 flex items-center px-4 justify-between cursor-grab active:cursor-grabbing select-none shrink-0"
                onPointerDown={(e) => dragControls.start(e)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{title}</span>
                </div>

                <div className="flex items-center gap-1">
                    <div className="w-px h-4 bg-white/10 mx-2" />
                    <button className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-500 hover:text-white">
                        <Minimize2 size={14} />
                    </button>
                    <button className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-500 hover:text-white">
                        <Maximize2 size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {children}
            </div>
        </motion.div>
    );
};
