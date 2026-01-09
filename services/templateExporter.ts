import JSZip from 'jszip';
import { AnimationItem, OfficialTemplateIndexEntry, TemplatePack } from '../types';

const buildIndexEntry = (pack: TemplatePack, item: AnimationItem): OfficialTemplateIndexEntry => {
  const templateId = pack.meta.template_id;
  const version = pack.meta.version;
  const skeletonName = item.files.skeleton?.name || 'skeleton.json';
  const atlasName = item.files.atlas?.name || 'skeleton.atlas';
  const imageNames = item.files.images.map(img => img.name);

  return {
    template_id: templateId,
    version,
    name: item.name || templateId,
    base_path: `/template_packs/${templateId}/${version}`,
    spine: {
      skeleton: skeletonName,
      atlas: atlasName,
      images: imageNames,
    },
    pack: {
      meta: 'template_meta.json',
      attachment_manifest: 'attachment_manifest.json',
      action_manifest: 'action_manifest.json',
      export_profile: 'export_profile.json',
    },
  };
};

export const exportTemplateZip = async (params: {
  pack: TemplatePack;
  item: AnimationItem;
}) => {
  const { pack, item } = params;
  if (!item.files.skeleton || !item.files.atlas) {
    throw new Error('模板资产缺少骨架或图集文件。');
  }

  const templateId = pack.meta.template_id;
  const version = pack.meta.version;
  const folderRoot = `${templateId}/${version}`;
  const zip = new JSZip();

  zip.file(`${folderRoot}/template_meta.json`, JSON.stringify(pack.meta, null, 2));
  zip.file(`${folderRoot}/attachment_manifest.json`, JSON.stringify(pack.attachment_manifest, null, 2));
  zip.file(`${folderRoot}/action_manifest.json`, JSON.stringify(pack.action_manifest, null, 2));
  zip.file(`${folderRoot}/export_profile.json`, JSON.stringify(pack.export_profile, null, 2));

  zip.file(`${folderRoot}/${item.files.skeleton.name}`, item.files.skeleton);
  zip.file(`${folderRoot}/${item.files.atlas.name}`, item.files.atlas);
  item.files.images.forEach((img) => {
    zip.file(`${folderRoot}/${img.name}`, img);
  });

  const indexEntry = buildIndexEntry(pack, item);
  zip.file('index_entry.json', JSON.stringify(indexEntry, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return {
    blob,
    filename: `template_pack_${templateId}_${version}.zip`,
    indexEntry,
  };
};
