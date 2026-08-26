import { z } from "zod";

export type SecretsStoreBinding = {
  get(): Promise<string>;
};

export type WorkerSecretSource = string | SecretsStoreBinding;

const WorkerSecretStringSchema = z.string();
const SecretsStoreBindingSchema = z.object({
  get: z.function({ input: [], output: z.promise(z.string()) }),
});
const WorkerSecretSourceSchema = z.union([
  WorkerSecretStringSchema,
  SecretsStoreBindingSchema,
]);
const WorkerSecretValueSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value);
type WorkerSecretSourceInput = Parameters<
  typeof WorkerSecretSourceSchema.parse
>[0];

export function isWorkerSecretSource(
  value: WorkerSecretSourceInput,
): value is WorkerSecretSource {
  return WorkerSecretSourceSchema.safeParse(value).success;
}

function isWorkerSecretString(source: WorkerSecretSource): source is string {
  return WorkerSecretStringSchema.safeParse(source).success;
}

export async function readWorkerSecret(
  source: WorkerSecretSource,
  name: string,
): Promise<string> {
  const value = isWorkerSecretString(source) ? source : await source.get();
  const result = WorkerSecretValueSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${name} is invalid`);
  }
  return result.data;
}
