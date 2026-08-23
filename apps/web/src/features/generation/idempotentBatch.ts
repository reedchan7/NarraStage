export async function runIdempotentBatch<T>(
  items: readonly T[],
  submit: (item: T) => Promise<string>,
  clearCompleted: (scope: string) => void,
): Promise<void> {
  const completedScopes: string[] = [];
  for (const item of items) completedScopes.push(await submit(item));
  completedScopes.forEach(clearCompleted);
}
