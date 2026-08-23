type ProviderRuntimeListener = () => void | Promise<void>;

const listeners = new Set<ProviderRuntimeListener>();

export function onProviderRuntimeChanged(listener: ProviderRuntimeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyProviderRuntimeChanged(): void {
  for (const listener of listeners) void listener();
}
