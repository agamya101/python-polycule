import type { Role } from './personas';

export type ActionKey =
  | 'farmer.register'
  | 'boundary.verify'
  | 'soil.create'
  | 'soil.edit'
  | 'soil.confirm'
  | 'soil.generateSms'
  | 'message.generate'
  | 'message.edit'
  | 'message.submit'
  | 'message.approve'
  | 'message.reject'
  | 'message.send'
  | 'message.acknowledge'
  | 'case.verify'
  | 'case.close'
  | 'case.reopen'
  | 'task.assign'
  | 'scan.run'
  | 'task.visit'
  | 'farmer.analyze'
  | 'followup.check'
  | 'demo.fastForward';

const ALL_ROLES: readonly Role[] = ['DEPT_OFFICER', 'EXTENSION_WORKER', 'KVK_EXPERT', 'LOCAL_REP'];

export const ACTION_ROLES: Record<ActionKey, readonly Role[]> = {
  'farmer.register': ['EXTENSION_WORKER', 'KVK_EXPERT'],
  'boundary.verify': ['EXTENSION_WORKER', 'KVK_EXPERT'],
  'soil.create': ['EXTENSION_WORKER', 'KVK_EXPERT'],
  'soil.edit': ['EXTENSION_WORKER', 'KVK_EXPERT'],
  'soil.confirm': ['EXTENSION_WORKER', 'KVK_EXPERT'],
  'soil.generateSms': ['EXTENSION_WORKER', 'KVK_EXPERT'],
  'message.generate': ['DEPT_OFFICER', 'EXTENSION_WORKER', 'KVK_EXPERT'],
  'message.edit': ['DEPT_OFFICER', 'EXTENSION_WORKER', 'KVK_EXPERT'],
  'message.submit': ['DEPT_OFFICER', 'EXTENSION_WORKER', 'KVK_EXPERT'],
  'message.approve': ['DEPT_OFFICER'],
  'message.reject': ['DEPT_OFFICER'],
  'message.send': ['DEPT_OFFICER'],
  'message.acknowledge': ALL_ROLES,
  'case.verify': ALL_ROLES,
  'case.close': ['DEPT_OFFICER'],
  'case.reopen': ['DEPT_OFFICER'],
  'task.assign': ['DEPT_OFFICER'],
  'scan.run': ['DEPT_OFFICER'],
  'task.visit': ['KVK_EXPERT', 'LOCAL_REP'],
  'farmer.analyze': ALL_ROLES,
  'followup.check': ALL_ROLES,
  'demo.fastForward': ALL_ROLES,
};

export interface PermissionCheckOptions {
  actor?: string;
  generatedBy?: string | null;
  latestVerifiedBy?: string | null;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string | null;
}

export function checkPermission(
  role: Role,
  action: ActionKey,
  options?: PermissionCheckOptions,
): PermissionResult {
  const allowedRoles = ACTION_ROLES[action];
  if (!allowedRoles.includes(role)) {
    return {
      allowed: false,
      reason: `Requires: ${allowedRoles.join(', ')}`,
    };
  }

  if (
    (action === 'message.approve' || action === 'message.reject') &&
    options?.actor &&
    options?.generatedBy &&
    options.actor === options.generatedBy
  ) {
    return {
      allowed: false,
      reason: 'Separation of duties: you drafted this',
    };
  }

  if (
    action === 'case.close' &&
    options?.actor &&
    options?.latestVerifiedBy &&
    options.actor === options.latestVerifiedBy
  ) {
    return {
      allowed: false,
      reason: 'Separation of duties: you recorded the latest verification',
    };
  }

  return { allowed: true, reason: null };
}

export function can(role: Role, action: ActionKey, options?: PermissionCheckOptions): boolean {
  return checkPermission(role, action, options).allowed;
}
