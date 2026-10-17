import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { getDistricts } from '@/api/client';
import { ConceptBackdrop } from '@/theme/ConceptBackdrop';
import { useTheme } from '@/theme/useTheme';
import { HaryaliLayout } from './HaryaliLayout';
import { MittiLayout } from './MittiLayout';
import { SarsonLayout } from './SarsonLayout';
import type { NavBadgeCounts } from './navItems';

export function AppLayout() {
  const { concept } = useTheme();
  const location = useLocation();
  const [counts, setCounts] = useState<NavBadgeCounts>({
    activeAlerts: 5,
    pendingApprovals: 2,
    needsFieldSupport: 2,
  });

  useEffect(() => {
    let active = true;
    getDistricts()
      .then((res) => {
        if (!active) return;
        setCounts({
          activeAlerts: res.summary.activeAlerts,
          pendingApprovals: res.summary.pendingApprovals,
          needsFieldSupport: res.summary.needsFieldSupport,
        });
      })
      .catch(() => {
        // ignore badge fetch errors
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  return (
    <>
      <ConceptBackdrop />
      {concept === 'mitti' && (
        <MittiLayout counts={counts}>
          <Outlet />
        </MittiLayout>
      )}
      {concept === 'haryali' && (
        <HaryaliLayout counts={counts}>
          <Outlet />
        </HaryaliLayout>
      )}
      {concept === 'sarson' && (
        <SarsonLayout counts={counts}>
          <Outlet />
        </SarsonLayout>
      )}
    </>
  );
}
