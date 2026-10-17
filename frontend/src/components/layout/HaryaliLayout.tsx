import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Tooltip } from '@/components/ui/Tooltip';
import { NAV_ITEMS, type NavBadgeCounts } from './navItems';
import { TopActions } from './TopActions';

export interface HaryaliLayoutProps {
  counts: NavBadgeCounts;
  children: ReactNode;
}

export function HaryaliLayout({ counts, children }: HaryaliLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (q.toUpperCase().startsWith('FRM-')) {
      navigate(`/farmers/${q.toUpperCase()}`);
    } else {
      navigate(`/farmers?q=${encodeURIComponent(q)}`);
    }
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen flex relative z-10">
      {/* Desktop/Tablet fixed left icon rail 76px */}
      <aside
        className="hidden md:flex flex-col items-center fixed top-0 left-0 bottom-0 w-[76px] z-30 border-r border-line py-4 gap-3"
        style={{ background: 'var(--fp-nav-bg)', color: 'var(--fp-nav-ink)' }}
      >
        <Link
          to="/"
          title="KrishiMitra — Haryali Canopy"
          className="mb-2"
        >
          <BrandLogo className="w-11 h-11 rounded-ctl" iconClassName="w-6 h-6" />
        </Link>
        <nav className="flex-1 flex flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const badgeVal = item.badgeKey ? counts[item.badgeKey] : 0;
            return (
              <Tooltip key={item.route} content={item.label}>
                <NavLink
                  to={item.route}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      'w-11 h-11 rounded-ctl flex items-center justify-center relative transition-colors',
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-2',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="w-[22px] h-[22px]" />
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent absolute bottom-1" />
                      )}
                      {badgeVal > 0 && (
                        <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-primary text-on-primary text-[10px] font-mono flex items-center justify-center">
                          {badgeVal}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </Tooltip>
            );
          })}
        </nav>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-ink/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative z-10 w-64 h-full bg-surface border-r border-line p-4 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <Link to="/" className="flex items-center gap-2 font-bold text-primary">
                <BrandLogo className="w-8 h-8" iconClassName="w-4 h-4" />
                <span>KrishiMitra</span>
              </Link>
              <button type="button" onClick={() => setMobileOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.route}
                    to={item.route}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-ctl text-sm',
                        isActive ? 'bg-primary/15 text-primary font-bold' : 'text-ink',
                      )
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main full-width area */}
      <div className="flex-1 md:pl-[76px] min-w-0 flex flex-col">
        <header
          className="h-[60px] sticky top-0 z-20 border-b border-line px-4 md:px-6 flex items-center justify-between gap-4 no-print"
          style={{ background: 'var(--fp-glass)', backdropFilter: 'blur(10px)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden fp-btn fp-btn-ghost p-1.5"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="font-mono text-xs text-ink-muted truncate">
              <span className="text-accent">//</span> krishimitra{location.pathname}
            </div>
          </div>

          <form onSubmit={handleSearch} className="hidden lg:flex items-center relative w-72">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Jump to farmer / village…"
              className="fp-input pl-8 py-1 text-xs w-full"
            />
          </form>

          <TopActions />
        </header>

        <main className="p-4 md:p-[24px] flex-1">{children}</main>
      </div>
    </div>
  );
}
