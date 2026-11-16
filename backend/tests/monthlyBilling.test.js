const test = require("node:test");
const assert = require("node:assert/strict");
const { getCompletedPeriods, allocateOpenLines, getRemainingQuantity } = require("../utils/monthlyBilling");

test("monthly eligibility uses completed issue-date anniversaries", () => {
  const periods = getCompletedPeriods("2026-11-10T00:00:00.000Z", new Date("2026-12-09T18:29:59.000Z"));
  assert.equal(periods.length, 0);
  const due = getCompletedPeriods("2026-11-10T00:00:00.000Z", new Date("2026-12-10T18:30:00.000Z"));
  assert.equal(due.length, 1);
  assert.equal(due[0].days, 30);
});

test("month anniversaries clamp short months and recover the original anchor day", () => {
  const periods = getCompletedPeriods("2026-01-31T00:00:00.000Z", new Date("2026-03-31T18:30:00.000Z"));
  assert.equal(periods.length, 2);
  assert.equal(periods[0].days, 28);
  assert.equal(periods[1].days, 31);
});

test("monthly bill allocation aggregates active Farma sizes", () => {
  const lines = allocateOpenLines([
    { _id: "1", materialName: "9 Inch Farma", quantity: 6, unit: "piece", rentalRate: 100, rentalPricingMode: "daily" },
    { _id: "2", materialName: "12 Inch Farma", quantity: 6, unit: "piece", rentalRate: 100, rentalPricingMode: "daily" },
  ], 30);
  assert.deepEqual(lines.map((line) => line.billingQuantity), [2, 1]);
  assert.equal(lines.reduce((sum, line) => sum + line.estimatedRent, 0), 9000);
});

test("remaining rental quantity never drops below zero", () => {
  assert.equal(getRemainingQuantity(12, 5), 7);
  assert.equal(getRemainingQuantity(12, 12), 0);
  assert.equal(getRemainingQuantity(12, 15), 0);
  assert.equal(getRemainingQuantity(0, 0), 0);
});
