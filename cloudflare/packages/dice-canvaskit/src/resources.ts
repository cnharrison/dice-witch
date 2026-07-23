export type CanvasKitResourceV4 = {
  delete(): void;
  isDeleted?(): boolean;
};

export type CanvasKitResourceDisposerV4<Resource> = (
  resource: Resource,
) => void;

type OwnedResourceV4 = {
  resource: CanvasKitResourceV4;
  dispose(): void;
};

function deleteResource(resource: CanvasKitResourceV4): void {
  if (resource.isDeleted?.() === true) return;
  resource.delete();
}

export class CanvasKitResourceScopeV4 {
  readonly #resources: OwnedResourceV4[] = [];
  #disposed = false;

  own<Resource extends CanvasKitResourceV4>(
    resource: Resource | null,
    label: string,
    dispose: CanvasKitResourceDisposerV4<Resource> = deleteResource,
  ): Resource {
    if (this.#disposed) {
      throw new Error("CanvasKit resource scope is disposed");
    }
    if (resource === null) {
      throw new Error(`CanvasKit ${label} allocation failed`);
    }
    if (!this.#resources.some((entry) => entry.resource === resource)) {
      this.#resources.push({
        resource,
        dispose: () => {
          dispose(resource);
        },
      });
    }
    return resource;
  }

  #take(resource: CanvasKitResourceV4): OwnedResourceV4 {
    const index = this.#resources.findIndex(
      (entry) => entry.resource === resource,
    );
    const entry = this.#resources[index];
    if (entry === undefined) {
      throw new Error("CanvasKit resource is not owned by this scope");
    }
    this.#resources.splice(index, 1);
    return entry;
  }

  release<Resource extends CanvasKitResourceV4>(resource: Resource): Resource {
    this.#take(resource);
    return resource;
  }

  delete(resource: CanvasKitResourceV4): void {
    const entry = this.#take(resource);
    entry.dispose();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const entry of this.#resources.reverse()) {
      try {
        entry.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#resources.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, "CanvasKit resource cleanup failed");
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }
  return typeof (value as { then?: unknown }).then === "function";
}

type SynchronousCallbackGuardV4<Result> = [Result] extends [never]
  ? []
  : Result extends PromiseLike<unknown>
    ? ["CanvasKit synchronous resource callbacks cannot return promises"]
    : [];

export function withCanvasKitResourcesSyncV4<Result>(
  operation: (scope: CanvasKitResourceScopeV4) => Result,
  ...promiseNotAllowed: SynchronousCallbackGuardV4<Result>
): Result {
  if (promiseNotAllowed.length > 0) {
    throw new Error(
      "CanvasKit synchronous resource callbacks cannot return promises",
    );
  }
  const scope = new CanvasKitResourceScopeV4();
  try {
    const result = operation(scope);
    if (isPromiseLike(result)) {
      throw new Error(
        "CanvasKit synchronous resource callback returned a promise",
      );
    }
    scope.dispose();
    return result;
  } catch (operationError) {
    try {
      scope.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        "CanvasKit operation and cleanup failed",
        { cause: cleanupError },
      );
    }
    throw operationError;
  }
}

export async function withCanvasKitResourcesV4<Result>(
  operation: (scope: CanvasKitResourceScopeV4) => Result | Promise<Result>,
): Promise<Result> {
  const scope = new CanvasKitResourceScopeV4();
  try {
    const result = await operation(scope);
    scope.dispose();
    return result;
  } catch (operationError) {
    try {
      scope.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        "CanvasKit operation and cleanup failed",
        { cause: cleanupError },
      );
    }
    throw operationError;
  }
}
