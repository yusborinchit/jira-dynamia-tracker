export type CategoryRole = 'active' | 'waiting' | 'terminal';

export const CATEGORY_ROLES: readonly CategoryRole[] = ['active', 'waiting', 'terminal'];

export interface DefaultCategory {
  key: string;
  label: string;
  color: string;
  role: CategoryRole;
  alertAfterSeconds: number | null;
  statuses: readonly string[];
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  {
    key: 'development',
    label: 'Desarrollo',
    color: '#2563eb',
    role: 'active',
    alertAfterSeconds: 57_600,
    statuses: ['En curso', 'In Progress'],
  },
  {
    key: 'testing',
    label: 'Testing',
    color: '#06b6d4',
    role: 'active',
    alertAfterSeconds: 28_800,
    statuses: ['Testing', 'Validar', 'Ready to Test'],
  },
  {
    key: 'deploy',
    label: 'Deploy',
    color: '#7c3aed',
    role: 'active',
    alertAfterSeconds: 28_800,
    statuses: ['To Deploy'],
  },
  {
    key: 'waiting_info',
    label: 'Esperando información',
    color: '#f59e0b',
    role: 'waiting',
    alertAfterSeconds: 28_800,
    statuses: ['Pendiente de info', 'Pending for info'],
  },
  {
    key: 'pending',
    label: 'Pendiente',
    color: '#94a3b8',
    role: 'waiting',
    alertAfterSeconds: 144_000,
    statuses: ['Backlog', 'To Do', 'Por hacer', 'Estimar', 'Open'],
  },
  {
    key: 'done',
    label: 'Listo',
    color: '#16a34a',
    role: 'terminal',
    alertAfterSeconds: null,
    statuses: ['Listo', 'Done', 'Hecho', 'Closed'],
  },
];

export const UNCATEGORIZED = 'uncategorized';
export const UNCATEGORIZED_LABEL = 'Sin categoría';
export const UNCATEGORIZED_COLOR = '#ec4899';

export const ACTIVE_WORK_CATEGORY = 'development';

export interface WorkShift {
  from: string;
  to: string;
}

export interface WorkScheduleSetting {
  days: number[];
  shifts: WorkShift[];
}

export const DEFAULT_WORK_SCHEDULE: WorkScheduleSetting = {
  days: [1, 2, 3, 4, 5],
  shifts: [
    { from: '09:00', to: '13:00' },
    { from: '14:00', to: '18:00' },
  ],
};

export const APP_SETTINGS_ID = 1;
