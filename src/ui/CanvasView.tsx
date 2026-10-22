import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Surface } from '../model/surface';
import { boundsOf, findNode } from '../model/tree';
import type { LayerDocument, NodeId } from '../model/types';
import { pickLayer } from '../render/hitTest';
import { transformedCorners, type FreeTransform, type Point } from '../render/transform';
import { dragMove, dragRotate, dragScale, pointInQuad, scaleHandles, type Axis } from '../render/transformHandles';
import { isTypingTarget } from './typingTarget';
import { documentToScreen, screenToDocument, zoomAround, type Size, type Viewport } from './viewport';

interface CanvasViewProps {
  document: LayerDocument;
  composite: Surface;
  selection: NodeId[];
  transform: FreeTransform | null;
  autoSelect: boolean;
  viewport: Viewport;
  label: string;
  onViewportChange(viewport: Viewport): void;
  onResize(size: Size): void;
  onSelect(ids: NodeId[]): void;
  onMoveStart(): void;
  onMove(ids: NodeId[], dx: number, dy: number): void;
  onMoveEnd(): void;
  onTransformChange(transform: FreeTransform): void;
  onTransformApply(): void;
}

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; viewport: Viewport }
  | { kind: 'move'; ids: NodeId[]; start: Point; moved: boolean }
  | { kind: 'transform-move'; start: Point; initial: FreeTransform }
  | { kind: 'transform-scale'; sx: Axis; sy: Axis; initial: FreeTransform }
  | { kind: 'transform-rotate'; start: Point; initial: FreeTransform }
  | { kind: 'pinch'; distance: number; center: Point; viewport: Viewport };

const handleRadius = 6;
const rotateReach = 28;

function createCheckerPattern(context: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = window.document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const tileContext = tile.getContext('2d');
  if (!tileContext) {
    return null;
  }
  tileContext.fillStyle = '#ffffff';
  tileContext.fillRect(0, 0, 16, 16);
  tileContext.fillStyle = '#d9dce1';
  tileContext.fillRect(0, 0, 8, 8);
  tileContext.fillRect(8, 8, 8, 8);
  return context.createPattern(tile, 'repeat');
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function CanvasView(props: CanvasViewProps) {
  const { document, composite, selection, transform, viewport } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [cursor, setCursor] = useState('default');
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const latest = useRef(props);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) };
      setSize(next);
      latest.current.onResize(next);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const current = latest.current.viewport;
      if (event.ctrlKey || event.metaKey || !event.shiftKey) {
        const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
        latest.current.onViewportChange(zoomAround(current, current.zoom * factor, event.clientX - rect.left, event.clientY - rect.top));
      } else {
        latest.current.onViewportChange({ ...current, x: current.x - event.deltaY, y: current.y - event.deltaX });
      }
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const documentWidth = document.width * viewport.zoom;
    const documentHeight = document.height * viewport.zoom;
    const pattern = createCheckerPattern(context);
    if (pattern) {
      context.fillStyle = pattern;
      context.fillRect(viewport.x, viewport.y, documentWidth, documentHeight);
    }
    context.imageSmoothingEnabled = viewport.zoom < 2;
    context.drawImage(composite, viewport.x, viewport.y, documentWidth, documentHeight);
    context.strokeStyle = 'rgba(0,0,0,0.5)';
    context.lineWidth = 1;
    context.strokeRect(Math.round(viewport.x) - 0.5, Math.round(viewport.y) - 0.5, Math.round(documentWidth) + 1, Math.round(documentHeight) + 1);

    if (transform) {
      const corners = transformedCorners(transform).map((point) => documentToScreen(viewport, point.x, point.y));
      context.strokeStyle = '#4da3ff';
      context.lineWidth = 1.5;
      context.beginPath();
      corners.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
      context.closePath();
      context.stroke();
      context.fillStyle = '#ffffff';
      for (const handle of scaleHandles(transform)) {
        const point = documentToScreen(viewport, handle.point.x, handle.point.y);
        context.fillRect(point.x - handleRadius / 1.5, point.y - handleRadius / 1.5, (handleRadius * 4) / 3, (handleRadius * 4) / 3);
        context.strokeRect(point.x - handleRadius / 1.5, point.y - handleRadius / 1.5, (handleRadius * 4) / 3, (handleRadius * 4) / 3);
      }
      return;
    }
    context.setLineDash([4, 3]);
    context.strokeStyle = '#4da3ff';
    for (const id of selection) {
      const node = findNode(document, id);
      const bounds = node && boundsOf(node);
      if (!bounds) {
        continue;
      }
      const topLeft = documentToScreen(viewport, bounds.left, bounds.top);
      const bottomRight = documentToScreen(viewport, bounds.right, bounds.bottom);
      context.strokeRect(Math.round(topLeft.x) + 0.5, Math.round(topLeft.y) + 0.5, Math.round(bottomRight.x - topLeft.x), Math.round(bottomRight.y - topLeft.y));
    }
    context.setLineDash([]);
  }, [composite, document, selection, size, transform, viewport]);

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const transformGesture = (screen: Point, active: FreeTransform): Gesture | null => {
    const documentPoint = screenToDocument(viewport, screen.x, screen.y);
    for (const handle of scaleHandles(active)) {
      if (distance(documentToScreen(viewport, handle.point.x, handle.point.y), screen) <= handleRadius + 2) {
        return { kind: 'transform-scale', sx: handle.sx, sy: handle.sy, initial: active };
      }
    }
    const corners = transformedCorners(active);
    if (pointInQuad(documentPoint, corners)) {
      return { kind: 'transform-move', start: documentPoint, initial: active };
    }
    const nearCorner = corners.some((corner) => distance(documentToScreen(viewport, corner.x, corner.y), screen) <= rotateReach);
    return nearCorner ? { kind: 'transform-rotate', start: documentPoint, initial: active } : null;
  };

  const cursorFor = (screen: Point): string => {
    if (spaceHeld) {
      return 'grab';
    }
    if (!transform) {
      return 'default';
    }
    const candidate = transformGesture(screen, transform);
    if (!candidate) {
      return 'default';
    }
    if (candidate.kind === 'transform-scale') {
      return candidate.sx === 0 ? 'ns-resize' : candidate.sy === 0 ? 'ew-resize' : candidate.sx === candidate.sy ? 'nwse-resize' : 'nesw-resize';
    }
    return candidate.kind === 'transform-rotate' ? 'alias' : 'move';
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = { kind: 'pinch', distance: distance(a, b), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, viewport };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event);
    pointers.current.set(event.pointerId, screen);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      if (gesture.current?.kind === 'move') {
        props.onMoveEnd();
      }
      startPinch();
      return;
    }
    if (spaceHeld || event.button === 1) {
      gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, viewport };
      setCursor('grabbing');
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (transform) {
      gesture.current = transformGesture(screen, transform);
      return;
    }
    const point = screenToDocument(viewport, screen.x, screen.y);
    let ids = selection;
    if (props.autoSelect) {
      const current = selection.length === 1 ? selection[0] : null;
      const picked = pickLayer(document, point.x, point.y, event.altKey ? current : null);
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        ids = picked ? (selection.includes(picked) ? selection.filter((id) => id !== picked) : [...selection, picked]) : selection;
        props.onSelect(ids);
        return;
      }
      ids = picked ? (selection.includes(picked) && !event.altKey ? selection : [picked]) : [];
      props.onSelect(ids);
    }
    if (ids.length === 0) {
      return;
    }
    props.onMoveStart();
    gesture.current = { kind: 'move', ids, start: point, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event);
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, screen);
    }
    const active = gesture.current;
    if (!active) {
      setCursor(cursorFor(screen));
      return;
    }
    const point = screenToDocument(viewport, screen.x, screen.y);
    switch (active.kind) {
      case 'pinch': {
        if (pointers.current.size < 2) {
          return;
        }
        const [a, b] = [...pointers.current.values()];
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoomed = zoomAround(active.viewport, (active.viewport.zoom * distance(a, b)) / active.distance, active.center.x, active.center.y);
        props.onViewportChange({ ...zoomed, x: zoomed.x + center.x - active.center.x, y: zoomed.y + center.y - active.center.y });
        return;
      }
      case 'pan':
        props.onViewportChange({ ...active.viewport, x: active.viewport.x + event.clientX - active.startX, y: active.viewport.y + event.clientY - active.startY });
        return;
      case 'move': {
        const dx = Math.round(point.x - active.start.x);
        const dy = Math.round(point.y - active.start.y);
        if (dx !== 0 || dy !== 0 || active.moved) {
          active.moved = true;
          props.onMove(active.ids, dx, dy);
        }
        return;
      }
      case 'transform-move':
        props.onTransformChange(dragMove(active.initial, point.x - active.start.x, point.y - active.start.y));
        return;
      case 'transform-scale':
        props.onTransformChange(dragScale(active.initial, active.sx, active.sy, point, event.shiftKey));
        return;
      case 'transform-rotate':
        props.onTransformChange(dragRotate(active.initial, active.start, point, event.shiftKey));
        return;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    const active = gesture.current;
    if (active?.kind === 'pinch' && pointers.current.size > 0) {
      gesture.current = null;
      return;
    }
    gesture.current = null;
    if (active?.kind === 'move') {
      props.onMoveEnd();
    }
    setCursor(cursorFor(localPoint(event)));
  };

  return (
    <div ref={containerRef} className="canvas-host">
      <canvas
        ref={canvasRef}
        className="canvas"
        role="img"
        aria-label={props.label}
        data-testid="canvas"
        style={{ cursor: spaceHeld && cursor === 'default' ? 'grab' : cursor, width: size.width, height: size.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => transform && props.onTransformApply()}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
