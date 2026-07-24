import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EnvironmentBanner } from './EnvironmentBanner';

const sha = 'abcdef0123456789abcdef0123456789abcdef01';

describe('EnvironmentBanner', () => {
  it('identifies staging and the exact short build SHA', () => {
    const markup = renderToStaticMarkup(
      <EnvironmentBanner environment="staging" buildSha={sha} />,
    );

    expect(markup).toContain('Staging environment');
    expect(markup).toContain('abcdef012345');
    expect(markup).toContain('role="status"');
  });

  it('is absent outside staging', () => {
    expect(
      renderToStaticMarkup(
        <EnvironmentBanner environment="production" buildSha={sha} />,
      ),
    ).toBe('');
  });
});
