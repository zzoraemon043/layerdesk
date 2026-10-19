import type { BlendMode } from 'ag-psd';
import { useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { boundsOf, findNode, unionBounds } from '../model/tree';
import type { LayerDocument, LayerNode, NodeId } from '../model/types';
import { editableBlendModes, isBlendModeRendered } from '../render/blend';

interface PropertiesPanelProps {
  document: LayerDocument;
  selection: NodeId[];
  onRename(id: NodeId, name: string): void;
  onPosition(dx: number, dy: number): void;
  onOpacityPreviewStart(): void;
  onOpacityPreview(opacity: number): void;
  onOpacityPreviewEnd(): void;
  onOpacity(opacity: number): void;
  onBlendMode(mode: BlendMode): void;
  onClipping(clipping: boolean): void;
  onLocked(locked: boolean): void;
}

function kindNotes(node: LayerNode): MessageKey[] {
  const notes: MessageKey[] = [];
  const { source } = node;
  if (source.text) {
    notes.push('props.kind.text');
  }
  if (source.placedLayer) {
    notes.push('props.kind.smart');
  }
  if (source.adjustment) {
    notes.push('props.kind.adjustment');
  }
  if (source.vectorFill) {
    notes.push('props.kind.fill');
  }
  if (source.effects && !source.effects.disabled) {
    notes.push('props.kind.effects');
  }
  if (!isBlendModeRendered(node.blendMode)) {
    notes.push('props.unrenderedBlend');
  }
  return notes;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, disabled, onCommit }: { label: string; value: number; disabled?: boolean; onCommit(value: number): void }) {
  return (
    <Field label={label}>
      <input
        key={value}
        type="number"
        className="input number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next) && next !== value) {
            onCommit(Math.round(next));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { t } = useI18n();
  const previewing = useRef(false);
  const blendLabel = (mode: BlendMode) => {
    const key = `blend.${mode}` as MessageKey;
    const label = t(key);
    return label === key ? mode : label;
  };
  const nodes = props.selection.map((id) => findNode(props.document, id)).filter((node): node is LayerNode => !!node);

  if (nodes.length === 0) {
    return (
      <section className="properties" aria-label={t('props.title')}>
        <p className="muted panel-note">{t('props.none')}</p>
      </section>
    );
  }

  const first = nodes[0];
  const bounds = unionBounds(nodes.map(boundsOf));
  const single = nodes.length === 1;
  const blendModes: BlendMode[] = editableBlendModes.includes(first.blendMode) || first.blendMode === 'pass through' ? editableBlendModes : [first.blendMode, ...editableBlendModes];
  const opacity = Math.round(first.opacity * 100);
  const locked = nodes.every((node) => node.locked);

  return (
    <section className="properties" aria-label={t('props.title')}>
      {single ? (
        <Field label={t('props.name')}>
          <input
            key={first.id + first.name}
            className="input"
            defaultValue={first.name}
            onBlur={(event) => event.currentTarget.value !== first.name && props.onRename(first.id, event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </Field>
      ) : (
        <p className="panel-note">{t('props.multiple', { count: nodes.length })}</p>
      )}
      {bounds ? (
        <div className="field-grid">
          <NumberField label={t('props.x')} value={bounds.left} disabled={locked} onCommit={(value) => props.onPosition(value - bounds.left, 0)} />
          <NumberField label={t('props.y')} value={bounds.top} disabled={locked} onCommit={(value) => props.onPosition(0, value - bounds.top)} />
          <Field label={t('props.width')}>
            <output className="input readonly">{bounds.right - bounds.left}</output>
          </Field>
          <Field label={t('props.height')}>
            <output className="input readonly">{bounds.bottom - bounds.top}</output>
          </Field>
        </div>
      ) : null}
      <Field label={`${t('props.opacity')} ${opacity}%`}>
        <input
          type="range"
          className="range"
          min={0}
          max={100}
          value={opacity}
          onPointerDown={() => {
            previewing.current = true;
            props.onOpacityPreviewStart();
          }}
          onPointerUp={() => {
            if (previewing.current) {
              previewing.current = false;
              props.onOpacityPreviewEnd();
            }
          }}
          onChange={(event) => {
            const value = Number(event.currentTarget.value) / 100;
            if (previewing.current) {
              props.onOpacityPreview(value);
            } else {
              props.onOpacity(value);
            }
          }}
        />
      </Field>
      <Field label={t('props.blend')}>
        <select className="input" value={first.kind === 'group' && first.blendMode === 'pass through' ? 'pass through' : first.blendMode} onChange={(event) => props.onBlendMode(event.currentTarget.value as BlendMode)}>
          {first.kind === 'group' ? <option value="pass through">{blendLabel('pass through')}</option> : null}
          {blendModes.map((mode) => (
            <option key={mode} value={mode}>
              {blendLabel(mode)}
            </option>
          ))}
        </select>
      </Field>
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={nodes.every((node) => node.clipping)} onChange={(event) => props.onClipping(event.currentTarget.checked)} />
          {t('props.clipping')}
        </label>
        <label className="check">
          <input type="checkbox" checked={locked} onChange={(event) => props.onLocked(event.currentTarget.checked)} />
          {t('props.locked')}
        </label>
      </div>
      {single
        ? kindNotes(first).map((key) => (
            <p key={key} className="note">
              {t(key)}
            </p>
          ))
        : null}
    </section>
  );
}
