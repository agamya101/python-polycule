import { cloneElement, isValidElement, type ReactElement } from 'react';
import { useRole } from '@/auth/RoleContext';
import { checkPermission, type ActionKey } from '@/auth/permissions';
import { Tooltip } from './Tooltip';

export interface RoleGateProps {
  action: ActionKey;
  generatedBy?: string | null;
  latestVerifiedBy?: string | null;
  extraDisableReason?: string | null;
  children: ReactElement<{ disabled?: boolean; title?: string }>;
}

export function RoleGate({
  action,
  generatedBy,
  latestVerifiedBy,
  extraDisableReason,
  children,
}: RoleGateProps) {
  const { persona } = useRole();
  const perm = checkPermission(persona.role, action, {
    actor: persona.name,
    generatedBy,
    latestVerifiedBy,
  });

  const isAllowed = perm.allowed && !extraDisableReason;
  const reason = !perm.allowed ? perm.reason : extraDisableReason;

  if (isAllowed) {
    return children;
  }

  const disabledChild = isValidElement(children)
    ? cloneElement(children, {
        disabled: true,
        title: reason ?? undefined,
      })
    : children;

  return <Tooltip content={reason}>{disabledChild}</Tooltip>;
}
