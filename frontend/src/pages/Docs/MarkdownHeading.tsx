import * as React from "react";

const HEADING_CLASSES = {
  1: "scroll-mt-24 font-['UnifrakturMaguntia'] text-5xl leading-tight text-brand sm:text-6xl",
  2: "mt-12 scroll-mt-24 border-b border-border pb-3 text-2xl font-bold tracking-tight sm:text-3xl",
  3: "mt-8 scroll-mt-24 text-xl font-semibold tracking-tight",
} as const;

function headingText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(headingText).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return headingText(node.props.children);
  }
  return "";
}

function headingSlug(children: React.ReactNode): string {
  return headingText(children)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function MarkdownHeading({
  level,
  children,
  id,
  ...props
}: React.ComponentProps<"h1"> & { level: keyof typeof HEADING_CLASSES }) {
  const Heading = `h${level}` as "h1" | "h2" | "h3";
  const headingId = id || headingSlug(children);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (window.location.hash === `#${headingId}`) {
      headingRef.current?.scrollIntoView?.();
    }
  }, [headingId]);

  return (
    <Heading
      {...props}
      ref={headingRef}
      id={headingId}
      className={HEADING_CLASSES[level]}
    >
      <a
        href={`#${headingId}`}
        className="group rounded-sm text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
        <span
          aria-hidden="true"
          className="ml-2 font-sans text-[0.7em] font-normal text-brand/50 group-hover:text-brand"
        >
          #
        </span>
      </a>
    </Heading>
  );
}
