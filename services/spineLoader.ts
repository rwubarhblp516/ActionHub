// This service mocks the interaction with the @esotericsoftware/spine-webgl library.
// Since we cannot import the actual heavy webgl library in this environment, 
// we structure the code to show exactly how it would be implemented.

import { AnimationItem, SpineFiles } from '../types';

// Helper to determine file type based on extension
export const getFileType = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.skel')) return 'skel';
  if (lower.endsWith('.spine')) return 'spine'; // Project file
  if (lower.endsWith('.atlas')) return 'atlas';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) return 'image';
  return 'unknown';
};

// Group files into logical animation sets based on directory structure
export const groupFilesByDirectory = (fileList: FileList): AnimationItem[] => {
  const fileArray = Array.from(fileList);
  
  // 1. Map directory path -> components
  const dirMap: Record<string, { 
    skeleton: File | null, 
    atlas: File | null, 
    images: File[],
    skeletonType: 'skel' | 'json' | 'spine' | null
  }> = {};

  const getDir = (path: string) => {
    if (!dirMap[path]) {
      dirMap[path] = { skeleton: null, atlas: null, images: [], skeletonType: null };
    }
    return dirMap[path];
  };

  // 2. Initial pass: categorize files by their immediate parent directory
  fileArray.forEach((file) => {
    // webkitRelativePath example: "Parent/Child/file.png"
    const pathParts = file.webkitRelativePath.split('/');
    pathParts.pop(); // Remove filename
    const dirPath = pathParts.join('/');
    
    // Skip hidden files/folders
    if (file.name.startsWith('.') || dirPath.split('/').some(p => p.startsWith('.'))) return;

    const entry = getDir(dirPath);
    const type = getFileType(file.name);

    if (type === 'skel' || type === 'json' || type === 'spine') {
      // Smart Priority Logic: skel > json > spine
      const currentType = entry.skeletonType;
      let shouldReplace = false;

      if (!entry.skeleton) {
        shouldReplace = true;
      } else {
        // If we have a spine project file, always overwrite with an export file (skel/json)
        if (currentType === 'spine' && (type === 'skel' || type === 'json')) shouldReplace = true;
        // If we have json, prefer binary skel (usually cleaner export)
        else if (currentType === 'json' && type === 'skel') shouldReplace = true;
      }

      if (shouldReplace) {
        entry.skeleton = file;
        entry.skeletonType = type as any;
      }
    } else if (type === 'atlas') {
      // If multiple atlases exist, prefer one that matches the skeleton name if possible
      // For now, simpler logic: take the first one, or override if we find a better name match?
      // Keeping it simple: just take the file.
      if (!entry.atlas) entry.atlas = file;
      else if (entry.skeleton && file.name.startsWith(entry.skeleton.name.split('.')[0])) {
         entry.atlas = file;
      }
    } else if (type === 'image') {
      entry.images.push(file);
    }
  });

  // 3. Identify valid roots and gather images from subdirectories
  const validItems: AnimationItem[] = [];
  
  // A folder is a "Root" if it contains a Skeleton and an Atlas
  const roots = Object.keys(dirMap).filter(path => {
      const entry = dirMap[path];
      // We accept spine file as a fallback, but practically runtime needs skel/json
      return entry.skeleton && entry.atlas; 
  });

  roots.forEach(rootPath => {
    const rootEntry = dirMap[rootPath];
    if (!rootEntry.skeleton || !rootEntry.atlas) return;

    // Collect images:
    // 1. From the root folder itself
    // 2. From any subfolder (e.g. root/images/), UNLESS that subfolder is a separate valid root
    const collectedImages: File[] = [];

    Object.keys(dirMap).forEach(path => {
      // Check if path is the root or a subfolder of root
      if (path === rootPath || path.startsWith(rootPath + '/')) {
        // If this subfolder is actually ANOTHER animation root (nested project), don't steal its images
        if (path !== rootPath && roots.includes(path)) return;
        
        collectedImages.push(...dirMap[path].images);
      }
    });

    if (collectedImages.length > 0) {
      validItems.push({
        id: crypto.randomUUID(),
        name: rootPath.split('/').pop() || 'Untitled',
        files: {
          skeleton: rootEntry.skeleton,
          atlas: rootEntry.atlas,
          images: collectedImages,
          basePath: rootPath
        },
        animationNames: [], // To be populated by parsing skeleton data later
        defaultAnimation: '',
        status: 'idle'
      });
    }
  });

  return validItems;
};

// Utility to create object URLs for assets
export const createAssetUrls = (files: SpineFiles) => {
  const urls: Record<string, string> = {};
  
  // Skeleton
  if (files.skeleton) urls[files.skeleton.name] = URL.createObjectURL(files.skeleton);
  
  // Atlas
  if (files.atlas) urls[files.atlas.name] = URL.createObjectURL(files.atlas);
  
  // Images - Map filename to Blob URL
  files.images.forEach(img => {
    urls[img.name] = URL.createObjectURL(img);
  });

  return urls;
};

export const revokeAssetUrls = (urls: Record<string, string>) => {
  Object.values(urls).forEach(url => URL.revokeObjectURL(url));
};