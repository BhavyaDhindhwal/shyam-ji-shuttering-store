const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getSpecialRentalRule,
  calculateBillingQuantity,
  calculateRentalPeriods,
  allocateCombinedFarmaSets,
  calculateCombinedFarmaSets,
  calculateFarmaSetDelta,
} = require("../utils/rentalPricing");

test("scaffolding is not assigned a square-foot monthly algorithm", () => {
  assert.equal(getSpecialRentalRule("Scaffolding Frame"), null);
  assert.equal(calculateBillingQuantity("Scaffolding Frame", 12), 12);
});

test("standard 3 meter scaffolding uses a per-piece daily rate", () => {
  const rule = getSpecialRentalRule("3 Meter Standard");
  assert.equal(rule.pricingMode, "daily");
  assert.equal(rule.rate, 3);
  assert.equal(rule.stockUnit, "piece");
});

test("Farma plates preserve the four-plates-per-set rule and 100 rupee rate", () => {
  const rule = getSpecialRentalRule("Farma");
  assert.equal(rule.rate, 100);
  assert.equal(calculateBillingQuantity("Farma", 5), 2);
});

test("rental periods are quantity/day based and have no area multiplier", () => {
  assert.equal(calculateRentalPeriods("daily", 15), 15);
  assert.equal(calculateRentalPeriods("monthly", 30), 1);
});


test("Farma sets are aggregated across 9, 12, 15 and 18 inch material lines", () => {
  const lines = [
    { materialName: "9 Inch Farma", quantity: 6 },
    { materialName: "12 Inch Farma", quantity: 6 },
  ];
  const allocations = allocateCombinedFarmaSets(lines);
  assert.deepEqual(allocations, [2, 1]);
  assert.equal(allocations.reduce((sum, value) => sum + value, 0), 3);
  assert.equal(calculateCombinedFarmaSets([6, 6]), 3);
});

test("Farma quantities across all four sizes never double-count plates", () => {
  const lines = [
    { materialName: "9 Inch Farma", quantity: 6 },
    { materialName: "12 Inch Farma", quantity: 6 },
    { materialName: "15 Inch Farma", quantity: 6 },
    { materialName: "18 Inch Farma", quantity: 6 },
  ];
  const allocations = allocateCombinedFarmaSets(lines);
  assert.equal(allocations.reduce((sum, value) => sum + value, 0), 6);
  assert.equal(calculateCombinedFarmaSets(lines.map((line) => line.quantity)), 6);
});

test("Farma set allocation supports partial sets and excludes Farma Chali", () => {
  assert.deepEqual(allocateCombinedFarmaSets([
    { materialName: "9 Inch Farma", quantity: 1 },
    { materialName: "12 Inch Farma", quantity: 1 },
    { materialName: "15 Inch Farma", quantity: 1 },
    { materialName: "18 Inch Farma", quantity: 1 },
    { materialName: "Farma Chali", quantity: 8 },
  ]), [1, 0, 0, 0, 8]);
});


test("partial Farma returns only bill a set when aggregate outstanding plates cross a set boundary", () => {
  assert.equal(calculateFarmaSetDelta(6, 1), 0);
  assert.equal(calculateFarmaSetDelta(5, 1), 1);
  assert.equal(calculateFarmaSetDelta(4, 1), 0);
  assert.equal(calculateFarmaSetDelta(4, 4), 1);
  assert.equal(calculateFarmaSetDelta(12, 6), 1);
  assert.equal(calculateFarmaSetDelta(12, 12), 3);
});
