import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const todayInput = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const CHALLAN_PERIODS = [
  { value: "daily", label: "Daily (1 day)", days: 1 },
  { value: "weekly", label: "1 Week (7 days)", days: 7 },
  { value: "15days", label: "15 Days", days: 15 },
  { value: "30days", label: "30 Days", days: 30 },
];
const getPeriodDays = (period) => CHALLAN_PERIODS.find((item) => item.value === period)?.days || 7;
const addDaysToDate = (dateValue, days) => {
  const date = new Date(`${dateValue || todayInput()}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const datePlusDays = (days) => addDaysToDate(todayInput(), days);
const isFarmaMaterial = (name) => /\b(?:farma|forma)\b/i.test(String(name || "")) && !/\bchali\b/i.test(String(name || ""));
const isGhoriMaterial = (name) => /\b(?:ghori|ghodi)\b/i.test(String(name || ""));
const getSpecialRentalRule = (name) => {
  const value = String(name || "").toLowerCase();
  if (/\bchali\b/.test(value)) return { mode: "daily", rate: 5, billingUnit: "piece", rule: "chali" };
  if (/\bbej\s*jack\b/.test(value)) return { mode: "daily", rate: 1, billingUnit: "piece", rule: "bejjack" };
  if (/\bpin\b/.test(value)) return { mode: "daily", rate: 0.5, billingUnit: "piece", rule: "pin" };
  if (/\b3\s*m.*standard|standard.*3\s*m/.test(value)) return { mode: "daily", rate: 3, billingUnit: "piece", rule: "standard" };
  if (/\b2\.5\s*m.*standard|standard.*2\.5\s*m/.test(value)) return { mode: "daily", rate: 2.5, billingUnit: "piece", rule: "standard" };
  if (/\b2\s*m.*standard|standard.*2\s*m/.test(value)) return { mode: "daily", rate: 2, billingUnit: "piece", rule: "standard" };
  if (/\b1\.5\s*m.*ledger|ledger.*1\.5\s*m/.test(value)) return { mode: "daily", rate: 1.5, billingUnit: "piece", rule: "ledger" };
  if (/\b1\s*m.*ledger|ledger.*1\s*m/.test(value)) return { mode: "daily", rate: 1, billingUnit: "piece", rule: "ledger" };
  if (isFarmaMaterial(name)) return { mode: "daily", rate: 100, billingUnit: "set", rule: "farma" };
  if (isGhoriMaterial(name)) return { mode: "daily", rate: 50, billingUnit: "piece", rule: "ghori" };
  return null;
};
const getEmptyForm = () => ({
  customerId: "",
  challanNumber: "",
  issueDate: todayInput(),
  rentalPeriod: "custom",
  rentalDurationDays: "7",
  expectedReturnDate: datePlusDays(7),
  notes: "",
  advanceAmount: "0",
  paymentDate: todayInput(),
  paymentNote: "",
  siteAddress: "",
});
const newLine = () => ({ materialId: "", quantity: "", rentalPricingMode: "daily", rentalRate: "0" });
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const displayDate = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

function getRentalPeriods(mode, durationDays) {
  if (mode === "fixed") return 1;
  if (mode === "monthly") return Math.max(durationDays / 30, 1 / 30);
  return durationDays;
}

function IssueMaterialPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [issues, setIssues] = useState([]);
  const [rentalSales, setRentalSales] = useState([]);
  const [form, setForm] = useState(getEmptyForm());
  const [items, setItems] = useState([newLine()]);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const token = localStorage.getItem("ownerToken");

  useEffect(() => {
    if (!token) {
      navigate("/owner-login", { replace: true });
      return;
    }
    loadData();
    // Token changes only when the owner session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { message: text }; }
  }

  function handleUnauthorized(status) {
    if (status === 401 || status === 403) {
      localStorage.removeItem("ownerToken");
      localStorage.removeItem("ownerData");
      navigate("/owner-login", { replace: true });
      return true;
    }
    return false;
  }

  async function loadData() {
    setLoading(true);
    try {
      const currentToken = localStorage.getItem("ownerToken");
      const [optionsResponse, issuesResponse] = await Promise.all([
        fetch(`${API_URL}/material-issues/options`, { headers: { Authorization: `Bearer ${currentToken}`, Accept: "application/json" } }),
        fetch(`${API_URL}/material-issues`, { headers: { Authorization: `Bearer ${currentToken}`, Accept: "application/json" } }),
      ]);
      const [optionsData, issuesData] = await Promise.all([parseResponse(optionsResponse), parseResponse(issuesResponse)]);
      if (handleUnauthorized(optionsResponse.status) || handleUnauthorized(issuesResponse.status)) return;
      if (!optionsResponse.ok) throw new Error(optionsData.message || "Unable to load customers and materials.");
      if (!issuesResponse.ok) throw new Error(issuesData.message || "Unable to load challan history.");
      setCustomers(Array.isArray(optionsData.customers) ? optionsData.customers : []);
      setInventory(Array.isArray(optionsData.inventory) ? optionsData.inventory : []);
      setIssues(Array.isArray(issuesData.issues) ? issuesData.issues : []);
      // Existing rental balances are loaded for a warning before issuing more material.
      try {
        const salesResponse = await fetch(`${API_URL}/sales`, { headers: { Authorization: `Bearer ${currentToken}`, Accept: "application/json" } });
        if (handleUnauthorized(salesResponse.status)) return;
        if (salesResponse.ok) {
          const salesData = await parseResponse(salesResponse);
          setRentalSales(Array.isArray(salesData.sales) ? salesData.sales : []);
        } else {
          setRentalSales([]);
        }
      } catch {
        setRentalSales([]);
      }
      setMessage({ type: "", text: "" });
    } catch (error) {
      console.error("Issue Material loading error:", error);
      setMessage({ type: "error", text: error.message || "Unable to load issue material data." });
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((previous) => {
      const next = { ...previous, [name]: value };
      if (name === "rentalDurationDays") {
        next.expectedReturnDate = addDaysToDate(previous.issueDate, Math.max(0, Number(value) || 0));
      } else if (name === "issueDate") {
        next.expectedReturnDate = addDaysToDate(value, Math.max(0, Number(previous.rentalDurationDays) || 0));
      }
      return next;
    });
    setMessage({ type: "", text: "" });
  }

  function handleLineChange(index, event) {
    const { name, value } = event.target;
    setItems((previous) => previous.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (name === "materialId") {
        const selected = inventory.find((material) => material._id === value);
        const special = getSpecialRentalRule(selected?.materialName);
        return {
          ...line,
          materialId: value,
          rentalPricingMode: special?.mode || selected?.rentalPricingMode || "daily",
          rentalRate: "0",
        };
      }
      const selected = inventory.find((material) => material._id === line.materialId);
      const special = getSpecialRentalRule(selected?.materialName);
      return { ...line, [name]: value };
    }));
    setMessage({ type: "", text: "" });
  }

  function addLine() {
    setItems((previous) => [...previous, newLine()]);
  }

  function removeLine(index) {
    setItems((previous) => previous.length === 1 ? [newLine()] : previous.filter((_, itemIndex) => itemIndex !== index));
  }

  const preparedItems = useMemo(() => {
    const lines = items.map((line) => {
      const material = inventory.find((item) => item._id === line.materialId);
      const quantity = Number(line.quantity || 0);
      const special = getSpecialRentalRule(material?.materialName);
      const isFarma = special?.rule === "farma";
      const isGhori = special?.rule === "ghori";
      const isScaffolding = special?.rule === "scaffolding-item" || /scaffolding/i.test(String(material?.category || "")) || /scaffolding/i.test(String(material?.materialName || ""));
      const mode = special?.mode || line.rentalPricingMode || material?.rentalPricingMode || "daily";
      const lineRate = Number(line.rentalRate);
      const savedRate = Number(material?.rentalRate);
      const rate = lineRate > 0 ? lineRate : savedRate > 0 ? savedRate : Number(special?.rate || 0);
      const durationDays = Math.max(0, Number(form.rentalDurationDays) || 0);
      const periods = getRentalPeriods(mode, durationDays);
      const billingQuantity = isFarma ? 0 : quantity;
      const billingUnit = isFarma ? "set" : isScaffolding ? "piece" : (special?.billingUnit || material?.unit || "piece");
      return { ...line, material, quantity, rentalPricingMode: mode, rate, periods, durationDays, billingQuantity, billingUnit, estimatedRent: 0, isFarma, isGhori, isScaffolding };
    });

    // Combine every selected Farma size before rounding: 4 plates = 1 set.
    let cumulativeFarmaPlates = 0;
    for (const line of lines) {
      if (line.isFarma) {
        const previousSets = Math.ceil(cumulativeFarmaPlates / 4);
        cumulativeFarmaPlates += Math.max(0, line.quantity);
        line.billingQuantity = Math.ceil(cumulativeFarmaPlates / 4) - previousSets;
        line.billingUnit = "set";
      }
      line.estimatedRent = Number.isFinite(line.billingQuantity * line.rate * line.periods)
        ? Math.round(line.billingQuantity * line.rate * line.periods * 100) / 100
        : 0;
    }
    return lines;
  }, [items, inventory, form.rentalDurationDays]);

  const validLines = preparedItems.filter((line) => {
    const permitsFraction = !line.isScaffolding && line.material?.unit === "sqft";
    return line.materialId && Number.isFinite(line.quantity) && line.quantity > 0 && (permitsFraction || Number.isInteger(line.quantity));
  });

  const selectedCustomerPending = useMemo(() => {
    if (!form.customerId) return 0;
    return Math.round(rentalSales.reduce((sum, sale) => {
      const customerId = String(sale.customer?._id || sale.customer || sale.customerId || "");
      if (customerId !== String(form.customerId)) return sum;
      if ([sale.paymentStatus, sale.status].some((status) => String(status || "").toLowerCase() === "cancelled")) return sum;
      const total = Number(sale.totalAmount ?? sale.amount ?? 0);
      const paid = Number(sale.paidAmount || 0);
      return sum + Math.max(total - paid, 0);
    }, 0) * 100) / 100;
  }, [rentalSales, form.customerId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    if (!form.challanNumber.trim()) return setMessage({ type: "error", text: "Enter the challan number. The owner assigns this number manually." });
    if (!form.customerId && newCustomerName.trim().length < 2) return setMessage({ type: "error", text: "Select an existing customer or enter a new customer name." });
    if (!form.customerId && newCustomerPhone.trim() && !/^\d{10}$/.test(newCustomerPhone.trim())) return setMessage({ type: "error", text: "Enter a valid 10-digit customer phone number or leave it blank to add later." });
    if (!form.issueDate || !form.rentalDurationDays || Number(form.rentalDurationDays) < 1) return setMessage({ type: "error", text: "Enter the rental duration in days (at least 1 day)." });
    if (new Date(`${form.expectedReturnDate}T00:00:00`) < new Date(`${form.issueDate}T00:00:00`)) {
      return setMessage({ type: "error", text: "Expected return date cannot be before issue date." });
    }
    if (validLines.length !== items.length) return setMessage({ type: "error", text: "Select each material and enter a valid positive quantity. Use whole numbers for piece-based stock and decimals only for materials measured in square feet." });
    if (new Set(validLines.map((line) => line.materialId)).size !== validLines.length) {
      return setMessage({ type: "error", text: "Each material can appear only once. Combine the quantities on the same line." });
    }
    for (const line of validLines) {
      if (line.quantity > Number(line.material?.availableStock || 0)) {
        return setMessage({ type: "error", text: `Only ${line.material?.availableStock ?? 0} ${line.material?.materialName || "units"} available.` });
      }
      if (!Number.isFinite(line.rate) || line.rate < 0) return setMessage({ type: "error", text: `Enter a valid rate for ${line.material?.materialName || "each material"}. Leave 0 if the rate will be finalized after return.` });
    }
    const advance = Number(form.advanceAmount || 0);
    if (!Number.isFinite(advance) || advance < 0) {
      return setMessage({ type: "error", text: "Advance received must be a non-negative amount." });
    }

    setSaving(true);
    setMessage({ type: "loading", text: "Saving customer and creating challan..." });
    try {
      let customerId = form.customerId;
      if (!customerId) {
        const customerResponse = await fetch(`${API_URL}/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("ownerToken")}` },
          body: JSON.stringify({ name: newCustomerName.trim(), phone: newCustomerPhone.trim() }),
        });
        const customerData = await parseResponse(customerResponse);
        if (!customerResponse.ok) throw new Error(customerData.message || "Unable to save the new customer.");
        customerId = customerData.customer?._id;
        if (!customerId) throw new Error("Customer was created but no customer ID was returned.");
      }
      const response = await fetch(`${API_URL}/material-issues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${localStorage.getItem("ownerToken")}`,
        },
        body: JSON.stringify({
          customerId,
          challanNumber: form.challanNumber.trim(),
          issueDate: form.issueDate,
          expectedReturnDate: form.expectedReturnDate,
          rentalPeriod: "custom",
          rentalDurationDays: Number(form.rentalDurationDays),
          notes: form.notes.trim(),
          advanceAmount: advance,
          paymentDate: form.paymentDate,
          paymentNote: form.paymentNote.trim(),
          items: validLines.map((line) => ({
            materialId: line.materialId,
            quantity: line.quantity,
            rentalPricingMode: line.rentalPricingMode,
            rentalRate: line.rate,
          })),
        }),
      });
      const data = await parseResponse(response);
      if (handleUnauthorized(response.status)) return;
      if (!response.ok) throw new Error(data.message || "Unable to create rental challan.");
      const challanNumber = data.challanNumber || data.issue?.challanGroupNumber || data.issue?.challanNumber || "Created";
      const successText = `Challan ${challanNumber} created. Advance received: ${money(advance)}. Rental charges will be finalized on return.`;
      setForm(getEmptyForm());
      setItems([newLine()]);
      setNewCustomerName("");
      setNewCustomerPhone("");
      await loadData();
      setMessage({ type: "success", text: successText });
    } catch (error) {
      console.error("Create challan error:", error);
      setMessage({ type: "error", text: error.message || "Unable to create rental challan." });
    } finally {
      setSaving(false);
    }
  }

  const challanGroups = useMemo(() => {
    const groups = new Map();
    for (const issue of issues) {
      const groupNumber = issue.challanGroupNumber || issue.challanNumber;
      if (!groups.has(groupNumber)) {
        groups.set(groupNumber, { key: groupNumber, challanNumber: groupNumber, first: issue, items: [], customer: issue.customer, issueDate: issue.issueDate });
      }
      groups.get(groupNumber).items.push(issue);
    }
    return Array.from(groups.values()).sort((a, b) => new Date(b.first.createdAt || b.issueDate) - new Date(a.first.createdAt || a.issueDate));
  }, [issues]);

  if (loading && issues.length === 0) {
    return <section className="owner-dashboard-panel"><div className="owner-empty-state">Loading customers, materials and challan history...</div></section>;
  }

  return (
    <>
    <section className="owner-dashboard-panel">
      <div className="owner-panel-heading">
        <div>
          <p className="owner-dashboard-eyebrow">Rental operation</p>
          <h2>Issue Material / Create Challan</h2>
          <p className="issue-page-note">Create one challan with multiple materials, saved rates, estimated rent and advance payment.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="owner-record-count">{challanGroups.length} challans</span>
          <button type="button" onClick={loadData} disabled={loading} className="stock-update-button">{loading ? "Refreshing..." : "Refresh"}</button>
        </div>
      </div>

      {message.text && <div className={`inventory-message ${message.type}`} role="status" style={{ marginBottom: 20 }}>{message.text}</div>}

      <div className="issue-main-column">
        <form className="issue-form" onSubmit={handleSubmit}>
          <div className="issue-field">
            <label htmlFor="issue-customer">Customer</label>
            <select id="issue-customer" name="customerId" value={form.customerId} onChange={(event) => { handleFormChange(event); if (event.target.value) setNewCustomerName(""); }} required={!newCustomerName.trim()}>
              <option value="">Select existing customer</option>
              {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name || "Unnamed Customer"}{customer.phone ? ` - ${customer.phone}` : ""}</option>)}
            </select>
            {customers.length === 0 && <small className="issue-page-note">No customers found. Add a customer before creating a challan.</small>}
            {selectedCustomerPending > 0 && <div className="rental-pending-inline-alert" role="alert"><strong>Pending balance alert: {money(selectedCustomerPending)}</strong><span>This customer already has unpaid rental charges. A full pending-balance pop-up will also appear after the new challan is created.</span><Link to="/owner-dashboard/payments">Review Payments</Link></div>}
          </div>

          <div className="issue-field">
            <label htmlFor="new-customer-name">Or add a new customer here</label>
            <input id="new-customer-name" value={newCustomerName} onChange={(event) => { setNewCustomerName(event.target.value); if (event.target.value) setForm((old) => ({ ...old, customerId: "" })); }} placeholder="New customer name" />
            <input aria-label="New customer phone number (optional)" value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone number (optional; can add later)" inputMode="numeric" maxLength={10} />
            <small className="issue-page-note">A new customer is saved to Customer Dashboard automatically when the challan is created. Phone number can be added later.</small>
          </div>

          <div className="issue-field">
            <label htmlFor="challan-number">Challan Number</label>
            <input id="challan-number" name="challanNumber" value={form.challanNumber} onChange={handleFormChange} placeholder="Enter challan number" autoComplete="off" maxLength={40} required />
            <small className="issue-page-note">Enter the challan number assigned by the owner. It must be unique.</small>
          </div>
          <div className="issue-field">
            <label htmlFor="rental-duration-days">Rental Duration (days)</label>
            <input id="rental-duration-days" name="rentalDurationDays" type="number" min="1" step="1" value={form.rentalDurationDays} onChange={handleFormChange} required />
            <small className="issue-page-note">Enter any number of days. Expected return date is for the owner's reference only.</small>
          </div>
          <div className="issue-field">
            <label htmlFor="issue-date">Issue Date</label>
            <input id="issue-date" name="issueDate" type="date" value={form.issueDate} onChange={handleFormChange} required />
          </div>
          <div className="issue-field">
            <label htmlFor="expected-return-date">Expected Return Date (owner reference)</label>
            <input id="expected-return-date" type="date" min={form.issueDate} value={form.expectedReturnDate} readOnly aria-readonly="true" />
            <small className="issue-page-note">Automatically set from the selected challan period.</small>
          </div>
          <div className="issue-field">
            <label htmlFor="issue-site-address">Site Address</label>
            <textarea id="issue-site-address" name="siteAddress" value={form.siteAddress} onChange={handleFormChange} placeholder="Enter the material delivery / project site address" rows="2" />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "24px 0 12px", gridColumn: "1 / -1" }}>
            <div>
              <p className="owner-dashboard-eyebrow">Challan line items</p>
              <h3 style={{ margin: 0 }}>Materials and Quantity</h3>
            </div>
            <button type="button" className="stock-update-button" onClick={addLine} disabled={inventory.length === 0}>+ Add Material</button>
          </div>

          {items.map((line, index) => {
            const selected = inventory.find((material) => material._id === line.materialId);
            const prepared = preparedItems[index];
            return (
              <div key={`line-${index}`} className="challan-line-editor">
                <div className="challan-line-editor-heading">
                  <strong>Material {index + 1}</strong>
                  {items.length > 1 && <button type="button" className="payment-cancel-button" onClick={() => removeLine(index)}>Remove</button>}
                </div>
                <div className="issue-field">
                  <label htmlFor={`material-${index}`}>Material</label>
                  <select id={`material-${index}`} name="materialId" value={line.materialId} onChange={(event) => handleLineChange(index, event)} required>
                    <option value="">Select material</option>
                    {inventory.map((material) => <option key={material._id} value={material._id}>{material.materialName}{material.size ? ` (${material.size})` : ""} — Available: {material.availableStock ?? 0} {/scaffolding/i.test(String(material.category || "")) || /scaffolding/i.test(String(material.materialName || "")) ? "piece" : (material.unit || "piece")}</option>)}
                  </select>
                </div>
                <div className="issue-field">
                  <label htmlFor={`quantity-${index}`}>{!prepared?.isScaffolding && selected?.unit === "sqft" ? "Area (square feet)" : "Quantity"}</label>
                  <input id={`quantity-${index}`} name="quantity" type="number" min={!prepared?.isScaffolding && selected?.unit === "sqft" ? "0.01" : "1"} step={!prepared?.isScaffolding && selected?.unit === "sqft" ? "0.01" : "1"} value={line.quantity} onChange={(event) => handleLineChange(index, event)} placeholder={!prepared?.isScaffolding && selected?.unit === "sqft" ? "Enter area in sq ft" : "Enter quantity"} required />
                  {selected && <small className="issue-page-note">In stock: {selected.availableStock ?? 0} {/scaffolding/i.test(String(selected.category || "")) || /scaffolding/i.test(String(selected.materialName || "")) ? "piece" : (selected.unit || "piece")}. Rental charges are finalized when material is returned.</small>}
                </div>
                
                <div className="issue-field" style={{ display: "none" }}>
                  <label htmlFor={`pricing-mode-${index}`}>Rental Method</label>
                  <select id={`pricing-mode-${index}`} name="rentalPricingMode" value={prepared?.rentalPricingMode || line.rentalPricingMode} onChange={(event) => handleLineChange(index, event)} disabled={Boolean(prepared?.isFarma || prepared?.isGhori)}>
                    <option value="daily">Per day</option>
                    <option value="monthly">Per month (prorated over 30 days)</option>
                    <option value="fixed">Fixed for the selected rental period</option>
                  </select>
                  {prepared?.isFarma && <small className="issue-page-note">Farma rule: 4 plates = 1 set; ₹100 per set per day.</small>}
                  {prepared?.isGhori && <small className="issue-page-note">Ghori rule: ₹50 per unit per day.</small>}

                </div>
                <div className="challan-line-estimate">
                  <span>Rental charge: calculated when material is returned</span>
                  <small>Only the material name and issued quantity are recorded here. Actual rental days and charges are finalized on the Bill.</small>
                </div>
              </div>
            );
          })}

          <div className="challan-payment-fields">
            <div className="issue-field">
              <label htmlFor="advance-amount">Advance / Amount Received (₹)</label>
              <input id="advance-amount" name="advanceAmount" type="number" min="0" step="0.01" value={form.advanceAmount} onChange={handleFormChange} required />
            </div>
            <div className="issue-field">
              <label htmlFor="payment-date">Payment Date</label>
              <input id="payment-date" name="paymentDate" type="date" value={form.paymentDate} onChange={handleFormChange} required />
            </div>
            <div className="issue-field payment-full-width">
              <label htmlFor="payment-note">Payment Note / Mode</label>
              <input id="payment-note" name="paymentNote" value={form.paymentNote} onChange={handleFormChange} placeholder="e.g. Cash, UPI, advance received" />
            </div>
          </div>
          <div className="challan-cost-summary">
            <div><span>Advance Received</span><strong>{money(form.advanceAmount)}</strong></div>
            <div><span>Rental Balance</span><strong>Calculated after returns</strong></div>
          </div>

          <div className="issue-field" style={{ marginTop: 18 }}>
            <label htmlFor="issue-notes">Challan Notes</label>
            <textarea id="issue-notes" name="notes" value={form.notes} onChange={handleFormChange} placeholder="Site address, delivery details or other terms" rows="3" />
          </div>
          <button type="submit" className="inventory-submit-button" disabled={saving || customers.length === 0 || inventory.length === 0 || items.length === 0}>
            {saving ? "Creating Challan..." : "Create Challan & Update Stock"}
          </button>
          <small className="issue-page-note" style={{ gridColumn: "1 / -1" }}>Challan records the issued materials and quantities only. Rental charges, Tempo Rent and Installation Charge are added during the return and billing process. Square-foot and folding rental calculations are not used.</small>
        </form>
      </div>

      <div className="owner-dashboard-panel" style={{ marginTop: 30 }}>
        <div className="owner-panel-heading">
          <div><p className="owner-dashboard-eyebrow">Rental documents</p><h3>Challan History</h3></div>
          <span className="owner-record-count">{challanGroups.length} records</span>
        </div>
        {challanGroups.length === 0 ? <div className="owner-empty-state">No challans recorded yet.</div> : (
          <div className="owner-table-wrapper">
            <table className="owner-inquiry-table">
              <thead><tr><th>Challan</th><th>Customer</th><th>Materials</th><th>Advance</th><th>Issue Date</th><th>Action</th></tr></thead>
              <tbody>{challanGroups.map((group) => {
                return <tr key={group.key}>
                  <td>{group.challanNumber}</td>
                  <td>{group.customer?.name || group.first.customerName || "Unknown"}</td>
                  <td>{group.items.map((item) => `${item.materialName || "Material"} × ${item.quantity || 0}`).join(", ")}</td>
                  <td>{money(group.first.billing?.paidAmount ?? 0)}</td>
                  <td>{displayDate(group.issueDate)}</td>
                  <td><Link to={`/owner/challan/${group.first._id}`}>View / Print</Link></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
    </>
  );
}

export default IssueMaterialPage;
