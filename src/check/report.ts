import type { Finding } from './rules';

export type FindingText = (finding: Finding) => { title: string; detail: string };

export function findingsToMarkdown(fileName: string, findings: Finding[], describe: FindingText, heading: string): string {
  const lines = [`# ${heading}: ${fileName}`, ''];
  for (const finding of findings) {
    const { title, detail } = describe(finding);
    const layer = finding.nodeName ? ` (${finding.nodeName})` : '';
    lines.push(`- [${finding.severity}] ${title}${layer}: ${detail}`);
  }
  return `${lines.join('\n')}\n`;
}

export function findingsToJson(fileName: string, findings: Finding[]): string {
  return `${JSON.stringify({ file: fileName, findings }, null, 2)}\n`;
}
