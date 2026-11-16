/**
 * Shyam Ji Shuttering Store rental pricing rules.
 * The server is authoritative; frontend previews mirror these rules.
 *
 * Farma: 4 plates = 1 set (round partial sets up), ₹100 / set / day.
 * Ghori/Ghodi: ₹50 / unit / day.
 * Scaffolding items use the same material/quantity-based daily rules as other stock.
 */
function isFarmaMaterial(name) {
  return /\b(?:farma|forma)\b/i.test(String(name || ""));
}

function isGhoriMaterial(name) {
  return /\b(?:ghori|ghodi)\b/i.test(String(name || ""));
}

function getSpecialRentalRule(name) {
  if (/farma\s+chali/i.test(String(name || ""))) {
    return { pricingMode: "daily", rate: 10, billingUnit: "piece", stockUnit: "piece", rule: "farma-chali" };
  }
  if (isFarmaMaterial(name)) {
    return { pricingMode: "daily", rate: 100, billingUnit: "set", stockUnit: "piece", rule: "farma" };
  }
  if (isGhoriMaterial(name)) {
    return { pricingMode: "daily", rate: 50, billingUnit: "piece", stockUnit: "piece", rule: "ghori" };
  }
  const value = String(name || "").toLowerCase();
  const itemRates = [[/\b3\s*(?:meter|m)\s*standard\b|\bstandard\s*3\s*(?:meter|m)\b/, 3], [/\b2\.5\s*(?:meter|m)\s*standard\b|\bstandard\s*2\.5\s*(?:meter|m)\b/, 2.5], [/\b2\s*(?:meter|m)\s*standard\b|\bstandard\s*2\s*(?:meter|m)\b/, 2], [/\b1\.5\s*(?:meter|m)\s*ledger\b|\bledger\s*1\.5\s*(?:meter|m)\b/, 1.5], [/\b1\s*(?:meter|m)\s*ledger\b|\bledger\s*1\s*(?:meter|m)\b/, 1], [/\bchali\b/, 5], [/\bbase\s*jack\b|\bbej\s*jack\b/, 1], [/\bpin\b/, 0.05]];
  const itemRate = itemRates.find(([pattern]) => pattern.test(value));
  if (itemRate) return { pricingMode: "daily", rate: itemRate[1], billingUnit: "piece", stockUnit: "piece", rule: "scaffolding-item" };
  return null;
}

function calculateRentalPeriods(pricingMode, durationDays) {
  if (pricingMode === "fixed") return 1;
  if (pricingMode === "monthly") return Math.max(Number(durationDays) / 30, 1 / 30);
  return Number(durationDays);
}

function isFarmaSetMaterial(name) {
  return isFarmaMaterial(name) && !/\bchali\b/i.test(String(name || ""));
}

function calculateCombinedFarmaSets(quantities) {
  const totalPlates = (Array.isArray(quantities) ? quantities : [])
    .reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return Math.ceil(totalPlates / 4);
}

function calculateFarmaSetDelta(outstandingBefore, returnedPlates) {
  const before = Math.max(0, Number(outstandingBefore) || 0);
  const returned = Math.max(0, Number(returnedPlates) || 0);
  const after = Math.max(0, before - returned);
  return Math.max(0, Math.ceil(before / 4) - Math.ceil(after / 4));
}

// Allocates aggregate Farma sets to individual material lines without
// rounding each size independently. The sum of allocations always equals
// ceil(total 9/12/15/18-inch Farma plates / 4).
function allocateCombinedFarmaSets(lines) {
  let cumulativePlates = 0;
  return (Array.isArray(lines) ? lines : []).map((line) => {
    if (!isFarmaSetMaterial(line.materialName || line.name)) {
      return Math.max(0, Number(line.quantity) || 0);
    }
    const before = Math.ceil(cumulativePlates / 4);
    cumulativePlates += Math.max(0, Number(line.quantity) || 0);
    const after = Math.ceil(cumulativePlates / 4);
    return after - before;
  });
}

function calculateBillingQuantity(materialName, quantity) {
  if (isFarmaSetMaterial(materialName)) return Math.ceil(Number(quantity) / 4);
  return Number(quantity);
}

module.exports = {
  isFarmaMaterial,
  isGhoriMaterial,
  getSpecialRentalRule,
  calculateRentalPeriods,
  calculateBillingQuantity,
  isFarmaSetMaterial,
  calculateCombinedFarmaSets,
  calculateFarmaSetDelta,
  allocateCombinedFarmaSets,
};
