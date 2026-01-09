import {
  ActionManifestEntry,
  ActionManifest,
  ActionHubNamingConfig,
  AttachmentManifest,
  AttachmentManifestEntry,
  ExportConfig,
  ExportProfile,
  TemplateMeta,
  TemplatePack,
} from '../types';
import { SpineRenderer } from './spineRenderer';
import { inferActionSpec } from './actionHubNaming';

type SpineAny = any;

const toHex = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return out.join('');
};

const hashFile = async (file: File) => {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return `sha256:${toHex(digest)}`;
};

const safeNumber = (value: any, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeName = (name: string) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const replaced = trimmed.replace(/\s+/g, '_');
  const safe = replaced.replace(/[^a-zA-Z0-9_\-]/g, '');
  return safe || trimmed;
};

const extractAttachmentDefaults = (attachment: SpineAny) => {
  const width = safeNumber(attachment?.width, 0) || safeNumber(attachment?.region?.originalWidth, 0) || safeNumber(attachment?.region?.width, 0);
  const height = safeNumber(attachment?.height, 0) || safeNumber(attachment?.region?.originalHeight, 0) || safeNumber(attachment?.region?.height, 0);
  const x = safeNumber(attachment?.x, 0);
  const y = safeNumber(attachment?.y, 0);
  const hasSize = width > 0 && height > 0;

  return {
    default_size: hasSize ? { w: Math.round(width), h: Math.round(height) } : undefined,
    default_pivot: { x, y },
  };
};

const extractEvents = (animation: SpineAny) => {
  const events: { name: string; time: number }[] = [];
  const timelines = animation?.timelines || [];
  const spineAny = (window as any)?.spine;
  const EventTimeline = spineAny?.EventTimeline;
  if (!EventTimeline) return events;

  timelines.forEach((timeline: SpineAny) => {
    if (!(timeline instanceof EventTimeline)) return;
    const frames = timeline.frames || [];
    const evs = timeline.events || [];
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      const time = safeNumber(frames[i], safeNumber(ev?.time, 0));
      if (ev?.data?.name || ev?.name) {
        events.push({ name: ev?.data?.name || ev?.name, time });
      }
    }
  });

  return events;
};

export interface TemplatePackBuildResult {
  pack: TemplatePack;
  attachmentNameConflicts: Array<{ attachment_name: string; slots: string[] }>;
}

export const buildTemplatePackFromAsset = async (params: {
  item: { name: string; files: { skeleton: File | null; atlas: File | null; images: File[]; basePath: string } };
  naming: ActionHubNamingConfig;
  exportConfig: ExportConfig;
  templateId: string;
  version: string;
}): Promise<TemplatePackBuildResult> => {
  const { item, naming, exportConfig, templateId, version } = params;
  if (!item.files.skeleton || !item.files.atlas) {
    throw new Error('模板资产缺少骨架或图集文件，无法生成模板包。');
  }
  if (typeof (window as any).spine === 'undefined') {
    throw new Error('Spine 运行时未就绪，无法解析模板。');
  }

  const canvas = document.createElement('canvas');
  const renderer = new SpineRenderer(canvas);
  try {
    await renderer.load(item.files as any);
    const skeletonData = renderer.skeleton?.data;
    if (!skeletonData) throw new Error('无法读取模板骨架数据。');

    const signature = await hashFile(item.files.skeleton);
    const meta: TemplateMeta = {
      template_id: templateId,
      version,
      view: 'VIEW_SIDE',
      dir_set: 'LR',
      fps: 30,
      mirror_source: 'R',
      skeleton_signature: signature,
      generated_at: new Date().toISOString(),
    };

    const defaultSkin = skeletonData.defaultSkin || skeletonData.skins?.[0];
    const requiredKeys = new Set<string>();
    if (defaultSkin) {
      const entries = defaultSkin.getAttachments();
      entries.forEach((entry: SpineAny) => {
        const slotName = skeletonData.slots?.[entry.slotIndex]?.name || `slot_${entry.slotIndex}`;
        requiredKeys.add(`${slotName}::${entry.name}`);
      });
    }

    const entriesMap = new Map<string, AttachmentManifestEntry>();
    const nameToSlots = new Map<string, Set<string>>();
    const skins = skeletonData.skins || [];
    skins.forEach((skin: SpineAny) => {
      const attachments = skin.getAttachments();
      attachments.forEach((entry: SpineAny) => {
        const slotName = skeletonData.slots?.[entry.slotIndex]?.name || `slot_${entry.slotIndex}`;
        const key = `${slotName}::${entry.name}`;
        const defaults = extractAttachmentDefaults(entry.attachment);
        const existing = entriesMap.get(key);
        if (!existing) {
          entriesMap.set(key, {
            slot_name: slotName,
            attachment_name: entry.name,
            required: requiredKeys.has(key),
            default_size: defaults.default_size,
            default_pivot: defaults.default_pivot,
            tags: [],
          });
        } else {
          if (requiredKeys.has(key)) existing.required = true;
        }

        if (!nameToSlots.has(entry.name)) nameToSlots.set(entry.name, new Set());
        nameToSlots.get(entry.name)?.add(slotName);
      });
    });

    const attachmentManifest: AttachmentManifest = {
      version: '1.0',
      template_id: templateId,
      template_version: version,
      entries: Array.from(entriesMap.values()).sort((a, b) => {
        const slot = a.slot_name.localeCompare(b.slot_name);
        if (slot !== 0) return slot;
        return a.attachment_name.localeCompare(b.attachment_name);
      }).map((entry) => {
        const base = normalizeName(entry.attachment_name) || entry.attachment_name;
        const slotSafe = normalizeName(entry.slot_name) || entry.slot_name;
        const canonical = nameToSlots.get(entry.attachment_name)?.size && (nameToSlots.get(entry.attachment_name)?.size || 0) > 1
          ? `${slotSafe}__${base}`
          : base;
        return { ...entry, canonical_name: canonical };
      }),
    };

    const actions: ActionManifestEntry[] = (skeletonData.animations || []).map((anim: SpineAny) => {
      const spec = inferActionSpec({
        assetName: item.name,
        assetKey: item.files.basePath || item.name,
        animationName: anim.name,
        naming,
      });
      const duration = safeNumber(anim?.duration, 0);
      const frames = Math.max(1, Math.round(duration * 30));
      return {
        canonicalName: spec.canonicalName,
        type: spec.type,
        frames,
        duration,
        dir_set: 'LR',
        view: 'VIEW_SIDE',
        fps: 30,
        events: extractEvents(anim),
        sourceAnimation: anim.name,
      };
    });

    const actionManifest: ActionManifest = {
      version: '1.0',
      template_id: templateId,
      template_version: version,
      actions,
    };

    const exportProfile: ExportProfile = {
      width: exportConfig.width,
      height: exportConfig.height,
      fps: 30,
      format: exportConfig.format,
      spritePackaging: exportConfig.spritePackaging,
      atlasMaxSize: exportConfig.atlasMaxSize,
      atlasPadding: exportConfig.atlasPadding,
      atlasTrim: exportConfig.atlasTrim,
      backgroundColor: exportConfig.backgroundColor,
    };

    const pack: TemplatePack = {
      meta,
      attachment_manifest: attachmentManifest,
      action_manifest: actionManifest,
      export_profile: exportProfile,
    };

    const conflicts: Array<{ attachment_name: string; slots: string[] }> = [];
    nameToSlots.forEach((slots, name) => {
      if (slots.size > 1) {
        conflicts.push({ attachment_name: name, slots: Array.from(slots).sort() });
      }
    });

    return { pack, attachmentNameConflicts: conflicts };
  } finally {
    renderer.dispose();
  }
};
