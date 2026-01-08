/**
 * 图片序列导出器
 * 用于导出 PNG/JPG 序列（由上层负责打包与目录结构）
 */

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

    async stop(): Promise<Blob[]> {
        this.isRecording = false;
        console.log(`图片序列捕获完成: ${this.frames.length} 帧`);
        return this.frames;
    }

    getFrameCount(): number {
        return this.frameCount;
    }
}
