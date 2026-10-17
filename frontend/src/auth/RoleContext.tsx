import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { PERSONAS, type Persona } from './personas';
import { setClientActor } from '@/api/client';

export interface RoleContextValue {
  persona: Persona;
  setPersonaById: (id: Persona['id']) => void;
  personas: readonly Persona[];
}

// oxlint-disable-next-line react/only-export-components
export const RoleContext = createContext<RoleContextValue | null>(null);

const DEFAULT_PERSONA = PERSONAS[1]; // p2: R. K. Sharma (DEPT_OFFICER)

function getInitialPersona(): { persona: Persona; isEmbed: boolean } {
  const params = new URLSearchParams(window.location.search);
  const isEmbed = params.get('embed') === '1';
  if (isEmbed) {
    return { persona: DEFAULT_PERSONA, isEmbed: true };
  }
  const savedId = localStorage.getItem('fp.persona');
  const found = PERSONAS.find((p) => p.id === savedId);
  return { persona: found ?? DEFAULT_PERSONA, isEmbed: false };
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(getInitialPersona);
  const [persona, setPersona] = useState<Persona>(initial.persona);

  useEffect(() => {
    setClientActor(persona.name, persona.role);
  }, [persona]);

  const setPersonaById = useCallback(
    (id: Persona['id']) => {
      const next = PERSONAS.find((p) => p.id === id);
      if (next) {
        setPersona(next);
        setClientActor(next.name, next.role);
        if (!initial.isEmbed) {
          localStorage.setItem('fp.persona', next.id);
        }
      }
    },
    [initial.isEmbed],
  );

  return (
    <RoleContext.Provider value={{ persona, setPersonaById, personas: PERSONAS }}>
      {children}
    </RoleContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return ctx;
}
