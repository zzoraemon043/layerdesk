import { memo, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { DropPosition } from '../model/commands';
import type { Surface } from '../model/surface';
import type { LayerDocument, LayerNode, NodeId } from '../model/types';
import { useI18n } from '../i18n/I18nProvider';
import { Icon } from './Icon';

interface LayerPanelProps {
  document: LayerDocument;
  selection: NodeId[];
  onSelect(ids: NodeId[]): void;
  onToggleVisibility(id: NodeId, hidden: boolean): void;
  onToggleLock(id: NodeId, locked: boolean): void;
  onToggleOpen(id: NodeId, opened: boolean): void;
  onRename(id: NodeId, name: string): void;
  onDrop(ids: NodeId[], referenceId: NodeId, position: DropPosition): void;
  onGroup(): void;
  onUngroup(): void;
  onDuplicate(): void;
  onDelete(): void;
  canUngroup: boolean;
}

interface Row {
  node: LayerNode;
  depth: number;
  hiddenByParent: boolean;
}

function visibleRows(nodes: LayerNode[], depth: number, hiddenByParent: boolean): Row[] {
  const rows: Row[] = [];
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    rows.push({ node, depth, hiddenByParent });
    if (node.kind === 'group' && node.opened) {
      rows.push(...visibleRows(node.children, depth + 1, hiddenByParent || node.hidden));
    }
  }
  return rows;
}

const Thumbnail = memo(function Thumbnail({ surface }: { surface: Surface | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!surface) {
      return;
    }
    const scale = Math.min(canvas.width / surface.width, canvas.height / surface.height);
    const width = surface.width * scale;
    const height = surface.height * scale;
    context.drawImage(surface, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }, [surface]);
  return <canvas ref={ref} className="thumbnail" width={32} height={32} aria-hidden="true" />;
});

function dropPositionFor(event: DragEvent<HTMLElement>, node: LayerNode): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  if (node.kind === 'group' && ratio > 0.25 && ratio < 0.75) {
    return 'inside';
  }
  return ratio < 0.5 ? 'above' : 'below';
}

export function LayerPanel(props: LayerPanelProps) {
  const { t } = useI18n();
  const { document, selection } = props;
  const [editing, setEditing] = useState<NodeId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: NodeId; position: DropPosition } | null>(null);
  const dragged = useRef<NodeId[]>([]);
  const lastClicked = useRef<NodeId | null>(null);
  const rows = visibleRows(document.children, 0, false);

  const onRowClick = (event: MouseEvent, id: NodeId) => {
    if (event.ctrlKey || event.metaKey) {
      props.onSelect(selection.includes(id) ? selection.filter((selected) => selected !== id) : [...selection, id]);
    } else if (event.shiftKey && lastClicked.current) {
      const ids = rows.map((row) => row.node.id);
      const from = ids.indexOf(lastClicked.current);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        props.onSelect(ids.slice(Math.min(from, to), Math.max(from, to) + 1));
        return;
      }
      props.onSelect([id]);
    } else {
      props.onSelect([id]);
    }
    lastClicked.current = id;
  };

  return (
    <div className="layer-panel">
      {rows.length === 0 ? <p className="muted panel-note">{t('layers.empty')}</p> : null}
      <ul className="layer-list" role="tree" aria-multiselectable="true" aria-label={t('tabs.layers')}>
        {rows.map(({ node, depth, hiddenByParent }) => {
          const selected = selection.includes(node.id);
          const marker = dropTarget?.id === node.id ? `drop-${dropTarget.position}` : '';
          return (
            <li
              key={node.id}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={node.kind === 'group' ? node.opened : undefined}
              data-testid="layer-row"
              data-name={node.name}
              className={['layer-row', selected ? 'selected' : '', hiddenByParent || node.hidden ? 'dimmed' : '', marker].join(' ')}
              style={{ paddingLeft: 6 + depth * 16 }}
              draggable={editing !== node.id}
              onClick={(event) => onRowClick(event, node.id)}
              onDragStart={(event) => {
                dragged.current = selected ? selection : [node.id];
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', node.name);
              }}
              onDragOver={(event) => {
                if (dragged.current.length === 0) {
                  return;
                }
                event.preventDefault();
                setDropTarget({ id: node.id, position: dropPositionFor(event, node) });
              }}
              onDragLeave={() => setDropTarget((current) => (current?.id === node.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const position = dropPositionFor(event, node);
                setDropTarget(null);
                if (dragged.current.length > 0) {
                  props.onDrop(dragged.current, node.id, position);
                }
                dragged.current = [];
              }}
              onDragEnd={() => {
                dragged.current = [];
                setDropTarget(null);
              }}
            >
              {node.kind === 'group' ? (
                <button
                  className="icon-button small"
                  aria-label={node.opened ? t('layers.collapse') : t('layers.expand')}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onToggleOpen(node.id, !node.opened);
                  }}
                >
                  <Icon name={node.opened ? 'chevronDown' : 'chevronRight'} size={14} />
                </button>
              ) : (
                <span className="caret-spacer" />
              )}
              <button
                className="icon-button small"
                aria-label={node.hidden ? t('layers.show') : t('layers.hide')}
                aria-pressed={!node.hidden}
                data-testid="visibility"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggleVisibility(node.id, !node.hidden);
                }}
              >
                <Icon name={node.hidden ? 'eyeOff' : 'eye'} size={15} />
              </button>
              {node.kind === 'group' ? <span className="thumbnail folder"><Icon name="folder" size={18} /></span> : <Thumbnail surface={node.surface} />}
              {node.clipping ? <Icon name="clip" size={13} /> : null}
              {editing === node.id ? (
                <input
                  className="rename"
                  autoFocus
                  defaultValue={node.name}
                  aria-label={t('props.name')}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    setEditing(null);
                    if (event.currentTarget.value !== node.name) {
                      props.onRename(node.id, event.currentTarget.value);
                    }
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      event.currentTarget.value = node.name;
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <span className="layer-name" onDoubleClick={() => setEditing(node.id)} title={node.name}>
                  {node.name || ' '}
                </span>
              )}
              <button
                className={node.locked ? 'icon-button small active' : 'icon-button small faint'}
                aria-label={node.locked ? t('layers.unlock') : t('layers.lock')}
                aria-pressed={node.locked}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggleLock(node.id, !node.locked);
                }}
              >
                <Icon name={node.locked ? 'lock' : 'unlock'} size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="panel-actions">
        <button className="icon-button" onClick={props.onGroup} disabled={selection.length === 0} title={t('layers.newGroup')} aria-label={t('layers.newGroup')}>
          <Icon name="group" />
        </button>
        <button className="icon-button" onClick={props.onUngroup} disabled={!props.canUngroup} title={t('layers.ungroup')} aria-label={t('layers.ungroup')}>
          <Icon name="ungroup" />
        </button>
        <button className="icon-button" onClick={props.onDuplicate} disabled={selection.length === 0} title={t('layers.duplicate')} aria-label={t('layers.duplicate')}>
          <Icon name="duplicate" />
        </button>
        <button className="icon-button" onClick={props.onDelete} disabled={selection.length === 0} title={t('layers.delete')} aria-label={t('layers.delete')}>
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}
