import { createCanvas } from '@napi-rs/canvas';
import { setSurfaceFactory, type Surface } from '../src/model/surface';

setSurfaceFactory((width, height) => createCanvas(width, height) as unknown as Surface);
