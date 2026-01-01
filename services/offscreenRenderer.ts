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

    async renderToVideo(task: OffscreenRenderTask): Promise<Blob> {
        const { assetName, animation, files, width, height, fps, format, duration, backgroundColor } = task;

        console.log(`[离屏渲染] 开始: ${assetName} - ${animation}`);

        try {
            // 加载资产
            const animations = await this.renderer.load(files);

            if (!animations.includes(animation)) {
                throw new Error(`动画 "${animation}" 不存在于资产 "${assetName}" 中`);
            }

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
            let blob: Blob;
            const isImageSequence = format === 'png-sequence' || format === 'jpg-sequence';
            const isMP4H264 = format === 'mp4-h264';

            if (isImageSequence) {
                // 使用图片序列导出器
                const imageFormat = format === 'png-sequence' ? 'png' : 'jpeg';
                const exporter = new ImageSequenceExporter(this.canvas, fps, imageFormat);
                exporter.start();

                // 逐帧渲染并捕获
                for (let i = 0; i < totalFrames; i++) {
                    this.renderer.updateAndRender(frameDelta);
                    await exporter.capture();
                }

                blob = await exporter.stop();
                console.log(`[离屏渲染] 捕获了 ${exporter.getFrameCount()} 帧`);
            } else if (isMP4H264) {
                // 使用 WebCodecs MP4 编码器
                if (!isWebCodecsSupported()) {
                    throw new Error('浏览器不支持 WebCodecs API,请使用 Chrome 94+ 或 Edge 94+');
                }

                const mp4Recorder = new MP4Recorder(this.canvas, fps, width, height);
                await mp4Recorder.start();

                // 逐帧渲染并编码
                for (let i = 0; i < totalFrames; i++) {
                    this.renderer.updateAndRender(frameDelta);
                    // 传入精确的时间戳 (微秒)
                    await mp4Recorder.encodeFrame((i * 1000000) / fps);
                }

                blob = await mp4Recorder.stop();
                console.log(`[离屏渲染] MP4编码完成: ${mp4Recorder.getFrameCount()} 帧`);
            } else {
                // 使用 MediaRecorder (WebM)
                const recorder = new CanvasRecorder(this.canvas, fps, format as VideoFormat);
                recorder.start(fps, width, height);

                // 逐帧渲染并捕获 (MediaRecorder 较难完全逐帧同步,但尽量模拟频率)
                for (let i = 0; i < totalFrames; i++) {
                    this.renderer.updateAndRender(frameDelta);
                    await new Promise(resolve => setTimeout(resolve, 10)); // 给 MediaRecorder 一点处理时间
                }

                blob = await recorder.stop();
            }

            // 停止渲染
            this.renderer.stop();

            console.log(`[离屏渲染] 完成: ${assetName} - ${animation} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

            return blob;
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
        resolve: (blob: Blob) => void;
        reject: (error: Error) => void;
    }> = [];

    async exportTask(task: OffscreenRenderTask): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        // 如果已达到最大并行数,等待
        if (this.activeRenderers.size >= this.maxConcurrent) {
            return;
        }

        // 从队列取出任务
        const item = this.queue.shift();
        if (!item) return;

        const renderer = new OffscreenRenderer();
        this.activeRenderers.add(renderer);

        try {
            const blob = await renderer.renderToVideo(item.task);
            item.resolve(blob);
        } catch (error) {
            item.reject(error as Error);
        } finally {
            renderer.dispose();
            this.activeRenderers.delete(renderer);

            // 继续处理队列
            this.processQueue();
        }
    }

    cancelAll() {
        this.queue = [];
        this.activeRenderers.forEach(r => r.dispose());
        this.activeRenderers.clear();
    }

    getQueueLength(): number {
        return this.queue.length + this.activeRenderers.size;
    }
}
