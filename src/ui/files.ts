import type { Surface } from '../model/surface';

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandle {
  createWritable(): Promise<WritableFile>;
}

type SaveFilePicker = (options: SaveFilePickerOptions) => Promise<FileHandle>;

export async function saveBlob(blob: Blob, fileName: string, description: string, extension: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker && !navigator.webdriver) {
    try {
      const handle = await picker({ suggestedName: fileName, types: [{ description, accept: { [blob.type || 'application/octet-stream']: [extension] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

export function surfaceToBlob(surface: Surface): Promise<Blob> {
  return new Promise((resolve, reject) => {
    surface.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

export async function encodePng(surface: Surface): Promise<Uint8Array> {
  return new Uint8Array(await (await surfaceToBlob(surface)).arrayBuffer());
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.(psd|psb)$/i, '');
}

export function looksLikePsd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}
