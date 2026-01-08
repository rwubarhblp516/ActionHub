import type {
  ActionHubNamingConfig,
  ActionHubNamingManifest,
  ActionHubNamingMapping,
  ActionTimingType,
  DirectionSet,
  ViewId,
} from '../types';

export type DeliveryId = 'sprite' | 'preview';

export interface ActionHubActionSpec {
  canonicalName: string; // e.g. locomotion/run_01
  category: string; // e.g. locomotion
  action: string; // e.g. run
  variant: string; // e.g. 01
  dir: DirectionSet;
  type: ActionTimingType;
  view: ViewId;
}

export interface ActionHubDerivedPaths {
  delivery: DeliveryId;
  view: ViewId;
  category: string;
  canonicalName: string;
  baseName: string; // action_variant_dir_type_fps_frames
  outputFilePath?: string; // for video
  outputBasePath?: string; // for sprite: base path without ext; sequence uses this as directory, atlas uses this as file base
  metadataPath: string;
}

export function sanitizePathSegment(input: string): string {
  const trimmed = (input || '').trim();
  const replaced = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/g, '_')
    .replace(/\.+$/g, '_');
  return replaced.length > 0 ? replaced : 'unnamed';
}

export function normalizeCanonicalName(input: string): string {
  const raw = (input || '').trim().replace(/^\/+|\/+$/g, '');
  const parts = raw.split('/').filter(Boolean).map(sanitizePathSegment);
  if (parts.length === 0) return 'misc/unnamed';
  if (parts.length === 1) return `misc/${parts[0]}`;
  return `${parts[0]}/${parts.slice(1).join('_')}`;
}

function stripDeliveryAndViewPrefix(animationName: string): {
  canonicalName?: string;
  view?: ViewId;
} {
  const raw = (animationName || '').trim().replace(/^\/+|\/+$/g, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts.length < 3) return {};

  const [maybeDelivery, maybeView, maybeCategory, ...rest] = parts;
  if (!['sprite', 'spine', 'preview', 'pose'].includes(maybeDelivery)) return {};
  if (!['VIEW_SIDE', 'VIEW_TOP', 'VIEW_ISO45'].includes(maybeView)) return {};
  if (!maybeCategory || rest.length === 0) return {};

  return {
    canonicalName: normalizeCanonicalName(`${maybeCategory}/${rest.join('_')}`),
    view: maybeView as ViewId,
  };
}

function parseActionSlug(lastSegment: string): {
  action: string;
  variant: string;
  dir?: DirectionSet;
  type?: ActionTimingType;
} {
  const base = (lastSegment || '').trim().split('@')[0];
  const sanitized = sanitizePathSegment(base);

  // 支持完整末尾格式: action_variant_dir_type_30fps_24f
  const full = sanitized.match(/^(.*)_([^_]+)_(LR|4dir|8dir|none)_(loop|once)_([0-9]+)fps_([0-9]+)f$/);
  if (full) {
    return {
      action: sanitizePathSegment(full[1]),
      variant: sanitizePathSegment(full[2]),
      dir: full[3] as DirectionSet,
      type: full[4] as ActionTimingType,
    };
  }

  // 支持 action_01（数字 variant）
  const numeric = sanitized.match(/^(.*)_([0-9]{2,})$/);
  if (numeric) {
    return {
      action: sanitizePathSegment(numeric[1]),
      variant: sanitizePathSegment(numeric[2]),
    };
  }

  // 支持 action_sword（非数字 variant）
  const parts = sanitized.split('_').filter(Boolean);
  if (parts.length >= 2) {
    const maybeVariant = parts[parts.length - 1];
    const maybeAction = parts.slice(0, -1).join('_');
    if (maybeVariant && maybeAction) {
      return { action: sanitizePathSegment(maybeAction), variant: sanitizePathSegment(maybeVariant) };
    }
  }

  return { action: sanitized, variant: '00' };
}

function findMapping(
  manifest: ActionHubNamingManifest | undefined,
  assetKeys: string[],
  animationName: string,
): ActionHubNamingMapping | undefined {
  const mappings = manifest?.mappings;
  if (!mappings) return undefined;
  for (const assetKey of assetKeys) {
    if (!assetKey) continue;
    const hit =
      mappings[`${assetKey}::${animationName}`] ||
      mappings[`${assetKey}/${animationName}`];
    if (hit) return hit;
  }
  return mappings[animationName];
}

export function inferActionSpec(params: {
  assetName: string;
  assetKey?: string;
  animationName: string;
  naming: ActionHubNamingConfig;
}): ActionHubActionSpec {
  const { assetName, assetKey, animationName, naming } = params;
  const manifest = naming.manifest;

  const mapping = findMapping(manifest, [assetKey || '', assetName], animationName);
  const prefixParsed = stripDeliveryAndViewPrefix(animationName);

  const view: ViewId = manifest?.defaults?.view || prefixParsed.view || naming.view;

  const canonicalFromName = normalizeCanonicalName(
    mapping?.name ||
      prefixParsed.canonicalName ||
      (animationName.includes('/') ? animationName : `${naming.defaultCategory}/${animationName}`),
  );

  const [categoryFromNameRaw, lastFromNameRaw] = canonicalFromName.split('/');
  const category = sanitizePathSegment(mapping?.category || categoryFromNameRaw || naming.defaultCategory || 'misc');

  const parsed = parseActionSlug(lastFromNameRaw || 'unnamed');
  const action = sanitizePathSegment(mapping?.action || parsed.action);
  const variant = sanitizePathSegment(mapping?.variant || parsed.variant);
  const last = `${action}_${variant}`;

  return {
    canonicalName: `${category}/${sanitizePathSegment(last)}`,
    category,
    action,
    variant,
    dir: mapping?.dir || manifest?.defaults?.dir || parsed.dir || naming.defaultDir,
    type: mapping?.type || manifest?.defaults?.type || parsed.type || naming.defaultType,
    view,
  };
}

export function buildBaseName(params: {
  action: string;
  variant: string;
  dir: DirectionSet;
  type: ActionTimingType;
  fps: number;
  frames: number;
}): string {
  const { action, variant, dir, type, fps, frames } = params;
  const safeAction = sanitizePathSegment(action);
  const safeVariant = sanitizePathSegment(variant || '00');
  return `${safeAction}_${safeVariant}_${dir}_${type}_${fps}fps_${frames}f`;
}

export function buildDerivedPaths(params: {
  spec: ActionHubActionSpec;
  delivery: DeliveryId;
  fps: number;
  frames: number;
  outputExt?: string; // for video
  framesExt?: string; // for sequence
}): ActionHubDerivedPaths {
  const { spec, delivery, fps, frames, outputExt, framesExt } = params;
  const baseName = buildBaseName({
    action: spec.action,
    variant: spec.variant,
    dir: spec.dir,
    type: spec.type,
    fps,
    frames,
  });

  const safeCategory = sanitizePathSegment(spec.category);
  const safeView = spec.view;

  const metadataPath = `metadata/derived/${delivery}/${safeView}/${spec.canonicalName}.json`;

  if (delivery === 'sprite') {
    return {
      delivery,
      view: spec.view,
      category: safeCategory,
      canonicalName: spec.canonicalName,
      baseName,
      outputBasePath: `sprite/${safeView}/${safeCategory}/${baseName}`,
      metadataPath,
    };
  }

  const ext = outputExt || 'mp4';
  return {
    delivery,
    view: spec.view,
    category: safeCategory,
    canonicalName: spec.canonicalName,
    baseName,
    outputFilePath: `preview/${safeView}/${safeCategory}/${baseName}.${ext}`,
    metadataPath,
  };
}

export function guessDeliveryFromFormat(format: string): DeliveryId {
  if (format === 'png-sequence' || format === 'jpg-sequence') return 'sprite';
  return 'preview';
}
