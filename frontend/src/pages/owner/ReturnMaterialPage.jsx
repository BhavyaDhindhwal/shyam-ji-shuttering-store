import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import authorizedSignature from "../../assets/authorized-signature.png";
import "./ReturnPages.css";

const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (v) => v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const customerName = (v) => typeof v === "string" ? v : v?.name || "Unknown Customer";
const issueKey = (i) => String(i.challanGroupNumber || i.challanNumber || i._id);
const issueUnit = (issue) => (/scaffolding/i.test(String(issue.material?.category || issue.category || "")) || /scaffolding/i.test(String(issue.materialName || ""))) ? "piece" : (issue.unit || "piece");
const isFarmaSetIssue = (issue) => {
  const name = String(issue.materialName || "").toLowerCase();
  const category = String(issue.material?.category || issue.category || "").toLowerCase();
  return !/chali|ghodi|ghori/.test(name) && (/farma|forma/.test(name) || /farma|forma/.test(category));
};
const calculateRentalDays = (issue, returnDate) => {
  const start = new Date(issue.rentalBilledThrough || issue.issueDate || issue.createdAt || today());
  const end = new Date(`${returnDate}T00:00:00`);
  return Math.max(0, Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000));
};

export default function ReturnMaterialPage() {
  const { dashboardData, fetchOwnerApi, reloadDashboard } = useOutletContext();
  const issues = dashboardData?.materialIssues || [];
  const returns = dashboardData?.returns || [];
  const [challan, setChallan] = useState("");
  const [rows, setRows] = useState({});
  const [returnDate, setReturnDate] = useState(today());
  const [paymentReceived, setPaymentReceived] = useState("0");
  const [tempoRent, setTempoRent] = useState("0");
  const [installationCharge, setInstallationCharge] = useState("0");
  const [paymentNote, setPaymentNote] = useState("Cash / UPI received during return");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [lastReceipt, setLastReceipt] = useState(null);

  const returnedMap = useMemo(() => {
    const m = new Map();
    returns.forEach((r) => {
      const id = r.materialIssue?._id || r.materialIssue;
      if (id) m.set(String(id), (m.get(String(id)) || 0) + Number(r.quantity || 0));
    });
    return m;
  }, [returns]);

  const groups = useMemo(() => {
    const m = new Map();
    issues.forEach((i) => {
      const remaining = Math.max(0, Number(i.quantity || 0) - Number(returnedMap.get(String(i._id)) || 0));
      if (remaining <= 0) return;
      const key = issueKey(i);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push({ ...i, _remaining: remaining });
    });
    return [...m.entries()].map(([number, items]) => ({ number, items }));
  }, [issues, returnedMap]);

  const selectedGroup = groups.find((g) => g.number === challan);
  const selectedRows = selectedGroup?.items || [];
  const linkedSale = useMemo(() => {
    if (!challan) return null;
    return (dashboardData?.sales || []).find((sale) => String(sale.challanNumber || "") === String(challan)) || null;
  }, [dashboardData?.sales, challan]);
  const setRow = (id, patch) => setRows((old) => ({ ...old, [id]: { ...(old[id] || {}), ...patch } }));

  const daysFor = (issue) => calculateRentalDays(issue, returnDate);
  const chosen = selectedRows.filter((i) => Number(rows[i._id]?.quantity || 0) > 0);
  const returnCharges = useMemo(() => {
    let outstandingFarmaPlates = selectedRows.filter(isFarmaSetIssue).reduce((sum, issue) => sum + Number(issue._remaining || 0), 0);
    return selectedRows.filter((issue) => Number(rows[issue._id]?.quantity || 0) > 0).map((issue) => {
      const row = rows[issue._id] || {};
      const quantity = Number(row.quantity || 0);
      const name = String(issue.materialName || "").toLowerCase();
      const rate = /chali/.test(name) ? 10 : /ghodi|ghori/.test(name) ? 50 : isFarmaSetIssue(issue) ? 100 : Number(row.rate === undefined || row.rate === "" ? (issue.rentalRate ?? 0) : row.rate);
      let billingQuantity = quantity;
      if (isFarmaSetIssue(issue)) {
        const before = Math.ceil(outstandingFarmaPlates / 4);
        outstandingFarmaPlates = Math.max(0, outstandingFarmaPlates - quantity);
        billingQuantity = Math.max(0, before - Math.ceil(outstandingFarmaPlates / 4));
      }
      const days = calculateRentalDays(issue, returnDate);
      return { issue, amount: Math.round(billingQuantity * rate * days * 100) / 100, days };
    });
  }, [selectedRows, rows, returnDate]);
  const returnChargeByIssue = new Map(returnCharges.map((item) => [String(item.issue._id), item]));
  const estimate = returnCharges.reduce((sum, item) => sum + item.amount, 0);

  async function submit(e) {
    e.preventDefault(); setMessage({ type: "", text: "" });
    if (!challan) return setMessage({ type: "error", text: "Please select an original challan." });
    if (!chosen.length) return setMessage({ type: "error", text: "Enter return quantity for at least one material." });
    for (const issue of chosen) {
      const q = Number(rows[issue._id].quantity);
      if (!Number.isFinite(q) || q <= 0 || q > issue._remaining || (issueUnit(issue) !== "sqft" && !Number.isInteger(q))) {
        return setMessage({ type: "error", text: `Check return quantity for ${issue.materialName}. Remaining: ${issue._remaining}.` });
      }
      const enteredRate = rows[issue._id].rate;
      const effectiveRate = enteredRate === undefined || enteredRate === "" ? Number(issue.rentalRate ?? 0) : Number(enteredRate);
      if (!Number.isFinite(effectiveRate) || effectiveRate < 0) return setMessage({ type: "error", text: `Enter a valid rate for ${issue.materialName}.` });
    }
    const pay = Number(paymentReceived || 0);
    const tempo = Number(tempoRent || 0);
    const install = Number(installationCharge || 0);
    if (!Number.isFinite(pay) || pay < 0) return setMessage({ type: "error", text: "Enter a valid payment amount." });
    if (!Number.isFinite(tempo) || tempo < 0) return setMessage({ type: "error", text: "Enter a valid non-negative tempo rent." });
    if (!Number.isFinite(install) || install < 0) return setMessage({ type: "error", text: "Enter a valid non-negative installation charge." });
    setSaving(true);
    try {
      const receiptLines = [];
      // Payment is posted only once, on the final line, after all rental charges have been added.
      for (let idx = 0; idx < chosen.length; idx++) {
        const issue = chosen[idx];
        const returnedBefore = Number(returnedMap.get(String(issue._id)) || 0);
        const result = await fetchOwnerApi("/returns", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialIssueId: issue._id,
            quantity: Number(rows[issue._id].quantity),
            returnDate,
            rentalRate: Number(rows[issue._id].rate === undefined || rows[issue._id].rate === "" ? (issue.rentalRate ?? 0) : rows[issue._id].rate),
            paymentReceived: idx === chosen.length - 1 ? pay : 0,
            tempoRent: idx === chosen.length - 1 ? tempo : 0,
            installationCharge: idx === chosen.length - 1 ? install : 0,
            paymentNote,
            notes,
          }),
        });
        const q = Number(rows[issue._id].quantity);
        receiptLines.push({
          id: result?.return?._id || `${issue._id}-${Date.now()}`,
          materialName: issue.materialName,
          unit: result?.unit || issueUnit(issue),
          issued: Number(issue.quantity || 0),
          returnedBefore,
          returnedNow: q,
          remaining: Math.max(0, issue._remaining - q),
          days: Number(result?.rentalDays ?? returnChargeByIssue.get(String(issue._id))?.days ?? daysFor(issue)),
          rate: Number(result?.rentalRate ?? (rows[issue._id].rate === undefined || rows[issue._id].rate === "" ? (issue.rentalRate ?? 0) : rows[issue._id].rate)),
          charge: Number(result?.rentalCharge ?? returnChargeByIssue.get(String(issue._id))?.amount ?? 0),
        });
      }
      await reloadDashboard();
      const totalCharge = receiptLines.reduce((s, x) => s + x.charge, 0);
      setLastReceipt({
        receiptNo: `RET-${Date.now().toString().slice(-8)}`,
        challan, customer: customerName(selectedRows[0]?.customer), phone: selectedRows[0]?.customer?.phone || "",
        date: returnDate, lines: receiptLines, totalCharge, payment: pay,
        tempoRent: tempo, installationCharge: install,
        paymentNote, notes,
      });
      setMessage({ type: "success", text: `Return saved for ${receiptLines.length} material line(s). Bill is ready to print.` });
      setChallan(""); setRows({}); setPaymentReceived("0"); setTempoRent("0"); setInstallationCharge("0"); setNotes("");
    } catch (err) {
      setMessage({ type: "error", text: `${err.message || "Unable to save return."} If some lines were already saved, check Bills before retrying to avoid duplicate returns.` });
      await reloadDashboard();
    } finally { setSaving(false); }
  }

  return <div className="return-batch-page">
    <section className="rb-panel">
      <div className="rb-head"><div><p className="rb-eyebrow">Stock return</p><h2>Return Material</h2><p className="rb-muted">Select one original challan, enter every returned material line, then submit once.</p></div><Link className="rb-btn secondary" to="/owner-dashboard/return-challans">Bills</Link></div>
      {message.text && <p className={`rb-message ${message.type}`}>{message.text}</p>}
      <form onSubmit={submit}>
        <div className="rb-grid">
          <div><label htmlFor="rb-challan">Original Challan</label><select id="rb-challan" value={challan} disabled={saving} required onChange={(e) => { setChallan(e.target.value); setRows({}); setMessage({ type: "", text: "" }); }}><option value="">Select challan number</option>{groups.map((g) => <option key={g.number} value={g.number}>Challan {g.number} · {customerName(g.items[0]?.customer)} · {g.items.length} material(s)</option>)}</select></div>
          <div><label htmlFor="rb-date">Return Date</label><input id="rb-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} disabled={saving} required /></div>
          <div><label htmlFor="rb-payment">Payment Received Now (₹)</label><input id="rb-payment" type="number" min="0" step="0.01" value={paymentReceived} onChange={(e) => setPaymentReceived(e.target.value)} disabled={saving} /><span className="rb-muted">Applied once to the bill, not once per item.</span></div>
          <div><label htmlFor="rb-tempo">Tempo Rent (₹)</label><input id="rb-tempo" type="number" min="0" step="0.01" value={tempoRent} onChange={(e) => setTempoRent(e.target.value)} disabled={saving} /><span className="rb-muted">Saved once for this return transaction.</span></div>
          <div><label htmlFor="rb-installation">Installation Charge (₹)</label><input id="rb-installation" type="number" min="0" step="0.01" value={installationCharge} onChange={(e) => setInstallationCharge(e.target.value)} disabled={saving} /><span className="rb-muted">Added separately to this challan's bill.</span></div>
        </div>
        {selectedGroup && <>
          <div className="rb-customer-line"><strong>{customerName(selectedRows[0]?.customer)}</strong><span className="rb-muted"> · {selectedRows.length} outstanding material line(s) in this challan</span></div>
          <div className="rb-existing-charges">
            <strong>Charges already saved on this challan</strong>
            <span>Tempo Rent: {money(linkedSale?.cartageAmount ?? linkedSale?.issueTempoRent ?? 0)}</span>
            <span>Installation Charge: {money(linkedSale?.installationCharge ?? linkedSale?.issueInstallationCharge ?? 0)}</span>
            <small>These totals are already included in the linked bill. Enter only any additional amount for this return below; it will be added once.</small>
          </div>
          <div className="rb-table-wrap"><table><thead><tr><th>Material</th><th>Issued</th><th>Returned earlier</th><th>Remaining</th><th>Return now</th><th>Rate (₹)</th><th>Rental days</th><th>Estimated charge</th></tr></thead><tbody>{selectedRows.map((issue) => { const r = rows[issue._id] || {}; const before = Number(returnedMap.get(String(issue._id)) || 0); const q = Number(r.quantity || 0); const active = q > 0; return <tr key={issue._id}><td><strong>{issue.materialName}</strong><br/><span className="rb-muted">{issueUnit(issue)}</span></td><td>{issue.quantity}</td><td>{before}</td><td>{issue._remaining}</td><td><input aria-label={`Return quantity ${issue.materialName}`} type="number" min={issueUnit(issue) === "sqft" ? "0.01" : "1"} step={issueUnit(issue) === "sqft" ? "0.01" : "1"} max={issue._remaining} value={r.quantity || ""} disabled={saving} placeholder="0 = skip" onChange={(e) => setRow(issue._id, { quantity: e.target.value })}/></td><td><input aria-label={`Rental rate ${issue.materialName}`} type="number" min="0" step="0.01" value={r.rate ?? issue.rentalRate ?? ""} disabled={saving} onChange={(e) => setRow(issue._id, { rate: e.target.value })}/></td><td>{returnChargeByIssue.get(String(issue._id))?.days || daysFor(issue)} day(s)</td><td>{money(active ? (returnChargeByIssue.get(String(issue._id))?.amount || 0) : 0)}</td></tr>; })}</tbody></table></div>
          <div className="rb-summary"><div className="rb-stat"><span>Selected material lines</span><strong>{chosen.length}</strong></div><div className="rb-stat"><span>New Rental Charges</span><strong>{money(estimate)}</strong></div><div className="rb-stat"><span>Payment received now</span><strong>{money(paymentReceived)}</strong></div></div>
          <div className="rb-grid rb-mt"><div><label htmlFor="rb-mode">Payment mode / note</label><input id="rb-mode" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} disabled={saving}/></div><div className="rb-span-2"><label htmlFor="rb-notes">Notes</label><input id="rb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} placeholder="Optional notes"/></div></div>
          <div className="rb-actions"><button className="rb-btn" type="submit" disabled={saving || !chosen.length}>{saving ? "Saving all returned items…" : `Submit Return (${chosen.length} item line${chosen.length === 1 ? "" : "s"})`}</button><Link className="rb-btn secondary" to="/owner-dashboard/return-challans">View Bills</Link></div>
        </>}
      </form>
    </section>
    {lastReceipt && <section className="rb-panel rb-print"><div className="rb-head rb-no-print"><div><p className="rb-eyebrow">Return saved</p><h2>Bill</h2></div><button className="rb-btn" onClick={() => window.print()}>Print / Save PDF</button></div><div className="rb-receipt"><h1>Shyam Ji Shuttering Store</h1><p className="rb-receipt-subtitle">BILL / MATERIAL RETURN</p><div className="rb-receipt-meta"><div><b>Return Receipt:</b> {lastReceipt.receiptNo}<br/><b>Original Challan:</b> {lastReceipt.challan}<br/><b>Customer:</b> {lastReceipt.customer}</div><div><b>Return Date:</b> {dateLabel(lastReceipt.date)}<br/><b>Phone:</b> {lastReceipt.phone || "-"}</div></div><table><thead><tr><th>Material</th><th>Issued</th><th>Returned earlier</th><th>Returned now</th><th>Balance with customer</th><th>Days</th><th>Rate/day</th><th>Charge</th></tr></thead><tbody>{lastReceipt.lines.map((l) => <tr key={l.id}><td>{l.materialName}</td><td>{l.issued} {l.unit}</td><td>{l.returnedBefore}</td><td>{l.returnedNow}</td><td>{l.remaining}</td><td>{l.days}</td><td>{money(l.rate)}</td><td>{money(l.charge)}</td></tr>)}</tbody></table><div className="rb-receipt-total"><div><span>Rental / Material Charges</span><strong>{money(lastReceipt.totalCharge)}</strong></div><div><span>Tempo Rent</span><strong>{money(lastReceipt.tempoRent)}</strong></div><div><span>Installation Charge</span><strong>{money(lastReceipt.installationCharge)}</strong></div><div><span>New Charges Total</span><strong>{money(lastReceipt.totalCharge + lastReceipt.tempoRent + lastReceipt.installationCharge)}</strong></div><div><span>Payment received now</span><strong>− {money(lastReceipt.payment)}</strong></div><div><span>Payment mode / note</span><strong>{lastReceipt.paymentNote || "-"}</strong></div></div>{lastReceipt.notes && <p><b>Notes:</b> {lastReceipt.notes}</p>}<div className="rb-receipt-authorized"><img src={authorizedSignature} alt="Authorized signature" /><strong>Authorized Signatory</strong></div><p className="rb-receipt-note">This receipt records the items returned in this transaction. Any remaining quantity is still with the customer.</p></div></section>}
  </div>;
}
