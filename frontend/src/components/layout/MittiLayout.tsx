import { useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useRole } from '@/auth/RoleContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { cn } from '@/lib/cn';
import { NAV_ITEMS, type NavBadgeCounts } from './navItems';
import { TopActions } from './TopActions';

export interface LayoutShellProps {
  counts: NavBadgeCounts;
  children: ReactNode;
}

export function MittiLayout({ counts, children }: LayoutShellProps) {
  const { persona } = useRole();
  const [mobileOpen, setMobileOpen] = useState(false);

  const renderNavLinks = (collapsed = false, onNavigate?: () => void) => (
    <nav className="flex-1 py-4 space-y-1 px-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const badgeVal = item.badgeKey ? counts[item.badgeKey] : 0;
        return (
          <NavLink
            key={item.route}
            to={item.route}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-between gap-3 px-3 py-2.5 text-[14px] rounded-ctl transition-colors relative',
                isActive
                  ? 'font-bold bg-surface/10'
                  : 'opacity-85 hover:opacity-100 hover:bg-surface/5',
              )
            }
            style={({ isActive }) => ({
              color: 'var(--fp-nav-ink)',
              borderLeft: isActive ? '3px solid var(--fp-nav-active)' : '3px solid transparent',
            })}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </div>
            {!collapsed && badgeVal > 0 && (
              <span
                className="px-1.5 py-0.5 text-[11px] font-mono rounded-ctl font-semibold"
                style={{
                  background: 'var(--fp-nav-active)',
                  color: 'var(--fp-on-primary)',
                }}
              >
                {badgeVal}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex relative z-10">
      {/* Desktop full sidebar >=1280px */}
      <aside
        className="hidden xl:flex flex-col fixed top-0 left-0 bottom-0 w-[248px] z-30 border-r border-line"
        style={{ background: 'var(--fp-nav-bg)', color: 'var(--fp-nav-ink)' }}
      >
        <div className="p-5 border-b border-line/20">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo />
            <span
              className="text-[22px] font-bold tracking-tight"
              style={{ fontFamily: 'var(--fp-font-display)' }}
            >
              KrishiMitra
            </span>
          </Link>
          <p className="text-[11px] opacity-70 mt-1 font-mono">Mitti Almanac Edition</p>
        </div>
        {renderNavLinks(false)}
        <div className="p-4 border-t border-line/20 text-xs space-y-0.5">
          <div className="font-semibold truncate">{persona.name}</div>
          <div className="font-mono text-[11px] opacity-75">{persona.role}</div>
        </div>
      </aside>

      {/* Tablet icon sidebar 768..1279px */}
      <aside
        className="hidden md:flex xl:hidden flex-col fixed top-0 left-0 bottom-0 w-[72px] z-30 border-r border-line items-center"
        style={{ background: 'var(--fp-nav-bg)', color: 'var(--fp-nav-ink)' }}
      >
        <div className="py-5 border-b border-line/20 w-full flex justify-center">
          <Link to="/" title="KrishiMitra">
            <BrandLogo />
          </Link>
        </div>
        {renderNavLinks(true)}
      </aside>

      {/* Mobile drawer <768px */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-ink/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside
            className="relative z-10 w-[248px] h-full flex flex-col"
            style={{ background: 'var(--fp-nav-bg)', color: 'var(--fp-nav-ink)' }}
          >
            <div className="p-4 border-b border-line/20 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2">
                <BrandLogo className="w-8 h-8" iconClassName="w-4 h-4" />
                <span
                  className="text-lg font-bold"
                  style={{ fontFamily: 'var(--fp-font-display)' }}
                >
                  KrishiMitra
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavLinks(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 xl:pl-[248px] md:pl-[72px] min-w-0">
        <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-[32px] space-y-6">
          <header className="flex items-center justify-between gap-4 pb-3 border-b border-line no-print">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden fp-btn fp-btn-ghost p-2"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <span className="fp-eyebrow">Department Operations Almanac</span>
            </div>
            <TopActions />
          </header>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
