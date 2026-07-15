export type DiscordFooterLinks = {
  inviteUrl: string;
  supportUrl: string;
};

function validateLink(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Discord footer link is invalid");
  }
  return url.href;
}

export function buildFooterComponents(
  links: DiscordFooterLinks,
): Record<string, unknown>[] {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "Invite me",
          url: validateLink(links.inviteUrl),
        },
        {
          type: 2,
          style: 5,
          label: "Questions? Join the support server",
          url: validateLink(links.supportUrl),
        },
      ],
    },
  ];
}
