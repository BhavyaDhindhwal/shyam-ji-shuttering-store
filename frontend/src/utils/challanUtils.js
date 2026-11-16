function normalizeMaterialName(materialName) {
  return String(materialName || "")
    .trim()
    .toLowerCase();
}

function toPositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return 0;
  }

  return number;
}

export function calculateFarmaSets(quantity) {
  const plates = toPositiveInteger(quantity);

  if (plates === 0) {
    return {
      plates: 0,
      sets: 0,
      remainingPlates: 0,
    };
  }

  const sets = Math.ceil(plates / 4);
  const remainingPlates = plates % 4;

  return {
    plates,
    sets,
    remainingPlates,
  };
}

export function isFarmaMaterial(materialName) {
  return /\b(?:farma|forma)\b/i.test(normalizeMaterialName(materialName)) && !/\bchali\b/i.test(normalizeMaterialName(materialName));
}

export function getChallanDisplayQuantity(
  materialName,
  quantity
) {
  const numericQuantity = Number(quantity || 0);

  if (!isFarmaMaterial(materialName)) {
    return {
      quantity: Number.isFinite(numericQuantity)
        ? numericQuantity
        : 0,
      plates: null,
      sets: null,
      remainingPlates: null,
      unit: "",
      display: String(
        Number.isFinite(numericQuantity)
          ? numericQuantity
          : 0
      ),
    };
  }

  const result = calculateFarmaSets(quantity);

  if (result.plates === 0) {
    return {
      quantity: 0,
      plates: 0,
      sets: 0,
      remainingPlates: 0,
      unit: "plates",
      display: "0 plates / 0 sets",
    };
  }

  return {
    quantity: result.plates,
    plates: result.plates,
    sets: result.sets,
    remainingPlates: result.remainingPlates,
    unit: "plates",
    display: `${result.plates} plates / ${result.sets} sets`,
  };
}

export function formatChallanQuantity(
  materialName,
  quantity
) {
  const result = getChallanDisplayQuantity(
    materialName,
    quantity
  );

  return result.display;
}

export function calculateAvailableStock(
  totalStock,
  rentedStock
) {
  const total = Number(totalStock || 0);
  const rented = Number(rentedStock || 0);

  if (
    !Number.isFinite(total) ||
    !Number.isFinite(rented)
  ) {
    return 0;
  }

  return Math.max(0, total - rented);
}

export function canIssueMaterial(
  availableStock,
  requestedQuantity
) {
  const available = Number(availableStock || 0);
  const requested = Number(
    requestedQuantity || 0
  );

  return (
    Number.isInteger(requested) &&
    requested > 0 &&
    requested <= available
  );
}

export function createChallanItem(item) {
  const materialName =
    item?.materialName ||
    item?.material ||
    "";

  const quantity = Number(item?.quantity || 0);

  const quantityInfo =
    getChallanDisplayQuantity(
      materialName,
      quantity
    );

  return {
    ...item,
    materialName,
    quantity,
    quantityInfo,
    displayQuantity: quantityInfo.display,
  };
}

export function createChallanSummary(items = []) {
  if (!Array.isArray(items)) {
    return {
      totalItems: 0,
      totalQuantity: 0,
      items: [],
    };
  }

  const challanItems = items.map(createChallanItem);
  const farmaItems = challanItems.filter((item) => isFarmaMaterial(item.materialName) && !/\bchali\b/i.test(item.materialName));
  const totalFarmaPlates = farmaItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  const totalFarmaSets = Math.ceil(totalFarmaPlates / 4);

  const totalQuantity = challanItems.reduce(
    (total, item) =>
      total + Number(item.quantity || 0),
    0
  );

  return {
    totalItems: challanItems.length,
    totalQuantity,
    totalFarmaPlates,
    totalFarmaSets,
    items: challanItems,
  };
}
