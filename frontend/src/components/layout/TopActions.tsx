import { Moon, Sun, UserCheck } from 'lucide-react';
import { useRole } from '@/auth/RoleContext';
import { useTheme } from '@/theme/useTheme';

export function TopActions() {
  const { mode, toggleMode } = useTheme();
  const { persona, setPersonaById, personas } = useRole();

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Persona switcher */}
      <div className="flex items-center gap-1.5 bg-surface-2 border border-line rounded-ctl px-2 py-1">
        <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
        <select
          aria-label="Switch active persona"
          value={persona.id}
          onChange={(e) => setPersonaById(e.target.value as typeof persona.id)}
          className="bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id} className="bg-surface text-ink">
              {p.name} · {p.role}
            </option>
          ))}
        </select>
      </div>

      {/* Light / Dark mode toggle */}
      <button
        type="button"
        onClick={toggleMode}
        aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
        className="fp-btn fp-btn-ghost p-2"
      >
        {mode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>
    </div>
  );
}
