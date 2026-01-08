/**
 * 导出处理逻辑 - 使用离屏渲染器
 */

import JSZip from 'jszip';
import { AnimationItem, ExportConfig } from '../types';
import { SpineRenderer } from './spineRenderer';
import { CanvasRecorder } from './recorder';
import { ExportManager, OffscreenRenderResult, OffscreenRenderTask } from './offscreenRenderer';
import { buildDerivedPaths, guessDeliveryFromFormat, inferActionSpec } from './actionHubNaming';

export interface ExportCallbacks {
    onProgress: (current: number, total: number, currentName: string) => void;
    onItemStatusChange: (itemId: string, status: 'waiting' | 'exporting' | 'completed' | 'failed') => void;
}

const buildDerivedMetadata = (params: {
    canonicalName: string;
    view: string;
    assetId: string;
    fps: number;
    frames: number;
    type: 'loop' | 'once';
    dir: string;
}) => {
    const { canonicalName, view, assetId, fps, frames, type, dir } = params;
    return {
        version: '1.0',
        name: canonicalName,
        master: {
            standard_skeleton: 'UE_Manny',
            asset_id: assetId
        },
        timing: {
            fps,
            frames,
            type,
            loop: type === 'loop',
            root_motion: 'n/a'
        },
        directions: {
            dir_set: dir
        },
        views: {
            [view]: {
                direction_set: dir
            }
        },
        tags: [],
        events: []
    };
};

const guessVideoExt = (blob: Blob) => {
    const t = (blob.type || '').toLowerCase();
    if (t.includes('webm')) return 'webm';
    return 'mp4';
};

const addFramesToZip = (params: {
    zip: JSZip;
    dirPath: string;
    imageExt: 'png' | 'jpg';
    frames: Blob[];
}) => {
    const { zip, dirPath, imageExt, frames } = params;
    const pad = Math.max(4, String(Math.max(0, frames.length - 1)).length);
    frames.forEach((blob, index) => {
        const name = String(index).padStart(pad, '0');
        zip.file(`${dirPath}/${name}.${imageExt}`, blob);
    });
};

export async function processExportWithOffscreen(
    selectedItems: AnimationItem[],
    config: ExportConfig,
    callbacks: ExportCallbacks,
    abortSignal?: AbortSignal
): Promise<number> {
    const { onProgress, onItemStatusChange } = callbacks;

    // 创建导出管理器
    const exportManager = new ExportManager();
    const zip = new JSZip();

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
                            backgroundColor: config.backgroundColor,
                            abortSignal: abortSignal
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
        if (totalTasks === 0) return 0;

        console.log(`[导出] 共扫描到 ${totalTasks} 个导出任务,准备并行处理...`);
        onProgress(0, totalTasks, '准备导出...');

        // 第二步: 处理所有任务
        let completed = 0;
        const exportIndex: any[] = [];

        // 我们使用一个简单的 promise 队列来控制并发, exportManager 内部已经有了 maxConcurrent
        const exportPromises = tasks.map(async ({ item, animation, task }, index) => {
            if (abortSignal?.aborted) return;

            try {
                const taskName = `${item.name} - ${animation}`;
                onProgress(completed + 1, totalTasks, taskName);
                onItemStatusChange(item.id, 'exporting');

                console.log(`[导出] [${index + 1}/${totalTasks}] 开始渲染: ${taskName}`);

                // 使用离屏渲染器导出
                const result: OffscreenRenderResult = await exportManager.exportTask(task);

                if (abortSignal?.aborted) return;

                if (config.naming?.enabled) {
                    const delivery = guessDeliveryFromFormat(config.format);
                    const spec = inferActionSpec({
                        assetName: item.name,
                        assetKey: item.files.basePath || item.name,
                        animationName: animation,
                        naming: config.naming
                    });

                    const derived = buildDerivedPaths({
                        spec,
                        delivery,
                        fps: config.fps,
                        frames: result.totalFrames,
                        outputExt: result.output.kind === 'video' ? guessVideoExt(result.output.blob) : undefined,
                        framesExt: result.output.kind === 'frames' ? result.output.imageExt : undefined
                    });

                    if (result.output.kind === 'video' && derived.outputFilePath) {
                        zip.file(derived.outputFilePath, result.output.blob);
                    } else if (result.output.kind === 'frames' && derived.outputDirPath) {
                        addFramesToZip({
                            zip,
                            dirPath: derived.outputDirPath,
                            imageExt: result.output.imageExt,
                            frames: result.output.frames
                        });
                    }

                    // metadata/derived
                    const metadata = buildDerivedMetadata({
                        canonicalName: spec.canonicalName,
                        view: spec.view,
                        assetId: `spine:${item.files.basePath || item.name}`,
                        fps: config.fps,
                        frames: result.totalFrames,
                        type: spec.type,
                        dir: spec.dir
                    });
                    zip.file(derived.metadataPath, JSON.stringify(metadata, null, 2));

                    exportIndex.push({
                        asset: item.name,
                        animation,
                        delivery: derived.delivery,
                        view: derived.view,
                        canonicalName: derived.canonicalName,
                        output: derived.outputFilePath || derived.outputDirPath,
                        metadata: derived.metadataPath,
                        fps: config.fps,
                        frames: result.totalFrames
                    });
                } else {
                    // Legacy: 保持旧命名（每个动画一个文件；图片序列仍打包成 zip）
                    let ext: string;
                    if (result.output.kind === 'frames') {
                        ext = 'zip';
                    } else {
                        ext = guessVideoExt(result.output.blob);
                    }

                    const filename = `${item.name}_${animation}.${ext}`;

                    if (result.output.kind === 'video') {
                        zip.file(filename, result.output.blob);
                    } else {
                        const seqZip = new JSZip();
                        result.output.frames.forEach((blob, frameIndex) => {
                            const frameNumber = String(frameIndex).padStart(5, '0');
                            seqZip.file(`frame_${frameNumber}.${result.output.imageExt}`, blob);
                        });
                        const seqZipBlob = await seqZip.generateAsync({
                            type: 'blob',
                            compression: 'STORE'
                        });
                        zip.file(filename, seqZipBlob);
                    }
                }

                completed++;
                onProgress(completed, totalTasks, taskName);

                console.log(`[导出] ✓ [${completed}/${totalTasks}] 渲染完成并已添加至打包队列`);
            } catch (error) {
                console.error(`[导出] 渲染失败: ${item.name} - ${animation}`, error);
                onItemStatusChange(item.id, 'failed');
            }
        });

        // 等待所有渲染任务完成
        await Promise.all(exportPromises);

        if (abortSignal?.aborted) return completed;

        if (completed > 0) {
            onProgress(completed, totalTasks, '正在打包 ZIP 文件...');
            console.log(`[导出] 正在打包所有结果至压缩包...`);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const zipFilename = `SpineExport_${timestamp}.zip`;

            if (config.naming?.enabled) {
                zip.file('export_index.json', JSON.stringify({
                    version: '1.0',
                    generated_date: new Date().toISOString(),
                    items: exportIndex
                }, null, 2));
            }

            const finalZipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            CanvasRecorder.download(finalZipBlob, zipFilename);
            console.log(`[导出] ✓ 打包完成并开始下载: ${zipFilename}`);
        }

        selectedItems.forEach(item => {
            // 如果该资产下所有任务都成功了(或者至少有一个成功),标记为完成
            onItemStatusChange(item.id, 'completed');
        });

        return completed;
    } catch (error) {
        console.error("[导出] 流程遇到严重错误:", error);
        selectedItems.forEach(item => onItemStatusChange(item.id, 'failed'));
        throw error;
    }
}
