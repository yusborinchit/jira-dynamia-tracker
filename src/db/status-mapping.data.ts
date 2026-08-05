export const STATUS_CATEGORIES = {
  pending: ['Backlog', 'To Do', 'Por hacer', 'Estimar'],
  waiting_info: ['Pendiente de info', 'Pending for info'],
  development: ['En curso', 'In Progress'],
  deploy: ['To Deploy'],
  testing: ['Testing', 'Validar'],
  done: ['Listo', 'Done', 'Hecho'],
} as const satisfies Record<string, readonly string[]>;

export type Category = keyof typeof STATUS_CATEGORIES;

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
