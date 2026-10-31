import { zipSync } from 'fflate';
import { context2d, createSurface, type Surface } from '../model/surface';
import type { GroupLayer, LayerDocument, LayerNode, PixelLayer } from '../model/types';

export type PngEncoder = (surface: Surface) => Promise<Uint8Array>;

export interface LayerEntry {
  name: string;
  path: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  blendMode: string;
  visible: boolean;
  order: number;
}

export interface LayerManifest {
  width: number;
  height: number;
  layers: LayerEntry[];
}

const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return 'layer';
  }
  return reservedNames.test(cleaned) ? `_${cleaned}` : cleaned;
}

// 以小寫比較：Windows、macOS 預設的檔案系統不分大小寫，Hand.png 與 hand.png 解壓會互相覆蓋
function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path.toLowerCase())) {
    used.add(path.toLowerCase());
    return path;
  }
  const extensionIndex = path.lastIndexOf('.');
  const stem = path.slice(0, extensionIndex);
  const extension = path.slice(extensionIndex);
  let counter = 2;
  while (used.has(`${stem}_${counter}${extension}`.toLowerCase())) {
    counter++;
  }
  const unique = `${stem}_${counter}${extension}`;
  used.add(unique.toLowerCase());
  return unique;
}

interface PlannedLayer {
  layer: PixelLayer;
  entry: LayerEntry;
}

export function planLayerExport(document: LayerDocument, keepFolders: boolean): PlannedLayer[] {
  const planned: PlannedLayer[] = [];
  const used = new Set<string>();
  const visit = (nodes: LayerNode[], folders: string[], parentVisible: boolean) => {
    for (const node of nodes) {
      const visible = parentVisible && !node.hidden;
      if (node.kind === 'group') {
        visit((node as GroupLayer).children, keepFolders ? [...folders, safeFileName(node.name)] : folders, visible);
        continue;
      }
      if (!node.surface || node.width === 0 || node.height === 0) {
        continue;
      }
      const path = uniquePath([...folders, `${safeFileName(node.name)}.png`].join('/'), used);
      planned.push({
        layer: node,
        entry: {
          name: node.name,
          path,
          left: node.left,
          top: node.top,
          width: node.width,
          height: node.height,
          opacity: node.opacity,
          blendMode: node.blendMode,
          visible,
          order: planned.length,
        },
      });
    }
  };
  visit(document.children, [], true);
  return planned;
}

export function maskedLayerSurface(layer: PixelLayer): Surface | null {
  if (!layer.surface) {
    return null;
  }
  if (!layer.mask || layer.mask.disabled) {
    return layer.surface;
  }
  const { mask } = layer;
  const surface = createSurface(layer.width, layer.height);
  const context = context2d(surface);
  context.drawImage(layer.surface, 0, 0);
  const alpha = createSurface(layer.width, layer.height);
  const alphaContext = context2d(alpha);
  if (mask.defaultColor > 0) {
    alphaContext.fillStyle = `rgba(0,0,0,${mask.defaultColor / 255})`;
    alphaContext.fillRect(0, 0, layer.width, layer.height);
    alphaContext.clearRect(mask.left - layer.left, mask.top - layer.top, mask.width, mask.height);
  }
  if (mask.surface) {
    alphaContext.drawImage(mask.surface, mask.left - layer.left, mask.top - layer.top);
  }
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(alpha, 0, 0);
  return surface;
}

export async function buildLayerZip(document: LayerDocument, keepFolders: boolean, encode: PngEncoder): Promise<Uint8Array> {
  const planned = planLayerExport(document, keepFolders);
  const files: Record<string, Uint8Array> = {};
  for (const { layer, entry } of planned) {
    const surface = maskedLayerSurface(layer);
    if (surface) {
      files[entry.path] = await encode(surface);
    }
  }
  const manifest: LayerManifest = { width: document.width, height: document.height, layers: planned.map(({ entry }) => entry) };
  files['layers.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 0 });
}
