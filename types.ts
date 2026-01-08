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
  duration: number; // seconds; 0 表示使用动画原始时长
  scale: number; // 0.1 to 3.0
  backgroundColor: string; // Hex
  spritePackaging: 'sequence' | 'atlas';
  atlasMaxSize: number; // e.g. 2048/4096
  atlasPadding: number; // pixels
  atlasTrim: boolean; // trim transparent pixels
  naming: ActionHubNamingConfig;
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

export type ViewId = 'VIEW_SIDE' | 'VIEW_TOP' | 'VIEW_ISO45';
export type DirectionSet = 'LR' | '4dir' | '8dir' | 'none';
export type ActionTimingType = 'loop' | 'once';

export interface ActionHubNamingMapping {
  name: string; // canonical action name, e.g. locomotion/run_01
  category?: string;
  dir?: DirectionSet;
  type?: ActionTimingType;
  variant?: string;
  action?: string;
}

export interface ActionHubNamingManifest {
  version: string;
  generated_date?: string;
  defaults?: {
    view?: ViewId;
    category?: string;
    dir?: DirectionSet;
    type?: ActionTimingType;
  };
  mappings?: Record<string, ActionHubNamingMapping>;
}

export interface ActionHubNamingConfig {
  enabled: boolean;
  view: ViewId;
  defaultCategory: string;
  defaultDir: DirectionSet;
  defaultType: ActionTimingType;
  manifest?: ActionHubNamingManifest;
}
