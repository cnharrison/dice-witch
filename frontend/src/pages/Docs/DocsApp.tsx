import * as React from "react";
import { House, LogIn, Plus, Search } from "lucide-react";
import { Link, NavLink, useLocation, useParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth, useSignIn } from "@/lib/AuthProvider";
import { appConfig } from "@/lib/config";
import {
  defaultDocsEntry,
  docsEntries,
  findDocsEntry,
  type DocsEntry,
} from "./docs";
import { markdownComponents } from "./markdown-components";

function PublicDocsHeader() {
  const location = useLocation();
  const { signIn, isLoaded } = useSignIn();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const login = () => {
    if (!isLoaded) return;
    try {
      signIn.authenticateWithRedirect({
        strategy: "oauth_discord",
        returnTo,
      });
    } catch (error) {
      console.error("Authentication error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex h-full items-center px-3 sm:px-4">
        <Link
          to="/"
          className="flex h-full items-center font-['UnifrakturMaguntia'] text-[2rem] leading-none text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-[2.5rem]"
        >
          Dice Witch
        </Link>
        <nav aria-label="Public" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="sm:w-auto sm:px-3"
          >
            <Link to="/" aria-label="Home">
              <House className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </Button>
          <Button asChild size="icon" className="sm:w-auto sm:px-3">
            <a
              href={appConfig.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Add Dice Witch to your server"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Add to server</span>
            </a>
          </Button>
          <div className="group relative">
            <Button
              type="button"
              size="icon"
              onClick={login}
              disabled={!isLoaded}
              aria-label="Login with Discord"
              aria-describedby="docs-login-requirement"
              className="bg-discord text-discord-foreground hover:bg-discord-hover sm:w-auto sm:px-3"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Login</span>
            </Button>
            <div
              id="docs-login-requirement"
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            >
              You must have already added Dice Witch to your server to log in with Discord.
            </div>
          </div>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function navigationClassName({ isActive }: { isActive: boolean }): string {
  return [
    "block border-l-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive
      ? "border-brand bg-brand/10 font-semibold text-brand"
      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
  ].join(" ");
}

function DocsNavigation() {
  const [query, setQuery] = React.useState("");
  const searchTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matchingEntries = docsEntries.filter((entry) => {
    if (searchTerms.length === 0) return true;
    const searchable = `${entry.title}\n${entry.description}\n${entry.searchText}`.toLocaleLowerCase();
    return searchTerms.every((term) => searchable.includes(term));
  });

  return (
    <aside className="border-b border-border pb-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Player guide
      </p>
      <label className="relative mb-4 block px-0.5">
        <span className="sr-only">Search docs</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          aria-label="Search docs"
          placeholder="Search docs"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <p role="status" className="sr-only">
        {searchTerms.length === 0
          ? `${String(docsEntries.length)} guides available`
          : `${String(matchingEntries.length)} matching guides`}
      </p>
      <nav aria-label="Documentation" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {matchingEntries.map((entry) => (
          <NavLink
            key={entry.slug}
            to={entry.path}
            end
            className={navigationClassName}
          >
            <span className="block">{entry.title}</span>
            <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
              {entry.description}
            </span>
          </NavLink>
        ))}
      </nav>
      {matchingEntries.length === 0 && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
          No guides match “{query.trim()}”.
        </p>
      )}
    </aside>
  );
}

function DocsArticle({ entry }: { entry: DocsEntry }) {
  const Content = entry.content;

  return (
    <React.Suspense
      fallback={<SparkleLoadingIndicator label={`Loading ${entry.title}`} className="min-h-64" />}
    >
      <Content components={markdownComponents} />
    </React.Suspense>
  );
}

function MissingDocsArticle() {
  return (
    <div>
      <h1 className="font-['UnifrakturMaguntia'] text-5xl leading-tight text-brand sm:text-6xl">
        Guide not found
      </h1>
      <p className="mt-5 max-w-[72ch] leading-7 text-foreground/90">
        That Dice Witch guide does not exist. Start with the{" "}
        <Link
          to="/docs"
          className="font-medium text-brand underline decoration-brand/45 underline-offset-4"
        >
          quick start
        </Link>
        .
      </p>
    </div>
  );
}

export default function DocsApp() {
  const { isSignedIn } = useAuth();
  const location = useLocation();
  const wildcard = useParams()["*"] ?? "";
  const slug = wildcard.replace(/^\/+|\/+$/g, "");
  const entry = slug === "" ? defaultDocsEntry : findDocsEntry(slug);
  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const previousTitle = document.title;
    document.title = entry
      ? `${entry.title} · Dice Witch Docs`
      : "Guide not found · Dice Witch Docs";
    return () => {
      document.title = previousTitle;
    };
  }, [entry]);

  React.useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <a
        href="#docs-content"
        className="sr-only z-[60] rounded bg-background px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to guide
      </a>
      {isSignedIn ? <Navbar /> : <PublicDocsHeader />}
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-8 lg:py-10">
        <DocsNavigation />
        <main
          id="docs-content"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 pb-16 outline-none"
        >
          {entry === undefined ? <MissingDocsArticle /> : <DocsArticle entry={entry} />}
        </main>
      </div>
    </div>
  );
}
