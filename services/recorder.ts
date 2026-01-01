// Handles the recording of the Canvas to WebM

export class CanvasRecorder {
  recorder: MediaRecorder | null = null;
  chunks: Blob[] = [];
  stream: MediaStream | null = null;

  constructor(canvas: HTMLCanvasElement, fps: number) {
    this.stream = canvas.captureStream(fps);
  }

  start(fps: number, width: number, height: number) {
    if (!this.stream) throw new Error("No stream");

    // Determine supported mime type
    const types = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";

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
}
