import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const blankForm = { name: "", phone: "", address: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem("ownerToken");
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request("/customers");
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Customers could not be loaded." });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => `${c.name || ""} ${c.phone || ""} ${c.address || ""}`.toLowerCase().includes(q));
  }, [customers, search]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage({ type: "", text: "" });
    try {
      const data = await request("/customers", { method: "POST", body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() }) });
      setCustomers(old => [...old, data.customer].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(blankForm);
      setMessage({ type: "success", text: "Customer added. This customer is now available in Issue Material and Quotation." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Customer could not be added." });
    } finally { setSaving(false); }
  };

  return <section className="owner-dashboard-panel customers-page">
    <div className="owner-panel-heading"><div><p className="owner-dashboard-eyebrow">Customer records</p><h2>Customer Dashboard</h2><p className="issue-page-note">Add customers once, then select them in Issue Material and Quotation.</p></div><strong>{customers.length} customers</strong></div>
    {message.text && <p role="status" className={`customer-message ${message.type}`}>{message.text}</p>}
    <div className="customer-dashboard-grid">
      <form className="customer-form-card" onSubmit={submit}>
        <h3>Add New Customer</h3>
        <label>Customer / Firm Name *<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} minLength="2" required placeholder="Enter customer name" /></label>
        <label>Phone Number *<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} inputMode="numeric" pattern="[0-9]{10}" minLength="10" maxLength="10" required placeholder="10-digit mobile number" /></label>
        <label>Address (optional)<textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows="3" placeholder="Address / site location" /></label>
        <button type="submit" className="inventory-submit-button" disabled={saving}>{saving ? "Saving…" : "+ Add Customer"}</button>
      </form>
      <div className="customer-list-card">
        <div className="customer-list-heading"><h3>Saved Customers</h3><input aria-label="Search customers" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone…" /></div>
        {loading ? <p>Loading customers…</p> : filtered.length === 0 ? <p className="issue-page-note">{customers.length ? "No customers match this search." : "No customers yet. Add the first customer using the form."}</p> : <div className="owner-table-wrapper"><table className="owner-inquiry-table"><thead><tr><th>Name</th><th>Phone</th><th>Address</th></tr></thead><tbody>{filtered.map(c => <tr key={c._id}><td>{c.name}</td><td><a href={`tel:${c.phone}`}>{c.phone}</a></td><td>{c.address || "—"}</td></tr>)}</tbody></table></div>}
      </div>
    </div>
    <style>{`.customer-dashboard-grid{display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:20px;margin-top:18px}.customer-form-card,.customer-list-card{background:#fff;border:1px solid var(--border);padding:18px;color:var(--royal-blue);min-width:0}.customer-form-card h3,.customer-list-card h3{margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:22px;color:var(--royal-blue)}.customer-form-card label{display:flex;flex-direction:column;gap:6px;margin:12px 0;font-size:12px;font-weight:700;color:var(--royal-blue)}.customer-form-card input,.customer-form-card textarea,.customer-list-heading input{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);font:inherit;font-size:13px;color:var(--royal-blue);outline:none}.customer-form-card input:focus,.customer-form-card textarea:focus,.customer-list-heading input:focus{border-color:var(--gold)}.customer-message{padding:10px 12px;border-radius:8px}.customer-message.success{background:#e8f6ed;color:#20733c}.customer-message.error{background:#fdeaea;color:#b42318}.customer-list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.customer-list-heading input{max-width:260px}.customer-list-card .owner-table-wrapper{overflow:auto}@media(max-width:800px){.customer-dashboard-grid{grid-template-columns:1fr}.customer-list-heading{align-items:stretch;flex-direction:column}.customer-list-heading input{max-width:none}}`}</style>
  </section>;
}
