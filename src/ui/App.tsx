import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { duplicateNodes, groupNodes, moveBy, moveNodes, removeNodes, setProperties, topLevelSelection, ungroup, type NodePropertyPatch } from '../model/commands';
import { findNode } from '../model/tree';
import type { LayerDocument, NodeId } from '../model/types';
import { encodeInWorker, parseInWorker } from '../psd/client';
import { documentFromPsd, readOnlyReason } from '../psd/fromPsd';
import { layersToRasterize, psdFromDocument } from '../psd/toPsd';
import { matchingPixelRatio } from '../render/compare';
import { createCompositor } from '../render/compose';
import { matrixOf } from '../render/transform';
import { buildLayerZip } from '../export/layerExport';
import { samplePsd } from '../sample';
import { CanvasView } from './CanvasView';
import { CheckPanel } from './CheckPanel';
import { Dialog, type DialogSpec } from './Dialog';
import { baseName, encodePng, looksLikePsd, saveBlob, surfaceToBlob } from './files';
import { HelpContent } from './HelpDialog';
import { HistoryPanel } from './HistoryPanel';
import { Icon, type IconName } from './Icon';
import { LayerPanel } from './LayerPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditor } from './useEditor';
import { centered, fitViewport, zoomAround, type Size, type Viewport } from './viewport';

type Tab = 'layers' | 'check' | 'history';
type Status = { tone: 'idle' | 'busy' | 'error'; text: string };

const largeFileBytes = 500 * 1024 * 1024;

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function ToolButton({ icon, label, onClick, disabled, active, testId }: { icon: IconName; label: string; onClick(): void; disabled?: boolean; active?: boolean; testId?: string }) {
  return (
    <button className={active ? 'icon-button active' : 'icon-button'} onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active} data-testid={testId}>
      <Icon name={icon} />
    </button>
  );
}

export function App() {
  const { t, language, setLanguage } = useI18n();
  const editor = useEditor();
  const { document, selection, transform } = editor;
  const compositor = useMemo(() => createCompositor(), []);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });
  const [viewSize, setViewSize] = useState<Size>({ width: 0, height: 0 });
  const [tab, setTab] = useState<Tab>('layers');
  const [autoSelect, setAutoSelect] = useState(true);
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: '' });
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingFit = useRef(false);

  const composite = useMemo(
    () => (document ? compositor.render(document, transform ? { id: transform.id, matrix: matrixOf(transform) } : null) : null),
    [compositor, document, transform],
  );

  const readOnly = document ? readOnlyReason(document) : null;
  const history = editor.history;
  const openedDocument = history && history.past.length === 0 ? history.present.document : null;

  useEffect(() => {
    if (document && pendingFit.current && viewSize.width > 0) {
      pendingFit.current = false;
      setViewport(fitViewport(document, viewSize));
    }
  }, [document, viewSize]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (editor.dirty) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor.dirty]);

  const ask = useCallback(
    (title: string, body: ReactNode, confirmLabel: string): Promise<boolean> =>
      new Promise((resolve) => {
        const close = (value: boolean) => {
          setDialog(null);
          resolve(value);
        };
        setDialog({
          title,
          body,
          onDismiss: () => close(false),
          actions: [
            { label: t('dialog.cancel'), onClick: () => close(false) },
            { label: confirmLabel, primary: true, onClick: () => close(true) },
          ],
        });
      }),
    [t],
  );

  const loadDocument = useCallback(
    (next: LayerDocument) => {
      pendingFit.current = true;
      editor.load(next, t('history.open'));
      setTab('layers');
    },
    [editor, t],
  );

  const openFile = useCallback(
    async (file: File) => {
      if (editor.dirty && !(await ask(t('dialog.unsavedTitle'), t('dialog.unsavedBody'), t('dialog.continue')))) {
        return;
      }
      if (file.size > largeFileBytes && !(await ask(t('dialog.largeTitle'), t('dialog.largeBody', { name: file.name, size: Math.round(file.size / 1048576) }), t('dialog.continue')))) {
        return;
      }
      setStatus({ tone: 'busy', text: t('status.loading', { name: file.name }) });
      try {
        const buffer = await file.arrayBuffer();
        if (!looksLikePsd(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)))) {
          setStatus({ tone: 'error', text: t('status.notPsd') });
          return;
        }
        const psd = await parseInWorker(buffer);
        loadDocument(documentFromPsd(psd, file.name));
        setStatus({ tone: 'idle', text: '' });
      } catch (error) {
        setStatus({ tone: 'error', text: t('status.error', { message: error instanceof Error ? error.message : String(error) }) });
      }
    },
    [ask, editor.dirty, loadDocument, t],
  );

  const openSample = useCallback(async () => {
    if (editor.dirty && !(await ask(t('dialog.unsavedTitle'), t('dialog.unsavedBody'), t('dialog.continue')))) {
      return;
    }
    loadDocument(documentFromPsd(samplePsd((key) => t(key)), t('sample.fileName')));
  }, [ask, editor.dirty, loadDocument, t]);

  const finalComposite = useCallback(() => (document ? compositor.render(document) : null), [compositor, document]);

  const savePsd = useCallback(async () => {
    if (!document || readOnly) {
      return;
    }
    const rasterized = layersToRasterize(document);
    if (
      rasterized.length > 0 &&
      !(await ask(
        t('dialog.rasterizeTitle'),
        <>
          <p>{t('dialog.rasterizeBody')}</p>
          <ul>
            {rasterized.map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        </>,
        t('dialog.continue'),
      ))
    ) {
      return;
    }
    setStatus({ tone: 'busy', text: t('status.saving') });
    try {
      const { psd } = psdFromDocument(document, finalComposite()!);
      const buffer = await encodeInWorker(psd);
      const fileName = /\.psd$/i.test(document.fileName) ? document.fileName : `${baseName(document.fileName)}.psd`;
      if (await saveBlob(new Blob([buffer], { type: 'image/vnd.adobe.photoshop' }), fileName, 'PSD', '.psd')) {
        editor.markSaved(document);
        setStatus({ tone: 'idle', text: t('status.saved', { name: fileName }) });
      } else {
        setStatus({ tone: 'idle', text: '' });
      }
    } catch (error) {
      setStatus({ tone: 'error', text: t('status.saveError', { message: error instanceof Error ? error.message : String(error) }) });
    }
  }, [ask, document, editor, finalComposite, readOnly, t]);

  const exportPng = useCallback(async () => {
    const surface = finalComposite();
    if (!document || !surface) {
      return;
    }
    const fileName = `${baseName(document.fileName)}.png`;
    if (await saveBlob(await surfaceToBlob(surface), fileName, 'PNG', '.png')) {
      setStatus({ tone: 'idle', text: t('status.exported', { name: fileName }) });
    }
  }, [document, finalComposite, t]);

  const exportZip = useCallback(
    async (keepFolders: boolean) => {
      if (!document) {
        return;
      }
      setStatus({ tone: 'busy', text: t('status.saving') });
      const zip = await buildLayerZip(document, keepFolders, encodePng);
      const fileName = `${baseName(document.fileName)}-layers.zip`;
      if (await saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), fileName, 'ZIP', '.zip')) {
        setStatus({ tone: 'idle', text: t('status.exported', { name: fileName }) });
      } else {
        setStatus({ tone: 'idle', text: '' });
      }
    },
    [document, t],
  );

  const exportText = useCallback(
    async (content: string, fileName: string, type: string) => {
      if (await saveBlob(new Blob([content], { type }), fileName, type, fileName.slice(fileName.lastIndexOf('.')))) {
        setStatus({ tone: 'idle', text: t('status.exported', { name: fileName }) });
      }
    },
    [t],
  );

  const setPatch = useCallback((label: MessageKey, ids: NodeId[], patch: NodePropertyPatch) => editor.apply(t(label), (current) => setProperties(current, ids, patch)), [editor, t]);

  const nudge = useCallback((dx: number, dy: number) => editor.apply(t('history.nudge'), (current) => moveBy(current, selection, dx, dy)), [editor, selection, t]);

  const groupSelection = useCallback(() => {
    if (!document || selection.length === 0) {
      return;
    }
    const { document: next, groupId } = groupNodes(document, selection, t('layers.groupName'));
    editor.apply(t('history.group'), () => next);
    if (groupId) {
      editor.select([groupId]);
    }
  }, [document, editor, selection, t]);

  const selectedGroup = document && selection.length === 1 ? findNode(document, selection[0]) : null;
  const canUngroup = selectedGroup?.kind === 'group';

  const ungroupSelection = useCallback(() => {
    if (!selectedGroup || selectedGroup.kind !== 'group') {
      return;
    }
    const childIds = selectedGroup.children.map((child) => child.id);
    editor.apply(t('history.ungroup'), (current) => ungroup(current, selectedGroup.id));
    editor.select(childIds);
  }, [editor, selectedGroup, t]);

  const duplicateSelection = useCallback(() => {
    if (!document || selection.length === 0) {
      return;
    }
    const { document: next, ids } = duplicateNodes(document, selection, t('layers.copySuffix'));
    editor.apply(t('history.duplicate'), () => next);
    editor.select(ids);
  }, [document, editor, selection, t]);

  const deleteSelection = useCallback(() => {
    if (!document || selection.length === 0) {
      return;
    }
    const ids = topLevelSelection(document, selection);
    editor.apply(t('history.delete'), (current) => removeNodes(current, ids));
    editor.select([]);
  }, [document, editor, selection, t]);

  const startTransform = useCallback(() => {
    if (!editor.beginTransform()) {
      setStatus({ tone: 'idle', text: t('transform.needsLayer') });
    }
  }, [editor, t]);

  const zoomBy = useCallback((factor: number) => setViewport((current) => zoomAround(current, current.zoom * factor, viewSize.width / 2, viewSize.height / 2)), [viewSize]);

  const fit = useCallback(() => document && setViewport(fitViewport(document, viewSize)), [document, viewSize]);
  const actualSize = useCallback(() => document && setViewport(centered(document, viewSize, 1)), [document, viewSize]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog || isTypingTarget(event.target)) {
        return;
      }
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 'o') {
        event.preventDefault();
        fileInput.current?.click();
        return;
      }
      if (!document) {
        return;
      }
      if (transform) {
        if (event.key === 'Enter') {
          event.preventDefault();
          editor.applyTransform(t('history.transform'));
        } else if (event.key === 'Escape') {
          event.preventDefault();
          editor.cancelTransform();
        }
        return;
      }
      if (command && key === 's') {
        event.preventDefault();
        void savePsd();
      } else if (command && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        editor.undo();
      } else if ((command && key === 'z' && event.shiftKey) || (command && key === 'y')) {
        event.preventDefault();
        editor.redo();
      } else if (command && key === 't') {
        event.preventDefault();
        startTransform();
      } else if (command && key === 'g') {
        event.preventDefault();
        if (event.shiftKey) {
          ungroupSelection();
        } else {
          groupSelection();
        }
      } else if (command && key === 'j') {
        event.preventDefault();
        duplicateSelection();
      } else if (command && key === '0') {
        event.preventDefault();
        fit();
      } else if (command && key === '1') {
        event.preventDefault();
        actualSize();
      } else if (command && (key === '=' || key === '+')) {
        event.preventDefault();
        zoomBy(1.25);
      } else if (command && key === '-') {
        event.preventDefault();
        zoomBy(0.8);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      } else if (event.key.startsWith('Arrow') && selection.length > 0) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        nudge(dx, dy);
      } else if (event.key === 'Escape') {
        editor.select([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actualSize, deleteSelection, dialog, document, duplicateSelection, editor, fit, groupSelection, nudge, savePsd, selection, startTransform, t, transform, ungroupSelection, zoomBy]);

  const showHelp = () =>
    setDialog({ title: t('help.title'), body: <HelpContent />, onDismiss: () => setDialog(null), actions: [{ label: t('dialog.ok'), primary: true, onClick: () => setDialog(null) }] });

  const onDrop = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void openFile(file);
    }
  };

  return (
    <div
      className={dragOver ? 'app drag-over' : 'app'}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => event.currentTarget === event.target && setDragOver(false)}
      onDrop={onDrop}
    >
      <header className="toolbar">
        <div className="brand">
          <img src="icon.svg" alt="" width={22} height={22} />
          <span>layerdesk</span>
        </div>
        <div className="tool-group">
          <ToolButton icon="open" label={t('toolbar.open')} onClick={() => fileInput.current?.click()} />
          <ToolButton icon="save" label={readOnly ? t(`readonly.${readOnly}`) : t('toolbar.save')} onClick={() => void savePsd()} disabled={!document || !!readOnly} testId="save" />
          <div className="menu-host">
            <ToolButton icon="export" label={t('toolbar.export')} onClick={() => setExportOpen((open) => !open)} disabled={!document} active={exportOpen} testId="export" />
            {exportOpen ? (
              <div className="menu" role="menu" onClick={() => setExportOpen(false)}>
                <button role="menuitem" onClick={() => void exportPng()}>
                  {t('toolbar.exportPng')}
                </button>
                <button role="menuitem" onClick={() => void exportZip(false)}>
                  {t('toolbar.exportZip')}
                </button>
                <button role="menuitem" onClick={() => void exportZip(true)}>
                  {t('toolbar.exportZipFolders')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tool-group">
          <ToolButton icon="undo" label={t('toolbar.undo')} onClick={editor.undo} disabled={!history || history.past.length === 0} testId="undo" />
          <ToolButton icon="redo" label={t('toolbar.redo')} onClick={editor.redo} disabled={!history || history.future.length === 0} testId="redo" />
        </div>
        <div className="tool-group">
          <ToolButton icon="cursor" label={t('toolbar.autoSelect')} onClick={() => setAutoSelect((value) => !value)} active={autoSelect} disabled={!document} />
          <ToolButton icon="transform" label={t('toolbar.transform')} onClick={startTransform} active={!!transform} disabled={!document} testId="transform" />
        </div>
        <div className="tool-group">
          <ToolButton icon="zoomOut" label={t('toolbar.zoomOut')} onClick={() => zoomBy(0.8)} disabled={!document} />
          <button className="zoom-readout" onClick={actualSize} disabled={!document} title={t('toolbar.actualSize')}>
            {Math.round(viewport.zoom * 100)}%
          </button>
          <ToolButton icon="zoomIn" label={t('toolbar.zoomIn')} onClick={() => zoomBy(1.25)} disabled={!document} />
          <ToolButton icon="fit" label={t('toolbar.fit')} onClick={fit} disabled={!document} />
        </div>
        <div className="tool-group end">
          <button className="button ghost" onClick={() => setLanguage(language === 'en' ? 'zh-TW' : 'en')} data-testid="language">
            <Icon name="language" size={16} />
            {t('toolbar.language')}
          </button>
          <ToolButton icon="help" label={t('toolbar.help')} onClick={showHelp} />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".psd,.psb,image/vnd.adobe.photoshop"
          hidden
          data-testid="file-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) {
              void openFile(file);
            }
          }}
        />
      </header>
      <main className="workspace">
        <section className="stage">
          {document && composite ? (
            <>
              <CanvasView
                document={document}
                composite={composite}
                selection={selection}
                transform={transform}
                autoSelect={autoSelect}
                viewport={viewport}
                label={document.fileName}
                onViewportChange={setViewport}
                onResize={setViewSize}
                onSelect={editor.select}
                onMoveStart={editor.beginPreview}
                onMove={(ids, dx, dy) => editor.updatePreview((base) => moveBy(base, ids, dx, dy))}
                onMoveEnd={() => editor.endPreview(t('history.move'))}
                onTransformChange={editor.updateTransform}
                onTransformApply={() => editor.applyTransform(t('history.transform'))}
              />
              {transform ? (
                <div className="transform-bar" role="toolbar">
                  <span>{t('transform.hint')}</span>
                  <button className="button" onClick={editor.cancelTransform}>
                    {t('transform.cancel')}
                  </button>
                  <button className="button primary" data-testid="apply-transform" onClick={() => editor.applyTransform(t('history.transform'))}>
                    {t('transform.apply')}
                  </button>
                </div>
              ) : null}
              {readOnly ? <div className="banner">{t(`readonly.${readOnly}`)}</div> : null}
            </>
          ) : (
            <div className="empty-state">
              <img src="icon.svg" alt="" width={72} height={72} />
              <h1>layerdesk</h1>
              <p>{t('app.tagline')}</p>
              <div className="drop-target">
                <strong>{t('empty.drop')}</strong>
                <span className="muted">{t('empty.or')}</span>
                <div className="empty-actions">
                  <button className="button primary" onClick={() => fileInput.current?.click()}>
                    {t('empty.open')}
                  </button>
                  <button className="button" onClick={() => void openSample()} data-testid="sample">
                    {t('empty.sample')}
                  </button>
                </div>
              </div>
              <p className="muted small">{t('empty.offline')}</p>
            </div>
          )}
        </section>
        {document ? (
          <aside className="sidebar">
            <PropertiesPanel
              document={document}
              selection={selection}
              onRename={(id, name) => setPatch('history.rename', [id], { name })}
              onPosition={(dx, dy) => editor.apply(t('history.position'), (current) => moveBy(current, selection, dx, dy))}
              onOpacityPreviewStart={editor.beginPreview}
              onOpacityPreview={(opacity) => editor.updatePreview((base) => setProperties(base, selection, { opacity }))}
              onOpacityPreviewEnd={() => editor.endPreview(t('history.opacity'))}
              onOpacity={(opacity) => setPatch('history.opacity', selection, { opacity })}
              onBlendMode={(blendMode) => setPatch('history.blend', selection, { blendMode })}
              onClipping={(clipping) => setPatch('history.clipping', selection, { clipping })}
              onLocked={(locked) => setPatch('history.lock', selection, { locked })}
            />
            <div className="tabs" role="tablist">
              {(['layers', 'check', 'history'] as Tab[]).map((name) => (
                <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? 'tab active' : 'tab'} onClick={() => setTab(name)} data-testid={`tab-${name}`}>
                  {t(`tabs.${name}`)}
                </button>
              ))}
            </div>
            <div className="tab-panel" role="tabpanel">
              {tab === 'layers' ? (
                <LayerPanel
                  document={document}
                  selection={selection}
                  onSelect={editor.select}
                  onToggleVisibility={(id, hidden) => setPatch('history.visibility', [id], { hidden })}
                  onToggleLock={(id, locked) => setPatch('history.lock', [id], { locked })}
                  onToggleOpen={(id, opened) => editor.replace((current) => setProperties(current, [id], { opened }))}
                  onRename={(id, name) => setPatch('history.rename', [id], { name })}
                  onDrop={(ids, referenceId, position) => editor.apply(t('history.reorder'), (current) => moveNodes(current, ids, referenceId, position))}
                  onGroup={groupSelection}
                  onUngroup={ungroupSelection}
                  onDuplicate={duplicateSelection}
                  onDelete={deleteSelection}
                  canUngroup={canUngroup}
                />
              ) : null}
              {tab === 'check' ? (
                <CheckPanel
                  document={document}
                  canCompare={!!openedDocument?.storedComposite && openedDocument === document}
                  onCompare={() => (document.storedComposite && composite ? matchingPixelRatio(composite, document.storedComposite) : null)}
                  onSelect={(id) => editor.select([id])}
                  onExport={(content, fileName, type) => void exportText(content, fileName, type)}
                />
              ) : null}
              {tab === 'history' && history ? <HistoryPanel history={history} onJump={editor.jump} /> : null}
            </div>
          </aside>
        ) : null}
      </main>
      <footer className="statusbar" aria-live="polite">
        <span className={`status ${status.tone}`} data-testid="status">
          {status.text}
        </span>
        {document ? (
          <span className="muted">
            {editor.dirty ? `${t('status.unsaved')} · ` : ''}
            {document.fileName} · {document.width} × {document.height}
          </span>
        ) : null}
      </footer>
      {dialog ? <Dialog spec={dialog} /> : null}
    </div>
  );
}
