import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  FlaskConical,
  HelpCircle,
  Satellite,
  ShieldCheck,
} from 'lucide-react';
import { useRole } from '@/auth/RoleContext';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

const FEATURES = [
  {
    icon: Satellite,
    title: 'F1 · Crop-Stress Early Warning',
    desc: 'District risk leaderboard (MODIS 250 m NDVI anomaly + weather alerts) paired with Sentinel-2 10 m farmer field polygons and multi-agent reasoning.',
  },
  {
    icon: FlaskConical,
    title: 'F2 · Soil Health Card Reader',
    desc: 'OCR extraction of 12 soil parameters with decimal-shift & unit safeguards, converted to bags/acre, and gated by mandatory department approval.',
  },
  {
    icon: Activity,
    title: 'F3 · 21-Day Follow-up & Resolution',
    desc: 'Post-advisory satellite follow-up, Needs Field Support queue, message reach verification (sent ≠ delivered ≠ acknowledged), and hash-chained audit.',
  },
];

const FAQS = [
  {
    q: 'Why does KrishiMitra separate District-level (250 m) and Field-level (10 m) satellite monitoring?',
    a: 'District early warning uses NASA MODIS 250 m 8-day composites to rank macro crop stress across 25 districts. Individual farmer advisories and 21-day recovery checks use Sentinel-2 10 m imagery over the registered field polygon, with explicit pixel-count reliability checks.',
  },
  {
    q: 'Can an AI-generated advisory or Soil Health Card SMS be sent directly to a farmer?',
    a: 'No. Every outbound SMS must pass numeric fidelity checks (ensuring doses, dates, and KVK phone numbers match between English and regional text) and be approved by an Agriculture Department Officer or Admin different from the person who drafted it.',
  },
  {
    q: 'When is a farmer considered "reached" by an advisory?',
    a: 'Gateway dispatch (SENT) and handset receipt (DELIVERED) do not count as reached. Only explicit farmer acknowledgement (via SMS reply, IVR press-1, or extension worker confirmation) marks a message as ACKNOWLEDGED.',
  },
  {
    q: 'Does satellite NDVI recovery automatically close an active case?',
    a: 'No. When post-advisory Sentinel-2 passes show NDVI recovery (Δ ≥ +0.05 or positive slope), the case moves to RECOVERING_PENDING_VERIFICATION. A human verification via phone call, SMS reply, or field visit is mandatory before closing.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { persona, setPersonaById, personas } = useRole();

  const handleSelectPersona = (id: typeof persona.id) => {
    setPersonaById(id);
    navigate('/overview');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agriculture & Rural Development · Platform Guide"
        title="KrishiMitra FAQ & Role Guide"
        description="From satellite warning to farmer SMS to verified recovery — every step accountable."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Core Pillars */}
        <div className="lg:col-span-7 space-y-4">
          <Card eyebrow="Core Capabilities" title="Three-Pillar Accountability Architecture">
            <div className="grid grid-cols-1 gap-4">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="p-4 rounded-card border border-line bg-surface-2 flex items-start gap-4"
                  >
                    <div className="w-10 h-10 rounded-ctl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-sm font-bold text-ink">{f.title}</h2>
                      <p className="text-xs text-ink-muted leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card eyebrow="Frequently Asked Questions" title="Operational & Safeguard Rules">
            <div className="space-y-3">
              {FAQS.map((item) => (
                <div
                  key={item.q}
                  className="p-4 rounded-card border border-line bg-surface-2 space-y-1.5"
                >
                  <div className="flex items-start gap-2 text-sm font-bold text-ink">
                    <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{item.q}</span>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed pl-6">{item.a}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right 5 cols: Continue as persona */}
        <div className="lg:col-span-5">
          <Card
            eyebrow="Role-Based Access & Separation of Duties"
            title="Switch Active Department Persona"
            actions={<ShieldCheck className="w-5 h-5 text-primary" />}
          >
            <div className="space-y-2.5">
              {personas.map((p) => {
                const isDefault = p.id === persona.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPersona(p.id)}
                    className={`w-full text-left p-3.5 rounded-card border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isDefault
                        ? 'bg-primary/10 border-primary shadow-sm'
                        : 'bg-surface-2 border-line hover:border-primary/60'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ink">{p.name}</span>
                        <span className="px-2 py-0.5 rounded-ctl bg-surface border border-line text-[10px] font-mono font-semibold text-primary">
                          {p.role}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted leading-snug">{p.duty}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

