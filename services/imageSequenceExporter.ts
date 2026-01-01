/**
 * 图片序列导出器
 * 用于导出PNG/JPG序列,兼容EbSynth等工具
 */

import JSZip from 'jszip';

export class ImageSequenceExporter {
    private canvas: HTMLCanvasElement;
    private frames: Blob[] = [];
    private isRecording: boolean = false;
    private frameCount: number = 0;
    private format: 'png' | 'jpeg' = 'png';
    private quality: number = 0.95;

    constructor(canvas: HTMLCanvasElement, fps: number, format: 'png' | 'jpeg' = 'png', quality: number = 0.95) {
        this.canvas = canvas;
        this.format = format;
        this.quality = quality;
    }

    start() {
        this.frames = [];
        this.frameCount = 0;
        this.isRecording = true;
    }

    /**
     * 手动捕获当前帧
     */
    async capture() {
        if (!this.isRecording) return;

        return new Promise<void>((resolve) => {
            this.canvas.toBlob((blob) => {
                if (blob && this.isRecording) {
                    this.frames.push(blob);
                    this.frameCount++;
                }
                resolve();
            }, this.format === 'png' ? 'image/png' : 'image/jpeg', this.quality);
        });
    }

    async stop(): Promise<Blob> {
        this.isRecording = false;

        console.log(`图片序列打包中: ${this.frames.length} 帧`);

        // 打包成ZIP
        const zip = new JSZip();

        this.frames.forEach((blob, index) => {
            const frameNumber = String(index).padStart(5, '0');
            const ext = this.format === 'png' ? 'png' : 'jpg';
            zip.file(`frame_${frameNumber}.${ext}`, blob);
        });

        // 生成ZIP
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'STORE' // 图片本身已压缩，ZIP层使用STORE更快
        });

        return zipBlob;
    }

    getFrameCount(): number {
        return this.frameCount;
    }
}
