export interface SpineFiles {
  skeleton: File | null; // .json or .skel
  atlas: File | null;    // .atlas
  images: File[];        // .png, .jpg
  basePath: string;      // logical folder path
}

export interface AnimationItem {
  id: string;
  name: string;
  files: SpineFiles;
  animationNames: string[]; // Loaded after parsing
  defaultAnimation: string;
  status: 'idle' | 'waiting' | 'exporting' | 'completed' | 'failed';
  previewUrl?: string; // For thumbnail or verifying texture
}

export interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  format: 'webm-vp9' | 'webm-vp8' | 'mp4' | 'png-sequence' | 'jpg-sequence' | 'mp4-h264';
  duration: number; // seconds
  scale: number; // 0.1 to 3.0
  backgroundColor: string; // Hex
}

export interface ExportProgress {
  current: number;
  total: number;
  currentName: string;
}

export enum FileType {
  SKELETON_JSON = 'json',
  SKELETON_BINARY = 'skel',
  ATLAS = 'atlas',
  IMAGE = 'image',
  UNKNOWN = 'unknown'
}
