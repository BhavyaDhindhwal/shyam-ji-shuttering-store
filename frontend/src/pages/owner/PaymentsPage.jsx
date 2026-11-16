import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PaymentsPage.css";
import authorizedSignature from "../../assets/authorized-signature.png";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

function PaymentsPage() {
  const navigate = useNavigate();

  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPaid: 0,
    totalPending: 0,
    totalRecords: 0,
  });
  const [monthlyRecap, setMonthlyRecap] = useState([]);
  const [monthlyRecapSummary, setMonthlyRecapSummary] = useState({ activeRentals: 0, eligibleRentals: 0, pendingReviewAmount: 0, billsCreatedThisMonth: 0 });
  const [monthlyRecapError, setMonthlyRecapError] = useState("");
  const [expandedMonthlyChallan, setExpandedMonthlyChallan] = useState("");
  const [monthlyActionId, setMonthlyActionId] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentNote, setPaymentNote] = useState("");
  const [reminderRevision, setReminderRevision] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const knownChallansRef = useRef(null);


  // ---------------------------------------
  // Parse API response safely
  // ---------------------------------------
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

  // ---------------------------------------
  // Logout when token expires
  // ---------------------------------------
  function handleUnauthorized(status) {
    if (status === 401 || status === 403) {
      localStorage.removeItem("ownerToken");
      localStorage.removeItem("ownerData");

      navigate("/owner-login", {
        replace: true,
      });

      return true;
    }

    return false;
  }

  // ---------------------------------------
  // Normalize a sale object
  // ---------------------------------------
  function normalizeSale(item) {
    const preferredTotal = Number(item.totalAmount ?? 0);
    const legacyTotal = Number(item.saleAmount ?? item.amount ?? item.sales ?? 0);
    const totalAmount = preferredTotal > 0 ? preferredTotal : legacyTotal;

    const paidAmount = Number(
      item.paidAmount ??
        item.paid ??
        0
    );

    const calculatedPending = Math.max(
      totalAmount - paidAmount,
      0
    );

    let paymentStatus =
      item.paymentStatus ||
      item.status ||
      "";

    if (!paymentStatus) {
      paymentStatus =
        calculatedPending <= 0
          ? "Paid"
          : paidAmount > 0
            ? "Partial"
            : "Pending";
    }

    const customerName =
      item.customer?.name ||
      item.customerName ||
      item.name ||
      "Unknown Customer";

    const customerPhone =
      item.customer?.phone ||
      item.phone ||
      "";

    const saleDate =
      item.saleDate ||
      item.date ||
      item.createdAt ||
      null;

    return {
      ...item,
      id: item._id,
      totalAmount,
      paidAmount,
      pendingAmount: calculatedPending,
      paymentStatus,
      customerName,
      customerPhone,
      saleDate,
    };
  }

  // ---------------------------------------
  // Local summary fallback
  // ---------------------------------------
  function calculateLocalSummary(data) {
    const totalSales = data.reduce(
      (sum, sale) =>
        sum + Number(sale.totalAmount || 0),
      0
    );

    const totalPaid = data.reduce(
      (sum, sale) =>
        sum + Number(sale.paidAmount || 0),
      0
    );

    const totalPending = data.reduce(
      (sum, sale) =>
        sum + Number(sale.pendingAmount || 0),
      0
    );

    setSummary({
      totalSales,
      totalPaid,
      totalPending,
      totalRecords: data.length,
    });
  }


  // ---------------------------------------
  // Load payments/sales
  // ---------------------------------------
  const loadPayments = useCallback(async () => {
    const currentToken =
      localStorage.getItem("ownerToken");

    if (!currentToken) {
      navigate("/owner-login", {
        replace: true,
      });
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const [salesResponse, summaryResponse] =
        await Promise.all([
          fetch(`${API_URL}/sales`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${currentToken}`,
            },
          }),

          fetch(`${API_URL}/sales/summary`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${currentToken}`,
            },
          }),
        ]);

      if (
        handleUnauthorized(salesResponse.status) ||
        handleUnauthorized(summaryResponse.status)
      ) {
        return;
      }

      const salesData =
        await parseResponse(salesResponse);

      const summaryData =
        await parseResponse(summaryResponse);

      try {
        const recapResponse = await fetch(`${API_URL}/sales/monthly-bill-recap`, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: `Bearer ${currentToken}` },
        });
        const recapData = await parseResponse(recapResponse);
        if (recapResponse.ok) {
          setMonthlyRecap(Array.isArray(recapData.recap) ? recapData.recap : []);
          setMonthlyRecapSummary(recapData.summary || { activeRentals: 0, eligibleRentals: 0, pendingReviewAmount: 0, billsCreatedThisMonth: 0 });
          setMonthlyRecapError("");
        } else {
          setMonthlyRecapError(recapData.message || "Monthly Bill Recap is currently unavailable.");
        }
      } catch (recapError) {
        console.warn("Monthly recap could not be loaded:", recapError);
        setMonthlyRecapError("Monthly Bill Recap is currently unavailable.");
      }

      if (!salesResponse.ok) {
        throw new Error(
          salesData.message ||
            salesData.error ||
            "Unable to load payment records."
        );
      }

      const normalizedSales = Array.isArray(
        salesData.sales
      )
        ? salesData.sales.map(normalizeSale)
        : [];

      setSales(normalizedSales);

      // ---------------------------------------
      // Use backend summary when available
      // ---------------------------------------
      const backendSummary =
        summaryData.totals ||
        summaryData.summary?.totals ||
        summaryData.summary ||
        summaryData;

      if (backendSummary) {
        setSummary({
          totalSales: Number(
            backendSummary.totalSales ??
              backendSummary.totalAmount ??
              normalizedSales.reduce(
                (sum, sale) =>
                  sum + sale.totalAmount,
                0
              )
          ),

          totalPaid: Number(
            backendSummary.totalPaid ??
              backendSummary.paidAmount ??
              normalizedSales.reduce(
                (sum, sale) =>
                  sum + sale.paidAmount,
                0
              )
          ),

          totalPending: Number(
            backendSummary.totalPending ??
              backendSummary.pendingAmount ??
              backendSummary.pendingPayments ??
              normalizedSales.reduce(
                (sum, sale) =>
                  sum + sale.pendingAmount,
                0
              )
          ),

          totalRecords: Number(
            backendSummary.totalRecords ??
              normalizedSales.length
          ),
        });
      } else {
        calculateLocalSummary(normalizedSales);
      }
    } catch (error) {
      console.error(
        "Payments load error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to load payment records."
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  async function handleMonthlyBillAction(row, action) {
    const latestPeriod = row.pendingPeriods?.[row.pendingPeriods.length - 1];
    if (!latestPeriod) return;
    const actionKey = `${row.challanNumber}:${action}`;
    if (action === "create") {
      const periodLabel = `${formatDate(row.billingPeriodStart)} to ${formatDate(row.billingPeriodEnd)}`;
      const confirmed = window.confirm(`Create a monthly rental bill for ${row.customerName}, challan ${row.challanNumber}?\nBilling period(s): ${periodLabel}\nEstimated amount: ${formatCurrency(row.estimatedAmount)}\n\nAny previously skipped but unbilled periods will be included. Continue?`);
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(`Skip the latest pending month for challan ${row.challanNumber}?\nThis does not waive the rental charges. The skipped period remains eligible for a future catch-up bill.`);
      if (!confirmed) return;
    }
    try {
      setMonthlyActionId(actionKey);
      setErrorMessage("");
      setSuccessMessage("");
      const token = localStorage.getItem("ownerToken");
      const response = await fetch(`${API_URL}/sales/monthly-bill/${encodeURIComponent(row.challanNumber)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(action === "create"
          ? { throughPeriodEnd: row.billingPeriodEnd }
          : { periodStart: latestPeriod.start, periodEnd: latestPeriod.end }),
      });
      const data = await parseResponse(response);
      if (!response.ok) throw new Error(data.message || "Monthly billing action failed.");
      setSuccessMessage(data.message || (action === "create" ? "Monthly bill created." : "Billing period skipped."));
      await loadPayments();
    } catch (error) {
      setErrorMessage(error.message || "Unable to update the monthly bill.");
    } finally {
      setMonthlyActionId("");
    }
  }

  function escapeBillHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function openBillPdf(sale) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setErrorMessage("The bill PDF window was blocked. Allow pop-ups for this site and try again.");
      return;
    }
    const billNumber = sale.billNumber || sale.challanNumber || `BILL-${String(sale._id || "").slice(-6)}`;
    const total = Number(sale.totalAmount ?? sale.amount ?? 0);
    const paid = Number(sale.paidAmount || 0);
    const pending = Math.max(0, total - paid);
    const billType = sale.billType === "monthly_rental" ? "Monthly Rental Bill" : "Rental Bill / Account Statement";
    const items = Array.isArray(sale.lineItems) ? sale.lineItems : [];
    const rows = [];
    if (sale.billType === "monthly_rental" && items.length) {
      items.forEach((line) => rows.push(`<tr><td>${escapeBillHtml(line.materialName || "Material")}</td><td>${escapeBillHtml(line.quantity ?? "-")} ${escapeBillHtml(line.unit || "")}</td><td>${escapeBillHtml(line.billingQuantity ?? "-")} ${escapeBillHtml(line.billingUnit || "")}</td><td>${formatCurrency(line.rate || 0)}</td><td>${formatCurrency(line.estimatedRent || 0)}</td></tr>`));
    } else {
      const rentalAmount = Math.max(0, total - Number(sale.cartageAmount || 0) - Number(sale.installationCharge || 0));
      if (rentalAmount > 0) rows.push(`<tr><td>Rental charges (as saved in bill)</td><td colspan="3">See challan / return records</td><td>${formatCurrency(rentalAmount)}</td></tr>`);
      if (Number(sale.cartageAmount || 0) > 0) rows.push(`<tr><td>Tempo / cartage charges</td><td colspan="3">As recorded</td><td>${formatCurrency(sale.cartageAmount)}</td></tr>`);
      if (Number(sale.installationCharge || 0) > 0) rows.push(`<tr><td>Installation charges</td><td colspan="3">As recorded</td><td>${formatCurrency(sale.installationCharge)}</td></tr>`);
      if (!rows.length) rows.push(`<tr><td>${escapeBillHtml(sale.description || "Rental bill")}</td><td colspan="3">Saved bill amount</td><td>${formatCurrency(total)}</td></tr>`);
    }
    const customerName = sale.customer?.name || sale.customerName || "Customer";
    const rawCustomerPhone = String(sale.customer?.phone || sale.customerPhone || "");
    const customerPhoneDigits = rawCustomerPhone.replace(/\D/g, "");
    const whatsappPhone = customerPhoneDigits.length === 10
      ? `91${customerPhoneDigits}`
      : customerPhoneDigits.length === 11 && customerPhoneDigits.startsWith("0")
        ? `91${customerPhoneDigits.slice(1)}`
        : customerPhoneDigits.length === 12 && customerPhoneDigits.startsWith("91")
          ? customerPhoneDigits
          : "";
    const startText = sale.billingPeriodStart ? formatDate(sale.billingPeriodStart) : "";
    const endText = sale.billingPeriodEnd ? formatDate(sale.billingPeriodEnd) : "";
    const periodText = startText && endText ? `${startText} - ${endText}` : "";
    const signatureUrl = `${window.location.origin}${authorizedSignature}`;
    const safe = escapeBillHtml;
    const whatsappUrl = whatsappPhone
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Namaste ${customerName}, please find the bill PDF ${billNumber} from Shyam Ji Shuttering Store. Total: ${formatCurrency(total)}. Kindly review the attached PDF. Thank you.`)}`
      : "";
    const whatsappAction = whatsappUrl ? `<a class="share" href="${whatsappUrl}" target="_blank" rel="noopener">Open WhatsApp with bill message</a><p class="hint">Save this page as a PDF first, then attach the saved PDF in WhatsApp before sending. The website does not auto-send files.</p>` : `<p class="hint">${rawCustomerPhone ? "The saved customer phone number is not a valid Indian mobile number." : "No customer phone number is saved."} Save the PDF and share it using your preferred method.</p>`;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(billNumber)} - Shyam Ji Shuttering Store</title><style>
      @page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;font-size:12px}.toolbar{display:flex;gap:12px;margin:0 auto 18px;max-width:780px}.toolbar button,.share{border:0;background:#123d78;color:white;padding:10px 14px;border-radius:6px;text-decoration:none;cursor:pointer;font-weight:700}.page{max-width:780px;margin:auto;border:1px solid #d8deea;padding:28px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #d9b64a;padding-bottom:16px}.head h1{font-family:Georgia,serif;margin:0 0 6px;color:#143c70;font-size:24px}.muted{color:#64748b;line-height:1.5}.billtag{text-align:right}.billtag h2{margin:0 0 6px;color:#143c70}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:18px 0}.meta div{padding:8px;background:#f7f9fc}.meta span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:4px}.meta strong{font-size:12px}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#173f75;color:white;text-align:left}th,td{padding:9px 8px;border:1px solid #dce2ed}td:last-child,th:last-child{text-align:right}.totals{width:340px;margin:18px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e4e9f1}.totals .grand{font-size:16px;font-weight:700;color:#143c70;border-top:2px solid #d9b64a}.note{margin-top:18px;padding:10px;background:#f7f9fc;color:#475569}.signature{margin-top:28px;display:flex;justify-content:flex-end}.signature img{max-width:145px;max-height:60px;object-fit:contain}.signature span{display:block;border-top:1px solid #334155;padding-top:6px;text-align:center}.hint{color:#64748b;font-size:11px}.share-area{max-width:780px;margin:14px auto}.share-area .hint{display:inline-block;margin-left:10px}@media print{.toolbar,.share-area{display:none}.page{border:0;padding:0;max-width:none}}
      </style></head><body>
      <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>
      <main class="page"><header class="head"><div><h1>SHYAM JI SHUTTERING STORE</h1><div class="muted">Rental Material & Shuttering Services</div><div class="muted">Thank you for your business.</div></div><div class="billtag"><h2>${safe(billType)}</h2><strong>${safe(billNumber)}</strong><div class="muted">Date: ${safe(formatDate(sale.saleDate || sale.createdAt))}</div></div></header>
      <section class="meta"><div><span>Customer</span><strong>${safe(customerName)}</strong></div><div><span>Phone</span><strong>${safe(sale.customer?.phone || sale.customerPhone || "-")}</strong></div><div><span>Address</span><strong>${safe(sale.customer?.address || sale.customerAddress || "-")}</strong></div><div><span>Challan Number</span><strong>${safe(sale.sourceChallanNumber || sale.challanNumber || "-")}</strong></div><div><span>Billing Period</span><strong>${safe(periodText || "As per saved bill")}</strong></div></section>
      <table><thead><tr><th>Description</th><th>Issued / Qty</th><th>Bill Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows.join("")}</tbody></table>
      <section class="totals"><div><span>Bill Total</span><strong>${formatCurrency(total)}</strong></div><div><span>Paid / Received</span><strong>${formatCurrency(paid)}</strong></div><div class="grand"><span>Balance Due</span><strong>${formatCurrency(pending)}</strong></div></section>
      ${Number(sale.previousOutstandingBalance || 0) > 0 ? `<p class="note">Previous outstanding (informational): ${formatCurrency(sale.previousOutstandingBalance)}. This amount is not added again to this bill total.</p>` : ""}
      <div class="signature"><div><img src="${signatureUrl}" alt="Authorized signature"><span>Authorized Signature</span></div></div>
      <p class="muted" style="margin-top:28px;text-align:center">This bill reflects the amounts saved in the Shyam Ji Shuttering Store system.</p></main>
      <div class="share-area">${whatsappAction}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  // ---------------------------------------
  // Initial load
  // ---------------------------------------
  useEffect(() => {
    // Trigger the initial API sync; subsequent state changes are handled by the fetch callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPayments();
  }, [loadPayments]);

  // Watch for newly created challans while the owner's Payments page is open.
  // Browser permission is required; this notification is sent to the owner, not the customer.
  useEffect(() => {
    const token = localStorage.getItem("ownerToken");
    if (!token) return undefined;
    const checkForNewChallans = async () => {
      try {
        const response = await fetch(`${API_URL}/sales`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const payload = await response.json();
        const records = Array.isArray(payload.sales) ? payload.sales : [];
        const current = new Map(records.map((item) => [String(item._id || item.id), item]));
        if (knownChallansRef.current === null) { knownChallansRef.current = current; return; }
        const previous = knownChallansRef.current;
        const fresh = records.filter((item) => { const id = String(item._id || item.id); return id && !previous.has(id); });
        knownChallansRef.current = current;
        if (fresh.length && notificationPermission === "granted" && "Notification" in window) {
          const item = fresh[0];
          const number = item.challanNumber || item.challanGroupNumber || item.invoiceNumber || item.billNumber || "Not assigned";
          const customer = item.customer?.name || item.customerName || item.name || "Customer";
          new Notification("New challan — Shyam Ji Shuttering Store", {
            body: `${fresh.length > 1 ? `${fresh.length} new challans. Latest: ` : "New challan: "}${number} · ${customer}. Open Payments to review and send a reminder.`,
            tag: `shyam-new-challan-${String(item._id || item.id)}`,
          });
        }
      } catch (error) { console.warn("Could not check for new challans:", error); }
    };
    checkForNewChallans();
    const timer = window.setInterval(checkForNewChallans, 30000);
    return () => window.clearInterval(timer);
  }, [notificationPermission]);

  // ---------------------------------------
  // Pending-payment browser notifications
  // Notifications are shown when this page is open and browser permission is granted.
  // ---------------------------------------
  const pendingSales = useMemo(
    () => sales.filter((sale) => Number(sale.pendingAmount || 0) > 0 && String(sale.paymentStatus).toLowerCase() !== "cancelled"),
    [sales]
  );

  useEffect(() => {
    if (loading || notificationPermission !== "granted" || pendingSales.length === 0) return;
    const pendingKey = pendingSales
      .map((sale) => `${sale.id}:${Number(sale.pendingAmount || 0).toFixed(2)}`)
      .sort()
      .join("|");
    const noticeKey = `shyamPendingPaymentNotice:${pendingKey}`;
    if (sessionStorage.getItem(noticeKey)) return;
    try {
      new Notification("Pending payments - Shyam Ji Shuttering Store", {
        body: `${pendingSales.length} record(s) have pending dues. Total pending: ₹${pendingSales.reduce((sum, sale) => sum + Number(sale.pendingAmount || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}. Open Payments to follow up.`,
        tag: "shyam-pending-payments",
      });
      sessionStorage.setItem(noticeKey, "shown");
    } catch (error) {
      console.warn("Could not show pending payment notification:", error);
    }
  }, [loading, notificationPermission, pendingSales]);

  async function enablePaymentNotifications() {
    if (!("Notification" in window)) {
      setSuccessMessage("Browser notifications are not supported here. Pending alerts will still appear on this page.");
      setNotificationPermission("unsupported");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        const pendingTotal = pendingSales.reduce((sum, sale) => sum + Number(sale.pendingAmount || 0), 0);
        new Notification("Payment alerts enabled", {
          body: pendingSales.length
            ? `${pendingSales.length} pending record(s). Total outstanding: ₹${pendingTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.`
            : "You will be notified when pending payments are detected while this page is open.",
        });
        setSuccessMessage("Browser payment notifications enabled.");
      } else {
        setSuccessMessage("Notifications were not enabled. You can allow them in your browser/site settings.");
      }
    } catch (error) {
      setErrorMessage("Could not enable browser notifications. Please check browser permissions.");
    }
  }

  // ---------------------------------------
  // Open payment modal
  // ---------------------------------------
  function openPaymentModal(sale) {
    setPaymentModal(sale);

    // Enter only the new receipt amount; the backend keeps the running total.
    setPaymentAmount("");

    setPaymentDate(
      sale.paymentDate
        ? new Date(sale.paymentDate)
            .toISOString()
            .split("T")[0]
        : new Date()
            .toISOString()
            .split("T")[0]
    );

    setPaymentNote(
      sale.paymentNote ||
        sale.notes ||
        ""
    );

    setSuccessMessage("");
    setErrorMessage("");
  }

  // ---------------------------------------
  // Close payment modal
  // ---------------------------------------
  function closePaymentModal() {
    if (savingId) {
      return;
    }

    setPaymentModal(null);
    setPaymentAmount("");
    setPaymentNote("");
  }

  // ---------------------------------------
  // Save payment
  // ---------------------------------------
  async function handlePaymentUpdate(event) {
    event.preventDefault();
    if (!paymentModal) return;

    const saleId = paymentModal._id;
    const totalAmount = Number(paymentModal.totalAmount) || 0;
    const currentPaid = Number(paymentModal.paidAmount) || 0;
    const newPaymentAmount = Number(paymentAmount);
    const currentPending = paymentModal._isCustomerGroup
      ? Math.max(0, Number(paymentModal.pendingAmount || 0))
      : Math.max(totalAmount - currentPaid, 0);

    if (!Number.isFinite(newPaymentAmount) || newPaymentAmount <= 0) {
      setErrorMessage("Enter a new payment amount greater than zero.");
      return;
    }
    if (newPaymentAmount > currentPending) {
      setErrorMessage("New payment cannot be greater than the pending balance.");
      return;
    }

    const updatedPaid = currentPaid + newPaymentAmount;
    const pendingAmount = Math.max(currentPending - newPaymentAmount, 0);

    try {
      setSavingId(saleId);
      setErrorMessage("");
      setSuccessMessage("");

      const currentToken = localStorage.getItem("ownerToken");
      if (!currentToken) {
        navigate("/owner-login", { replace: true });
        return;
      }

      const response = await fetch(
        paymentModal._isCustomerGroup
          ? `${API_URL}/sales/customer-payment`
          : `${API_URL}/sales/${saleId}`,
        {
          method: paymentModal._isCustomerGroup ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify(paymentModal._isCustomerGroup
            ? {
                customerId: paymentModal.customerId,
                customerIds: paymentModal.customerIds || [paymentModal.customerId],
                amount: newPaymentAmount,
                paymentDate,
                paymentNote: paymentNote.trim(),
              }
            : {
                paymentAmount: newPaymentAmount,
                paymentDate,
                paymentNote: paymentNote.trim(),
              }),
        }
      );

      if (handleUnauthorized(response.status)) return;
      const data = await parseResponse(response);
      if (!response.ok) throw new Error(data.message || data.error || "Unable to record payment.");

      setSuccessMessage(`Payment of ₹${newPaymentAmount.toLocaleString("en-IN")} recorded for ${paymentModal.customerName}. Remaining balance: ₹${pendingAmount.toLocaleString("en-IN")}.`);
      setPaymentModal(null);
      setPaymentAmount("");
      setPaymentNote("");
      await loadPayments();
    } catch (error) {
      console.error("Payment update error:", error);
      setErrorMessage(error.message || "Unable to record payment.");
    } finally {
      setSavingId("");
    }
  }

  // ---------------------------------------
  // Filter records
  // ---------------------------------------
  const customerPaymentGroups = useMemo(() => {
    const grouped = new Map();
    for (const sale of sales) {
      const customerId = String(sale.customer?._id || sale.customer || sale.customerId || "");
      const phone = String(sale.customerPhone || "").replace(/\D/g, "");
      const nameKey = String(sale.customerName || "Unknown Customer").trim().toLowerCase();
      // Keep distinct named customer records separate if a phone number has been reused.
      const key = phone ? `phone:${phone}:${nameKey}` : customerId ? `customer:${customerId}` : `sale:${sale._id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          _id: key,
          customerId: customerId || "",
          customerIds: [],
          customer: sale.customer || null,
          customerName: sale.customerName || "Unknown Customer",
          customerPhone: sale.customerPhone || "",
          sales: [],
          challanNumbers: [],
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          paymentHistory: [],
          latestDate: sale.lastBillDate || sale.saleDate || sale.createdAt || null,
        });
      }
      const group = grouped.get(key);
      group.sales.push(sale);
      if (customerId && !group.customerIds.includes(customerId)) group.customerIds.push(customerId);
      const challan = String(sale.sourceChallanNumber || sale.challanNumber || sale.challanGroupNumber || sale.invoiceNumber || sale.billNumber || "").trim();
      if (challan && !group.challanNumbers.includes(challan)) group.challanNumbers.push(challan);
      group.totalAmount += Number(sale.totalAmount || 0);
      group.paidAmount += Number(sale.paidAmount || 0);
      group.pendingAmount += Math.max(0, Number(sale.totalAmount || 0) - Number(sale.paidAmount || 0));
      if (Array.isArray(sale.paymentHistory)) group.paymentHistory.push(...sale.paymentHistory);
      const billDate = sale.lastBillDate || sale.saleDate || sale.createdAt;
      if (new Date(billDate || 0) > new Date(group.latestDate || 0)) {
        group.latestDate = billDate;
      }
    }
    return [...grouped.values()].map((group) => {
      const pending = Math.max(0, group.pendingAmount);
      return {
        ...group,
        totalAmount: Math.round(group.totalAmount * 100) / 100,
        paidAmount: Math.round(group.paidAmount * 100) / 100,
        pendingAmount: Math.round(pending * 100) / 100,
        saleDate: group.latestDate,
        challanNumber: group.challanNumbers.at(-1) || "-",
        paymentStatus: pending <= 0.005 ? "Paid" : group.paidAmount > 0 ? "Partial" : "Pending",
        _isCustomerGroup: true,
      };
    }).sort((a, b) => new Date(b.latestDate || 0) - new Date(a.latestDate || 0));
  }, [sales]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customerPaymentGroups.filter((sale) => {
      const matchesSearch =
        !query ||
        sale.customerName.toLowerCase().includes(query) ||
        sale.customerPhone.toLowerCase().includes(query) ||
        sale.challanNumbers.some((number) => number.toLowerCase().includes(query)) ||
        sale.sales.some((entry) => String(entry.description || "").toLowerCase().includes(query));
      const status = sale.paymentStatus.toLowerCase();
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && status !== "paid") ||
        (statusFilter === "paid" && status === "paid") ||
        (statusFilter === "partial" && status === "partial");
      return matchesSearch && matchesStatus;
    });
  }, [customerPaymentGroups, search, statusFilter]);

  // ---------------------------------------
  // Format currency
  // ---------------------------------------
  function formatCurrency(value) {
    return `₹${Number(
      value || 0
    ).toLocaleString("en-IN")}`;
  }

  // ---------------------------------------
  // Format date
  // ---------------------------------------
  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }

    return date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  // ---------------------------------------
  // Customer-wide balance + WhatsApp reminder
  // A reminder is rate-limited to one per customer per 3 days, but a NEW
  // challan/bill for that customer immediately makes the reminder available again.
  // WhatsApp opens a prefilled message; the owner still confirms/sends it.
  // ---------------------------------------
  function getCustomerPendingTotal(sale) {
    if (sale?._isCustomerGroup) return Number(sale.pendingAmount || 0);
    const saleCustomerId = String(sale.customer?._id || sale.customer || sale.customerId || "");
    const normalizedPhone = String(sale.customerPhone || "").replace(/\D/g, "");
    const customerName = String(sale.customerName || "").trim().toLowerCase();

    return sales.reduce((total, item) => {
      const itemCustomerId = String(item.customer?._id || item.customer || item.customerId || "");
      const itemPhone = String(item.customerPhone || "").replace(/\D/g, "");
      const itemName = String(item.customerName || "").trim().toLowerCase();
      const sameCustomer = saleCustomerId && itemCustomerId
        ? saleCustomerId === itemCustomerId
        : normalizedPhone && itemPhone
          ? normalizedPhone === itemPhone
          : customerName && itemName && customerName === itemName;
      return sameCustomer ? total + Math.max(0, Number(item.pendingAmount || 0)) : total;
    }, 0);
  }

  function getReminderCooldown(sale) {
    const phone = String(sale.customerPhone || "").replace(/\D/g, "");
    if (!phone) return { blocked: true, reason: "No phone number" };

    const storageKey = `rentalReminderSentAt:${phone}`;
    const storedValue = localStorage.getItem(storageKey) || "0";
    let lastSentAt = 0;
    let lastChallanKey = "";
    try {
      const parsed = JSON.parse(storedValue);
      if (parsed && typeof parsed === "object") {
        lastSentAt = Number(parsed.sentAt || 0);
        lastChallanKey = String(parsed.challanKey || "");
      } else {
        lastSentAt = Number(parsed || 0); // backward compatibility with old timestamp-only entries
      }
    } catch {
      lastSentAt = Number(storedValue || 0);
    }

    const currentChallanKey = String(sale._id || sale.id || sale.challanNumber || sale.description || "");
    // A different/new challan for the same customer resets the 3-day cooldown.
    if (currentChallanKey && lastChallanKey && currentChallanKey !== lastChallanKey) {
      return { blocked: false, remainingDays: 0 };
    }

    const remaining = 3 * 24 * 60 * 60 * 1000 - (Date.now() - lastSentAt);
    if (lastSentAt && remaining > 0) {
      return { blocked: true, remainingDays: Math.ceil(remaining / (24 * 60 * 60 * 1000)) };
    }
    return { blocked: false, remainingDays: 0 };
  }

  function saveReminderSent(sale, phone) {
    const challanKey = String(sale._id || sale.id || sale.challanNumber || sale.description || "");
    localStorage.setItem(`rentalReminderSentAt:${phone}`, JSON.stringify({ sentAt: Date.now(), challanKey }));
  }

  function messageCustomerAboutPending(sale) {
    const rawPhone = String(sale.customerPhone || "").replace(/\D/g, "");
    const balance = Math.round(getCustomerPendingTotal(sale) * 100) / 100;
    if (!rawPhone || balance <= 0) return;
    const cooldown = getReminderCooldown(sale);
    if (cooldown.blocked) {
      setSuccessMessage(`A reminder was already prepared recently. Try again in about ${cooldown.remainingDays || 3} day(s).`);
      return;
    }
    const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const challanText = sale.challanNumber || sale.description || "rental account";
    const messageText = `Namaste ${sale.customerName || "Customer"}, Shyam Ji Shuttering Store ke account ke hisaab se aapki total pending rental payment ₹${balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })} hai. Recent challan: ${challanText}. Kripya suvidha anusar payment clear kar dein. Payment receive hone par humein suchit karein. Dhanyavaad.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`, "_blank", "noopener,noreferrer");
    saveReminderSent(sale, rawPhone);
    setReminderRevision((value) => value + 1);
    setSuccessMessage(`WhatsApp reminder prepared for ${sale.customerName}. Review and press Send in WhatsApp.`);
  }

  function sendSmsReminder(sale) {
    const phone = String(sale.customerPhone || "").replace(/\D/g, "");
    const balance = Math.round(getCustomerPendingTotal(sale) * 100) / 100;
    if (!phone || balance <= 0) return;
    const cooldown = getReminderCooldown(sale);
    if (cooldown.blocked) {
      setSuccessMessage(`A reminder was prepared recently. Try again in about ${cooldown.remainingDays || 3} day(s).`);
      return;
    }
    const message = `Shyam Ji Shuttering Store: Dear ${sale.customerName || "Customer"}, your pending rental payment is ₹${balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}. Challan: ${sale.challanNumber || sale.description || "Rental account"}. Please clear the balance. Thank you.`;
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
    saveReminderSent(sale, phone);
    setReminderRevision((value) => value + 1);
    setSuccessMessage(`SMS reminder prepared for ${sale.customerName}. Confirm and send it in your Messages app.`);
  }

  // ---------------------------------------
  // Status badge class
  // ---------------------------------------
  function getStatusClass(status) {
    const normalized =
      String(status)
        .toLowerCase();

    if (normalized === "paid") {
      return "payment-status paid";
    }

    if (normalized === "partial") {
      return "payment-status partial";
    }

    return "payment-status pending";
  }

  // ---------------------------------------
  // Page
  // ---------------------------------------
  return (
    <section className="owner-dashboard-panel payments-page" data-reminder-revision={reminderRevision}>
      {/* PAGE HEADER */}
      <div className="owner-panel-heading">
        <div>
          <p className="owner-dashboard-eyebrow">
            Accounts & collections
          </p>

          <h2>
            Payment Management
          </h2>

          <p className="payments-subtitle">
            Track total, paid and pending
            customer rental payments
            records.
          </p>
        </div>

        <button
          type="button"
          className="stock-update-button"
          onClick={loadPayments}
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </div>

      <div className="payments-notification-toolbar">
        <div className="payments-notification-copy">
          <span className="payments-notification-icon" aria-hidden="true">🔔</span>
          <div>
            <strong>{pendingSales.length ? `${pendingSales.length} payment record(s) need attention` : "No pending payment alerts"}</strong>
            <span>{pendingSales.length ? `Outstanding balance: ${formatCurrency(pendingSales.reduce((sum, sale) => sum + Number(sale.pendingAmount || 0), 0))}` : "You are up to date with recorded payments."}</span>
          </div>
        </div>
        <button type="button" className="payments-notification-button" onClick={enablePaymentNotifications} disabled={notificationPermission === "granted"}>
          {notificationPermission === "granted" ? "Browser Alerts Enabled" : "Enable Browser Alerts"}
        </button>
      </div>

      {pendingSales.length > 0 && (
        <div className="payments-pending-alert" role="status">
          <div><strong>Pending payment reminder</strong><p>{pendingSales.length} record(s) still have unpaid balances. Use the WhatsApp reminder action in the table to contact customers.</p></div>
          <button type="button" onClick={() => { setStatusFilter("pending"); setSearch(""); }}>View Pending</button>
        </div>
      )}

      {/* MESSAGES */}
      {errorMessage && (
        <div className="inventory-message error">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="inventory-message success">
          {successMessage}
        </div>
      )}

      {/* OWNER-CONTROLLED MONTHLY BILL RECAP */}
      <section className="monthly-bill-recap">
        <div className="monthly-bill-recap-heading">
          <div><p className="owner-dashboard-eyebrow">Rental billing review</p><h3>Monthly Bill Recap</h3><p>Completed months are calculated from each challan's issue date. A skipped month is not waived; it rolls into a future catch-up bill.</p></div>
          <button type="button" className="stock-update-button" onClick={loadPayments} disabled={loading || Boolean(monthlyActionId)}>Refresh Recap</button>
        </div>
        {monthlyRecapError && <div className="inventory-message error">{monthlyRecapError}</div>}
        <div className="monthly-bill-stats">
          <div><span>Active rentals to review</span><strong>{monthlyRecapSummary.activeRentals || 0}</strong></div>
          <div><span>Eligible for billing</span><strong>{monthlyRecapSummary.eligibleRentals || 0}</strong></div>
          <div><span>Estimated unbilled rent</span><strong>{formatCurrency(monthlyRecapSummary.pendingReviewAmount || 0)}</strong></div>
          <div><span>Monthly bills created this month</span><strong>{monthlyRecapSummary.billsCreatedThisMonth || 0}</strong><small>Actual billed: {formatCurrency(monthlyRecapSummary.actualBillAmountThisMonth || 0)}</small></div>
        </div>
        {monthlyRecap.length === 0 ? <div className="owner-empty-state"><h4>No monthly bills require review</h4><p>Active rentals will appear here after a full month has elapsed from their issue date.</p></div> : (
          <div className="owner-table-wrapper"><table className="owner-inquiry-table monthly-recap-table"><thead><tr><th>Customer / Challan</th><th>Issue Date</th><th>Material Still Out</th><th>Previous Bills</th><th>Unbilled Periods</th><th>Estimated Amount</th><th>Owner Action</th></tr></thead><tbody>
            {monthlyRecap.map((row) => <tr key={row.challanNumber}>
              <td><strong>{row.customerName}</strong><small>{row.challanNumber}</small>{row.customerPhone && <small>{row.customerPhone}</small>}</td>
              <td>{formatDate(row.issueDate)}</td>
              <td>{row.materials.map((item, index) => <div key={`${item.materialName}-${index}`}>{item.materialName}: <strong>{item.quantity} {item.unit}</strong></div>)}</td>
              <td>{row.previousBills.length ? row.previousBills.map((bill, index) => <div key={`${bill.billNumber}-${index}`}><strong>{bill.billNumber}</strong><small>{formatDate(bill.start)} - {formatDate(bill.end)} · {formatCurrency(bill.amount)}</small></div>) : <span>None yet</span>}</td>
              <td>{row.pendingPeriods.map((period) => <div key={`${period.start}-${period.end}`}><strong>{formatDate(period.start)} - {formatDate(period.end)}</strong> <span className={`monthly-period-status ${period.status}`}>{period.status === "skipped" ? "Skipped · carried forward" : "Pending review"}</span></div>)}</td>
              <td><strong>{formatCurrency(row.estimatedAmount)}</strong><small>{row.billingDays} unbilled rental day(s)</small></td>
              <td><div className="monthly-bill-actions"><button type="button" className="payment-reminder-button" onClick={() => setExpandedMonthlyChallan((current) => current === row.challanNumber ? "" : row.challanNumber)}>{expandedMonthlyChallan === row.challanNumber ? "Hide Details" : "View Details"}</button><button type="button" className="stock-update-button" disabled={Boolean(monthlyActionId)} onClick={() => handleMonthlyBillAction(row, "create")}>{monthlyActionId === `${row.challanNumber}:create` ? "Creating..." : "Create Monthly Bill"}</button><button type="button" className="payment-cancel-button" disabled={Boolean(monthlyActionId)} onClick={() => handleMonthlyBillAction(row, "skip")}>{monthlyActionId === `${row.challanNumber}:skip` ? "Skipping..." : "Skip This Month"}</button></div></td>
            </tr>)}
          </tbody></table></div>
        )}
        {expandedMonthlyChallan && (() => {
          const detail = monthlyRecap.find((row) => row.challanNumber === expandedMonthlyChallan);
          if (!detail) return null;
          return <div className="monthly-detail-panel"><h4>{detail.customerName} · Challan {detail.challanNumber}</h4><div className="monthly-detail-grid"><div><span>Customer Phone</span><strong>{detail.customerPhone || "Not saved"}</strong></div><div><span>Rental Status</span><strong>{detail.rentalStatus || "Active"}</strong></div><div><span>Rental Started</span><strong>{formatDate(detail.issueDate)}</strong></div><div><span>Unbilled Period</span><strong>{formatDate(detail.billingPeriodStart)} – {formatDate(detail.billingPeriodEnd)}</strong></div><div><span>Estimated Amount</span><strong>{formatCurrency(detail.estimatedAmount)}</strong></div></div><h5>Outstanding Material</h5>{detail.materials.map((item, index) => <p key={`${item.materialName}-${index}`}>{item.materialName}: {item.quantity} {item.unit}</p>)}<h5>Previous Monthly Bills</h5>{detail.previousBills.length ? detail.previousBills.map((bill, index) => <p key={`${bill.billNumber}-${index}`}>{bill.billNumber} · {formatDate(bill.start)} – {formatDate(bill.end)} · {formatCurrency(bill.amount)}</p>) : <p>No monthly bill has been created for this challan yet.</p>}<h5>Unbilled Periods</h5>{detail.pendingPeriods.map((period) => <p key={`${period.start}-${period.end}`}>{formatDate(period.start)} – {formatDate(period.end)} · {period.status === "skipped" ? "Skipped, charges carried forward" : "Pending owner review"}</p>)}</div>;
        })()}
      </section>

      {/* SUMMARY CARDS */}
      <div className="payment-summary-grid">
        <article className="payment-summary-card">
          <span>Total Rental Sales</span>

          <strong>
            {formatCurrency(
              summary.totalSales
            )}
          </strong>

          <small>
            Overall recorded amount
          </small>
        </article>

        <article className="payment-summary-card">
          <span>Total Paid</span>

          <strong>
            {formatCurrency(
              summary.totalPaid
            )}
          </strong>

          <small>
            Amount received
          </small>
        </article>

        <article className="payment-summary-card pending-card">
          <span>Pending Payment</span>

          <strong>
            {formatCurrency(
              summary.totalPending
            )}
          </strong>

          <small>
            Amount still outstanding
          </small>
        </article>

        <article className="payment-summary-card">
          <span>Total Records</span>

          <strong>
            {summary.totalRecords}
          </strong>

          <small>
            Rental sales/payment records
          </small>
        </article>
      </div>

      {/* FILTERS */}
      <div className="payment-filter-bar">
        <div className="payment-search-box">
          <label htmlFor="payment-search">
            Search
          </label>

          <input
            id="payment-search"
            type="search"
            placeholder="Search customer, phone or challan number..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />
        </div>

        <div className="payment-filter-box">
          <label htmlFor="payment-status-filter">
            Payment Status
          </label>

          <select
            id="payment-status-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              All Payments
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="partial">
              Partial
            </option>

            <option value="paid">
              Paid
            </option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="owner-empty-state">
          Loading payment records...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="owner-empty-state">
          <h3>
            No payment records found
          </h3>

          <p>
            Create a rental challan first; its rental sales and payments will appear here.
          </p>
        </div>
      ) : (
        <div className="owner-table-wrapper">
          <table className="owner-inquiry-table payments-table">
            <thead>
              <tr>
                <th>Challan Number</th>
                <th>Customer</th>
                <th>Latest Bill Date</th>
                <th>Total Billed</th>
                <th>Paid</th>
                <th>Pending</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredSales.map(
                (sale, index) => (
                  <tr
                    key={sale._id || `${sale.customerName}-${index}`}
                  >
                    <td>
                      <strong>{sale.challanNumbers.length ? sale.challanNumbers.join(", ") : "—"}</strong>
                    </td>

                    <td>
                      <strong>
                        {sale.customerName}
                      </strong>

                      {sale.customerPhone && (
                        <small className="payment-customer-phone">
                          {sale.customerPhone}
                        </small>
                      )}
                    </td>

                    <td>
                      {formatDate(sale.saleDate)}
                    </td>

                    <td>
                      {formatCurrency(
                        sale.totalAmount
                      )}
                    </td>

                    <td className="paid-amount-cell">
                      {formatCurrency(
                        sale.paidAmount
                      )}
                    </td>

                    <td className="pending-amount-cell">
                      {formatCurrency(
                        sale.pendingAmount
                      )}
                    </td>

                    <td>
                      <span
                        className={getStatusClass(
                          sale.paymentStatus
                        )}
                      >
                        {sale.paymentStatus}
                      </span>
                    </td>

                    <td>
                      <div className="payment-action-stack">
                        <button
                          type="button"
                          className="stock-update-button"
                          onClick={() => openPaymentModal(sale.customerIds?.length ? sale : { ...sale.sales[0], _isCustomerGroup: false })}
                          disabled={savingId === sale._id || !sale.sales?.length}
                        >
                          {sale.paymentStatus.toLowerCase() === "paid" ? "View / Edit" : "Update Payment"}
                        </button>
                        <button
                          type="button"
                          className="payment-reminder-button"
                          onClick={() => messageCustomerAboutPending(sale)}
                          disabled={getCustomerPendingTotal(sale) <= 0 || !sale.customerPhone || getReminderCooldown(sale).blocked}
                          title={!sale.customerPhone ? "Save a customer phone number first" : getReminderCooldown(sale).blocked ? `Reminder cooldown: ${getReminderCooldown(sale).remainingDays || 3} day(s)` : "Open WhatsApp with a payment reminder"}
                        >
                          {getCustomerPendingTotal(sale) <= 0 ? "No Pending" : !sale.customerPhone ? "No Phone" : getReminderCooldown(sale).blocked ? `Reminder in ${getReminderCooldown(sale).remainingDays || 3}d` : "WhatsApp Reminder"}
                        </button>
                        <button type="button" className="payment-reminder-button" disabled={!sale.customerPhone || getCustomerPendingTotal(sale) <= 0 || getReminderCooldown(sale).blocked} onClick={() => sendSmsReminder(sale)} title="Open SMS app with a prefilled reminder">SMS Reminder</button>
                        {sale.sales.map((bill) => <button key={`share-${bill._id}`} type="button" className="payment-reminder-button bill-share-button" onClick={() => openBillPdf(bill)} title={`Open saved bill ${bill.billNumber || bill.challanNumber || "PDF"} to print or save as PDF and share`}>Share Bill PDF · {bill.billNumber || bill.challanNumber || String(bill._id).slice(-5)}</button>)}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* FOOTER INFO */}
      <div className="payment-page-footer">
        Showing{" "}
        <strong>
          {filteredSales.length}
        </strong>{" "}
        of{" "}
        <strong>
          {sales.length}
        </strong>{" "}
        payment records.
      </div>

      {/* PAYMENT MODAL */}
      {paymentModal && (
        <div
          className="payment-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closePaymentModal();
            }
          }}
        >
          <div className="payment-modal-card">
            <div className="payment-modal-header">
              <div>
                <p className="owner-dashboard-eyebrow">
                  Payment update
                </p>

                <h3>
                  {paymentModal.customerName}
                </h3>
              </div>

              <button
                type="button"
                className="payment-modal-close"
                onClick={
                  closePaymentModal
                }
                disabled={Boolean(
                  savingId
                )}
              >
                ×
              </button>
            </div>

            {/* RENTAL SALE INFO */}
            <div className="payment-modal-info-grid">
              <div>
                <span>
                  Total Amount
                </span>

                <strong>
                  {formatCurrency(
                    paymentModal.totalAmount
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Current Paid
                </span>

                <strong>
                  {formatCurrency(
                    paymentModal.paidAmount
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Current Pending
                </span>

                <strong>
                  {formatCurrency(
                    paymentModal.pendingAmount
                  )}
                </strong>
              </div>
            </div>

            {paymentModal._isCustomerGroup && Array.isArray(paymentModal.sales) && (
              <div className="payment-history-list">
                <h4>Customer Bills — payment is applied to oldest pending bills first</h4>
                <table className="owner-inquiry-table">
                  <thead><tr><th>Challan No.</th><th>Bill Date</th><th>Bill Total</th><th>Paid</th><th>Pending</th></tr></thead>
                  <tbody>{[...paymentModal.sales].sort((a, b) => new Date(a.saleDate || a.createdAt || 0) - new Date(b.saleDate || b.createdAt || 0)).map((bill) => (
                    <tr key={bill._id}>
                      <td>{bill.sourceChallanNumber || bill.challanNumber || bill.billNumber || "—"}</td>
                      <td>{formatDate(bill.saleDate || bill.createdAt)}</td>
                      <td>{formatCurrency(bill.totalAmount)}</td>
                      <td>{formatCurrency(bill.paidAmount)}</td>
                      <td>{formatCurrency(bill.pendingAmount)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {Array.isArray(paymentModal.paymentHistory) && paymentModal.paymentHistory.length > 0 && (
              <div className="payment-history-list">
                <h4>Recorded Payments</h4>
                <div className="owner-table-wrapper">
                  <table className="owner-inquiry-table">
                    <thead><tr><th>Date</th><th>Note</th><th>Amount</th></tr></thead>
                    <tbody>{paymentModal.paymentHistory.map((entry, index) => (
                      <tr key={entry._id || `${entry.date}-${index}`}>
                        <td>{entry.date ? new Date(entry.date).toLocaleDateString("en-IN") : "-"}</td>
                        <td>{entry.note || entry.kind || "Payment"}</td>
                        <td>{formatCurrency(entry.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FORM */}
            <form
              className="payment-update-form"
              onSubmit={
                handlePaymentUpdate
              }
            >
              <div className="payment-field">
                <label htmlFor="payment-amount">
                  New Payment Amount
                </label>

                <input
                  id="payment-amount"
                  type="number"
                  min="0.01"
                  max={
                    paymentModal.pendingAmount
                  }
                  step="0.01"
                  value={
                    paymentAmount
                  }
                  onChange={(event) =>
                    setPaymentAmount(
                      event.target.value
                    )
                  }
                  required
                  disabled={Number(paymentModal.pendingAmount || 0) <= 0}
                />
              </div>

              <div className="payment-field">
                <label htmlFor="payment-date">
                  Payment Date
                </label>

                <input
                  id="payment-date"
                  type="date"
                  value={
                    paymentDate
                  }
                  onChange={(event) =>
                    setPaymentDate(
                      event.target.value
                    )
                  }
                  required
                />
              </div>

              <div className="payment-field payment-full-width">
                <label htmlFor="payment-note">
                  Note
                </label>

                <textarea
                  id="payment-note"
                  rows="3"
                  placeholder="Optional payment note..."
                  value={
                    paymentNote
                  }
                  onChange={(event) =>
                    setPaymentNote(
                      event.target.value
                    )
                  }
                />
              </div>

              {/* LIVE CALCULATION */}
              <div className="payment-live-preview">
                <div>
                  <span>
                    Total
                  </span>

                  <strong>
                    {formatCurrency(
                      paymentModal.totalAmount
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Paid After This Payment
                  </span>

                  <strong>
                    {formatCurrency(
                      (Number(paymentModal.paidAmount) || 0) + (Number(paymentAmount) || 0)
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Pending After This Payment
                  </span>

                  <strong>
                    {formatCurrency(
                      Math.max(
                        Number(paymentModal.pendingAmount || 0) - (Number(paymentAmount) || 0),
                        0
                      )
                    )}
                  </strong>
                </div>
              </div>

              <div className="payment-modal-actions">
                <button
                  type="button"
                  className="payment-cancel-button"
                  onClick={
                    closePaymentModal
                  }
                  disabled={
                    Boolean(
                      savingId
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="inventory-submit-button"
                  disabled={Boolean(savingId) || Number(paymentModal.pendingAmount || 0) <= 0}
                >
                  {savingId
                    ? "Saving Payment..."
                    : Number(paymentModal.pendingAmount || 0) <= 0 ? "Fully Paid" : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default PaymentsPage;