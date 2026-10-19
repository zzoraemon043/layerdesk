export type Surface = HTMLCanvasElement;

type SurfaceFactory = (width: number, height: number) => Surface;

function createDomSurface(width: number, height: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

let surfaceFactory: SurfaceFactory = createDomSurface;

export function setSurfaceFactory(factory: SurfaceFactory) {
  surfaceFactory = factory;
}

export function createSurface(width: number, height: number): Surface {
  return surfaceFactory(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
}

export function context2d(surface: Surface): CanvasRenderingContext2D {
  const context = surface.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D is not available');
  }
  return context;
}

export function surfaceFromPixels(width: number, height: number, data: ArrayLike<number>): Surface {
  const surface = createSurface(width, height);
  const context = context2d(surface);
  const image = context.createImageData(width, height);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  return surface;
}

export function pixelsOf(surface: Surface): ImageData {
  return context2d(surface).getImageData(0, 0, surface.width, surface.height);
}
