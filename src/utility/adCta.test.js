import { resolveAdCtaDestination } from './adCta';

describe('resolveAdCtaDestination', () => {
  const origin = 'https://www.acadexe.com';

  it('resolves app routes for client-side navigation', () => {
    expect(resolveAdCtaDestination('/candidate/referrals?from=ad', origin)).toEqual({
      type: 'internal',
      path: '/candidate/referrals?from=ad',
    });
    expect(resolveAdCtaDestination('candidate/referrals', origin)).toEqual({
      type: 'internal',
      path: '/candidate/referrals',
    });
  });

  it('resolves same-origin absolute links as app routes', () => {
    expect(resolveAdCtaDestination('https://www.acadexe.com/candidate/referrals', origin)).toEqual({
      type: 'internal',
      path: '/candidate/referrals',
    });
  });

  it('keeps external URLs as external destinations', () => {
    expect(resolveAdCtaDestination('www.example.com/campaign', origin)).toEqual({
      type: 'external',
      url: 'https://www.example.com/campaign',
    });
  });

  it('rejects labels and malformed destinations instead of opening encoded URLs', () => {
    expect(resolveAdCtaDestination('CHECK MY POINTS', origin)).toBeNull();
    expect(resolveAdCtaDestination('', origin)).toBeNull();
    expect(resolveAdCtaDestination('javascript:alert(1)', origin)).toBeNull();
  });
});
