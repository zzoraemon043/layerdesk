import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface DialogSpec {
  title: string;
  body: ReactNode;
  actions: DialogAction[];
  onDismiss: () => void;
}

export function Dialog({ spec }: { spec: DialogSpec }) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [spec]);

  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && spec.onDismiss()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            spec.onDismiss();
          }
        }}
      >
        <h2 id="dialog-title">{spec.title}</h2>
        <div className="dialog-body">{spec.body}</div>
        <div className="dialog-actions">
          {spec.actions.map((action) => (
            <button key={action.label} ref={action.primary ? primaryRef : undefined} className={action.primary ? 'button primary' : 'button'} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
