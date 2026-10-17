import { Phone, Shield } from 'lucide-react';
import type { RoleResponsibility } from '@/api/contract';

export interface RolesPanelProps {
  roles: RoleResponsibility[];
}

export function RolesPanel({ roles }: RolesPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {roles.map((r) => (
        <div
          key={r.role}
          className="p-4 rounded-card bg-surface-2 border border-line flex flex-col justify-between gap-3"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <h4 className="text-sm font-bold text-ink">{r.title}</h4>
            </div>
            <ul className="space-y-1.5 text-xs text-ink-muted list-disc pl-4">
              {r.responsibilities.map((resp, idx) => (
                <li key={idx}>{resp}</li>
              ))}
            </ul>
          </div>
          <div className="pt-2 border-t border-line text-[11px] font-mono text-ink flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">{r.contact}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
