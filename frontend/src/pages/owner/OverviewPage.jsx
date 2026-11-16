
import { Link, useOutletContext } from "react-router-dom";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function getSaleAmount(sale) {
  return Number(sale.totalAmount ?? sale.amount ?? 0);
}

function getPaidAmount(sale) {
  return Number(sale.paidAmount ?? 0);
}

function getPendingAmount(sale) {
  if (sale.pendingAmount !== undefined && sale.pendingAmount !== null) {
    return Math.max(0, Number(sale.pendingAmount) || 0);
  }

  return Math.max(0, getSaleAmount(sale) - getPaidAmount(sale));
}

function getPaymentStatus(sale) {
  const total = getSaleAmount(sale);
  const paid = getPaidAmount(sale);
  const pending = getPendingAmount(sale);

  if (sale.status === "Cancelled" || sale.paymentStatus === "Cancelled") {
    return "Cancelled";
  }

  if (pending <= 0 && total > 0) {
    return "Paid";
  }

  if (paid > 0) {
    return "Partial";
  }

  return sale.paymentStatus || sale.status || "Pending";
}

function OverviewPage() {
  const context = useOutletContext() || {};

  const dashboardData = context.dashboardData || {
    materialIssues: [],
    sales: [],
    inquiries: [],
    returns: [],
  };

  const activeRenters = context.activeRenters || 0;

  const materialIssues = Array.isArray(dashboardData.materialIssues)
    ? dashboardData.materialIssues
    : [];

  const sales = Array.isArray(dashboardData.sales)
    ? dashboardData.sales
    : [];

  const inquiries = Array.isArray(dashboardData.inquiries)
    ? dashboardData.inquiries
    : [];

  const latestIssues = materialIssues.slice(0, 5);
  const latestSales = sales.slice(0, 5);

  const newInquiries = inquiries
    .filter((item) => {
      return String(item.status || "").toLowerCase() === "new";
    })
    .slice(0, 5);

  return (
    <>
      {/* QUICK ACCESS */}
      <section className="owner-dashboard-panel">
        <div className="owner-panel-heading">
          <div>
            <p className="owner-dashboard-eyebrow">Quick access</p>
            <h2>Business Control Center</h2>
          </div>

          <span className="owner-record-count">
            {activeRenters} active renter(s)
          </span>
        </div>

        <div className="owner-quick-grid">
          <Link to="/owner-dashboard/sales">
            Rental Sales &amp; Reports
          </Link>

          <Link to="/owner-dashboard/inventory">
            Inventory
          </Link>

          <Link to="/owner-dashboard/issue-material">
            Issue Material
          </Link>

          <Link to="/owner-dashboard/challans">
            Challans
          </Link>

          <Link to="/owner-dashboard/payments">
            Payments
          </Link>

          <Link to="/owner-dashboard/expenses">Expenses</Link>

          <Link to="/owner-dashboard/return-material">
            Return Material
          </Link>

          <Link to="/owner-dashboard/inquiries">
            Customer Inquiries
          </Link>
        </div>
      </section>

      {/* MATERIAL ISSUES AND NEW INQUIRIES */}
      <section className="overview-two-column">
        {/* MATERIAL ISSUES */}
        <div className="owner-dashboard-panel">
          <div className="owner-panel-heading">
            <div>
              <p className="owner-dashboard-eyebrow">Latest</p>
              <h2>Material Issues</h2>
            </div>

            <Link
              className="owner-text-link"
              to="/owner-dashboard/challans"
            >
              View all
            </Link>
          </div>

          {latestIssues.length === 0 ? (
            <div className="owner-empty-state">
              No material issues recorded yet.
            </div>
          ) : (
            <div className="owner-table-wrapper">
              <table className="owner-inquiry-table">
                <thead>
                  <tr>
                    <th>Challan</th>
                    <th>Customer</th>
                    <th>Material</th>
                    <th>Qty</th>
                  </tr>
                </thead>

                <tbody>
                  {latestIssues.map((issue, index) => (
                    <tr key={issue._id || index}>
                      <td>
                        {issue._id ? (
                          <Link
                            className="owner-text-link"
                            to={`/owner/challan/${issue._id}`}
                          >
                            {issue.challanNumber || "View challan"}
                          </Link>
                        ) : (
                          issue.challanNumber || "—"
                        )}
                      </td>

                      <td>
                        {issue.customer?.name ||
                          issue.customerName ||
                          "Unknown"}
                      </td>

                      <td>
                        {issue.materialName ||
                          issue.material?.materialName ||
                          "—"}
                      </td>

                      <td>
                        {Number(issue.quantity || 0)}{" "}
                        {issue.unit || issue.material?.unit || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* NEW INQUIRIES */}
        <div className="owner-dashboard-panel">
          <div className="owner-panel-heading">
            <div>
              <p className="owner-dashboard-eyebrow">Inbox</p>
              <h2>New Inquiries</h2>
            </div>

            <Link
              className="owner-text-link"
              to="/owner-dashboard/inquiries"
            >
              Manage
            </Link>
          </div>

          {newInquiries.length === 0 ? (
            <div className="owner-empty-state">
              No new inquiries.
            </div>
          ) : (
            <div className="owner-mini-list">
              {newInquiries.map((item, index) => (
                <div
                  className="owner-mini-item"
                  key={item._id || index}
                >
                  <div>
                    <strong>{item.name || "Unnamed customer"}</strong>

                    <span>
                      {item.material || item.message || "Material inquiry"}
                      {item.phone ? ` · ${item.phone}` : ""}
                    </span>
                  </div>

                  <span className="owner-status-badge">New</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* RECENT PAYMENT RECORDS */}
      <section className="owner-dashboard-panel">
        <div className="owner-panel-heading">
          <div>
            <p className="owner-dashboard-eyebrow">Accounts</p>
            <h2>Recent Payment Records</h2>
          </div>

          <Link
            className="owner-text-link"
            to="/owner-dashboard/payments"
          >
            Open payments
          </Link>
        </div>

        {latestSales.length === 0 ? (
          <div className="owner-empty-state">
            No payment records yet.
          </div>
        ) : (
          <div className="owner-table-wrapper">
            <table className="owner-inquiry-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {latestSales.map((sale, index) => {
                  const amount = getSaleAmount(sale);
                  const paid = getPaidAmount(sale);
                  const pending = getPendingAmount(sale);
                  const status = getPaymentStatus(sale);

                  return (
                    <tr key={sale._id || index}>
                      <td>
                        {sale.customer?.name ||
                          sale.customerName ||
                          "Walk-in / Unlinked"}
                      </td>

                      <td>{formatCurrency(amount)}</td>

                      <td>{formatCurrency(paid)}</td>

                      <td>{formatCurrency(pending)}</td>

                      <td>
                        <span className="owner-status-badge">
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default OverviewPage;
