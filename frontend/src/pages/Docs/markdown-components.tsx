import type { MDXComponents } from "mdx/types.js";
import * as React from "react";
import { Link } from "react-router-dom";
import { MarkdownHeading } from "./MarkdownHeading";

function markdownLink({ href = "", ...props }: React.ComponentProps<"a">) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link
        {...props}
        to={href}
        className="font-medium text-brand underline decoration-brand/45 underline-offset-4 hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }

  return (
    <a
      {...props}
      href={href}
      className="font-medium text-brand underline decoration-brand/45 underline-offset-4 hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export const markdownComponents: MDXComponents = {
  h1: (props) => <MarkdownHeading {...props} level={1} />,
  h2: (props) => <MarkdownHeading {...props} level={2} />,
  h3: (props) => <MarkdownHeading {...props} level={3} />,
  p: (props) => (
    <p {...props} className="mt-5 max-w-[72ch] leading-7 text-foreground/90" />
  ),
  a: markdownLink,
  ul: (props) => (
    <ul {...props} className="mt-5 max-w-[72ch] list-disc space-y-2 pl-6" />
  ),
  ol: (props) => (
    <ol {...props} className="mt-5 max-w-[72ch] list-decimal space-y-3 pl-6" />
  ),
  li: (props) => <li {...props} className="pl-1 leading-7" />,
  blockquote: (props) => (
    <blockquote
      {...props}
      className="mt-6 max-w-[72ch] border-l-4 border-brand bg-brand/5 px-5 py-1 text-foreground/85"
    />
  ),
  code: (props) => (
    <code
      {...props}
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
    />
  ),
  pre: (props) => (
    <pre
      {...props}
      className="mt-5 max-w-full overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm [&>code]:bg-transparent [&>code]:p-0"
    />
  ),
  table: (props) => (
    <div className="mt-6 max-w-full overflow-x-auto rounded-lg border border-border">
      <table {...props} className="w-full border-collapse text-left text-sm" />
    </div>
  ),
  thead: (props) => <thead {...props} className="bg-muted" />,
  th: (props) => (
    <th {...props} className="border-b border-border px-4 py-3 font-semibold" />
  ),
  td: (props) => (
    <td {...props} className="border-b border-border px-4 py-3 align-top" />
  ),
  hr: (props) => <hr {...props} className="my-10 border-border" />,
};
