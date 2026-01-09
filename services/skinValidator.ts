import { AttachmentManifest, AttachmentManifestEntry, SkinValidationReport } from '../types';

const getBaseName = (name: string) => {
  const trimmed = (name || '').trim();
  const idx = trimmed.lastIndexOf('.');
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
};

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
};

const parseSlotAttachment = (base: string) => {
  const parts = base.split('__');
  if (parts.length !== 2) return null;
  const slot = parts[0].trim();
  const attachment = parts[1].trim();
  if (!slot || !attachment) return null;
  return { slot, attachment };
};

const levenshtein = (a: string, b: string) => {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
};

const suggestName = (input: string, candidates: string[]) => {
  if (candidates.length === 0) return '';
  let best = candidates[0];
  let bestScore = levenshtein(input, best);
  for (let i = 1; i < candidates.length; i++) {
    const score = levenshtein(input, candidates[i]);
    if (score < bestScore) {
      bestScore = score;
      best = candidates[i];
    }
  }
  return best;
};

const analyzeImage = async (file: File) => {
  // eslint-disable-next-line no-undef
  const bmp = await createImageBitmap(file);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D 画布不可用，无法分析贴图。');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    let hasAlpha = false;
    let nonTransparent = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 255) hasAlpha = true;
      if (a > 0) nonTransparent++;
    }
    const total = Math.max(1, w * h);
    const nonTransparentRatio = nonTransparent / total;
    return { width: w, height: h, hasAlpha, nonTransparentRatio };
  } finally {
    try { bmp.close(); } catch { }
  }
};

export type SkinMatch = {
  key: string;
  slotName: string;
  attachmentName: string;
  entry: AttachmentManifestEntry;
  file: File;
  normalizedFile: File;
  width: number;
  height: number;
  hasAlpha: boolean;
  nonTransparentRatio: number;
};

export type SkinValidationResult = {
  report: SkinValidationReport;
  matches: SkinMatch[];
};

const computeCoverageScore = (requiredTotal: number, requiredHit: number, optionalTotal: number, optionalHit: number) => {
  if (requiredTotal === 0 && optionalTotal === 0) return 0;
  const reqScore = requiredTotal === 0 ? 1 : requiredHit / requiredTotal;
  const optScore = optionalTotal === 0 ? 1 : optionalHit / optionalTotal;
  const score = reqScore * 0.8 + optScore * 0.2;
  return Math.round(score * 100);
};

export const computeSkinId = async (files: File[]) => {
  const parts = files
    .map(f => `${f.name}:${f.size}:${f.lastModified}`)
    .sort()
    .join('|');
  const buf = new TextEncoder().encode(parts);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const validateSkinFiles = async (params: {
  templateId: string;
  templateVersion: string;
  manifest: AttachmentManifest;
  files: File[];
}): Promise<SkinValidationResult> => {
  const { templateId, templateVersion, manifest, files } = params;

  const pngFiles = files.filter(f => getExt(f.name) === 'png');
  const skinId = await computeSkinId(pngFiles);

  const errors: string[] = [];
  const warnings: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const extraAttachments: string[] = [];
  const noAlpha: string[] = [];
  const sizeOutliers: string[] = [];
  const emptyOrNearEmpty: string[] = [];
  const mismatchSuggestions: Array<{ input: string; suggestion: string }> = [];

  const entries = manifest.entries || [];
  const entryByKey = new Map<string, AttachmentManifestEntry>();
  const nameToKeys = new Map<string, string[]>();
  const canonicalToKeys = new Map<string, string[]>();
  const entryBySlotCanonical = new Map<string, AttachmentManifestEntry>();
  entries.forEach((entry) => {
    const key = `${entry.slot_name}::${entry.attachment_name}`;
    entryByKey.set(key, entry);
    if (!nameToKeys.has(entry.attachment_name)) nameToKeys.set(entry.attachment_name, []);
    nameToKeys.get(entry.attachment_name)?.push(key);

    const canonical = (entry.canonical_name || entry.attachment_name).trim();
    if (!canonicalToKeys.has(canonical)) canonicalToKeys.set(canonical, []);
    canonicalToKeys.get(canonical)?.push(key);
    entryBySlotCanonical.set(`${entry.slot_name}::${canonical}`, entry);
  });

  const nameConflicts = new Set<string>();
  nameToKeys.forEach((keys, name) => {
    if (keys.length > 1) nameConflicts.add(name);
  });
  const canonicalConflicts = new Set<string>();
  canonicalToKeys.forEach((keys, name) => {
    if (keys.length > 1) canonicalConflicts.add(name);
  });

  const getPreferredName = (entry: AttachmentManifestEntry) => {
    const canonical = (entry.canonical_name || entry.attachment_name).trim();
    if (canonicalConflicts.has(canonical)) return `${entry.slot_name}__${canonical}`;
    return canonical;
  };

  const matches: SkinMatch[] = [];
  const matchedKeys = new Set<string>();

  for (const file of pngFiles) {
    const base = getBaseName(file.name);
    let matchedKey = '';
    let entry: AttachmentManifestEntry | undefined;
    const parsed = parseSlotAttachment(base);
    if (parsed) {
      matchedKey = `${parsed.slot}::${parsed.attachment}`;
      entry = entryByKey.get(matchedKey);
      if (!entry) {
        entry = entryBySlotCanonical.get(`${parsed.slot}::${parsed.attachment}`);
        if (entry) matchedKey = `${entry.slot_name}::${entry.attachment_name}`;
      }
    } else {
      if (!nameConflicts.has(base)) {
        const candidates = nameToKeys.get(base);
        if (candidates && candidates.length === 1) {
          matchedKey = candidates[0];
          entry = entryByKey.get(matchedKey);
        }
      }
      if (!entry && !canonicalConflicts.has(base)) {
        const candidates = canonicalToKeys.get(base);
        if (candidates && candidates.length === 1) {
          matchedKey = candidates[0];
          entry = entryByKey.get(matchedKey);
        }
      }
    }

    if (!entry || !matchedKey) {
      extraAttachments.push(base);
      const suggestions = entries.map((entryItem) => {
        const canonical = (entryItem.canonical_name || entryItem.attachment_name).trim();
        if (canonicalConflicts.has(canonical)) return `${entryItem.slot_name}__${canonical}`;
        if (nameConflicts.has(entryItem.attachment_name)) return `${entryItem.slot_name}__${canonical}`;
        return canonical;
      });
      const suggestion = suggestName(base, suggestions);
      if (suggestion) mismatchSuggestions.push({ input: base, suggestion });
      errors.push(`未识别的附件文件: ${file.name}`);
      continue;
    }

    if (matchedKeys.has(matchedKey)) {
      errors.push(`附件重复: ${base} 对应的附件已匹配过。`);
      continue;
    }
    matchedKeys.add(matchedKey);

    const analysis = await analyzeImage(file);
    const normalizedFile = new File([file], `${entry.attachment_name}.png`, { type: file.type });
    matches.push({
      key: matchedKey,
      slotName: entry.slot_name,
      attachmentName: entry.attachment_name,
      entry,
      file,
      normalizedFile,
      width: analysis.width,
      height: analysis.height,
      hasAlpha: analysis.hasAlpha,
      nonTransparentRatio: analysis.nonTransparentRatio,
    });

    if (!analysis.hasAlpha) {
      noAlpha.push(entry.attachment_name);
      errors.push(`附件缺少透明通道: ${getPreferredName(entry)}`);
    }

    if (analysis.nonTransparentRatio < 0.01) {
      emptyOrNearEmpty.push(getPreferredName(entry));
      warnings.push(`附件接近全透明: ${getPreferredName(entry)}`);
    }

    if (entry.default_size?.w && entry.default_size?.h) {
      const wRatio = analysis.width / entry.default_size.w;
      const hRatio = analysis.height / entry.default_size.h;
      const ratio = Math.max(wRatio, hRatio, 1 / Math.max(wRatio, 0.001), 1 / Math.max(hRatio, 0.001));
      if (ratio > 2.5) {
        sizeOutliers.push(getPreferredName(entry));
        warnings.push(`附件尺寸异常: ${getPreferredName(entry)} (${analysis.width}x${analysis.height})`);
      }
    }
  }

  entries.forEach((entry) => {
    const key = `${entry.slot_name}::${entry.attachment_name}`;
    if (!matchedKeys.has(key)) {
      if (entry.required) missingRequired.push(getPreferredName(entry));
      else missingOptional.push(getPreferredName(entry));
    }
  });

  if (missingRequired.length > 0) {
    missingRequired.forEach(name => {
      errors.push(`缺少必需附件: ${name}`);
    });
  }

  if (missingOptional.length > 0) {
    missingOptional.forEach(name => {
      warnings.push(`缺少可选附件: ${name}`);
    });
  }

  const coverageScore = computeCoverageScore(
    entries.filter(e => e.required).length,
    matches.filter(m => m.entry.required).length,
    entries.filter(e => !e.required).length,
    matches.filter(m => !m.entry.required).length,
  );

  const report: SkinValidationReport = {
    version: '1.0',
    template_id: templateId,
    template_version: templateVersion,
    skin_id: skinId,
    generated_at: new Date().toISOString(),
    errors,
    warnings,
    missing_required: missingRequired,
    missing_optional: missingOptional,
    extra_attachments: extraAttachments,
    name_mismatch_suggestions: mismatchSuggestions,
    no_alpha: noAlpha,
    size_outliers: sizeOutliers,
    empty_or_near_empty: emptyOrNearEmpty,
    coverage_score: coverageScore,
  };

  return { report, matches };
};

export const buildSkinAtlasFiles = (params: {
  skinId: string;
  matches: SkinMatch[];
}) => {
  const { skinId, matches } = params;
  const lines: string[] = [];
  const imageFiles: File[] = [];

  matches.forEach((match) => {
    const fileName = match.normalizedFile.name;
    lines.push(fileName);
    lines.push(`size: ${match.width},${match.height}`);
    lines.push('format: RGBA8888');
    lines.push('filter: Linear,Linear');
    lines.push('repeat: none');
    lines.push(match.attachmentName);
    lines.push('  rotate: false');
    lines.push('  xy: 0, 0');
    lines.push(`  size: ${match.width}, ${match.height}`);
    lines.push(`  orig: ${match.width}, ${match.height}`);
    lines.push('  offset: 0, 0');
    lines.push('  index: -1');
    lines.push('');
    imageFiles.push(match.normalizedFile);
  });

  const atlasText = lines.join('\n');
  const atlasFile = new File([atlasText], `${skinId}.atlas`, { type: 'text/plain' });

  return { atlasFile, imageFiles };
};
