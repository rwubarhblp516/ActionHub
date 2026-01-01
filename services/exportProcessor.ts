/**
 * 导出处理逻辑 - 使用离屏渲染器
 */

import { AnimationItem, ExportConfig } from '../types';
import { SpineRenderer } from './spineRenderer';
import { CanvasRecorder } from './recorder';
import { ExportManager, OffscreenRenderTask } from './offscreenRenderer';

export interface ExportCallbacks {
    onProgress: (current: number, total: number, currentName: string) => void;
    onItemStatusChange: (itemId: string, status: 'waiting' | 'exporting' | 'completed' | 'failed') => void;
}

export async function processExportWithOffscreen(
    selectedItems: AnimationItem[],
    config: ExportConfig,
    callbacks: ExportCallbacks,
    abortSignal?: AbortSignal
): Promise<number> {
    const { onProgress, onItemStatusChange } = callbacks;

    // 创建导出管理器
    const exportManager = new ExportManager();

    // 标记所有选中项为等待状态
    selectedItems.forEach(item => onItemStatusChange(item.id, 'waiting'));

    try {
        // 第一步: 扫描所有任务
        console.log('[导出] 正在扫描资产和动画...');
        const tasks: Array<{ item: AnimationItem; animation: string; task: OffscreenRenderTask }> = [];

        // 使用临时渲染器快速扫描动画列表
        const tempCanvas = document.createElement('canvas');
        const tempRenderer = new SpineRenderer(tempCanvas);

        for (const item of selectedItems) {
            if (abortSignal?.aborted) break;

            try {
                const animations = await tempRenderer.load(item.files);
                console.log(`[导出] 资产 "${item.name}" 包含 ${animations.length} 个动画:`, animations);

                for (const anim of animations) {
                    tasks.push({
                        item,
                        animation: anim,
                        task: {
                            assetName: item.name,
                            animation: anim,
                            files: item.files,
                            width: config.width,
                            height: config.height,
                            fps: config.fps,
                            format: config.format,
                            duration: config.duration,
                            backgroundColor: config.backgroundColor
                        }
                    });
                }
            } catch (error) {
                console.error(`[导出] 扫描资产 "${item.name}" 失败:`, error);
                onItemStatusChange(item.id, 'failed');
            }
        }

        tempRenderer.dispose();

        const totalTasks = tasks.length;
        console.log(`[导出] 共扫描到 ${totalTasks} 个导出任务,准备并行处理...`);
        onProgress(0, totalTasks, '准备导出...');

        // 第二步: 并行处理所有任务
        let completed = 0;
        const exportPromises = tasks.map(async ({ item, animation, task }, index) => {
            if (abortSignal?.aborted) return;

            try {
                const taskName = `${item.name} - ${animation}`;
                onProgress(completed + 1, totalTasks, taskName);
                onItemStatusChange(item.id, 'exporting');

                console.log(`[导出] [${index + 1}/${totalTasks}] 开始: ${taskName}`);

                // 使用离屏渲染器导出
                const blob = await exportManager.exportTask(task);

                if (abortSignal?.aborted) return;

                // 下载文件
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                let ext: string;
                let filename: string;

                if (config.format === 'png-sequence' || config.format === 'jpg-sequence') {
                    ext = 'zip';
                    filename = `${item.name}_${animation}_${timestamp}.${ext}`;
                } else if (config.format === 'mp4-h264') {
                    ext = 'mp4';
                    filename = `${item.name}_${animation}_${timestamp}.${ext}`;
                } else {
                    ext = config.format.startsWith('webm') ? 'webm' : 'mp4';
                    filename = `${item.name}_${animation}_${timestamp}.${ext}`;
                }

                CanvasRecorder.download(blob, filename);

                completed++;
                onProgress(completed, totalTasks, taskName);

                console.log(`[导出] ✓ [${completed}/${totalTasks}] 完成: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
            } catch (error) {
                console.error(`[导出] 失败: ${item.name} - ${animation}`, error);
                onItemStatusChange(item.id, 'failed');
            }
        });

        // 等待所有导出完成
        await Promise.all(exportPromises);

        if (!abortSignal?.aborted) {
            selectedItems.forEach(item => onItemStatusChange(item.id, 'completed'));
            console.log(`[导出] ✓ 全部完成! 共导出 ${completed}/${totalTasks} 个动画`);
        }

        return completed;
    } catch (error) {
        console.error("[导出] 失败:", error);
        selectedItems.forEach(item => onItemStatusChange(item.id, 'failed'));
        throw error;
    }
}
