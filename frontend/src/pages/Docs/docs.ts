import * as React from "react";
import type { MDXProps } from "mdx/types.js";
import docsSearchText from "virtual:dice-witch-docs-search";

type DocsComponent = React.LazyExoticComponent<React.ComponentType<MDXProps>>;

function requiredSearchText(slug: string): string {
  const searchText = docsSearchText[slug];
  if (searchText === undefined) {
    throw new Error(`Documentation search text for ${slug} is required`);
  }
  return searchText;
}

export type DocsEntry = Readonly<{
  slug: string;
  path: string;
  title: string;
  description: string;
  searchText: string;
  content: DocsComponent;
}>;

export const docsEntries: readonly DocsEntry[] = [
  {
    slug: "quick-start",
    path: "/docs",
    title: "Quick start",
    description: "Make your first Dice Witch roll in Discord or on the web.",
    searchText: requiredSearchText("quick-start"),
    content: React.lazy(() => import("./content/quick-start.md")),
  },
  {
    slug: "dice-notation",
    path: "/docs/dice-notation",
    title: "Dice notation",
    description: "Write dice, arithmetic, groups, and common modifiers.",
    searchText: requiredSearchText("dice-notation"),
    content: React.lazy(() => import("./content/dice-notation.md")),
  },
  {
    slug: "modifiers",
    path: "/docs/modifiers",
    title: "Modifiers",
    description: "Keep, drop, explode, reroll, count, and highlight dice.",
    searchText: requiredSearchText("modifiers"),
    content: React.lazy(() => import("./content/modifiers.md")),
  },
  {
    slug: "saved-rolls",
    path: "/docs/saved-rolls",
    title: "Saved rolls",
    description: "Save, use, organize, and share reusable rolls.",
    searchText: requiredSearchText("saved-rolls"),
    content: React.lazy(() => import("./content/saved-rolls.md")),
  },
  {
    slug: "appearances-and-web-rolling",
    path: "/docs/appearances-and-web-rolling",
    title: "Appearances and web rolling",
    description: "Customize dice and deliver rolls from the website.",
    searchText: requiredSearchText("appearances-and-web-rolling"),
    content: React.lazy(() => import("./content/appearances-and-web-rolling.md")),
  },
  {
    slug: "troubleshooting",
    path: "/docs/troubleshooting",
    title: "Troubleshooting",
    description: "Resolve missing commands, destinations, results, and styles.",
    searchText: requiredSearchText("troubleshooting"),
    content: React.lazy(() => import("./content/troubleshooting.md")),
  },
];

export const defaultDocsEntry = docsEntries[0];

export function findDocsEntry(slug: string): DocsEntry | undefined {
  return docsEntries.find((entry) => entry.slug === slug);
}
