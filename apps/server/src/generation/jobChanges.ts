export interface JobChangedNotification {
  jobId: string;
  principalId: string;
  version: number;
}

export type JobChangedListener = (notification: JobChangedNotification) => void;

export class JobChangePublisher {
  readonly #listeners = new Set<JobChangedListener>();

  publish(notification: JobChangedNotification): void {
    for (const listener of this.#listeners) listener(notification);
  }

  subscribe(listener: JobChangedListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
