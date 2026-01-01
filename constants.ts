import { ExportConfig } from './types';

export const DEFAULT_CONFIG: ExportConfig = {
  width: 1920,
  height: 1080,
  fps: 30,
  format: 'webm',
  duration: 5,
  scale: 1.0,
  backgroundColor: '#2a2a40',
};

export const RESOLUTION_PRESETS = [
  { label: 'HD 720p', width: 1280, height: 720 },
  { label: 'Full HD 1080p', width: 1920, height: 1080 },
  { label: '2K QHD', width: 2560, height: 1440 },
  { label: '4K UHD', width: 3840, height: 2160 },
];

export const FPS_PRESETS = [24, 30, 60];
