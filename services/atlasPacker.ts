export type AtlasImageFormat = 'png';

export type TrimmedFrame = {
  index: number;
  blob: Blob;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  fullW: number;
  fullH: number;
};

export type AtlasPackOptions = {
  maxSize: number; // 2048/4096
  padding: number; // px between frames
  trim: boolean;
};

export type AtlasPage = {
  imageBlob: Blob;
  json: any;
  imageFileName: string;
  jsonFileName: string;
};

const clamp = (n: number, min: number, max: number) => {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const padNumber = (n: number, width: number) => String(n).padStart(width, '0');

function computeTrimRect(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = data[row + x * 4 + 3];
      if (a !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    // 全透明帧：给一个 1x1 以避免 0 尺寸
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function buildTrimmedFrames(frames: Blob[], trim: boolean): Promise<TrimmedFrame[]> {
  const trimmed: TrimmedFrame[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D 画布不可用，无法打包图集');

  for (let i = 0; i < frames.length; i++) {
    const blob = frames[i];
    // eslint-disable-next-line no-undef
    const bmp = await createImageBitmap(blob);
    try {
      const w = bmp.width;
      const h = bmp.height;

      let r = { x: 0, y: 0, w, h };
      if (trim) {
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0);
        r = computeTrimRect(ctx, w, h);
      }

      trimmed.push({
        index: i,
        blob,
        srcX: r.x,
        srcY: r.y,
        srcW: r.w,
        srcH: r.h,
        fullW: w,
        fullH: h,
      });
    } finally {
      try { bmp.close(); } catch { }
    }
  }

  return trimmed;
}

type Placed = TrimmedFrame & { x: number; y: number };

function packShelf(frames: TrimmedFrame[], options: AtlasPackOptions): Array<{ placed: Placed[]; w: number; h: number }> {
  const maxSize = clamp(options.maxSize, 256, 8192);
  const padding = clamp(options.padding, 0, 64);

  const sorted = [...frames].sort((a, b) => b.srcH - a.srcH);
  const pages: Array<{ placed: Placed[]; w: number; h: number }> = [];

  let placed: Placed[] = [];
  let x = padding;
  let y = padding;
  let rowH = 0;
  let usedW = 0;
  let usedH = 0;

  const flushPage = () => {
    if (placed.length === 0) return;
    pages.push({
      placed,
      w: clamp(usedW + padding, 1, maxSize),
      h: clamp(usedH + padding, 1, maxSize),
    });
    placed = [];
    x = padding;
    y = padding;
    rowH = 0;
    usedW = 0;
    usedH = 0;
  };

  for (const f of sorted) {
    const fw = f.srcW;
    const fh = f.srcH;
    if (fw + padding * 2 > maxSize || fh + padding * 2 > maxSize) {
      // 单帧过大：强制放单页（会被裁到 maxSize 的限制之外时抛错更合理）
      throw new Error(`单帧尺寸过大，无法打包：${fw}x${fh}（maxSize=${maxSize}）`);
    }

    if (x + fw + padding > maxSize) {
      x = padding;
      y += rowH + padding;
      rowH = 0;
    }

    if (y + fh + padding > maxSize) {
      flushPage();
    }

    placed.push({ ...f, x, y });
    x += fw + padding;
    rowH = Math.max(rowH, fh);
    usedW = Math.max(usedW, x);
    usedH = Math.max(usedH, y + rowH);
  }

  flushPage();
  return pages;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const m = /data:(.*?);base64/i.exec(meta);
  const mime = m?.[1] || 'image/png';
  const binary = atob(data);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error(`生成 PNG 失败：canvas 尺寸无效（${canvas.width}x${canvas.height}）`);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
  if (blob) return blob;

  // 某些浏览器/内存压力下 toBlob 可能返回 null；退化到 dataURL 再转 Blob
  try {
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrlToBlob(dataUrl);
  } catch {
    throw new Error(`生成 PNG 失败（${canvas.width}x${canvas.height}）。可尝试降低图集最大尺寸或关闭“裁切”。`);
  }
}

export async function packFramesToAtlas(params: {
  frames: Blob[];
  baseName: string; // file base name in atlas json
  options: AtlasPackOptions;
}): Promise<AtlasPage[]> {
  const { frames, baseName, options } = params;
  if (frames.length === 0) return [];

  const normalizedOptions: AtlasPackOptions = {
    maxSize: clamp(toFiniteNumber(options.maxSize, 2048), 256, 8192),
    padding: clamp(toFiniteNumber(options.padding, 2), 0, 64),
    trim: !!options.trim,
  };

  const trimmed = await buildTrimmedFrames(frames, normalizedOptions.trim);
  const pages = packShelf(trimmed, normalizedOptions);

  const pad = Math.max(4, String(Math.max(0, frames.length - 1)).length);
  const pagesOut: AtlasPage[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];

    const canvas = document.createElement('canvas');
    // 不强制 2 的幂：优先保持图集更小，避免内存压力导致 toBlob 失败
    canvas.width = clamp(page.w, 1, normalizedOptions.maxSize);
    canvas.height = clamp(page.h, 1, normalizedOptions.maxSize);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 画布不可用，无法绘制图集');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const framesJson: Record<string, any> = {};
    for (const p of page.placed) {
      // eslint-disable-next-line no-undef
      const bmp = await createImageBitmap(p.blob);
      try {
        const frameName = `${baseName}_${padNumber(p.index, pad)}.png`;
        ctx.drawImage(
          bmp,
          p.srcX,
          p.srcY,
          p.srcW,
          p.srcH,
          p.x,
          p.y,
          p.srcW,
          p.srcH,
        );
        framesJson[frameName] = {
          frame: { x: p.x, y: p.y, w: p.srcW, h: p.srcH },
          rotated: false,
          trimmed: options.trim,
          spriteSourceSize: { x: p.srcX, y: p.srcY, w: p.srcW, h: p.srcH },
          sourceSize: { w: p.fullW, h: p.fullH },
        };
      } finally {
        try { bmp.close(); } catch { }
      }
    }

    const suffix = pages.length > 1 ? `_p${pageIndex}` : '';
    const imageFileName = `${baseName}${suffix}.png`;
    const jsonFileName = `${baseName}${suffix}.json`;

    const imageBlob = await canvasToPngBlob(canvas);
    const json = {
      frames: framesJson,
      meta: {
        app: 'ActionHub',
        version: '1.0',
        image: imageFileName,
        format: 'RGBA8888',
        size: { w: canvas.width, h: canvas.height },
        scale: '1',
      }
    };

    pagesOut.push({ imageBlob, json, imageFileName, jsonFileName });
  }

  return pagesOut;
}
