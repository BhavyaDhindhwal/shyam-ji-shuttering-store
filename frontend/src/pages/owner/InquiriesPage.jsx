import { useOutletContext } from "react-router-dom";
import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function InquiriesPage() {
  const context = useOutletContext() || {};
  const dashboardData = context.dashboardData || {};

  const inquiries = Array.isArray(dashboardData.inquiries)
    ? dashboardData.inquiries
    : [];
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function clearAll() {
    if (!inquiries.length || !window.confirm("Clear all inquiries? This permanently deletes the current inquiry list.")) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${API_URL}/inquiries`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("ownerToken")}`, Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not clear inquiries");
      setNotice(`Cleared ${data.deletedCount || 0} inquiries. Refresh the dashboard to see new inquiries.`);
      window.location.reload();
    } catch (error) { setNotice(error.message || "Could not clear inquiries"); }
    finally { setBusy(false); }
  }

  return (
    <section className="owner-dashboard-panel">

      <div className="owner-panel-heading">
        <div>
          <p className="owner-dashboard-eyebrow">
            Customer requests
          </p>

          <h2>Recent Inquiries</h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="owner-record-count">{inquiries.length} records</span>
          <button type="button" className="payment-cancel-button" onClick={clearAll} disabled={busy || inquiries.length === 0}>{busy ? "Clearing..." : "Clear All Inquiries"}</button>
        </div>
      </div>

      {notice && <p role="status">{notice}</p>}

      {inquiries.length === 0 ? (
        <div className="owner-empty-state">
          No customer inquiries available.
        </div>
      ) : (
        <div className="owner-table-wrapper">

          <table className="owner-inquiry-table">

            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Material</th>
                <th>Requirement</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {inquiries.map((inquiry) => (
                <tr key={inquiry._id}>

                  <td>
                    {inquiry.name || "-"}
                  </td>

                  <td>
                    {inquiry.phone || "-"}
                  </td>

                  <td>
                    {inquiry.material || "-"}
                  </td>

                  <td>
                    {inquiry.message || "-"}
                  </td>

                  <td>
                    <span className="owner-status-badge">
                      {inquiry.status || "New"}
                    </span>
                  </td>

                  <td>
                    {inquiry.createdAt
                      ? new Date(
                          inquiry.createdAt
                        ).toLocaleDateString("en-IN")
                      : "-"}
                  </td>

                </tr>
              ))}
            </tbody>

          </table>

        </div>
      )}

    </section>
  );
}

export default InquiriesPage;