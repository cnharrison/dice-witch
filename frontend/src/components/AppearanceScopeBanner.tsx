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

// States what the rows currently edit, per the copy-on-write contract: ALL,
// a target following ALL (first change forks), or a target with its own
// override. Shared-design change notices surface here instead of below.
export function AppearanceScopeBanner({
  target,
  hasOverride,
  disabled = false,
  sharedNotices = [],
  onReset,
}: AppearanceScopeBannerProps) {
  const label = target === "all"
    ? "ALL"
    : APPEARANCE_TARGET_LABELS[target];

  let title: string;
  let caption: string;
  if (target === "all") {
    title = "Editing ALL";
    caption = "Applies to every die without its own design.";
  } else if (hasOverride) {
    title = `Editing ${label} only`;
    caption = "Reset to ALL removes the override.";
  } else {
    title = `${label} follows ALL right now`;
    caption = `Your first change gives ${label} its own copy. ALL stays untouched.`;
  }

  return (
    <div className="rounded-lg border border-brand/35 bg-muted/20 p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
      {sharedNotices.map((notice) => (
        <p key={notice} className="mt-1 text-xs text-muted-foreground">
          {notice}
        </p>
      ))}
    </div>
  );
}
