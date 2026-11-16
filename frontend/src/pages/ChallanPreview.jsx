import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createChallanSummary,
  getChallanDisplayQuantity,
} from "../utils/challanUtils";
import "./ChallanPreview.css";
import authorizedSignature from "../assets/authorized-signature.png";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const getRentalPeriodLabel = (issue) => {
  const knownLabels = { daily: "Daily (1 day)", weekly: "1 Week (7 days)", "15days": "15 Days", "30days": "30 Days" };
  if (knownLabels[issue?.rentalPeriod]) return knownLabels[issue.rentalPeriod];
  const start = issue?.issueDate ? new Date(issue.issueDate) : null;
  const end = issue?.expectedReturnDate ? new Date(issue.expectedReturnDate) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    return `${days} day(s)`;
  }
  return "Not specified";
};

function ChallanPreview() {
  const navigate = useNavigate();
  const { issueId } = useParams();
  const token = localStorage.getItem("ownerToken");

  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/owner-login");
      return;
    }

    if (issueId) {
      loadIssue();
    }
  }, [issueId]);

  async function parseResponse(response) {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        message: text,
      };
    }
  }

  async function loadIssue() {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await fetch(
        `${API_URL}/material-issues/${issueId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await parseResponse(response);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("ownerToken");
        localStorage.removeItem("ownerData");
        navigate("/owner-login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load challan"
        );
      }

      setIssue(data.issue || data.materialIssue || null);
    } catch (error) {
      console.error("Load challan error:", error);
      setErrorMessage(
        error.message || "Unable to load challan"
      );
    } finally {
      setLoading(false);
    }
  }

  const challanSummary = useMemo(() => {
    if (!issue) {
      return null;
    }

    const items = Array.isArray(issue.items)
      ? issue.items
      : [issue];

    return createChallanSummary(items);
  }, [issue]);

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getCustomerName() {
    return (
      issue?.customer?.name ||
      issue?.customerName ||
      "-"
    );
  }

  function getCustomerPhone() {
    return (
      issue?.customer?.phone ||
      issue?.customerPhone ||
      "-"
    );
  }

  function getCustomerAddress() {
    return (
      issue?.customer?.address ||
      issue?.customerAddress ||
      "-"
    );
  }

  function getItems() {
    if (Array.isArray(issue?.items)) {
      return issue.items;
    }

    return issue ? [issue] : [];
  }

  function handlePrint() {
    window.print();
  }

  function handleBack() {
    navigate("/owner-dashboard");
  }

  if (loading) {
    return (
      <main className="challan-page">
        <section className="challan-state-card">
          <p>Loading challan...</p>
        </section>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="challan-page">
        <section className="challan-state-card">
          <h1>Unable to load challan</h1>
          <p>{errorMessage}</p>

          <div className="challan-state-actions">
            <button
              type="button"
              className="challan-secondary-button"
              onClick={loadIssue}
            >
              Try Again
            </button>

            <button
              type="button"
              className="challan-primary-button"
              onClick={handleBack}
            >
              Back to Dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!issue) {
    return (
      <main className="challan-page">
        <section className="challan-state-card">
          <h1>Challan not found</h1>
          <p>The requested challan could not be found.</p>

          <button
            type="button"
            className="challan-primary-button"
            onClick={handleBack}
          >
            Back to Dashboard
          </button>
        </section>
      </main>
    );
  }

  const items = getItems();

  return (
    <main className="challan-page">
      <div className="challan-toolbar no-print">
        <Link
          className="challan-back-link"
          to="/owner-dashboard"
        >
          ← Back to Dashboard
        </Link>

        <div className="challan-toolbar-actions">
          <button
            type="button"
            className="challan-secondary-button"
            onClick={loadIssue}
          >
            Refresh
          </button>

          <button
            type="button"
            className="challan-primary-button"
            onClick={handlePrint}
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <section className="challan-paper">
        <header className="challan-header challan-header-centered">
          <div className="challan-gst-placeholder">GSTIN: 06EBPPK9260J1Z1</div>
          <div className="challan-brand-block challan-brand-centered">
            <div className="challan-logo">SJ</div>
            <div>
              <h1>Shyam Ji Shuttering Store</h1>
              <p>Shuttering material rental services</p>
              <p className="challan-business-details">Nirmal Darbar, Maruti Kunj, Near Doon Valley International School, Gurugram (Hr.)</p>
              <p className="challan-business-details">E-mail: rkdhindhwal153@gmail.com</p>
              <p className="challan-business-details">Ramesh Kumar: 7015436736; 8802546135</p>
            </div>
          </div>
          <div className="challan-title-block">
            <p>RENTAL CHALLAN</p>
            <h2>{issue.challanGroupNumber || ""}</h2>
          </div>
        </header>

        <div className="challan-divider"></div>

        <section className="challan-meta-grid">
          <div className="challan-meta-card">
            <span>Customer</span>
            <strong>{getCustomerName()}</strong>
            <small>{getCustomerPhone()}</small>
            <small>Customer Address: {getCustomerAddress()}</small>
            <small><b>Site Address:</b> {issue.siteAddress || "-"}</small>
          </div>

          <div className="challan-meta-card">
            <span>Issue / Return & Rental Period</span>
            <strong>{formatDate(issue.issueDate)}</strong>
            <small>Period: {getRentalPeriodLabel(issue)}</small>

            <small>Created: {formatDateTime(issue.createdAt)}</small>
          </div>

          <div className="challan-meta-card">
            <span>Status</span>
            <strong>{issue.status || "Issued"}</strong>
            <small>Material issue record</small>
          </div>
        </section>

        <section className="challan-section">
          <div className="challan-section-heading">
            <div>
              <p className="challan-eyebrow">Outgoing material</p>
              <h3>Material Details</h3>
            </div>

            <span>{items.length} item(s)</span>
          </div>

          <div className="challan-table-wrapper">
            <table className="challan-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Material</th>
                  <th>Quantity</th>
                  <th>Notes</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => {
                  const quantityInfo =
                    getChallanDisplayQuantity(
                      item.materialName || item.material,
                      item.quantity
                    );

                  return (
                    <tr
                      key={item._id || `${item.materialName}-${index}`}
                    >
                      <td>{index + 1}</td>
                      <td>
                        {item.materialName ||
                          item.material ||
                          "-"}
                      </td>
                      <td>
                        <strong>
                          {/\b(?:farma|forma)\b/i.test(String(item.materialName || "")) && !/\bchali\b/i.test(String(item.materialName || ""))
                            ? `${quantityInfo.plates} plates`
                            : `${quantityInfo.display}${item.billingUnit || item.unit ? ` ${item.billingUnit || item.unit}` : ""}`}
                        </strong>
                      </td>
                      <td>{item.notes || issue.notes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="challan-summary-box">
          <div><span>Total Material Lines</span><strong>{challanSummary?.totalItems || 0}</strong></div>
          <div><span>Total Quantity</span><strong>{challanSummary?.totalQuantity || 0}</strong></div>
          {(challanSummary?.totalFarmaPlates || 0) > 0 && <div><span>Combined Farma Sets (9 / 12 / 15 / 18 inch)</span><strong>{challanSummary.totalFarmaPlates} plates = {challanSummary.totalFarmaSets} sets</strong></div>}
        </section>

        <section className="challan-payment-section">
          <div className="challan-section-heading"><div><p className="challan-eyebrow">Advance received</p><h3>Payment Record</h3></div></div>
          <div className="challan-payment-grid">
            <div><span>Advance Amount Received</span><strong>₹{Number(issue.billing?.paidAmount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
            <div><span>Payment Date</span><strong>{formatDate(issue.billing?.paymentHistory?.[0]?.date)}</strong></div>
            <div><span>Payment Mode / Note</span><strong>{issue.billing?.paymentHistory?.[0]?.note || "-"}</strong></div>
          </div>
        </section>

        <section className="challan-notes-section">
          <h3>Notes</h3>
          <p>{issue.notes || "No additional notes."}</p>
        </section>

        <footer className="challan-footer">
          <div>
            <span></span>
          </div>

          <div className="challan-authorized-signature">
            <img src={authorizedSignature} alt="Authorized signature" />
            <p>Authorized Signatory</p>
          </div>
        </footer>

        <div className="challan-footer-note">
        </div>
      </section>
    </main>
  );
}

export default ChallanPreview;
