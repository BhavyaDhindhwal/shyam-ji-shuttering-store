const { getSpecialRentalRule, isFarmaSetMaterial } = require("./rentalPricing");

const BUSINESS_TIME_ZONE = "Asia/Kolkata";

function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function asUtcDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthBoundary(anchor, monthOffset) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + monthOffset;
  const targetDay = anchor.getUTCDate();
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(targetDay, lastDay)));
}

function dateKey(value) {
  const date = asUtcDateOnly(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function getRemainingQuantity(issuedQuantity, returnedQuantity = 0) {
  return Math.max(0, Number(issuedQuantity || 0) - Number(returnedQuantity || 0));
}

function daysBetween(start, end) {
  const startDate = asUtcDateOnly(start);
  const endDate = asUtcDateOnly(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

function getCompletedPeriods(issueDate, now = new Date()) {
  const anchor = asUtcDateOnly(issueDate);
  const today = businessToday(now);
  if (!anchor || anchor > today) return [];
  const periods = [];
  for (let index = 1; index <= 240; index += 1) {
    const start = monthBoundary(anchor, index - 1);
    const end = monthBoundary(anchor, index);
    if (end > today) break;
    periods.push({ index, start, end, days: daysBetween(start, end), key: dateKey(end) });
  }
  return periods;
}

function allocateOpenLines(openLines, periodDays) {
  let cumulativeFarmaPlates = 0;
  return openLines.map((line) => {
    const name = String(line.materialName || "");
    const special = getSpecialRentalRule(name);
    const isFarma = isFarmaSetMaterial(name);
    let billingQuantity = line.quantity;
    let billingUnit = line.unit || "piece";
    if (isFarma) {
      const before = Math.ceil(cumulativeFarmaPlates / 4);
      cumulativeFarmaPlates += line.quantity;
      billingQuantity = Math.ceil(cumulativeFarmaPlates / 4) - before;
      billingUnit = "set";
    }
    const mode = line.rentalPricingMode || "daily";
    const savedRate = line.rentalRate;
    const rate = savedRate !== undefined && savedRate !== null && savedRate !== ""
      ? Number(savedRate)
      : Number(special?.rate || 0);
    const multiplier = mode === "monthly" ? periodDays / 30 : mode === "fixed" ? 0 : periodDays;
    const estimatedRent = Math.round(Math.max(0, billingQuantity) * Math.max(0, rate) * multiplier * 100) / 100;
    return {
      issue: line._id,
      materialName: line.materialName,
      quantity: line.quantity,
      unit: line.unit || "piece",
      pricingMode: mode,
      rate,
      billingQuantity: Math.max(0, billingQuantity),
      billingUnit,
      periods: multiplier,
      estimatedRent,
    };
  });
}

module.exports = { BUSINESS_TIME_ZONE, businessToday, asUtcDateOnly, monthBoundary, dateKey, daysBetween, getRemainingQuantity, getCompletedPeriods, allocateOpenLines };
