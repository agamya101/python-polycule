import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { CONCEPTS, type ConceptKey, type ThemeMode } from './concepts';

export interface ThemeContextValue {
  concept: ConceptKey;
  mode: ThemeMode;
  setConcept: (concept: ConceptKey) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  isEmbed: boolean;
}

// oxlint-disable-next-line react/only-export-components
export const ThemeContext = createContext<ThemeContextValue | null>(null);

function isValidConcept(val: string | null): val is ConceptKey {
  return val !== null && val in CONCEPTS;
}

function isValidMode(val: string | null): val is ThemeMode {
  return val === 'light' || val === 'dark';
}

function getInitialState(): { concept: ConceptKey; mode: ThemeMode; isEmbed: boolean } {
  const params = new URLSearchParams(window.location.search);
  const isEmbed = params.get('embed') === '1';
  const urlConcept = params.get('concept');
  const urlMode = params.get('mode');

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const systemMode: ThemeMode = prefersDark ? 'dark' : 'light';

  if (isEmbed) {
    return {
      concept: isValidConcept(urlConcept) ? urlConcept : 'sarson',
      mode: isValidMode(urlMode) ? urlMode : systemMode,
      isEmbed: true,
    };
  }

  if (!localStorage.getItem('fp.chosenConcept')) {
    localStorage.setItem('fp.chosenConcept', 'sarson');
  }
  const storedConcept = localStorage.getItem('fp.concept');
  const chosenConcept = localStorage.getItem('fp.chosenConcept');
  const storedMode = localStorage.getItem('fp.mode');

  const concept: ConceptKey = isValidConcept(urlConcept)
    ? urlConcept
    : isValidConcept(storedConcept)
      ? storedConcept
      : isValidConcept(chosenConcept)
        ? chosenConcept
        : 'sarson';

  const mode: ThemeMode = isValidMode(urlMode)
    ? urlMode
    : isValidMode(storedMode)
      ? storedMode
      : systemMode;

  return { concept, mode, isEmbed: false };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(getInitialState);
  const [concept, setConceptState] = useState<ConceptKey>(initial.concept);
  const [mode, setModeState] = useState<ThemeMode>(initial.mode);
  const isEmbed = initial.isEmbed;

  useEffect(() => {
    document.documentElement.setAttribute('data-concept', concept);
    document.documentElement.setAttribute('data-mode', mode);
  }, [concept, mode]);

  const setConcept = useCallback(
    (next: ConceptKey) => {
      setConceptState(next);
      if (!isEmbed) {
        localStorage.setItem('fp.concept', next);
      }
    },
    [isEmbed],
  );

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      if (!isEmbed) {
        localStorage.setItem('fp.mode', next);
      }
    },
    [isEmbed],
  );

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      if (!isEmbed) {
        localStorage.setItem('fp.mode', next);
      }
      return next;
    });
  }, [isEmbed]);

  return (
    <ThemeContext.Provider value={{ concept, mode, setConcept, setMode, toggleMode, isEmbed }}>
      {children}
    </ThemeContext.Provider>
  );
}
