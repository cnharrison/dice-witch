import type { AppearanceEditorTargetV3 } from "@/lib/appearance-editor-v3";
import { APPEARANCE_TARGET_LABELS } from "@/types/appearance";
import * as React from "react";

type AppearanceScopeBannerProps = {
  target: AppearanceEditorTargetV3;
  hasOverride: boolean;
  disabled?: boolean;
  sharedNotices?: readonly string[];
  onReset?(): void;
};

export function AppearanceScopeBanner({
  target,
  hasOverride,
  disabled = false,
  sharedNotices = [],
  onReset,
}: AppearanceScopeBannerProps) {
  const label = target === "all"
    ? null
    : APPEARANCE_TARGET_LABELS[target];
  const caption = label === null
    ? null
    : hasOverride
      ? "Reset to ALL removes the override."
      : `Your first change gives ${label} its own copy. ALL stays untouched.`;
  if (caption === null && sharedNotices.length === 0) return null;

  return (
    <div className="rounded-lg border border-brand/35 bg-muted/20 p-3">
      {caption !== null && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{caption}</span>
          {hasOverride && onReset !== undefined && (
            <button
              type="button"
              disabled={disabled}
              onClick={onReset}
              className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Reset to ALL
            </button>
          )}
        </p>
      )}
      {sharedNotices.map((notice) => (
        <p key={notice} className="mt-1 text-xs text-muted-foreground">
          {notice}
        </p>
      ))}
    </div>
  );
}
