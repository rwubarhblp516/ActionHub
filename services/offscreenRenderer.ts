/**
 * 离屏渲染器 - 用于后台导出,不影响预览
 * 每个导出任务创建独立的canvas和渲染器
 */

import { SpineRenderer } from './spineRenderer';
import { SpineFiles } from '../types';
import { CanvasRecorder, VideoFormat } from './recorder';
import { ImageSequenceExporter } from './imageSequenceExporter';
import { MP4Recorder, isWebCodecsSupported } from './mp4Encoder';

export type ExportFormat = VideoFormat | 'png-sequence' | 'jpg-sequence' | 'mp4-h264';

export interface OffscreenRenderTask {
    assetName: string;
    animation: string;
    files: SpineFiles;
    width: number;
    height: number;
    fps: number;
    format: ExportFormat;
    duration?: number; // 可选,如果不指定则使用动画实际时长
    backgroundColor?: string; // 背景色,支持hex或'transparent'
    abortSignal?: AbortSignal; // 中断信号
}

export type OffscreenRenderOutput =
    | { kind: 'frames'; frames: Blob[]; imageExt: 'png' | 'jpg' }
    | { kind: 'video'; blob: Blob };

export interface OffscreenRenderResult {
    output: OffscreenRenderOutput;
    totalFrames: number;
    durationSeconds: number;
}

export class OffscreenRenderer {
    private canvas: HTMLCanvasElement;
    private renderer: SpineRenderer;

    constructor() {
        // 创建离屏canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1920;
        this.canvas.height = 1080;
        // 不添加到DOM,保持离屏

        this.renderer = new SpineRenderer(this.canvas);
    }

    async renderToVideo(task: OffscreenRenderTask): Promise<OffscreenRenderResult> {
        const { assetName, animation, files, width, height, fps, format, duration, backgroundColor, abortSignal } = task;

        console.log(`[离屏渲染] 开始: ${assetName} - ${animation}`);

        // 检查初始中断
        if (abortSignal?.aborted) {
            throw new Error('AbortError');
        }

        try {
            // 加载资产
            const animations = await this.renderer.load(files);

            if (!animations.includes(animation)) {
                throw new Error(`动画 "${animation}" 不存在于资产 "${assetName}" 中`);
            }

            // 检查载入后中断
            if (abortSignal?.aborted) throw new Error('AbortError');

            // 设置渲染参数
            this.renderer.resize(width, height);
            this.renderer.setAnimation(animation, false); // 导出时关闭循环播放
            this.renderer.setPaused(false);
            this.renderer.setTargetFPS(fps);
            this.renderer.resetAnimation(); // 重置到开头

            // 设置背景色
            if (backgroundColor) {
                this.renderer.setBackgroundColor(backgroundColor);
            }

            // 获取动画时长
            const animDuration = this.renderer.totalTime || 2.0;
            const recordDuration = (duration && duration > 0) ? duration : animDuration;

            console.log(`[离屏渲染] 动画时长: ${animDuration.toFixed(2)}s, 录制时长: ${recordDuration.toFixed(2)}s`);

            // 计算总帧数
            const totalFrames = Math.ceil(recordDuration * fps);
            const frameDelta = 1 / fps;

            // 根据格式选择导出器
            let output: OffscreenRenderOutput;
            const isImageSequence = format === 'png-sequence' || format === 'jpg-sequence';
            const isMP4H264 = format === 'mp4-h264';

            if (isImageSequence) {
                const imageFormat = format === 'png-sequence' ? 'png' : 'jpeg';
                const exporter = new ImageSequenceExporter(this.canvas, fps, imageFormat);
                exporter.start();

                // 逐帧渲染并捕获
                for (let i = 0; i < totalFrames; i++) {
                    if (abortSignal?.aborted) throw new Error('AbortError');
                    this.renderer.updateAndRender(frameDelta);
                    await exporter.capture();
                }

                const frames = await exporter.stop();
                output = {
                    kind: 'frames',
                    frames,
                    imageExt: format === 'png-sequence' ? 'png' : 'jpg',
                };
            } else if (isMP4H264) {
                if (!isWebCodecsSupported()) {
                    throw new Error('浏览器不支持 WebCodecs API,请使用 Chrome 94+ 或 Edge 94+');
                }

                const mp4Recorder = new MP4Recorder(this.canvas, fps, width, height);
                await mp4Recorder.start();

                // 逐帧渲染并编码
                for (let i = 0; i < totalFrames; i++) {
                    if (abortSignal?.aborted) throw new Error('AbortError');
                    this.renderer.updateAndRender(frameDelta);
                    await mp4Recorder.encodeFrame((i * 1000000) / fps);
                }

                const blob = await mp4Recorder.stop();
                output = { kind: 'video', blob };
            } else {
                const recorder = new CanvasRecorder(this.canvas, fps, format as VideoFormat);
                recorder.start(fps, width, height);

                for (let i = 0; i < totalFrames; i++) {
                    if (abortSignal?.aborted) throw new Error('AbortError');
                    this.renderer.updateAndRender(frameDelta);
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                const blob = await recorder.stop();
                output = { kind: 'video', blob };
            }

            this.renderer.stop();
            console.log(`[离屏渲染] 完成: ${assetName} - ${animation}`);

            return {
                output,
                totalFrames,
                durationSeconds: recordDuration,
            };
        } catch (error) {
            this.renderer.stop();
            throw error;
        }
    }

    dispose() {
        this.renderer.dispose();
    }
}

/**
 * 导出管理器 - 管理多个并行导出任务
 */
export class ExportManager {
    private maxConcurrent: number = 2; // 最大并行数
    private activeRenderers: Set<OffscreenRenderer> = new Set();
    private queue: Array<{
        task: OffscreenRenderTask;
        resolve: (result: OffscreenRenderResult) => void;
        reject: (error: Error) => void;
    }> = [];

    async exportTask(task: OffscreenRenderTask): Promise<OffscreenRenderResult> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.activeRenderers.size >= this.maxConcurrent) return;

        const item = this.queue.shift();
        if (!item) return;

        // 如果任务在启动前就被中止，直接忽略
        if (item.task.abortSignal?.aborted) {
            item.reject(new Error('AbortError'));
            this.processQueue();
            return;
        }

        const renderer = new OffscreenRenderer();
        this.activeRenderers.add(renderer);

        try {
            const result = await renderer.renderToVideo(item.task);
            item.resolve(result);
        } catch (error) {
            item.reject(error as Error);
        } finally {
            renderer.dispose();
            this.activeRenderers.delete(renderer);
            this.processQueue();
        }
    }

    cancelAll() {
        // 清空等待队列
        this.queue.forEach(item => item.reject(new Error('AbortError')));
        this.queue = [];
        // activeRenderers 会根据各自引用的 signal 停止内部循环
        this.activeRenderers.forEach(r => r.dispose());
        this.activeRenderers.clear();
    }

    getQueueLength(): number {
        return this.queue.length + this.activeRenderers.size;
    }
}
