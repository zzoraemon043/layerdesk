import { isBlendModeRendered } from '../render/blend';
import { allNodes, boundsOf, walk } from '../model/tree';
import type { LayerDocument, LayerNode, NodeId, PixelLayer } from '../model/types';

export type Severity = 'error' | 'warning' | 'info';
export type RigTarget = 'live2d' | 'spine';

export interface Finding {
  ruleId: RuleId;
  nodeId: NodeId | null;
  nodeName: string;
  severity: Severity;
  params: Record<string, string | number>;
}

export type RuleId =
  | 'blend-mode'
  | 'unrendered-blend-mode'
  | 'clipping'
  | 'layer-mask'
  | 'effects'
  | 'adjustment'
  | 'fill-layer'
  | 'smart-object'
  | 'text'
  | 'duplicate-name'
  | 'empty-layer'
  | 'outside-canvas'
  | 'partly-outside-canvas'
  | 'hidden'
  | 'large-canvas'
  | 'large-layer'
  | 'invalid-name'
  | 'blank-name';

export interface Rule {
  id: RuleId;
  severity: Severity;
  targets: RigTarget[];
  check(document: LayerDocument): Finding[];
}

const both: RigTarget[] = ['live2d', 'spine'];
export const largeCanvasSize = 8192;
export const largeLayerSize = 4096;
const invalidNameCharacters = /[\\/:*?"<>|]/;

function finding(rule: Pick<Rule, 'id' | 'severity'>, node: LayerNode | null, params: Record<string, string | number> = {}): Finding {
  return { ruleId: rule.id, nodeId: node?.id ?? null, nodeName: node?.name ?? '', severity: rule.severity, params };
}

function nodeRule(id: RuleId, severity: Severity, targets: RigTarget[], matches: (node: LayerNode) => Record<string, string | number> | boolean): Rule {
  const rule: Rule = {
    id,
    severity,
    targets,
    check(document) {
      return allNodes(document).flatMap((node) => {
        const result = matches(node);
        if (result === false) {
          return [];
        }
        return [finding(rule, node, result === true ? {} : result)];
      });
    },
  };
  return rule;
}

function pixelLayer(node: LayerNode): node is PixelLayer {
  return node.kind === 'layer';
}

function hasEnabledEffects(node: LayerNode): boolean {
  const effects = node.source.effects;
  if (!effects || effects.disabled) {
    return false;
  }
  return Object.entries(effects).some(([key, value]) => key !== 'scale' && key !== 'disabled' && value !== undefined);
}

function duplicateNameRule(): Rule {
  const rule: Rule = {
    id: 'duplicate-name',
    severity: 'warning',
    targets: both,
    check(document) {
      const findings: Finding[] = [];
      const scan = (siblings: LayerNode[]) => {
        const counts = new Map<string, number>();
        for (const node of siblings) {
          counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
        }
        for (const node of siblings) {
          const count = counts.get(node.name) ?? 0;
          if (count > 1) {
            findings.push(finding(rule, node, { count }));
          }
        }
      };
      scan(document.children);
      walk(document.children, (node) => {
        if (node.kind === 'group') {
          scan(node.children);
        }
      });
      return findings;
    },
  };
  return rule;
}

function canvasRule(): Rule {
  const rule: Rule = {
    id: 'large-canvas',
    severity: 'info',
    targets: both,
    check(document) {
      if (document.width <= largeCanvasSize && document.height <= largeCanvasSize) {
        return [];
      }
      return [finding(rule, null, { width: document.width, height: document.height, limit: largeCanvasSize })];
    },
  };
  return rule;
}

function outsideCanvas(document: LayerDocument, node: LayerNode): 'outside' | 'partly' | null {
  const bounds = boundsOf(node);
  if (!bounds || node.kind !== 'layer') {
    return null;
  }
  if (bounds.right <= 0 || bounds.bottom <= 0 || bounds.left >= document.width || bounds.top >= document.height) {
    return 'outside';
  }
  if (bounds.left < 0 || bounds.top < 0 || bounds.right > document.width || bounds.bottom > document.height) {
    return 'partly';
  }
  return null;
}

function documentRule(id: RuleId, severity: Severity, matches: (document: LayerDocument, node: LayerNode) => boolean): Rule {
  const rule: Rule = {
    id,
    severity,
    targets: both,
    check(document) {
      return allNodes(document).filter((node) => matches(document, node)).map((node) => finding(rule, node));
    },
  };
  return rule;
}

export const rules: Rule[] = [
  nodeRule('blend-mode', 'warning', both, (node) => (pixelLayer(node) && node.blendMode !== 'normal' ? { mode: node.blendMode } : false)),
  nodeRule('unrendered-blend-mode', 'info', both, (node) => (!isBlendModeRendered(node.blendMode) ? { mode: node.blendMode } : false)),
  nodeRule('clipping', 'warning', both, (node) => node.clipping),
  nodeRule('layer-mask', 'warning', both, (node) => !!node.mask && !node.mask.disabled),
  nodeRule('effects', 'warning', both, hasEnabledEffects),
  nodeRule('adjustment', 'error', both, (node) => !!node.source.adjustment),
  nodeRule('fill-layer', 'warning', both, (node) => !!node.source.vectorFill),
  nodeRule('smart-object', 'warning', both, (node) => !!node.source.placedLayer),
  nodeRule('text', 'warning', both, (node) => !!node.source.text),
  duplicateNameRule(),
  nodeRule('empty-layer', 'info', both, (node) => pixelLayer(node) && !node.source.adjustment && (node.width === 0 || node.height === 0)),
  documentRule('outside-canvas', 'warning', (document, node) => outsideCanvas(document, node) === 'outside'),
  documentRule('partly-outside-canvas', 'info', (document, node) => outsideCanvas(document, node) === 'partly'),
  nodeRule('hidden', 'info', both, (node) => node.hidden),
  canvasRule(),
  nodeRule('large-layer', 'info', ['spine'], (node) =>
    pixelLayer(node) && (node.width > largeLayerSize || node.height > largeLayerSize) ? { width: node.width, height: node.height, limit: largeLayerSize } : false,
  ),
  nodeRule('invalid-name', 'warning', both, (node) => invalidNameCharacters.test(node.name) || node.name !== node.name.trim()),
  nodeRule('blank-name', 'warning', both, (node) => node.name.trim() === ''),
];

export function runChecks(document: LayerDocument, target: RigTarget | 'all'): Finding[] {
  return rules.filter((rule) => target === 'all' || rule.targets.includes(target)).flatMap((rule) => rule.check(document));
}
