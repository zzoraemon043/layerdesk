import { describe, expect, it } from 'vitest';
import { createGroup } from '../src/model/commands';
import { findingsToJson, findingsToMarkdown } from '../src/check/report';
import { rules, runChecks, type RuleId } from '../src/check/rules';
import type { LayerNode } from '../src/model/types';
import { testDocument, testLayer } from './fixtures';

function idsFor(children: LayerNode[], width = 20, height = 20): RuleId[] {
  return runChecks(testDocument(children, width, height), 'all').map((finding) => finding.ruleId);
}

const plain = () => testLayer('plain', 0, 0, 4, 4, [0, 0, 0, 255]);

describe('rig check rules', () => {
  it('reports nothing for a clean document', () => {
    expect(idsFor([plain()])).toEqual([]);
  });

  it.each<[RuleId, Partial<Parameters<typeof testLayer>[6]>]>([
    ['blend-mode', { blendMode: 'multiply' }],
    ['clipping', { clipping: true }],
    ['layer-mask', { mask: { left: 0, top: 0, width: 1, height: 1, defaultColor: 0, disabled: false, surface: null } }],
    ['effects', { source: { effects: { dropShadow: [{ enabled: true }] } } }],
    ['adjustment', { source: { adjustment: { type: 'invert' } } }],
    ['fill-layer', { source: { vectorFill: { type: 'color', color: { r: 0, g: 0, b: 0 } } } }],
    ['smart-object', { source: { placedLayer: { id: 'a', type: 'raster', transform: [] } } }],
    ['text', { source: { text: { text: 'x' } } }],
    ['hidden', { hidden: true }],
    ['invalid-name', { name: 'arm/left' }],
    ['invalid-name', { name: 'arm ' }],
    ['blank-name', { name: ' ' }],
    ['unrendered-blend-mode', { blendMode: 'vivid light' }],
  ])('detects %s', (ruleId, extra) => {
    expect(idsFor([{ ...plain(), ...extra } as LayerNode])).toContain(ruleId);
  });

  it('ignores disabled masks and disabled effects', () => {
    const layer = { ...plain(), mask: { left: 0, top: 0, width: 1, height: 1, defaultColor: 0, disabled: true, surface: null }, source: { effects: { disabled: true, dropShadow: [{ enabled: true }] } } };
    expect(idsFor([layer])).toEqual([]);
  });

  it('detects duplicate names among siblings only', () => {
    const findings = idsFor([plain(), plain(), createGroup('g', [plain()])]);
    expect(findings.filter((id) => id === 'duplicate-name')).toHaveLength(2);
  });

  it('detects empty layers and layers outside the canvas', () => {
    expect(idsFor([testLayer('e', 0, 0, 0, 0, [0, 0, 0, 0])])).toContain('empty-layer');
    expect(idsFor([testLayer('o', 30, 30, 4, 4, [0, 0, 0, 255])])).toContain('outside-canvas');
    expect(idsFor([testLayer('p', 18, 18, 4, 4, [0, 0, 0, 255])])).toContain('partly-outside-canvas');
  });

  it('detects very large canvases and layers', () => {
    expect(idsFor([plain()], 9000, 100)).toContain('large-canvas');
    expect(idsFor([testLayer('big', 0, 0, 4097, 1, [0, 0, 0, 255])])).toContain('large-layer');
  });

  it('filters rules by target', () => {
    const document = testDocument([testLayer('big', 0, 0, 4097, 1, [0, 0, 0, 255])]);
    expect(runChecks(document, 'spine').map((finding) => finding.ruleId)).toContain('large-layer');
    expect(runChecks(document, 'live2d').map((finding) => finding.ruleId)).not.toContain('large-layer');
  });

  it('gives every rule a unique id', () => {
    const ids = rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('reports', () => {
  it('writes findings as Markdown and JSON', () => {
    const findings = runChecks(testDocument([{ ...plain(), hidden: true }]), 'all');
    const markdown = findingsToMarkdown('a.psd', findings, (finding) => ({ title: finding.ruleId, detail: 'detail' }), 'Check');
    expect(markdown).toContain('# Check: a.psd');
    expect(markdown).toContain('- [info] hidden (plain): detail');
    expect(JSON.parse(findingsToJson('a.psd', findings))).toMatchObject({ file: 'a.psd', findings: [{ ruleId: 'hidden', nodeName: 'plain' }] });
  });
});
