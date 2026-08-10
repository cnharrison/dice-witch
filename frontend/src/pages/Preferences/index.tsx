import { AppearanceEditorV3 } from "@/components/AppearanceEditorV3";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { SearchableGuildPicker } from "@/components/SearchableGuildPicker";
import { ServerAppearanceModeV3 } from "@/components/ServerAppearanceModeV3";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useGuild } from "@/context/GuildContext";
import { AppearanceApiError } from "@/lib/appearance";
import {
  getGuildAppearanceProfileV4,
  getPersonalAppearanceBootstrapV4,
  putGuildAppearanceProfileV3,
  putGuildAppearanceProfileV4,
  putPersonalAppearanceProfileV3,
  putPersonalAppearanceProfileV4,
  type PersonalAppearanceBootstrapV4,
} from "@/lib/appearance-v3";
import {
  PERSONAL_APPEARANCE_BOOTSTRAP_V4_QUERY_KEY,
  PERSONAL_APPEARANCE_STALE_TIME_MS,
} from "@/lib/appearance-query";
import {
  createEmptyAppearanceProfileV4,
  setGuildAppearanceModeV3,
} from "@/lib/appearance-editor-v3";
import { appConfig } from "@/lib/config";
import { customFetch } from "@/lib/api";
import type {
  AppearanceProfileV3,
  AppearanceProfileV4,
  GuildAppearanceProfileV3,
  GuildAppearanceProfileV4,
} from "@/types/appearance";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

interface GuildMembership {
  guilds: {
    id: string;
    name: string;
    icon: string | null;
  };
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

async function readJsonResponse(
  response: Response,
  errorMessage: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(errorMessage);
  }
}

function parseGuildMemberships(value: unknown): GuildMembership[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["guilds"]) ||
    !Array.isArray(value.guilds) ||
    value.guilds.length > 250
  ) {
    throw new Error("Guild response is invalid");
  }
  return value.guilds.map((membership) => {
    if (
      !isRecord(membership) ||
      !hasExactKeys(membership, [
        "guilds",
        "isAdmin",
        "isDiceWitchAdmin",
      ]) ||
      !isRecord(membership.guilds) ||
      !hasExactKeys(membership.guilds, ["icon", "id", "name"]) ||
      typeof membership.guilds.id !== "string" ||
      !SNOWFLAKE.test(membership.guilds.id) ||
      typeof membership.guilds.name !== "string" ||
      membership.guilds.name.length < 1 ||
      membership.guilds.name.length > 255 ||
      (membership.guilds.icon !== null &&
        typeof membership.guilds.icon !== "string") ||
      typeof membership.isAdmin !== "boolean" ||
      typeof membership.isDiceWitchAdmin !== "boolean"
    ) {
      throw new Error("Guild response is invalid");
    }
    return {
      guilds: {
        id: membership.guilds.id,
        name: membership.guilds.name,
        icon: membership.guilds.icon,
      },
      isAdmin: membership.isAdmin,
      isDiceWitchAdmin: membership.isDiceWitchAdmin,
    };
  });
}

async function getGuildMemberships(): Promise<GuildMembership[]> {
  const response = await customFetch("/api/guilds/mutual");
  if (!response.ok) throw new Error("Guilds are unavailable");
  return parseGuildMemberships(
    await readJsonResponse(response, "Guild response is invalid"),
  );
}

async function getGuildPreferences(guildId: string): Promise<boolean> {
  const response = await customFetch(`/api/guilds/${guildId}/preferences`);
  if (!response.ok) throw new Error("Guild preferences are unavailable");
  const value = await readJsonResponse(
    response,
    "Guild preference response is invalid",
  );
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["preferences"]) ||
    !isRecord(value.preferences) ||
    !hasExactKeys(value.preferences, ["skipDiceDelay"]) ||
    typeof value.preferences.skipDiceDelay !== "boolean"
  ) {
    throw new Error("Guild preferences are unavailable");
  }
  return value.preferences.skipDiceDelay;
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <SparkleLoadingIndicator
      label={label}
      className="min-h-64 rounded-xl border bg-card"
    />
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/45 bg-destructive/10 p-5 text-destructive" role="alert">
      <h2 className="font-semibold">Appearance settings are unavailable</h2>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}

function retryAppearanceQuery(
  failureCount: number,
  error: unknown,
  maximumRetries: number,
): boolean {
  if (
    error instanceof AppearanceApiError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < maximumRetries;
}

function appearanceErrorMessage(error: unknown): string {
  if (!(error instanceof AppearanceApiError)) {
    return error instanceof Error ? error.message : "Appearance settings are unavailable";
  }
  switch (error.code) {
    case "appearance_authentication_required":
      return "Your session expired. Sign in again to load appearance settings.";
    case "appearance_catalog_build_mismatch":
      return "This dashboard build does not match the appearance catalog. Reload the page before editing.";
    case "appearance_profile_version_conflict":
      return "The stored profile belongs to another appearance version and was not migrated in the browser.";
    case "appearance_profile_response_invalid":
      return "The stored appearance profile is malformed and was not replaced.";
    case "appearance_guild_forbidden":
      return "You no longer have permission to administer this server appearance.";
    case "appearance_data_unavailable":
    case "appearance_service_unavailable":
    case "appearance_web_api_unavailable":
      return "The appearance service is temporarily unavailable. No settings were changed.";
    default:
      return "Appearance settings could not be loaded safely.";
  }
}

export default function Preferences() {
  const { selectedGuildId, setSelectedGuildId } = useGuild();
  const queryClient = useQueryClient();
  const [section, setSection] = React.useState<"personal" | "guild">(
    "personal",
  );
  const [appearanceDraftDirty, setAppearanceDraftDirty] = React.useState(false);

  const discardAppearanceDraft = (): boolean =>
    !appearanceDraftDirty ||
    window.confirm("Discard unsaved appearance changes?");

  const selectSection = (nextSection: "personal" | "guild") => {
    if (nextSection === section || !discardAppearanceDraft()) return;
    setAppearanceDraftDirty(false);
    setSection(nextSection);
  };

  const selectGuild = (guildId: string) => {
    if (guildId === selectedGuildId || !discardAppearanceDraft()) return;
    setAppearanceDraftDirty(false);
    setSelectedGuildId(guildId);
  };

  const personalBootstrapQuery = useQuery({
    queryKey: PERSONAL_APPEARANCE_BOOTSTRAP_V4_QUERY_KEY,
    queryFn: getPersonalAppearanceBootstrapV4,
    staleTime: PERSONAL_APPEARANCE_STALE_TIME_MS,
    retry: (failureCount, error) =>
      retryAppearanceQuery(failureCount, error, 2),
  });

  const guildsQuery = useQuery({
    queryKey: ["guilds"],
    queryFn: getGuildMemberships,
    staleTime: 5 * 60 * 1_000,
    retry: 2,
  });

  const catalog = personalBootstrapQuery.data?.catalog;
  const personalResource = personalBootstrapQuery.data?.resource;

  const adminGuilds = guildsQuery.isSuccess
    ? guildsQuery.data.filter(
        ({ isAdmin, isDiceWitchAdmin }) => isAdmin || isDiceWitchAdmin,
      )
    : [];
  const selectedAdminGuild = adminGuilds.find(
    ({ guilds }) => guilds.id === selectedGuildId,
  );
  const soleAdminGuildId =
    adminGuilds.length === 1 ? adminGuilds[0]?.guilds.id : undefined;

  React.useEffect(() => {
    if (selectedGuildId === undefined && soleAdminGuildId !== undefined) {
      setSelectedGuildId(soleAdminGuildId);
    }
  }, [selectedGuildId, setSelectedGuildId, soleAdminGuildId]);

  React.useEffect(() => {
    if (!guildsQuery.isLoading && adminGuilds.length === 0) {
      setSection("personal");
    }
  }, [adminGuilds.length, guildsQuery.isLoading]);

  const guildAppearanceQuery = useQuery({
    queryKey: ["appearanceProfileV4", "guild", selectedGuildId],
    queryFn: () => {
      if (!catalog || !selectedGuildId) {
        throw new Error("Guild appearance context is missing");
      }
      return getGuildAppearanceProfileV4(selectedGuildId, catalog);
    },
    enabled:
      section === "guild" &&
      personalBootstrapQuery.isSuccess &&
      selectedAdminGuild !== undefined,
    retry: (failureCount, error) =>
      retryAppearanceQuery(failureCount, error, 1),
  });

  const guildPreferencesQuery = useQuery({
    queryKey: ["guildPreferences", selectedGuildId],
    queryFn: () => {
      if (!selectedGuildId) throw new Error("Guild id is missing");
      return getGuildPreferences(selectedGuildId);
    },
    enabled: section === "guild" && selectedAdminGuild !== undefined,
    staleTime: 5 * 60 * 1_000,
    retry: 1,
  });

  const personalMutation = useMutation({
    mutationFn: async ({
      profile,
      revision,
    }: {
      profile:
        | AppearanceProfileV3
        | AppearanceProfileV4
        | GuildAppearanceProfileV3
        | GuildAppearanceProfileV4;
      revision: number;
    }) => {
      if (!catalog) {
        throw new Error("Personal appearance catalog is not loaded");
      }
      if ("mode" in profile) {
        throw new Error("Guild profile cannot be saved as a personal profile");
      }
      return profile.version === 4
        ? putPersonalAppearanceProfileV4(revision, profile, catalog)
        : putPersonalAppearanceProfileV3(revision, profile, catalog);
    },
    onSuccess: (resource) => {
      queryClient.setQueryData(
        PERSONAL_APPEARANCE_BOOTSTRAP_V4_QUERY_KEY,
        (current: PersonalAppearanceBootstrapV4 | undefined) =>
          current === undefined ? current : { ...current, resource },
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: PERSONAL_APPEARANCE_BOOTSTRAP_V4_QUERY_KEY,
      });
    },
  });

  const guildAppearanceMutation = useMutation({
    mutationFn: async ({
      profile,
      guildId,
      revision,
    }: {
      profile:
        | AppearanceProfileV3
        | AppearanceProfileV4
        | GuildAppearanceProfileV3
        | GuildAppearanceProfileV4;
      guildId: string;
      revision: number;
    }) => {
      if (!catalog) {
        throw new Error("Guild appearance catalog is not loaded");
      }
      if (!("mode" in profile)) {
        throw new Error("Personal profile cannot be saved as a guild profile");
      }
      return profile.version === 4
        ? putGuildAppearanceProfileV4(guildId, revision, profile, catalog)
        : putGuildAppearanceProfileV3(guildId, revision, profile, catalog);
    },
    onSuccess: (resource, variables) => {
      queryClient.setQueryData(
        ["appearanceProfileV4", "guild", variables.guildId],
        resource,
      );
    },
    onError: (_error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["appearanceProfileV4", "guild", variables.guildId],
      });
    },
  });

  const guildPreferencesMutation = useMutation({
    mutationFn: async ({
      guildId,
      skipDiceDelay,
    }: {
      guildId: string;
      skipDiceDelay: boolean;
    }) => {
      const response = await customFetch(
        `/api/guilds/${guildId}/preferences`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ skipDiceDelay }),
        },
      );
      if (!response.ok) {
        throw new Error("Guild preference could not be saved");
      }
      const value = await readJsonResponse(
        response,
        "Guild preference response is invalid",
      );
      if (
        !isRecord(value) ||
        !hasExactKeys(value, ["success"]) ||
        value.success !== true
      ) {
        throw new Error("Guild preference could not be saved");
      }
      return skipDiceDelay;
    },
    onSuccess: (skipDiceDelay, variables) => {
      queryClient.setQueryData(
        ["guildPreferences", variables.guildId],
        skipDiceDelay,
      );
    },
  });

  const guildResource = guildAppearanceQuery.data;

  let content: React.ReactNode;
  if (personalBootstrapQuery.isError) {
    content = (
      <ErrorPanel
        message={appearanceErrorMessage(personalBootstrapQuery.error)}
      />
    );
  } else if (personalBootstrapQuery.isLoading || !catalog || !personalResource) {
    content = <LoadingPanel label="Loading your appearance workspace…" />;
  } else if (section === "personal") {
    content = (
      <AppearanceEditorV3
        catalog={catalog}
        resource={personalResource}
        kind="personal"
        personalDesigns={personalResource.profile?.designs ?? []}
        isSaving={personalMutation.isPending}
        version={personalResource.profile?.version ?? 4}
        onDirtyChange={setAppearanceDraftDirty}
        onSave={async (profile, revision) => {
          if ("mode" in profile) {
            throw new Error("Personal appearance profile is required");
          }
          await personalMutation.mutateAsync({ profile, revision });
        }}
      />
    );
  } else {
    let serverSettings: React.ReactNode;
    if (selectedAdminGuild === undefined || selectedGuildId === undefined) {
      serverSettings = (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Choose a server where you have Administrator or Dice Witch Admin
          permission.
        </div>
      );
    } else if (guildAppearanceQuery.isError) {
      serverSettings = (
        <ErrorPanel
          message={appearanceErrorMessage(guildAppearanceQuery.error)}
        />
      );
    } else if (guildAppearanceQuery.isLoading || !guildResource) {
      serverSettings = <LoadingPanel label="Loading server dice…" />;
    } else {
      let deliverySetting: React.ReactNode;
      if (guildPreferencesQuery.isError) {
        deliverySetting = (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {guildPreferencesQuery.error.message}
          </p>
        );
      } else if (
        guildPreferencesQuery.isLoading ||
        guildPreferencesQuery.data === undefined
      ) {
        deliverySetting = (
          <SparkleLoadingIndicator
            label="Loading roll delivery preference"
            className="mt-4 min-h-20"
          />
        );
      } else {
        deliverySetting = (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3">
              <Switch
                id="skipDiceDelay"
                checked={guildPreferencesQuery.data}
                disabled={guildPreferencesMutation.isPending}
                onCheckedChange={(skipDiceDelay) =>
                  guildPreferencesMutation.mutate({
                    guildId: selectedGuildId,
                    skipDiceDelay,
                  })
                }
              />
              <Label htmlFor="skipDiceDelay">
                Skip dice roll delay and clatter message
              </Label>
            </div>
            {guildPreferencesMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {guildPreferencesMutation.error.message}
              </p>
            )}
          </div>
        );
      }

      serverSettings = (
        <AppearanceEditorV3
          key={selectedGuildId}
          catalog={catalog}
          resource={guildResource}
          kind="guild"
          personalDesigns={personalResource.profile?.designs ?? []}
          isSaving={guildAppearanceMutation.isPending}
          version={guildResource.profile?.version ?? 4}
          onDirtyChange={setAppearanceDraftDirty}
          settingsPanel={
            <>
              <ServerAppearanceModeV3
                mode={
                  guildResource.profile?.mode ??
                  createEmptyAppearanceProfileV4("guild").mode
                }
                disabled={guildAppearanceMutation.isPending}
                onChange={async (mode) => {
                  const profile = setGuildAppearanceModeV3(
                    guildResource.profile ??
                      createEmptyAppearanceProfileV4("guild"),
                    mode,
                    catalog,
                  );
                  await guildAppearanceMutation.mutateAsync({
                    profile,
                    guildId: selectedGuildId,
                    revision: guildResource.revision,
                  });
                }}
              />
              <section
                aria-labelledby="roll-delivery-heading"
                className="rounded-lg border bg-muted/20 p-4"
              >
                <h3 id="roll-delivery-heading" className="font-semibold">
                  Roll delivery
                </h3>
                {deliverySetting}
              </section>
            </>
          }
          onSave={async (profile, revision) => {
            if (!("mode" in profile)) {
              throw new Error("Guild appearance profile is required");
            }
            await guildAppearanceMutation.mutateAsync({
              profile,
              guildId: selectedGuildId,
              revision,
            });
          }}
        />
      );
    }

    content = (
      <section aria-labelledby="server-appearance-heading" className="space-y-6">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 id="server-appearance-heading" className="text-xl font-semibold">
            Server appearance
          </h2>
          <div className="mt-4">
            <SearchableGuildPicker
              guilds={adminGuilds}
              value={selectedGuildId ?? ""}
              onValueChange={selectGuild}
            />
          </div>
        </div>
        {serverSettings}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-6 flex gap-2" aria-label="Appearance sections">
        <button
          type="button"
          onClick={() => selectSection("personal")}
          aria-current={section === "personal" ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            section === "personal"
              ? "bg-primary text-primary-foreground"
              : "border bg-card hover:border-brand/70"
          }`}
        >
          Personal
        </button>
        {adminGuilds.length > 0 && (
          <button
            type="button"
            onClick={() => selectSection("guild")}
            aria-current={section === "guild" ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              section === "guild"
                ? "bg-primary text-primary-foreground"
                : "border bg-card hover:border-brand/70"
            }`}
          >
            Server
          </button>
        )}
      </nav>

      {guildsQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-warning-border bg-warning p-4 text-sm text-warning-foreground"
        >
          Server appearance controls are unavailable: {guildsQuery.error.message}
        </div>
      )}

      {content}

      {guildsQuery.isSuccess && guildsQuery.data.length === 0 && (
        <aside className="mt-8 rounded-xl border border-info-border bg-info p-4 text-sm text-info-foreground">
          Dice Witch does not share a server with this account yet. Personal
          styles still work in DMs.{" "}
          <a
            href={appConfig.inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2"
          >
            Add Dice Witch to a server
          </a>
          .
        </aside>
      )}
    </div>
  );
}
