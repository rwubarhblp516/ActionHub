import { ExportConfig } from './types';

export const DEFAULT_CONFIG: ExportConfig = {
  width: 1080,
  height: 1080,
  fps: 30,
  format: 'png-sequence',
  duration: 5,
  scale: 1.0,
  backgroundColor: 'transparent',
};

export const RESOLUTION_PRESETS = [
  { label: '方形 720', width: 720, height: 720 },
  { label: '方形 1080', width: 1080, height: 1080 },
  { label: '竖屏 720x1280', width: 720, height: 1280 },
  { label: '竖屏 1080x1920', width: 1080, height: 1920 },
];

export const FPS_PRESETS = [24, 30, 60];
