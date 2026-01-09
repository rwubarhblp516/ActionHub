import { AnimationItem, LocalTemplateSummary, OfficialTemplateIndexEntry, TemplatePack } from '../types';

type StoredFile = {
  name: string;
  type: string;
  blob: Blob;
};

type LocalTemplateRecord = {
  key: string;
  template_id: string;
  version: string;
  name?: string;
  created_at: string;
  pack: TemplatePack;
  files: {
    skeleton: StoredFile;
    atlas: StoredFile;
    images: StoredFile[];
  };
};

const OFFICIAL_INDEX_URL = '/template_packs/index.json';
const DB_NAME = 'actionhub.template.library.v1';
const STORE_NAME = 'templates';

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('浏览器不支持 IndexedDB'));
    return;
  }
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('无法打开模板数据库'));
});

const requestToPromise = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('数据库请求失败'));
});

const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    requestToPromise(req).then(resolve).catch(reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error || new Error('数据库事务失败'));
    tx.onabort = () => reject(tx.error || new Error('数据库事务中断'));
  });
};

const toStoredFile = async (file: File): Promise<StoredFile> => ({
  name: file.name,
  type: file.type || 'application/octet-stream',
  blob: file,
});

const fromStoredFile = (stored: StoredFile) =>
  new File([stored.blob], stored.name, { type: stored.type || 'application/octet-stream' });

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`无法加载模板文件: ${url}`);
  return res.json() as Promise<T>;
};

const fetchAsFile = async (url: string, name: string): Promise<File> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`无法加载模板资源: ${url}`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
};

export const fetchOfficialTemplateIndex = async (): Promise<OfficialTemplateIndexEntry[]> => {
  try {
    const res = await fetch(OFFICIAL_INDEX_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data?.templates)) return data.templates as OfficialTemplateIndexEntry[];
    return [];
  } catch {
    return [];
  }
};

export const loadOfficialTemplateFiles = async (entry: OfficialTemplateIndexEntry) => {
  const base = entry.base_path || `/template_packs/${entry.template_id}/${entry.version}`;
  const skeleton = await fetchAsFile(`${base}/${entry.spine.skeleton}`, entry.spine.skeleton);
  const atlas = await fetchAsFile(`${base}/${entry.spine.atlas}`, entry.spine.atlas);
  const images = await Promise.all(entry.spine.images.map((img) => fetchAsFile(`${base}/${img}`, img)));

  const packPaths = entry.pack || {
    meta: 'template_meta.json',
    attachment_manifest: 'attachment_manifest.json',
    action_manifest: 'action_manifest.json',
    export_profile: 'export_profile.json',
  };

  let pack: TemplatePack | null = null;
  try {
    if (packPaths.meta && packPaths.attachment_manifest && packPaths.action_manifest && packPaths.export_profile) {
      const [meta, attachment_manifest, action_manifest, export_profile] = await Promise.all([
        fetchJson<TemplatePack['meta']>(`${base}/${packPaths.meta}`),
        fetchJson<TemplatePack['attachment_manifest']>(`${base}/${packPaths.attachment_manifest}`),
        fetchJson<TemplatePack['action_manifest']>(`${base}/${packPaths.action_manifest}`),
        fetchJson<TemplatePack['export_profile']>(`${base}/${packPaths.export_profile}`),
      ]);
      pack = { meta, attachment_manifest, action_manifest, export_profile };
    }
  } catch {
    pack = null;
  }

  const item: AnimationItem = {
    id: `template:official:${entry.template_id}:${entry.version}`,
    name: entry.name || `${entry.template_id}@${entry.version}`,
    files: {
      skeleton,
      atlas,
      images,
      basePath: `official/${entry.template_id}/${entry.version}`,
    },
    animationNames: [],
    defaultAnimation: '',
    status: 'idle',
    kind: 'template',
    templateId: entry.template_id,
  };

  return { item, pack };
};

export const saveLocalTemplate = async (params: {
  item: AnimationItem;
  pack: TemplatePack;
  name?: string;
}) => {
  const { item, pack, name } = params;
  if (!item.files.skeleton || !item.files.atlas) throw new Error('模板资产缺少骨架或图集文件。');
  const key = `${pack.meta.template_id}@${pack.meta.version}`;
  const record: LocalTemplateRecord = {
    key,
    template_id: pack.meta.template_id,
    version: pack.meta.version,
    name: name || pack.meta.template_id,
    created_at: new Date().toISOString(),
    pack,
    files: {
      skeleton: await toStoredFile(item.files.skeleton),
      atlas: await toStoredFile(item.files.atlas),
      images: await Promise.all(item.files.images.map(toStoredFile)),
    },
  };
  await withStore('readwrite', store => store.put(record));
  return record;
};

export const listLocalTemplates = async (): Promise<LocalTemplateSummary[]> => {
  try {
    const records = await withStore('readonly', store => store.getAll() as IDBRequest<LocalTemplateRecord[]>);
    return records.map((record) => ({
      key: record.key,
      template_id: record.template_id,
      version: record.version,
      name: record.name,
      created_at: record.created_at,
      attachment_count: record.pack.attachment_manifest.entries.length,
      action_count: record.pack.action_manifest.actions.length,
    })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
};

export const loadLocalTemplate = async (key: string) => {
  const record = await withStore('readonly', store => store.get(key) as IDBRequest<LocalTemplateRecord | undefined>);
  if (!record) throw new Error('找不到本地模板记录。');

  const item: AnimationItem = {
    id: `template:local:${record.template_id}:${record.version}`,
    name: record.name || `${record.template_id}@${record.version}`,
    files: {
      skeleton: fromStoredFile(record.files.skeleton),
      atlas: fromStoredFile(record.files.atlas),
      images: record.files.images.map(fromStoredFile),
      basePath: `local/${record.template_id}/${record.version}`,
    },
    animationNames: [],
    defaultAnimation: '',
    status: 'idle',
    kind: 'template',
    templateId: record.template_id,
  };

  return { item, pack: record.pack };
};
