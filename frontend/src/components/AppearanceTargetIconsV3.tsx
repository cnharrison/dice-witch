import type { AppearanceTargetV4 } from "@dice-witch/dice-v4-model";

const iconClassName =
  "h-full w-full fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.2]";

function LegacyCubeIcon({ fudge = false }: { fudge?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={iconClassName} aria-hidden="true">
      <path d="M15 29h56v56H15Z" />
      <path d="m15 29 14-14h56L71 29m0 0 14-14v56L71 85" />
      {fudge && <path d="M43 43v28M29 57h28" />}
    </svg>
  );
}

function D10Icon({ paired = false }: { paired?: boolean }) {
  const paths = (
    <>
      <path d="M50 5 95 53 50 96 5 53Z" />
      <path d="m50 5 23 43-23 14-23-14Z" />
      <path d="m5 53 22-5 23 48 23-48 22 5" />
    </>
  );
  if (!paired) {
    return (
      <svg viewBox="0 0 100 100" className={iconClassName} aria-hidden="true">
        {paths}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 100" className={iconClassName} aria-hidden="true">
      <g transform="translate(-5 15) scale(.72)">{paths}</g>
      <g transform="translate(48 -8) scale(.72)">{paths}</g>
    </svg>
  );
}

export function AppearanceTargetIconV3({
  target,
}: {
  target: AppearanceTargetV4;
}) {
  switch (target) {
    case "d4":
      return (
        <svg viewBox="0 0 100 100" className={iconClassName} aria-hidden="true">
          <path d="M50 7 92 72 50 94 8 72Z" />
          <path d="M50 7v87" />
        </svg>
      );
    case "d6":
      return <LegacyCubeIcon />;
    case "d8":
      return (
        <svg viewBox="0 0 100 100" className={iconClassName} aria-hidden="true">
          <path d="M50 6 92 30v42L50 95 8 72V30Z" />
          <path d="M50 6 9 72h82Z" />
        </svg>
      );
    case "d10":
      return <D10Icon />;
    case "d12":
      return (
        <svg viewBox="0 0 100 100" className={iconClassName} aria-hidden="true">
          <path d="m50 5 26 9 18 23v28L76 88l-26 8-26-8L6 65V37l18-23Z" />
          <path d="m50 25 23 17-9 28H36l-9-28Z" />
          <path d="M50 5v20m44 12-21 5m3 46L64 70M24 88l12-18M6 37l21 5" />
        </svg>
      );
    case "d20":
      return (
        <svg viewBox="0 0 100 100" className={iconClassName} aria-hidden="true">
          <path d="m50 5 36 20-2 45-34 26-34-26-2-45Z" />
          <path d="M50 5v13M14 25l36-7 36 7M50 18 28 70h44ZM14 25l14 45-12 0m70-45L72 70h12M28 70l22 26 22-26" />
        </svg>
      );
    case "percentile":
      return <D10Icon paired />;
    case "fudge":
      return <LegacyCubeIcon fudge />;
    case "other":
      return (
        <span
          aria-hidden="true"
          className="block aspect-square w-[72%] rounded-full bg-[radial-gradient(circle_at_32%_27%,#fff_0_8%,#d9cee1_20%,#8d7b99_57%,#392d46_100%)] shadow-[inset_-7px_-8px_11px_rgba(27,20,37,0.67),0_3px_8px_rgba(0,0,0,0.53)]"
        />
      );
  }
}
