import { useMemo } from 'react';
import { useTheme } from './useTheme';

export interface ThemeColors {
  primary: string;
  accent: string;
  ink: string;
  inkMuted: string;
  border: string;
  surface: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  risk: {
    LOW: string;
    MEDIUM: string;
    HIGH: string;
    CRITICAL: string;
  };
  ndvi: [string, string, string, string, string];
}

function readColorsFromDom(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    primary: v('--fp-primary'),
    accent: v('--fp-accent'),
    ink: v('--fp-ink'),
    inkMuted: v('--fp-ink-muted'),
    border: v('--fp-border'),
    surface: v('--fp-surface'),
    success: v('--fp-success'),
    warning: v('--fp-warning'),
    danger: v('--fp-danger'),
    info: v('--fp-info'),
    risk: {
      LOW: v('--fp-risk-low'),
      MEDIUM: v('--fp-risk-medium'),
      HIGH: v('--fp-risk-high'),
      CRITICAL: v('--fp-risk-critical'),
    },
    ndvi: [
      v('--fp-ndvi-0'),
      v('--fp-ndvi-1'),
      v('--fp-ndvi-2'),
      v('--fp-ndvi-3'),
      v('--fp-ndvi-4'),
    ],
  };
}

export function useThemeColors(): ThemeColors {
  const { concept, mode } = useTheme();
  return useMemo(() => {
    document.documentElement.setAttribute('data-concept', concept);
    document.documentElement.setAttribute('data-mode', mode);
    return readColorsFromDom();
  }, [concept, mode]);
}
