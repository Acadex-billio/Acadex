const { getPricingSnapshot } = require('../services/platformPricingService');

async function getCatalogSnapshot() {
  return getPricingSnapshot();
}

async function getPlanDefinitions() {
  const snapshot = await getPricingSnapshot();
  return snapshot.planDefinitions;
}

async function getPlanDefinition(planCode) {
  const plans = await getPlanDefinitions();
  return plans[String(planCode || 'basic').toLowerCase()] || plans.basic;
}

async function getMaterialDefaults(materialType) {
  const snapshot = await getPricingSnapshot();
  return snapshot.materialDefaults[String(materialType || '').toLowerCase()] || null;
}

async function getCenterPricing(action, planCode = 'paygo') {
  const snapshot = await getPricingSnapshot();
  const normalizedAction = String(action || '').toLowerCase();
  const normalizedPlan = String(planCode || 'paygo').toLowerCase();
  return snapshot.centerPricing?.[normalizedAction]?.[normalizedPlan] || null;
}

module.exports = {
  getCatalogSnapshot,
  getPlanDefinitions,
  getPlanDefinition,
  getMaterialDefaults,
  getCenterPricing,
};
