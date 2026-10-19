import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLanguage, format, messages, type Language, type MessageKey } from './messages';

const storageKey = 'layerdesk.language';

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'en' || stored === 'zh-TW') {
      return stored;
    }
  } catch {
    return detectLanguage(navigator.languages ?? [navigator.language]);
  }
  return detectLanguage(navigator.languages ?? [navigator.language]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback<Translate>((key, params) => format(messages[language][key] ?? key, params), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}
