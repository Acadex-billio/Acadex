const APPAREL_AD_IMAGE_URLS = new Set(['/referral-tshirt.png', '/referral-shirt.png']);
const CANDIDATE_AUDIENCES = new Set(['candidate_all', 'candidate_hnd', 'candidate_bts', 'first_time_candidate']);

const normalizeAdImageSettings = ({ imageUrl, imagePersonalization, targetAudience }) => {
  const normalizedImageUrl = String(imageUrl || '').trim();
  const useCandidateApparel = imagePersonalization === 'candidate_apparel' && APPAREL_AD_IMAGE_URLS.has(normalizedImageUrl);
  if (!useCandidateApparel) {
    return { imageUrl: normalizedImageUrl, imagePersonalization: 'none', targetAudience };
  }

  const candidateAudiences = Array.isArray(targetAudience)
    ? targetAudience.filter((tag) => CANDIDATE_AUDIENCES.has(tag))
    : [];

  return {
    imageUrl: normalizedImageUrl,
    imagePersonalization: 'candidate_apparel',
    targetAudience: candidateAudiences.length ? candidateAudiences : ['candidate_all'],
  };
};

const personalizeAdForCandidate = (ad, candidateName, nextGiftNumber) => {
  if (!ad || ad.imagePersonalization !== 'candidate_apparel' || !candidateName) return ad;
  return {
    ...ad,
    candidateName,
    nextGiftNumber: Number.isInteger(nextGiftNumber) && nextGiftNumber > 0 ? nextGiftNumber : null,
  };
};

module.exports = { normalizeAdImageSettings, personalizeAdForCandidate };
