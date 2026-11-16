import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SalesLineChart from "../../components/SalesLineChart";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const currentBusinessMonth = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit",
}).format(new Date()).slice(0, 7);

function SalesPage() {
  const navigate = useNavigate();

  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentBusinessMonth());
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [monthlyTransactions, setMonthlyTransactions] = useState([]);
  const [monthlyReloadKey, setMonthlyReloadKey] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("ownerToken");

  useEffect(() => {
    if (!token) {
      navigate("/owner-login", {
        replace: true,
      });

      return;
    }

    loadSales();
  }, [token]);

  useEffect(() => {
    if (!token || !/^\d{4}-\d{2}$/.test(selectedMonth)) return;
    let cancelled = false;
    setMonthlySummary(null);
    setMonthlyTransactions([]);
    setError("");
    fetch(`${API_URL}/sales/monthly-summary?month=${encodeURIComponent(selectedMonth)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      const data = await parseResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to load month summary.");
      if (!cancelled) {
        setMonthlySummary(data.summary || null);
        setMonthlyTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      }
    }).catch((err) => {
      if (!cancelled) setError(err.message || "Unable to load monthly summary.");
    });
    return () => { cancelled = true; };
  }, [token, selectedMonth, monthlyReloadKey]);

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

  async function loadSales() {
    setLoading(true);
    setError("");

    try {
      const [salesResponse, summaryResponse] =
        await Promise.all([
          fetch(`${API_URL}/sales`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }),

          fetch(`${API_URL}/sales/summary`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

      const salesData =
        await parseResponse(salesResponse);

      const summaryData =
        await parseResponse(summaryResponse);

      if (
        salesResponse.status === 401 ||
        salesResponse.status === 403 ||
        summaryResponse.status === 401 ||
        summaryResponse.status === 403
      ) {
        localStorage.removeItem("ownerToken");
        localStorage.removeItem("ownerData");

        navigate("/owner-login", {
          replace: true,
        });

        return;
      }

      if (!salesResponse.ok) {
        throw new Error(
          salesData.message ||
            "Unable to load rental sales records."
        );
      }

      if (!summaryResponse.ok) {
        throw new Error(
          summaryData.message ||
            "Unable to load rental sales summary."
        );
      }

      const records = Array.isArray(
        salesData.sales
      )
        ? salesData.sales
        : Array.isArray(salesData.data)
        ? salesData.data
        : Array.isArray(salesData)
        ? salesData
        : [];

      setSales(records);

      setSummary(
        summaryData.totals ||
          summaryData.summary?.totals ||
          summaryData.summary ||
          summaryData.data ||
          summaryData
      );
    } catch (err) {
      console.error(
        "Rental Sales page loading error:",
        err
      );

      setError(
        err.message ||
          "Unable to load rental sales data."
      );

      setSales([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  const monthSales = useMemo(() => sales.filter((sale) => {
    const raw = sale.saleDate || sale.date || sale.createdAt;
    if (!raw) return false;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return false;
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
    return key === selectedMonth;
  }), [sales, selectedMonth]);

  const totalSales = useMemo(() => {
    if (monthlySummary) return Number(monthlySummary.totalRentalSales || 0);
    return monthSales.reduce((total, sale) => {
      return (
        total +
        (Number(sale.totalAmount ?? 0) > 0
          ? Number(sale.totalAmount)
          : Number(sale.saleAmount ?? sale.amount ?? sale.sales ?? 0))
      );
    }, 0);
  }, [monthSales, monthlySummary]);

  const totalCartage = useMemo(() => monthlySummary ? Number(monthlySummary.totalTempoRent || 0) : monthSales.reduce((sum, sale) => sum + Number(sale.cartageAmount || 0), 0), [monthSales, monthlySummary]);
  const totalInstallation = useMemo(() => Number(monthlySummary?.totalInstallationCharge || 0), [monthlySummary]);
  const materialRevenue = useMemo(() => Math.max(0, totalSales - totalCartage - totalInstallation), [totalSales, totalCartage, totalInstallation]);

  const totalPaid = useMemo(() => {
    if (monthlySummary) return Number(monthlySummary.totalReceivedInMonth || 0);
    return monthSales.reduce((total, sale) => total + Number(sale.paidAmount ?? sale.paid ?? 0), 0);
  }, [monthSales, monthlySummary]);

  const totalPending = useMemo(() => {
    return monthlySummary
      ? Number(monthlySummary.outstandingAtMonthEnd || 0)
      : Math.max(totalSales - totalPaid, 0);
  }, [monthlySummary, totalSales, totalPaid]);

  const chartData = useMemo(() => {
    const dailyTotals = new Map();
    const chargeEvents = monthlyTransactions.filter((entry) => entry.type !== "Payment Received");
    for (const entry of chargeEvents) {
      const date = new Date(entry.date || 0);
      if (Number.isNaN(date.getTime())) continue;
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const part = (type) => parts.find((item) => item.type === type)?.value || "";
      const key = `${part("year")}-${part("month")}-${part("day")}`;
      dailyTotals.set(key, (dailyTotals.get(key) || 0) + Number(entry.amount || 0));
    }
    return Array.from(dailyTotals, ([date, amount]) => ({ date, sales: Math.round(amount * 100) / 100 }));
  }, [monthlyTransactions]);

  return (
    <section className="owner-dashboard-panel sales-dashboard-panel">

      {/* ===================================== */}
      {/* HEADER */}
      {/* ===================================== */}

      <div className="owner-panel-heading">

        <div>
          <p className="owner-dashboard-eyebrow">
            Business performance
          </p>

          <h2>Rental Sales Overview</h2>
        </div>

        <label className="sales-month-filter" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Month</span>
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>
        <button
          type="button"
          className="stock-update-button"
          onClick={() => {
            loadSales();
            setMonthlyReloadKey((current) => current + 1);
          }}
          disabled={loading}
        >
          {loading
            ? "Loading..."
            : "Refresh"}
        </button>

      </div>

      {/* ===================================== */}
      {/* ERROR */}
      {/* ===================================== */}

      {error && (
        <div className="inventory-message error">
          {error}
        </div>
      )}

      {/* ===================================== */}
      {/* RENTAL SALES SUMMARY CARDS */}
      {/* ===================================== */}

      <div
        className="owner-dashboard-stats"
        style={{
          marginTop: "24px",
        }}
      >

        <article className="owner-stat-card">
          <span className="owner-stat-label">
            Total Rental Sales
          </span>

          <strong>
            ₹
            {totalSales.toLocaleString(
              "en-IN"
            )}
          </strong>

          <small>
            {monthSales.length} transaction{monthSales.length !== 1 ? "s" : ""} in {selectedMonth}
          </small>
        </article>


        <article className="owner-stat-card">
          <span className="owner-stat-label">
            Paid Amount
          </span>

          <strong>
            ₹
            {totalPaid.toLocaleString(
              "en-IN"
            )}
          </strong>

          <small>
            Received payments
          </small>
        </article>


        <article className="owner-stat-card owner-highlight-stat">
          <span className="owner-stat-label">
            Pending Amount
          </span>

          <strong>
            ₹
            {totalPending.toLocaleString(
              "en-IN"
            )}
          </strong>

          <small>
            Outstanding
          </small>
        </article>

      </div>

      <div className="owner-dashboard-stats" style={{ marginTop: 16 }}>
        <article className="owner-stat-card"><span className="owner-stat-label">Active Rentals at Month End</span><strong>{Number(monthlySummary?.activeRentalOrdersAtMonthEnd || 0)}</strong><small>Open rental challans carried forward</small></article>
        <article className="owner-stat-card"><span className="owner-stat-label">Returned Orders in Month</span><strong>{Number(monthlySummary?.completedRentalOrdersInMonth || 0)}</strong><small>Return transactions recorded</small></article>
        <article className="owner-stat-card"><span className="owner-stat-label">Customers in Month</span><strong>{Number(monthlySummary?.customerCount || 0)}</strong><small>Distinct customers billed</small></article>
      </div>

      <section className="owner-dashboard-panel" style={{ marginTop: "24px" }}>
        <div className="owner-panel-heading"><div><p className="owner-dashboard-eyebrow">Separate income tracking</p><h3>Material Rent vs Tempo / Cartage</h3></div></div>
        <div className="owner-dashboard-stats">
          <article className="owner-stat-card"><span className="owner-stat-label">Material / Rental</span><strong>₹{materialRevenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong><small>Rental and material charges</small></article>
          <article className="owner-stat-card"><span className="owner-stat-label">Tempo Rent</span><strong>₹{totalCartage.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong><small>Issue and return-time tempo rent</small></article>
          <article className="owner-stat-card"><span className="owner-stat-label">Installation Charge</span><strong>₹{totalInstallation.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong><small>Issue and return-time installation</small></article>
        </div>
        <div className="owner-table-wrapper"><table className="owner-inquiry-table"><thead><tr><th>Customer</th><th>Transaction</th><th>Rental</th><th>Tempo</th><th>Installation</th><th>Payment Received</th><th>Total Charge</th></tr></thead><tbody>{monthlyTransactions.map((entry,index)=><tr key={entry.id||index}><td>{entry.customerName||"—"}</td><td>{entry.type||"Charge"}</td><td>₹{Number(entry.rentalCharge||0).toLocaleString("en-IN",{maximumFractionDigits:2})}</td><td>₹{Number(entry.tempoRent||0).toLocaleString("en-IN",{maximumFractionDigits:2})}</td><td>₹{Number(entry.installationCharge||0).toLocaleString("en-IN",{maximumFractionDigits:2})}</td><td>₹{Number(entry.paymentAmount||0).toLocaleString("en-IN",{maximumFractionDigits:2})}</td><td>₹{Number(entry.amount||0).toLocaleString("en-IN",{maximumFractionDigits:2})}</td></tr>)}{!monthlyTransactions.length&&<tr><td colSpan="7">No income entries for this month.</td></tr>}</tbody></table></div>
      </section>

      {/* ===================================== */}
      {/* RENTAL SALES GRAPH */}
      {/* ===================================== */}

      <div
        className="owner-dashboard-panel"
        style={{
          marginTop: "30px",
        }}
      >

        <div className="owner-panel-heading">

          <div>
            <p className="owner-dashboard-eyebrow">
              Rental sales trend
            </p>

            <h3>
              Rental Sales Performance
            </h3>
          </div>

          <span className="owner-record-count">
            {chartData.length} points
          </span>

        </div>

        <SalesLineChart
          data={chartData}
          loading={loading}
        />

      </div>

      {/* ===================================== */}
      {/* RENTAL SALES TABLE */}
      {/* ===================================== */}

      <div
        className="owner-dashboard-panel"
        style={{
          marginTop: "30px",
        }}
      >

        <div className="owner-panel-heading">

          <div>
            <p className="owner-dashboard-eyebrow">
              Transaction history
            </p>

            <h3>
              Monthly Transactions
            </h3>
          </div>

          <span className="owner-record-count">
            {monthlyTransactions.length} records
          </span>

        </div>

        {loading ? (
          <div className="owner-empty-state">
            Loading rental sales records...
          </div>
        ) : monthlyTransactions.length === 0 ? (
          <div className="owner-empty-state">
            No rental sales records available yet.
          </div>
        ) : (
          <div className="owner-table-wrapper">

            <table className="owner-inquiry-table">

              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Challan</th>
                  <th>Transaction</th>
                  <th>Tempo</th>
                  <th>Installation</th>
                  <th>Charges</th>
                  <th>Received</th>
                </tr>
              </thead>

              <tbody>

                {monthlyTransactions.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.date ? new Date(entry.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                    <td>{entry.customerName || "—"}</td>
                    <td>{entry.challanNumber || "—"}</td>
                    <td>{entry.type}</td>
                    <td>₹{Number(entry.tempoRent || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                    <td>₹{Number(entry.installationCharge || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                    <td>₹{Number(entry.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                    <td>₹{Number(entry.paymentAmount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* ===================================== */}
      {/* BACKEND SUMMARY */}
      {/* ===================================== */}

      {summary && (
        <div
          className="owner-dashboard-panel"
          style={{
            marginTop: "30px",
          }}
        >

          <div className="owner-panel-heading">

            <div>
              <p className="owner-dashboard-eyebrow">
                Backend summary
              </p>

              <h3>
                Rental Sales Summary
              </h3>
            </div>

          </div>

          <div
            className="owner-dashboard-stats"
            style={{
              marginTop: "20px",
            }}
          >

            <article className="owner-stat-card">
              <span className="owner-stat-label">
                Transactions
              </span>

              <strong>
                {summary.totalSales ??
                  summary.count ??
                  sales.length}
              </strong>

              <small>
                Recorded rental sales
              </small>
            </article>

            <article className="owner-stat-card">
              <span className="owner-stat-label">
                Revenue
              </span>

              <strong>
                ₹
                {Number(
                  summary.totalAmount ??
                    summary.totalSalesAmount ??
                    totalSales
                ).toLocaleString(
                  "en-IN"
                )}
              </strong>

              <small>
                From backend summary
              </small>
            </article>

            <article className="owner-stat-card">
              <span className="owner-stat-label">
                Pending
              </span>

              <strong>
                ₹
                {Number(
                  summary.pendingAmount ??
                    summary.totalPending ??
                    totalPending
                ).toLocaleString(
                  "en-IN"
                )}
              </strong>

              <small>
                Outstanding amount
              </small>
            </article>

          </div>

        </div>
      )}

    </section>
  );
}

export default SalesPage;