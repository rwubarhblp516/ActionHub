
import React from 'react';
import { SpineRenderer } from '../services/spineRenderer';

interface ProgressBarProps {
    renderer: SpineRenderer | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ renderer }) => {
    const [progress, setProgress] = React.useState(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const reqRef = React.useRef<number>();
    const barRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const update = () => {
            if (renderer && renderer.totalTime > 0 && !isDragging) {
                const p = (renderer.currentTime / renderer.totalTime) * 100;
                setProgress(Math.max(0, Math.min(100, p)));
            }
            reqRef.current = requestAnimationFrame(update);
        };
        reqRef.current = requestAnimationFrame(update);
        return () => {
            if (reqRef.current) cancelAnimationFrame(reqRef.current);
        };
    }, [renderer, isDragging]);

    const handleInteraction = (clientX: number) => {
        if (!renderer || !barRef.current || renderer.totalTime <= 0) return;
        const rect = barRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.min(Math.max(x / rect.width, 0), 1);

        renderer.seek(percent * renderer.totalTime);
        setProgress(percent * 100);
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleInteraction(e.clientX);

        const handleMouseMove = (mv: MouseEvent) => {
            handleInteraction(mv.clientX);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            ref={barRef}
            className="w-64 h-1.5 bg-white/20 rounded-full cursor-pointer hover:bg-white/30 transition-all relative group"
            onMouseDown={handleMouseDown}
        >
            {/* Hit Area */}
            <div className="absolute -inset-y-2 inset-x-0 cursor-pointer" />

            <div
                className="h-full bg-indigo-500 rounded-full relative"
                style={{ width: `${progress}%` }}
            >
                {/* Handle */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform" />
            </div>

            {/* Time Tooltip (Optional, maybe later) */}
        </div>
    );
};
