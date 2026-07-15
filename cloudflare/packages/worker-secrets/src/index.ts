export type SecretsStoreBinding = {
  get(): Promise<string>;
};

export type WorkerSecretSource = string | SecretsStoreBinding;

export function isWorkerSecretSource(
  value: unknown,
): value is WorkerSecretSource {
  return (
    typeof value === "string" ||
    (typeof value === "object" &&
      value !== null &&
      "get" in value &&
      typeof value.get === "function")
  );
}

export async function readWorkerSecret(
  source: WorkerSecretSource,
  name: string,
): Promise<string> {
  const value = typeof source === "string" ? source : await source.get();
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}
