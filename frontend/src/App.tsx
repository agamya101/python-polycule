import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './theme/ThemeContext';
import { RoleProvider } from './auth/RoleContext';
import { AppLayout } from './components/layout/AppLayout';
import Landing from './pages/Landing';
import Overview from './pages/Overview';
import EarlyWarning from './pages/EarlyWarning';
import DistrictReport from './pages/DistrictReport';
import Farmers from './pages/Farmers';
import FarmerNew from './pages/FarmerNew';
import FarmerDetail from './pages/FarmerDetail';
import SoilCards from './pages/SoilCards';
import SoilCardNew from './pages/SoilCardNew';
import SoilCardDetail from './pages/SoilCardDetail';
import { Advisories } from './pages/Advisories';
import { Approvals } from './pages/Approvals';
import { FollowUp } from './pages/FollowUp';
import { FieldSupport } from './pages/FieldSupport';
import { Audit } from './pages/Audit';
import { AuditReport } from './pages/AuditReport';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';
import { DesignLab } from './pages/DesignLab';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <RoleProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/design-lab" element={<DesignLab />} />
            <Route element={<AppLayout />}>
              <Route path="/overview" element={<Overview />} />
              <Route path="/early-warning" element={<EarlyWarning />} />
              <Route path="/districts/:id" element={<DistrictReport />} />
              <Route path="/farmers" element={<Farmers />} />
              <Route path="/farmers/new" element={<FarmerNew />} />
              <Route path="/farmers/:id" element={<FarmerDetail />} />
              <Route path="/soil-cards" element={<SoilCards />} />
              <Route path="/soil-cards/new" element={<SoilCardNew />} />
              <Route path="/soil-cards/:id" element={<SoilCardDetail />} />
              <Route path="/advisories" element={<Advisories />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/follow-up" element={<FollowUp />} />
              <Route path="/field-support" element={<FieldSupport />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/audit/report/:caseId" element={<AuditReport />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/faq" element={<Landing />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </ErrorBoundary>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                fontSize: '0.875rem',
              },
            }}
          />
        </RoleProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
