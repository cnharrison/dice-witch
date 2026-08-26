import randomPreview1 from "@/assets/marketing-random-previews/random-1.webp";
import randomPreview2 from "@/assets/marketing-random-previews/random-2.webp";
import randomPreview3 from "@/assets/marketing-random-previews/random-3.webp";
import randomPreview4 from "@/assets/marketing-random-previews/random-4.webp";
import randomPreview5 from "@/assets/marketing-random-previews/random-5.webp";
import randomPreview6 from "@/assets/marketing-random-previews/random-6.webp";
import { PixelatedImageTransition } from "@/components/PixelatedPreviewImage";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import * as React from "react";

const RANDOM_PREVIEWS = [
  randomPreview1,
  randomPreview2,
  randomPreview3,
  randomPreview4,
  randomPreview5,
  randomPreview6,
].map((source) => ({ source, width: 750, height: 300 }));

function nextPreviewIndex(current: number): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  if (value === undefined) throw new Error("Random preview selection failed");
  return (current + 1 + (value % (RANDOM_PREVIEWS.length - 1))) % RANDOM_PREVIEWS.length;
}

export function MarketingAppearancePreviewView({
  ImageTransition,
}: {
  ImageTransition: typeof PixelatedImageTransition;
}) {
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const [previewFailed, setPreviewFailed] = React.useState(false);

  return (
    <section
      aria-label="Random appearance preview"
      className="overflow-hidden rounded-xl border border-marketing-border bg-marketing-card p-4 shadow-lg"
    >
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            setPreviewFailed(false);
            setPreviewIndex(nextPreviewIndex);
          }}
          className="bg-marketing-accent text-marketing-background hover:bg-marketing-accent-hover"
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Reroll
        </Button>
      </div>
      <div
        className="mt-4 flex min-h-48 items-center justify-center overflow-hidden rounded-lg border border-marketing-border bg-marketing-background p-3 sm:min-h-72"
        aria-live="polite"
      >
        {previewFailed ? (
          <p role="alert" className="text-sm text-marketing-muted">
            Preview unavailable.
          </p>
        ) : (
          <ImageTransition
            candidate={RANDOM_PREVIEWS[previewIndex]}
            alt={`Random Dice Witch appearance ${String(previewIndex + 1)}`}
            onDisplay={() => setPreviewFailed(false)}
            onError={() => setPreviewFailed(true)}
          />
        )}
      </div>
    </section>
  );
}

export default function MarketingAppearancePreview() {
  return (
    <MarketingAppearancePreviewView
      ImageTransition={PixelatedImageTransition}
    />
  );
}
