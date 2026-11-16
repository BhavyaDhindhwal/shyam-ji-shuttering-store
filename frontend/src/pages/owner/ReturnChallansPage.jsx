import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import authorizedSignature from "../../assets/authorized-signature.png";
import "./ReturnPages.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const getName = (customer) => typeof customer === "string" ? customer : customer?.name || "Unknown Customer";
const getId = (value) => String(value?._id || value || "");

export default function ReturnChallansPage() {
  const { dashboardData } = useOutletContext();
  const returns = dashboardData?.returns || [];
  const sales = dashboardData?.sales || [];
  const [search, setSearch] = useState("");
  const [printKey, setPrintKey] = useState(null);

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of returns) {
      const issue = row.materialIssue || {};
      const original = String(issue.challanGroupNumber || issue.challanNumber || "-");
      const customerId = getId(row.customer);
      const customer = getName(row.customer);
      const phone = row.customer?.phone || "";
      const key = `${original}|${customerId || customer}`;
      const date = String(row.returnDate || row.createdAt || "").slice(0, 10);

      if (!map.has(key)) {
        map.set(key, {
          key, original, customer, customerId, phone,
          siteAddress: issue.siteAddress || "",
          issueDate: String(issue.issueDate || issue.createdAt || "").slice(0, 10),
          issueIds: new Set(),
          events: new Map(),
          lines: [],
        });
      }
      const group = map.get(key);
      if (issue._id) group.issueIds.add(String(issue._id));
      if (!group.events.has(date)) group.events.set(date, { date, lines: [], rentalCharge: 0, tempoRent: 0, installationCharge: 0 });
      const line = {
        id: row._id,
        date,
        material: row.materialName || issue.materialName || row.material?.materialName || "Material",
        issued: Number(issue.quantity || 0),
        quantity: Number(row.quantity || 0),
        rentalDays: Number(row.rentalDays || 0),
        rate: Number(row.rentalRate || 0),
        charge: Number(row.rentalCharge || 0),
        tempoRent: Number(row.tempoRent || 0),
        installationCharge: Number(row.installationCharge || 0),
        notes: row.notes || "",
      };
      group.lines.push(line);
      const event = group.events.get(date);
      event.lines.push(line);
      event.rentalCharge += line.charge;
      event.tempoRent += line.tempoRent;
      event.installationCharge += line.installationCharge;
    }

    return [...map.values()].map((group) => {
      const events = [...group.events.values()].sort((a, b) => a.date.localeCompare(b.date));
      const lastReturnDate = events.at(-1)?.date || "";
      const issueIds = group.issueIds;
      const sale = sales.find((entry) =>
        String(entry.challanNumber || entry.billNumber || "") === group.original ||
        issueIds.has(getId(entry.challan))
      ) || null;
      const customerSales = sales.filter((entry) => {
        if (group.customerId) return getId(entry.customer) === group.customerId;
        const samePhone = String(entry.customer?.phone || "").replace(/\D/g, "") === String(group.phone || "").replace(/\D/g, "");
        return samePhone && getName(entry.customer).toLowerCase() === group.customer.toLowerCase();
      });
      const candidateDates = [sale?.lastBillDate, lastReturnDate, sale?.saleDate, sale?.createdAt]
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()));
      const saleDate = candidateDates.length
        ? new Date(Math.max(...candidateDates.map((value) => value.getTime())))
        : null;
      const currentBillAmount = Number(sale?.totalAmount ?? sale?.amount ?? group.lines.reduce((sum, line) => sum + line.charge + line.tempoRent + line.installationCharge, 0));
      const billPaid = Number(sale?.paidAmount || 0);
      const billPending = Math.max(0, currentBillAmount - billPaid);
      const customerPending = customerSales.reduce((sum, entry) => {
        if ([entry.paymentStatus, entry.status].some((value) => String(value || "").toLowerCase() === "cancelled")) return sum;
        return sum + Math.max(0, Number(entry.totalAmount ?? entry.amount ?? 0) - Number(entry.paidAmount || 0));
      }, 0);
      const previousPending = Math.max(0, customerPending - billPending);
      const days = group.issueDate && lastReturnDate
        ? Math.max(0, Math.ceil((new Date(`${lastReturnDate}T00:00:00`) - new Date(`${group.issueDate}T00:00:00`)) / 86400000))
        : Math.max(0, ...group.lines.map((line) => line.rentalDays));
      return {
        ...group,
        events,
        lastReturnDate,
        sale,
        saleDate,
        days,
        rentalCharge: sale
          ? Math.max(0, currentBillAmount - Number(sale.cartageAmount || 0) - Number(sale.installationCharge || 0))
          : group.lines.reduce((sum, line) => sum + line.charge, 0),
        tempoRent: Number(sale?.cartageAmount ?? group.lines.reduce((sum, line) => sum + line.tempoRent, 0)),
        installationCharge: Number(sale?.installationCharge ?? group.lines.reduce((sum, line) => sum + line.installationCharge, 0)),
        currentBillAmount,
        billPaid,
        billPending,
        previousPending,
        customerPending,
      };
    }).sort((a, b) => new Date(b.saleDate || b.lastReturnDate || 0) - new Date(a.saleDate || a.lastReturnDate || 0));
  }, [returns, sales]);

  const normalizedSearch = search.trim().toLocaleLowerCase("en-IN");
  const filtered = groups.filter((group) =>
    `${group.original} BILL-${group.original} ${group.customer} ${group.phone} ${group.lines.map((line) => line.material).join(" ")}`
      .toLocaleLowerCase("en-IN")
      .includes(normalizedSearch)
  );
  const billAnchor = (key) => `bill-${String(key).replace(/[^a-z0-9_-]/gi, "-")}`;

  const printBill = (key) => {
    setPrintKey(key);
    window.setTimeout(() => window.print(), 180);
  };

  return <div className="owner-dashboard-panel return-challans-shell">
    <div className="return-challans-page">
      <div className="owner-panel-heading rc-heading">
        <div><p className="rc-eyebrow">Customer billing</p><h2>Bills</h2><p className="rc-muted">The newest bill appears first. Reopening or printing a bill does not create another charge.</p></div>
        <Link className="rc-btn" to="/owner-dashboard/return-material">+ Create Bill / Return</Link>
      </div>
      <div className="rc-search">
        <label htmlFor="bill-search" className="rc-muted">Search bill, challan, customer or phone</label>
        <input id="bill-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bill / challan number or customer…" />
      </div>
      {filtered.length === 0 ? <p className="rc-muted rc-empty">No bills found.</p> : <>
        <section className="rc-register-panel rc-no-print">
          <div className="rc-register-heading"><div><p className="rc-eyebrow">Quick lookup</p><h3>Bill Register</h3></div><span className="rc-muted">{filtered.length} bill(s)</span></div>
          <div className="rc-register-scroll">
            <table className="rc-table rc-register-table">
              <thead><tr><th>Bill No.</th><th>Challan No.</th><th>Customer</th><th>Bill Date</th><th>Bill Amount</th><th>Customer Pending</th><th>Status</th><th>View</th></tr></thead>
              <tbody>{filtered.map((group) => <tr key={`register-${group.key}`}>
                <td><strong>BILL-{group.original}</strong></td><td>{group.original}</td><td>{group.customer}<small>{group.phone || ""}</small></td><td>{dateLabel(group.saleDate)}</td><td>{money(group.currentBillAmount)}</td><td className={group.customerPending > 0.005 ? "rc-pending-value" : "rc-paid-value"}>{money(group.customerPending)}</td><td>{group.customerPending <= 0.005 ? "Paid" : group.customerPending < group.currentBillAmount + group.previousPending ? "Partially Paid" : "Pending"}</td><td><a className="rc-open-link" href={`#${billAnchor(group.key)}`}>Open Bill</a></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
        {filtered.map((group) => (
        <section id={billAnchor(group.key)} className={`rc-card rc-print${printKey === group.key ? " rc-print-target" : ""}`} key={group.key}>
          <div className="rc-no-print rc-card-head">
            <div><strong>Bill · Challan {group.original} · {group.customer}</strong><p className="rc-muted">{dateLabel(group.saleDate)} · Current bill {money(group.currentBillAmount)} · Customer pending {money(group.customerPending)}</p></div>
            <button className="rc-btn" type="button" onClick={() => printBill(group.key)}>Print / Save PDF</button>
          </div>

          <header className="bill-document-header">
            <div className="bill-gstin">GSTIN: 06EBPPK9260J1Z1</div>
            <div className="bill-brand-mark" aria-hidden="true">SJ</div>
            <h1>SHYAM JI SHUTTERING STORE</h1>
            <p>Shuttering Material, Scaffolding &amp; Allied Services</p>
            <p>Nirmal Darbar, Maruti Kunj, Near Doon Valley International School, Gurugram (Hr.)</p>
            <p>E-mail: rkdhindhwal153@gmail.com · Ramesh Kumar: 7015436736; 8802546135</p>
            <div className="bill-document-title">BILL / INVOICE</div>
          </header>

          <div className="bill-meta-grid">
            <div><small>Bill Number</small><strong>BILL-{group.original}</strong></div>
            <div><small>Bill Date</small><strong>{dateLabel(group.saleDate)}</strong></div>
            <div><small>Challan Number</small><strong>{group.original}</strong></div>
            <div><small>Issue Date</small><strong>{dateLabel(group.issueDate)}</strong></div>
            <div><small>Customer</small><strong>{group.customer}</strong></div>
            <div><small>Mobile</small><strong>{group.phone || "-"}</strong></div>
            <div className="bill-meta-wide"><small>Site Address</small><strong>{group.siteAddress || "-"}</strong></div>
            <div><small>Last Return Date</small><strong>{dateLabel(group.lastReturnDate)}</strong></div>
          </div>

          <div className="rc-section-heading"><small>RETURNED MATERIAL</small><h3>Material &amp; Rental Details</h3><span>{group.lines.length} return line(s)</span></div>
          <div className="rc-scroll">
            <table className="rc-table bill-material-table">
              <thead><tr><th>#</th><th>Material</th><th>Issued Qty</th><th>Returned Qty</th><th>Rental Days</th><th>Rate / Day</th><th>Rental Charge</th></tr></thead>
              <tbody>{group.lines.map((line, index) => <tr key={line.id}>
                <td>{index + 1}</td><td>{line.material}</td><td>{line.issued || "-"}</td><td>{line.quantity}</td><td>{line.rentalDays}</td><td>{money(line.rate)}</td><td>{money(line.charge)}</td>
              </tr>)}</tbody>
            </table>
          </div>

          <div className="bill-financial-grid">
            <div className="bill-charge-panel">
              <h3>Charge Breakdown</h3>
              <div><span>Rental / Material Charges (returns)</span><strong>{money(group.rentalCharge)}</strong></div>
              <div><span>Tempo Rent</span><strong>{money(group.tempoRent)}</strong></div>
              <div><span>Installation Charge</span><strong>{money(group.installationCharge)}</strong></div>
              <div className="bill-current-total"><span>Current Bill Total</span><strong>{money(group.currentBillAmount)}</strong></div>
            </div>
            <div className="bill-balance-panel">
              <h3>Customer Account</h3>
              <div><span>Previous Outstanding Balance</span><strong>{money(group.previousPending)}</strong></div>
              <div><span>Payment / Advance Applied to This Bill</span><strong>{money(group.billPaid)}</strong></div>
              <div><span>Current Bill Pending</span><strong>{money(group.billPending)}</strong></div>
              <div className="bill-final-pending"><span>Final Amount Payable (Customer Total)</span><strong>{money(group.customerPending)}</strong></div>
            </div>
          </div>

          <div className="bill-status-line">
            <strong>Payment Status: {group.customerPending <= 0.005 ? "Paid" : group.customerPending < group.currentBillAmount + group.previousPending ? "Partially Paid" : "Pending"}</strong>
            <span>Outstanding is calculated from all unpaid customer bills after recorded payments; previous balances are not duplicated.</span>
          </div>
          <div className="bill-stamp-center">SHYAM JI SHUTTERING STORE</div>
          <div className="bill-signature">
            <img src={authorizedSignature} alt="Authorized signature" />
            <strong>Authorized Signatory</strong>
          </div>
          <p className="bill-terms">Terms: Please clear the pending amount as agreed. All amounts are in Indian Rupees (₹).</p>
        </section>
      ))}
      </>}
    </div>
  </div>;
}
