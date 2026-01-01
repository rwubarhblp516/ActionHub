// Handles the recording of the Canvas to WebM/MP4

export type VideoFormat = 'webm-vp9' | 'webm-vp8' | 'mp4';

export class CanvasRecorder {
  recorder: MediaRecorder | null = null;
  chunks: Blob[] = [];
  stream: MediaStream | null = null;
  format: VideoFormat = 'webm-vp9';

  constructor(canvas: HTMLCanvasElement, fps: number, format: VideoFormat = 'webm-vp9') {
    this.stream = canvas.captureStream(fps);
    this.format = format;
  }

  start(fps: number, width: number, height: number) {
    if (!this.stream) throw new Error("No stream");

    // 根据格式选择 MIME 类型
    let mimeType: string;
    const formatMap: Record<VideoFormat, string[]> = {
      'webm-vp9': ["video/webm;codecs=vp9", "video/webm"],
      'webm-vp8': ["video/webm;codecs=vp8", "video/webm"],
      'mp4': ["video/mp4;codecs=h264", "video/mp4", "video/webm"] // MP4 fallback to WebM
    };

    const candidates = formatMap[this.format];
    mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";

    console.log(`使用编码器: ${mimeType} (请求格式: ${this.format})`);

    // Calculate approximate bits per second
    // formula: width * height * fps * motion_factor (0.1)
    const videoBitsPerSecond = width * height * fps * 0.1;

    this.recorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond
    });

    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject("No recorder");

      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'video/webm' });
        resolve(blob);
      };

      this.recorder.stop();
    });
  }

  static download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 获取文件扩展名
  getFileExtension(): string {
    if (this.format.startsWith('webm')) return 'webm';
    if (this.format === 'mp4') return 'mp4';
    return 'webm';
  }
}
