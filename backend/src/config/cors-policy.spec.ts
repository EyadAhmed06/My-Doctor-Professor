import { isAllowedOrigin, parseAllowedOrigins } from './cors-policy';

describe('CORS policy', () => {
  it('accepts only configured exact origins', () => {
    const allowed = parseAllowedOrigins(
      'https://app.example.com',
      'https://admin.example.com',
      'production',
    );
    expect(isAllowedOrigin('https://app.example.com', allowed)).toBe(true);
    expect(isAllowedOrigin('https://admin.example.com', allowed)).toBe(true);
    expect(isAllowedOrigin('https://evil.example.com', allowed)).toBe(false);
    expect(isAllowedOrigin('https://app.example.com.evil.test', allowed)).toBe(false);
  });

  it('allows requests without Origin for non-browser clients', () => {
    const allowed = parseAllowedOrigins('https://app.example.com', '', 'production');
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
  });

  it('rejects paths and insecure production origins', () => {
    expect(() => parseAllowedOrigins('https://app.example.com/path', '', 'production')).toThrow();
    expect(() => parseAllowedOrigins('http://app.example.com', '', 'production')).toThrow();
  });

  it('defaults local development to the frontend dev server only', () => {
    const allowed = parseAllowedOrigins('', '', 'development');
    expect([...allowed]).toEqual(['http://localhost:3001']);
  });
});
