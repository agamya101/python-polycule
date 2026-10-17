import { useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { NAV_ITEMS, type NavBadgeCounts } from './navItems';
import { TopActions } from './TopActions';

export interface SarsonLayoutProps {
  counts: NavBadgeCounts;
  children: ReactNode;
}

export function SarsonLayout({ counts, children }: SarsonLayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const primaryItems = NAV_ITEMS.slice(0, 8);
  const overflowItems = NAV_ITEMS.slice(8); // Audit, Settings
  const bottomBarRoutes = ['/overview', '/early-warning', '/farmers', '/follow-up'];
  const bottomItems = NAV_ITEMS.filter((i) => bottomBarRoutes.includes(i.route));

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Top bar 72px */}
      <header className="h-[72px] sticky top-0 z-30 bg-surface border-b-2 border-line px-4 lg:px-7 flex items-center justify-between gap-3 no-print">
        <Link to="/overview" className="flex items-center gap-2.5 shrink-0">
          <BrandLogo />
          <span
            className="text-xl font-extrabold tracking-tight text-ink"
            style={{ fontFamily: 'var(--fp-font-display)' }}
          >
            KrishiMitra
          </span>
        </Link>

        {/* Horizontal pill nav >=1024px */}
        <nav className="hidden lg:flex items-center gap-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const badgeVal = item.badgeKey ? counts[item.badgeKey] : 0;
            return (
              <NavLink
                key={item.route}
                to={item.route}
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-transform',
                    isActive
                      ? 'bg-accent text-on-accent shadow-sm'
                      : 'text-ink hover:bg-surface-2',
                  )
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {badgeVal > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-primary text-on-primary text-[10px] font-mono">
                    {badgeVal}
                  </span>
                )}
              </NavLink>
            );
          })}

          {/* More menu for Audit & Settings */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 text-ink hover:bg-surface-2 cursor-pointer"
            >
              <span>More</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {moreOpen && (
              <div
                onMouseLeave={() => setMoreOpen(false)}
                className="absolute right-0 mt-2 w-44 fp-card p-1.5 z-40 bg-surface space-y-1"
              >
                {overflowItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.route}
                      to={item.route}
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 px-3 py-2 rounded-ctl text-xs font-bold',
                          isActive
                            ? 'bg-accent text-on-accent'
                            : 'text-ink hover:bg-surface-2',
                        )
                      }
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        <TopActions />
      </header>

      {/* Main container centered max-w 1320px, bottom padding 260px so hills show */}
      <main className="w-full max-w-[1320px] mx-auto p-4 sm:p-[28px] pb-[260px] flex-1">
        {children}
      </main>

      {/* Below 1024px fixed bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t-2 border-line px-2 py-1.5 flex items-center justify-around no-print">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const badgeVal = item.badgeKey ? counts[item.badgeKey] : 0;
          return (
            <NavLink
              key={item.route}
              to={item.route}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 rounded-full text-[11px] font-bold relative',
                  isActive ? 'bg-accent text-on-accent' : 'text-ink-muted',
                )
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label.split(' ')[0]}</span>
              {badgeVal > 0 && (
                <span className="absolute -top-0.5 right-1 px-1 rounded-full bg-primary text-on-primary text-[9px] font-mono">
                  {badgeVal}
                </span>
              )}
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileSheetOpen((v) => !v)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-full text-[11px] font-bold text-ink-muted"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More sheet */}
      {mobileSheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-ink/40"
            onClick={() => setMobileSheetOpen(false)}
            aria-hidden
          />
          <div className="relative z-10 bg-surface border-t-2 border-line rounded-t-card p-5 space-y-3">
            <div className="text-sm font-bold text-ink">All Sections</div>
            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.route}
                    to={item.route}
                    onClick={() => setMobileSheetOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 p-2.5 rounded-ctl text-xs font-bold border border-line',
                        isActive ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink',
                      )
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
