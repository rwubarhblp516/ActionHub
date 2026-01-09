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
  kind?: 'assembly' | 'template';
  templateId?: string;
  skinId?: string;
}

export interface TemplateContext {
  templateId: string;
  templateVersion: string;
  skinId?: string;
  skeletonSignature?: string;
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
  templateContext?: TemplateContext;
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

export interface TemplateMeta {
  template_id: string;
  version: string;
  view: ViewId;
  dir_set: DirectionSet;
  fps: number;
  mirror_source: 'R' | 'L';
  skeleton_signature: string;
  generated_at?: string;
}

export interface AttachmentManifestEntry {
  slot_name: string;
  attachment_name: string;
  canonical_name?: string;
  required: boolean;
  default_size?: { w: number; h: number };
  default_pivot?: { x: number; y: number };
  tags?: string[];
}

export interface AttachmentManifest {
  version: string;
  template_id: string;
  template_version: string;
  entries: AttachmentManifestEntry[];
}

export interface ActionEventEntry {
  name: string;
  time: number;
}

export interface ActionManifestEntry {
  canonicalName: string;
  type: ActionTimingType;
  frames: number;
  duration: number;
  dir_set: DirectionSet;
  view: ViewId;
  fps: number;
  events?: ActionEventEntry[];
  sourceAnimation?: string;
}

export interface ActionManifest {
  version: string;
  template_id: string;
  template_version: string;
  actions: ActionManifestEntry[];
}

export interface ExportProfile {
  width: number;
  height: number;
  fps: number;
  format: ExportConfig['format'];
  spritePackaging: ExportConfig['spritePackaging'];
  atlasMaxSize: number;
  atlasPadding: number;
  atlasTrim: boolean;
  backgroundColor: string;
}

export interface TemplatePack {
  meta: TemplateMeta;
  attachment_manifest: AttachmentManifest;
  action_manifest: ActionManifest;
  export_profile: ExportProfile;
}

export interface OfficialTemplateIndexEntry {
  template_id: string;
  version: string;
  name?: string;
  description?: string;
  base_path?: string;
  spine: {
    skeleton: string;
    atlas: string;
    images: string[];
  };
  pack?: {
    meta?: string;
    attachment_manifest?: string;
    action_manifest?: string;
    export_profile?: string;
  };
}

export interface LocalTemplateSummary {
  key: string;
  template_id: string;
  version: string;
  name?: string;
  created_at: string;
  attachment_count: number;
  action_count: number;
}

export interface SkinOverrideEntry {
  offset_x: number;
  offset_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
}

export interface SkinOverrides {
  version: string;
  template_id: string;
  template_version: string;
  skin_id: string;
  generated_at?: string;
  overrides: Record<string, SkinOverrideEntry>;
}

export interface SkinValidationReport {
  version: string;
  template_id: string;
  template_version: string;
  skin_id: string;
  generated_at?: string;
  errors: string[];
  warnings: string[];
  missing_required: string[];
  missing_optional: string[];
  extra_attachments: string[];
  name_mismatch_suggestions: Array<{ input: string; suggestion: string }>;
  no_alpha: string[];
  size_outliers: string[];
  empty_or_near_empty: string[];
  coverage_score: number;
}

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
