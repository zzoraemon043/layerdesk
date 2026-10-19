import type { History } from '../model/history';

export function HistoryPanel({ history, onJump }: { history: History; onJump(index: number): void }) {
  const entries = [...history.past, history.present, ...history.future];
  const presentIndex = history.past.length;
  return (
    <ol className="history-list">
      {entries.map((entry, index) => (
        <li key={index}>
          <button className={['history-entry', index === presentIndex ? 'current' : '', index > presentIndex ? 'future' : ''].join(' ')} aria-current={index === presentIndex} onClick={() => onJump(index)}>
            {entry.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
