import toast from 'react-hot-toast';
import { Copy, Printer, ShieldAlert } from 'lucide-react';
import type { InstitutionalBriefing as InstitutionalBriefingType } from '@/api/contract';
import { Button } from '@/components/ui/Button';
import { DataBadge } from '@/components/ui/DataBadge';

export interface InstitutionalBriefingProps {
  briefing: InstitutionalBriefingType;
}

export function InstitutionalBriefing({ briefing }: InstitutionalBriefingProps) {
  const handleCopy = () => {
    const text = [
      briefing.headline,
      briefing.summary,
      'Recommended Actions:',
      ...briefing.actions.map((a, i) => `${i + 1}. ${a}`),
      `Insurance Signal: Claim Probability ${briefing.insuranceSignal.claimProbability}%, Affected Acreage ${briefing.insuranceSignal.affectedAcreagePct}% (${briefing.insuranceSignal.note})`,
    ].join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Briefing copied to clipboard'))
      .catch(() => toast.error('Could not copy text'));
  };

  return (
    <div className="fp-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="fp-eyebrow">Institutional Briefing & Insurance Signal</span>
          <h3 className="text-lg font-bold text-ink mt-1">{briefing.headline}</h3>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            icon={<Copy className="w-3.5 h-3.5" />}
          >
            Copy text
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            icon={<Printer className="w-3.5 h-3.5" />}
          >
            Print
          </Button>
        </div>
      </div>

      <p className="text-sm text-ink leading-relaxed">{briefing.summary}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 p-4 rounded-card bg-surface-2 border border-line space-y-2">
          <div className="text-xs font-mono font-bold uppercase text-ink-muted">
            Department Action Checklist
          </div>
          <ul className="space-y-1.5 text-xs sm:text-sm text-ink list-decimal pl-4">
            {briefing.actions.map((act, i) => (
              <li key={i}>{act}</li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-card bg-surface-2 border border-line flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase text-ink-muted">
              PMFBY Insurance Signal
            </span>
            <DataBadge status="SIMULATED" source="Composite Risk Model" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-ink-muted">Claim Probability</div>
              <div className="text-2xl font-bold fp-num text-primary">
                {briefing.insuranceSignal.claimProbability}%
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Affected Acreage</div>
              <div className="text-2xl font-bold fp-num text-warning">
                {briefing.insuranceSignal.affectedAcreagePct}%
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono text-ink-muted flex items-center gap-1.5 pt-2 border-t border-line">
            <ShieldAlert className="w-3.5 h-3.5 text-warning shrink-0" />
            <span>Indicative signal only — not a claim decision</span>
          </div>
        </div>
      </div>
    </div>
  );
}
