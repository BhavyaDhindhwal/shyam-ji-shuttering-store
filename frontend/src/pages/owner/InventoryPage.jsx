
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

const emptyForm = {
  materialName: "",
  category: "Shuttering Material",
  size: "",
  totalStock: "",
  rentedStock: "0",
  unit: "piece",
  rentalPricingMode: "daily",
  rentalRate: "0",
  lowStockLimit: "10",
};

const MATERIAL_PRESETS = {
  Farma: ["9 Inch Farma", "12 Inch Farma", "15 Inch Farma", "18 Inch Farma", "Ghodi", "Farma Chali"],
  Scaffolding: ["3 Meter Standard", "2.5 Meter Standard", "2 Meter Standard", "1.5 Meter Ledger", "1 Meter Ledger", "Scaffolding Chali", "Base Jack", "Pin"],
};
const SUGGESTED_RATES = {
  "9 inch farma": 100, "12 inch farma": 100, "15 inch farma": 100, "18 inch farma": 100,
  "ghodi": 50, "ghori": 50, "farma chali": 10, "scaffolding chali": 5, "chali": 5,
  "3 meter standard": 3, "3m standard": 3, "2.5 meter standard": 2.5, "2.5m standard": 2.5,
  "2 meter standard": 2, "2m standard": 2, "1.5 meter ledger": 1.5, "1.5m ledger": 1.5,
  "1 meter ledger": 1, "1m ledger": 1, "base jack": 1, "bej jack": 1, "pin": 0.05,
};
const suggestedRate = (name) => SUGGESTED_RATES[String(name || "").trim().toLowerCase()] ?? 0;

const units = [
  { value: "piece", label: "Piece" },
  { value: "set", label: "Set" },
  { value: "pair", label: "Pair" },
  { value: "meter", label: "Meter" },
  { value: "kg", label: "KG" },
  { value: "bundle", label: "Bundle" },
  { value: "sqft", label: "Square feet (sq ft)" },
];

const numberValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatNumber = (value) =>
  numberValue(value).toLocaleString("en-IN");

const isFarmaMaterial = (name) => /\b(?:farma|forma)\b/i.test(String(name || "")) && !/\bchali\b/i.test(String(name || ""));
const isGhoriMaterial = (name) => /\b(?:ghori|ghodi)\b/i.test(String(name || ""));
const getSpecialRentalRule = (name) => {
  const lower = String(name || "").toLowerCase();
  if (/farma chali/.test(lower)) return { mode: "daily", rate: 10, unit: "piece", label: "Farma Chali: suggested ₹10 per day (editable)." };
  if (isFarmaMaterial(name)) return { mode: "daily", rate: 100, unit: "piece", label: "Farma: 4 plates = 1 set; suggested ₹100 per set/day (editable)." };
  if (isGhoriMaterial(name)) return { mode: "daily", rate: 50, unit: "piece", label: "Ghodi: suggested ₹50 per unit/day (editable)." };
  const rate = suggestedRate(lower);
  if (rate || /\b(?:chali|base jack|bej jack|pin|standard|ledger)\b/.test(lower)) return { mode: "daily", rate, unit: "piece", label: `Suggested ₹${rate} per day; owner can change it.` };
  return null;
};

function InventoryPage() {
  const {
    dashboardData,
    fetchOwnerApi,
    reloadDashboard,
  } = useOutletContext();

  const inventory = Array.isArray(dashboardData?.inventory)
    ? dashboardData.inventory
    : [];

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [editingRateId, setEditingRateId] = useState(null);
  const [rateDraft, setRateDraft] = useState("");
  const [modeDraft, setModeDraft] = useState("daily");
  const [message, setMessage] = useState({ type: "", text: "" });

  const categories = useMemo(() => {
    const values = inventory
      .map((item) => item.category)
      .filter(Boolean);

    return ["All", ...new Set(values)];
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return inventory.filter((item) => {
      const text = [
        item.materialName,
        item.category,
        item.size,
        item.unit,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!keyword || text.includes(keyword)) &&
        (categoryFilter === "All" ||
          item.category === categoryFilter)
      );
    });
  }, [inventory, search, categoryFilter]);

  const totalStock = inventory.reduce(
    (sum, item) => sum + numberValue(item.totalStock),
    0
  );

  const rentedStock = inventory.reduce(
    (sum, item) => sum + numberValue(item.rentedStock),
    0
  );

  // Fall back to total minus rented if an older record lacks availableStock.
  const availableStock = inventory.reduce(
    (sum, item) =>
      sum +
      numberValue(
        item.availableStock ??
          (numberValue(item.totalStock) -
            numberValue(item.rentedStock))
      ),
    0
  );

  const lowStockCount = inventory.filter((item) => {
    const available = numberValue(
      item.availableStock ??
        (numberValue(item.totalStock) -
          numberValue(item.rentedStock))
    );

    return available <= numberValue(item.lowStockLimit ?? 10);
  }).length;

  function showMessage(type, text) {
    setMessage({ type, text });
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setMessage({ type: "", text: "" });
    setForm((previous) => {
      const next = { ...previous, [name]: value };
      // Apply suggested defaults only when the material name changes. Do not
      // overwrite a rate the owner is actively typing into the form.
      if (name === "category" && /scaffolding/i.test(value)) next.unit = "piece";
      if (name === "unit" && value === "sqft" && /scaffolding/i.test(next.category || "")) next.unit = "piece";
      if (name === "materialName") {
        const special = getSpecialRentalRule(value);
        if (special) {
          next.rentalPricingMode = special.mode;
          next.rentalRate = String(special.rate);
          if (special.unit) next.unit = special.unit;
          if (/farma|forma|ghodi|ghori/i.test(value)) next.category = "Farma";
          else if (/standard|ledger|base jack|bej jack|pin|scaffolding chali|scaffolding/i.test(value)) { next.category = "Scaffolding"; next.unit = "piece"; }
          else if (/farma chali/i.test(value)) next.category = "Farma";
        } else {
          next.rentalPricingMode = "daily";
          next.rentalRate = "0";
        }
      }
      return next;
    });
  }

  function closeModal() {
    if (saving) return;

    setShowAddModal(false);
    setForm({ ...emptyForm });
  }

  async function handleAddItem(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    const total = Number(form.totalStock);
    const rented = Number(form.rentedStock);
    const lowStockLimit = Number(form.lowStockLimit);

    if (!form.materialName.trim()) {
      return showMessage("error", "Please enter a material name.");
    }

    if (
      form.totalStock === "" ||
      !(form.unit === "sqft" ? Number.isFinite(total) : Number.isInteger(total)) ||
      total < 0
    ) {
      return showMessage(
        "error",
        form.unit === "sqft" ? "Total stock must be a non-negative square-foot value." : "Total stock must be a non-negative whole number."
      );
    }

    if (
      !(form.unit === "sqft" ? Number.isFinite(rented) : Number.isInteger(rented)) ||
      rented < 0 ||
      rented > total
    ) {
      return showMessage(
        "error",
        form.unit === "sqft" ? "Rented stock must be a square-foot value between zero and total stock." : "Rented stock must be a whole number between zero and total stock."
      );
    }

    if (
      !(form.unit === "sqft" ? Number.isFinite(lowStockLimit) : Number.isInteger(lowStockLimit)) ||
      lowStockLimit < 0
    ) {
      return showMessage(
        "error",
        form.unit === "sqft" ? "Low stock limit must be a non-negative square-foot value." : "Low stock limit must be a non-negative whole number."
      );
    }

    if (!Number.isFinite(Number(form.rentalRate)) || Number(form.rentalRate) < 0) {
      return showMessage("error", "Rental rate must be a valid non-negative amount.");
    }

    try {
      setSaving(true);

      await fetchOwnerApi("/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName: form.materialName.trim(),
          category: form.category.trim() || "Other",
          size: form.size.trim(),
          totalStock: total,
          rentedStock: rented,
          unit: form.unit,
          rentalPricingMode: form.rentalPricingMode,
          rentalRate: Number(form.rentalRate),
          lowStockLimit,
        }),
      });

      setShowAddModal(false);
      setForm({ ...emptyForm });
      showMessage("success", "Inventory item added successfully.");

      await reloadDashboard();
    } catch (error) {
      showMessage(
        "error",
        error.message || "Unable to add inventory item."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStock(item) {
    const totalInput = window.prompt(
      `Total stock for ${item.materialName}${
        item.size ? ` (${item.size})` : ""
      }`,
      String(item.totalStock ?? 0)
    );

    if (totalInput === null) return;

    const total = Number(totalInput);

    const stockUnit = item.unit || "piece";
    if (!(stockUnit === "sqft" ? Number.isFinite(total) : Number.isInteger(total)) || total < 0) {
      return showMessage(
        "error",
        stockUnit === "sqft" ? "Total stock must be a non-negative square-foot value." : "Total stock must be a non-negative whole number."
      );
    }

    // Do not manually overwrite rentedStock here: issue/return records
    // should remain the source of truth for outstanding material.
    if (total < numberValue(item.rentedStock)) {
      return showMessage(
        "error",
        "Total stock cannot be less than currently rented stock."
      );
    }

    try {
      setUpdatingId(item._id);

      await fetchOwnerApi(`/inventory/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalStock: total,
          unit: stockUnit,
        }),
      });

      showMessage("success", "Total stock updated successfully.");
      await reloadDashboard();
    } catch (error) {
      showMessage(
        "error",
        error.message || "Unable to update stock."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  function beginRateEdit(item) {
    setMessage({ type: "", text: "" });
    setEditingRateId(item._id);
    setRateDraft(String(item.rentalRate ?? 0));
    setModeDraft(item.rentalPricingMode || "daily");
  }

  async function handleUpdatePricing(item) {
    const rate = Number(rateDraft);
    const mode = String(modeDraft).trim().toLowerCase();
    if (rateDraft.trim() === "" || !Number.isFinite(rate) || rate < 0) {
      return showMessage("error", "Enter a valid rate (zero or a positive amount). ");
    }
    if (!["daily", "monthly", "fixed"].includes(mode)) {
      return showMessage("error", "Choose daily, monthly or fixed pricing.");
    }
    try {
      setUpdatingId(item._id);
      const result = await fetchOwnerApi(`/inventory/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalRate: rate, rentalPricingMode: mode }),
      });
      if (!result?.success) throw new Error(result?.message || "Rate update was not confirmed by the server.");
      setEditingRateId(null);
      showMessage("success", `Rate saved for ${item.materialName}: ₹${formatNumber(rate)}.`);
      await reloadDashboard();
    } catch (error) {
      showMessage("error", error.message || "Unable to update rental pricing.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteItem(item) {
    const label = `${item.materialName}${item.size ? ` (${item.size})` : ""}`;
    if (numberValue(item.rentedStock) > 0) {
      return showMessage("error", "This item has rented/outstanding stock and cannot be deleted until it is returned.");
    }
    if (!window.confirm(`Delete ${label} from inventory? This cannot be undone.`)) return;
    try {
      setUpdatingId(item._id);
      await fetchOwnerApi(`/inventory/${item._id}`, { method: "DELETE" });
      showMessage("success", `${label} deleted successfully.`);
      await reloadDashboard();
    } catch (error) {
      showMessage("error", error.message || "Unable to delete inventory item.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      <section className="owner-dashboard-panel">
        <div className="owner-panel-heading">
          <div>
            <p className="owner-dashboard-eyebrow">Stock management</p>
            <h2>Inventory Management</h2>
          </div>

          <button
            type="button"
            className="inventory-add-item-button"
            onClick={() => {
              setMessage({ type: "", text: "" });
              setShowAddModal(true);
            }}
          >
            + Add Item
          </button>
        </div>

        <div className="inventory-summary-grid">
          <div className="inventory-summary-card">
            <span>Items</span>
            <strong>{formatNumber(inventory.length)}</strong>
            <small>Material records</small>
          </div>

          <div className="inventory-summary-card">
            <span>Total Stock</span>
            <strong>{formatNumber(totalStock)}</strong>
            <small>All units combined</small>
          </div>

          <div className="inventory-summary-card">
            <span>Available</span>
            <strong>{formatNumber(availableStock)}</strong>
            <small>Ready for rental</small>
          </div>

          <div className="inventory-summary-card">
            <span>Rented / Outgoing</span>
            <strong>{formatNumber(rentedStock)}</strong>
            <small>Currently outside</small>
          </div>
        </div>

        {message.text && (
          <p className={`inventory-message ${message.type}`} role="status">
            {message.text}
          </p>
        )}

        <div className="inventory-toolbar">
          <input
            type="search"
            aria-label="Search inventory"
            placeholder="Search material, category or size..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {lowStockCount > 0 && (
          <p className="inventory-message error" role="status">
            {lowStockCount} item(s) are at or below their low-stock limit.
          </p>
        )}

        {filteredInventory.length === 0 ? (
          <div className="owner-empty-state">
            {inventory.length === 0
              ? "No inventory items added yet."
              : "No matching inventory items found."}
          </div>
        ) : (
          <div className="owner-table-wrapper">
            <table className="owner-inventory-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Total</th>
                  <th>Available</th>
                  <th>Rented</th>
                  <th>Unit</th>
                  <th>Default Rate</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredInventory.map((item) => {
                  const available = numberValue(
                    item.availableStock ??
                      (numberValue(item.totalStock) -
                        numberValue(item.rentedStock))
                  );

                  const lowLimit = numberValue(
                    item.lowStockLimit ?? 10
                  );

                  const isLowStock = available <= lowLimit;

                  return (
                    <tr key={item._id}>
                      <td>
                        <strong>{item.materialName}</strong>
                      </td>
                      <td>{item.category || "Other"}</td>
                      <td>{item.size || "—"}</td>
                      <td>{formatNumber(item.totalStock)}</td>
                      <td className="available-stock">
                        {formatNumber(available)}
                      </td>
                      <td className="rented-stock">
                        {formatNumber(item.rentedStock)}
                      </td>
                      <td>{item.unit || "piece"}</td>
                      <td>
                        {editingRateId === item._id ? (
                          <div style={{ display: "grid", gap: "6px", minWidth: "130px" }}>
                            <label style={{ fontSize: "12px" }} htmlFor={`rate-${item._id}`}>Rate (₹)</label>
                            <input
                              id={`rate-${item._id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={rateDraft}
                              onChange={(event) => setRateDraft(event.target.value)}
                              disabled={updatingId === item._id}
                            />
                            <select
                              aria-label={`Pricing mode for ${item.materialName}`}
                              value={modeDraft}
                              onChange={(event) => setModeDraft(event.target.value)}
                              disabled={updatingId === item._id}
                            >
                              <option value="daily">Per day</option>
                              <option value="monthly">Per month</option>
                              <option value="fixed">Fixed rental</option>
                            </select>
                            <div style={{ display: "flex", gap: "5px" }}>
                              <button type="button" className="stock-update-button" disabled={updatingId === item._id} onClick={() => handleUpdatePricing(item)}>
                                {updatingId === item._id ? "Saving…" : "Save Rate"}
                              </button>
                              <button type="button" className="stock-update-button" disabled={updatingId === item._id} onClick={() => setEditingRateId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <strong>₹{formatNumber(item.rentalRate ?? 0)}</strong>
                            <small style={{ display: "block", color: "#64748b" }}>
                              {item.rentalPricingMode === "monthly" ? "/ month" : item.rentalPricingMode === "fixed" ? "fixed / rental" : "/ day"}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            isLowStock
                              ? "inventory-status low"
                              : "inventory-status available"
                          }
                        >
                          {isLowStock ? "Low Stock" : "Available"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
                          <button
                            type="button"
                            className="stock-update-button"
                            disabled={updatingId === item._id}
                            onClick={() => handleUpdateStock(item)}
                          >
                            Update Stock
                          </button>
                          {editingRateId !== item._id && (
                            <button
                              type="button"
                              className="stock-update-button"
                              disabled={updatingId === item._id}
                              onClick={() => beginRateEdit(item)}
                            >
                              Update Rate
                            </button>
                          )}
                          <button
                            type="button"
                            className="stock-update-button"
                            disabled={updatingId === item._id || numberValue(item.rentedStock) > 0}
                            onClick={() => handleDeleteItem(item)}
                            title={numberValue(item.rentedStock) > 0 ? "Return outstanding material before deleting" : "Delete this inventory item"}
                          >
                            Delete Item
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAddModal && (
        <div
          className="inventory-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className="inventory-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal-header">
              <div>
                <p className="owner-dashboard-eyebrow">Inventory</p>
                <h2>Add New Item</h2>
                <small>Add a new shuttering material to inventory.</small>
              </div>

              <button
                type="button"
                className="inventory-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <form className="inventory-modal-form" onSubmit={handleAddItem}>
              <div className="inventory-field">
                <label htmlFor="materialName">Material Name</label>
                <select
                  id="materialName"
                  name="materialName"
                  value={form.materialName}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select material</option>
                  <optgroup label="Farma">
                    {MATERIAL_PRESETS.Farma.map((name) => <option key={`farma-${name}`} value={name}>{name}</option>)}
                  </optgroup>
                  <optgroup label="Scaffolding">
                    {MATERIAL_PRESETS.Scaffolding.map((name) => <option key={`scaffold-${name}`} value={name}>{name}</option>)}
                  </optgroup>
                </select>
              </div>

              <div className="inventory-field">
                <label htmlFor="category">Category</label>
                <select id="category" name="category" value={form.category} onChange={handleChange}>
                  <option value="Farma">Farma</option><option value="Scaffolding">Scaffolding</option><option value="Shuttering Material">Shuttering Material</option><option value="Other">Other</option>
                </select>
              </div>

              <div className="inventory-field">
                <label htmlFor="size">Size</label>
                <input
                  id="size"
                  name="size"
                  value={form.size}
                  onChange={handleChange}
                  placeholder="e.g. 3 m"
                />
              </div>

              <div className="inventory-field">
                <label htmlFor="totalStock">Total Stock</label>
                <input
                  id="totalStock"
                  name="totalStock"
                  type="number"
                  min="0"
                  step={form.unit === "sqft" ? "0.01" : "1"}
                  value={form.totalStock}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="inventory-field">
                <label htmlFor="rentedStock">Rented / Outgoing</label>
                <input
                  id="rentedStock"
                  name="rentedStock"
                  type="number"
                  min="0"
                  step={form.unit === "sqft" ? "0.01" : "1"}
                  value={form.rentedStock}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="inventory-field">
                <label htmlFor="unit">Unit</label>
                <select
                  id="unit"
                  name="unit"
                  value={form.unit}
                  onChange={handleChange}
                >
                  {units.map((unit) => (
                    <option key={unit.value} value={unit.value} disabled={unit.value === "sqft" && /scaffolding/i.test(form.category || "")}>
                      {unit.label}
                    </option>
                  ))}
                </select>
                {/scaffolding/i.test(form.category || "") && <small style={{ color: "#64748b" }}>Scaffolding stock is counted as individual pieces, not square feet.</small>}
              </div>

              <div className="inventory-field">
                <label htmlFor="rentalPricingMode">Default Rental Method</label>
                <select
                  id="rentalPricingMode"
                  name="rentalPricingMode"
                  value={form.rentalPricingMode}
                  onChange={handleChange}
                  disabled={Boolean(getSpecialRentalRule(form.materialName))}
                >
                  <option value="daily">Per day</option>
                  <option value="monthly">Per month (30-day billing periods)</option>
                  <option value="fixed">Fixed for the rental period</option>
                </select>
              </div>

              <div className="inventory-field">
                <label htmlFor="rentalRate">Default Rate (₹ per {isFarmaMaterial(form.materialName) ? "set" : form.unit}{form.rentalPricingMode === "daily" ? " / day" : form.rentalPricingMode === "monthly" ? " / month" : " / rental"})</label>
                <input
                  id="rentalRate"
                  name="rentalRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.rentalRate}
                  onChange={handleChange}
                  readOnly={false}
                  required
                />
                {getSpecialRentalRule(form.materialName) && <small style={{ color: "#64748b" }}>{getSpecialRentalRule(form.materialName).label} Suggested values are editable, not locked.</small>}
              </div>

              <div className="inventory-field">
                <label htmlFor="lowStockLimit">Low Stock Alert</label>
                <input
                  id="lowStockLimit"
                  name="lowStockLimit"
                  type="number"
                  min="0"
                  step={form.unit === "sqft" ? "0.01" : "1"}
                  value={form.lowStockLimit}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="inventory-preview-card">
                <span>Available Stock Preview</span>
                <strong>
                  {formatNumber(
                    numberValue(form.totalStock) -
                      numberValue(form.rentedStock)
                  )}{" "}
                  {form.unit}
                </strong>
              </div>

              <div className="inventory-modal-actions">
                <button
                  type="button"
                  className="inventory-cancel-button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="inventory-submit-button"
                  disabled={saving}
                >
                  {saving ? "Adding..." : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default InventoryPage;
