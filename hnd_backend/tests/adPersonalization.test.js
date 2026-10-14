const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAdImageSettings,
  personalizeAdForCandidate,
} = require('../services/adPersonalization');

test('apparel campaign images are limited to candidate audiences', () => {
  const settings = normalizeAdImageSettings({
    imageUrl: '/referral-tshirt.png',
    imagePersonalization: 'candidate_apparel',
    targetAudience: ['all', 'candidate_hnd', 'admin'],
  });

  assert.deepEqual(settings, {
    imageUrl: '/referral-tshirt.png',
    imagePersonalization: 'candidate_apparel',
    targetAudience: ['candidate_hnd'],
  });
});

test('apparel ads default to all candidates and reject unsupported personalized artwork', () => {
  assert.deepEqual(
    normalizeAdImageSettings({
      imageUrl: '/campaign.png',
      imagePersonalization: 'candidate_apparel',
      targetAudience: ['admin'],
    }),
    {
      imageUrl: '/campaign.png',
      imagePersonalization: 'none',
      targetAudience: ['admin'],
    }
  );

  assert.deepEqual(
    normalizeAdImageSettings({
      imageUrl: '/referral-shirt.png',
      imagePersonalization: 'candidate_apparel',
      targetAudience: ['admin'],
    }),
    {
      imageUrl: '/referral-shirt.png',
      imagePersonalization: 'candidate_apparel',
      targetAudience: ['candidate_all'],
    }
  );
});

test('candidate personalization adds their name and next gift number without mutating the ad', () => {
  const ad = { imagePersonalization: 'candidate_apparel', imageUrl: '/referral-shirt.png' };
  const personalized = personalizeAdForCandidate(ad, 'Candidate Example', 3);

  assert.deepEqual(personalized, {
    ...ad,
    candidateName: 'Candidate Example',
    nextGiftNumber: 3,
  });
  assert.equal(ad.candidateName, undefined);
  assert.equal(personalizeAdForCandidate(ad, null, 3), ad);
});
