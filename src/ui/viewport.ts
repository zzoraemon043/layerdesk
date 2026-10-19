export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const minZoom = 0.02;
export const maxZoom = 64;

export function clampZoom(zoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export function fitViewport(document: Size, view: Size, padding = 32): Viewport {
  if (view.width <= 0 || view.height <= 0) {
    return { zoom: 1, x: 0, y: 0 };
  }
  const zoom = clampZoom(Math.min(1, (view.width - padding * 2) / document.width, (view.height - padding * 2) / document.height));
  return centered(document, view, zoom);
}

export function centered(document: Size, view: Size, zoom: number): Viewport {
  return { zoom, x: (view.width - document.width * zoom) / 2, y: (view.height - document.height * zoom) / 2 };
}

export function zoomAround(viewport: Viewport, zoom: number, screenX: number, screenY: number): Viewport {
  const next = clampZoom(zoom);
  const docX = (screenX - viewport.x) / viewport.zoom;
  const docY = (screenY - viewport.y) / viewport.zoom;
  return { zoom: next, x: screenX - docX * next, y: screenY - docY * next };
}

export function screenToDocument(viewport: Viewport, screenX: number, screenY: number) {
  return { x: (screenX - viewport.x) / viewport.zoom, y: (screenY - viewport.y) / viewport.zoom };
}

export function documentToScreen(viewport: Viewport, x: number, y: number) {
  return { x: x * viewport.zoom + viewport.x, y: y * viewport.zoom + viewport.y };
}
