import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  FlaskConical,
  HelpCircle,
  LayoutDashboard,
  MessageSquareText,
  Satellite,
  ScrollText,
  Settings,
  ShieldCheck,
  Tractor,
  Users,
} from 'lucide-react';

export interface NavItemDef {
  label: string;
  route: string;
  icon: LucideIcon;
  badgeKey?: 'activeAlerts' | 'pendingApprovals' | 'needsFieldSupport';
}

export const NAV_ITEMS: readonly NavItemDef[] = [
  { label: 'Command Center', route: '/overview', icon: LayoutDashboard },
  { label: 'Early Warning', route: '/early-warning', icon: Satellite, badgeKey: 'activeAlerts' },
  { label: 'Farmers', route: '/farmers', icon: Users },
  { label: 'Soil Cards', route: '/soil-cards', icon: FlaskConical },
  { label: 'Advisories', route: '/advisories', icon: MessageSquareText },
  { label: 'Approvals', route: '/approvals', icon: ShieldCheck, badgeKey: 'pendingApprovals' },
  { label: 'Follow-up', route: '/follow-up', icon: Activity },
  { label: 'Field Support', route: '/field-support', icon: Tractor, badgeKey: 'needsFieldSupport' },
  { label: 'Audit', route: '/audit', icon: ScrollText },
  { label: 'Settings', route: '/settings', icon: Settings },
  { label: 'FAQ', route: '/faq', icon: HelpCircle },
] as const;

export interface NavBadgeCounts {
  activeAlerts: number;
  pendingApprovals: number;
  needsFieldSupport: number;
}
