import { useMemo, useState } from 'react';
import { findingsToJson, findingsToMarkdown } from '../check/report';
import { runChecks, type Finding, type RigTarget, type Severity } from '../check/rules';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import type { LayerDocument, NodeId } from '../model/types';
import { Icon, type IconName } from './Icon';

interface CheckPanelProps {
  document: LayerDocument;
  canCompare: boolean;
  onCompare(): number | null;
  onSelect(id: NodeId): void;
  onExport(content: string, fileName: string, type: string): void;
}

const severityOrder: Severity[] = ['error', 'warning', 'info'];
const severityIcons: Record<Severity, IconName> = { error: 'error', warning: 'warning', info: 'info' };

export function CheckPanel(props: CheckPanelProps) {
  const { t } = useI18n();
  const [target, setTarget] = useState<RigTarget | 'all'>('all');
  const [comparison, setComparison] = useState<{ document: LayerDocument; ratio: number | null } | null>(null);
  const findings = useMemo(
    () => runChecks(props.document, target).sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)),
    [props.document, target],
  );

  const localizedParams = (params: Finding['params']) => {
    if (typeof params.mode !== 'string') {
      return params;
    }
    const key = `blend.${params.mode}` as MessageKey;
    const label = t(key);
    return { ...params, mode: label === key ? params.mode : label };
  };

  const describe = (finding: Finding) => ({
    title: t(`rule.${finding.ruleId}.title` as MessageKey),
    detail: t(`rule.${finding.ruleId}.detail` as MessageKey, localizedParams(finding.params)),
  });

  const baseName = props.document.fileName.replace(/\.(psd|psb)$/i, '');
  const comparisonResult = comparison?.document === props.document ? comparison.ratio : undefined;

  return (
    <div className="check-panel">
      <div className="check-toolbar">
        <label className="field inline">
          <span className="field-label">{t('check.target')}</span>
          <select className="input" value={target} onChange={(event) => setTarget(event.currentTarget.value as RigTarget | 'all')}>
            <option value="all">{t('check.all')}</option>
            <option value="live2d">{t('check.live2d')}</option>
            <option value="spine">{t('check.spine')}</option>
          </select>
        </label>
        <span className="muted" data-testid="finding-count">
          {t('check.count', { count: findings.length })}
        </span>
      </div>
      {findings.length === 0 ? <p className="panel-note">{t('check.none')}</p> : null}
      <ul className="findings">
        {findings.map((finding, index) => {
          const { title, detail } = describe(finding);
          return (
            <li key={`${finding.ruleId}-${finding.nodeId}-${index}`}>
              <button className={`finding ${finding.severity}`} data-testid="finding" data-rule={finding.ruleId} onClick={() => finding.nodeId && props.onSelect(finding.nodeId)}>
                <Icon name={severityIcons[finding.severity]} size={16} />
                <span>
                  <strong>
                    {title}
                    {finding.nodeName ? <span className="finding-layer">{finding.nodeName}</span> : null}
                  </strong>
                  <span className="finding-detail">{detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="panel-actions spread">
        <button className="button" onClick={() => props.onExport(findingsToMarkdown(props.document.fileName, findings, describe, t('check.heading')), `${baseName}-check.md`, 'text/markdown')}>
          {t('check.exportMd')}
        </button>
        <button className="button" onClick={() => props.onExport(findingsToJson(props.document.fileName, findings), `${baseName}-check.json`, 'application/json')}>
          {t('check.exportJson')}
        </button>
      </div>
      <div className="compare">
        <button className="button" disabled={!props.canCompare} onClick={() => setComparison({ document: props.document, ratio: props.onCompare() })}>
          {t('check.compare')}
        </button>
        {comparisonResult !== undefined ? (
          <p className="panel-note">{comparisonResult === null ? t('check.compareUnavailable') : t('check.compareResult', { percent: (comparisonResult * 100).toFixed(1) })}</p>
        ) : !props.canCompare ? (
          <p className="muted panel-note">{t('check.compareUnavailable')}</p>
        ) : null}
      </div>
      <p className="muted panel-note small">{t('check.disclaimer')}</p>
    </div>
  );
}
