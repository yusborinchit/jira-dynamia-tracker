export interface IssueChangedEvent {
  type: 'issue.changed';
  issueKey: string;
  statusName: string | null;
  assignee: string | null;
  occurredAt: string;
}

export type TrackerEvent = IssueChangedEvent;

type Listener = (event: TrackerEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publish(event: TrackerEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }
}

export function subscriberCount(): number {
  return listeners.size;
}
