import { Link, useOutletContext } from "react-router-dom";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const periodText = (issue) => {
  const labels = { daily: "Daily", weekly: "1 Week", "15days": "15 Days", "30days": "30 Days" };
  if (labels[issue?.rentalPeriod]) return labels[issue.rentalPeriod];
  if (issue?.issueDate && issue?.expectedReturnDate) {
    const days = Math.max(1, Math.ceil((new Date(issue.expectedReturnDate).getTime() - new Date(issue.issueDate).getTime()) / 86400000));
    return `${days} day(s)`;
  }
  return "—";
};

function ChallansPage() {
  const { dashboardData } = useOutletContext();
  const issues = dashboardData?.materialIssues || [];
  const returns = dashboardData?.returns || [];

  const returnedMap = new Map();
  for (const item of returns) {
    const issueId = item.materialIssue?._id || item.materialIssue;
    if (!issueId) continue;
    const key = String(issueId);
    returnedMap.set(key, (returnedMap.get(key) || 0) + Number(item.quantity || 0));
  }

  const grouped = new Map();
  for (const issue of issues) {
    const number = issue.challanGroupNumber || issue.challanNumber;
    if (!grouped.has(number)) {
      grouped.set(number, { number, first: issue, items: [], billing: issue.billing || null });
    }
    const group = grouped.get(number);
    group.items.push(issue);
    if (!group.billing && issue.billing) group.billing = issue.billing;
  }
  const challans = Array.from(grouped.values()).sort((a, b) => new Date(b.first.createdAt || b.first.issueDate) - new Date(a.first.createdAt || a.first.issueDate));

  return (
    <section className="owner-dashboard-panel">
      <div className="owner-panel-heading">
        <div>
          <p className="owner-dashboard-eyebrow">Rental documents</p>
          <h2>Challan Management</h2>
        </div>
        <div className="challan-page-actions">
          <span className="owner-record-count">{challans.length} challan(s)</span>
          <Link className="return-secondary-button" to="/owner-dashboard/return-material">Return Material</Link>
        </div>
      </div>

      {challans.length === 0 ? <div className="owner-empty-state">No challans available yet.</div> : (
        <div className="owner-table-wrapper">
          <table className="owner-inquiry-table">
            <thead>
              <tr><th>Challan</th><th>Customer</th><th>Materials / Outstanding</th><th>Rental Period</th><th>Total Estimated</th><th>Cartage</th><th>Received</th><th>Pending</th><th>Issue Date</th><th>Open</th></tr>
            </thead>
            <tbody>
              {challans.map((challan) => {
                const totalEstimate = Number(challan.billing?.totalAmount ?? challan.billing?.amount ?? challan.items.reduce((sum, item) => sum + Number(item.estimatedRent || 0), 0));
                const paid = Number(challan.billing?.paidAmount || 0);
                const pending = Math.max(totalEstimate - paid, 0);
                return (
                  <tr key={challan.number}>
                    <td><strong>{challan.number || "-"}</strong></td>
                    <td>{challan.first.customer?.name || challan.first.customerName || "Unknown"}</td>
                    <td>
                      {challan.items.map((item) => {
                        const returned = Number(returnedMap.get(String(item._id)) || 0);
                        const outstanding = Math.max(Number(item.quantity || 0) - returned, 0);
                        return <div key={item._id} style={{ marginBottom: 7 }}>
                          <strong>{item.materialName || item.material?.materialName || "Material"}</strong>
                          <small style={{ display: "block", color: "#64748b" }}>Issued {item.quantity || 0} · Returned {returned} · Outstanding {outstanding}</small>
                        </div>;
                      })}
                    </td>
                    <td>{periodText(challan.first)}</td>
                    <td>{money(totalEstimate)}</td>
                    <td>{money(challan.billing?.cartageAmount || 0)}</td>
                    <td>{money(paid)}</td>
                    <td className={pending > 0 ? "rented-stock" : "available-stock"}>{money(pending)}</td>
                    <td>{dateText(challan.first.issueDate)}</td>
                    <td><Link className="owner-text-link" to={`/owner/challan/${challan.first._id}`}>View / Print</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default ChallansPage;
