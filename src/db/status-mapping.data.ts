export const STATUS_CATEGORIES = {
  pending: ['Backlog', 'To Do', 'Por hacer', 'Estimar'],
  waiting_info: ['Pendiente de info', 'Pending for info'],
  development: ['En curso', 'In Progress'],
  deploy: ['To Deploy'],
  testing: ['Testing', 'Validar'],
  done: ['Listo', 'Done', 'Hecho'],
} as const satisfies Record<string, readonly string[]>;

export type Category = keyof typeof STATUS_CATEGORIES;

export const UNCATEGORIZED_COLOR = '#ec4899';

/**
 * Colores del reporte. Elegidos con luminosidad bien distinta entre sí para que el Gantt
 * siga siendo legible impreso en blanco y negro. `uncategorized` es deliberadamente
 * estridente: marca estados de Jira que faltan mapear acá.
 */
export const CATEGORY_COLORS: Record<Category, string> = {
  pending: '#94a3b8',
  waiting_info: '#f59e0b',
  development: '#2563eb',
  deploy: '#7c3aed',
  testing: '#06b6d4',
  done: '#16a34a',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category as Category] ?? UNCATEGORIZED_COLOR;
}

export const TERMINAL_CATEGORIES = new Set<string>(['done']);

export function isTerminalCategory(category: string): boolean {
  return TERMINAL_CATEGORIES.has(category);
}

export interface StatusMappingEntry {
  statusName: string;
  category: Category;
}

export const STATUS_MAPPING_ENTRIES: StatusMappingEntry[] = Object.entries(STATUS_CATEGORIES).flatMap(
  ([category, names]) => names.map((statusName) => ({ statusName, category: category as Category })),
);
