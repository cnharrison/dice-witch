type EnvironmentBannerProps = {
  environment: 'development' | 'staging' | 'production';
  buildSha: string;
};

export function EnvironmentBanner({
  environment,
  buildSha,
}: EnvironmentBannerProps) {
  if (environment !== 'staging') return null;

  return (
    <aside
      role="status"
      aria-label="Staging environment"
      className="border-b border-amber-700 bg-amber-300 px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-[0.16em] text-amber-950"
    >
      Staging environment
      <span aria-hidden="true"> · </span>
      <span className="normal-case tracking-normal" title={buildSha}>
        build {buildSha.slice(0, 12)}
      </span>
    </aside>
  );
}
