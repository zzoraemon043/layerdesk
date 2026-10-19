import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';

const shortcuts: [string, MessageKey][] = [
  ['Ctrl+O', 'help.open'],
  ['Ctrl+S', 'help.save'],
  ['Ctrl+Z', 'help.undo'],
  ['Ctrl+Shift+Z / Ctrl+Y', 'help.redo'],
  ['← ↑ → ↓', 'help.move'],
  ['Ctrl+T', 'help.transform'],
  ['Enter / Esc', 'help.applyTransform'],
  ['Ctrl+G', 'help.group'],
  ['Ctrl+Shift+G', 'help.ungroup'],
  ['Ctrl+J', 'help.duplicate'],
  ['Delete', 'help.delete'],
  ['Space + drag', 'help.pan'],
  ['Wheel / Ctrl+wheel', 'help.zoom'],
  ['Ctrl+0 / Ctrl+1', 'help.fit'],
  ['Alt+click', 'help.selectBelow'],
  ['Shift+click', 'help.addSelection'],
];

export function HelpContent() {
  const { t } = useI18n();
  return (
    <table className="shortcuts">
      <tbody>
        {shortcuts.map(([keys, label]) => (
          <tr key={label}>
            <td>
              <kbd>{keys}</kbd>
            </td>
            <td>{t(label)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
