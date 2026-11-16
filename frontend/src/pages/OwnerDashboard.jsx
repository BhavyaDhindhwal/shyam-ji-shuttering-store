import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import "./OwnerDashboard.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

// =====================================================
// PAGE TITLE
// =====================================================

function getPageTitle(pathname) {
  if (pathname.endsWith("/sales")) {
    return "Rental Sales Overview";
  }

  if (pathname.endsWith("/inquiries")) {
    return "Customer Inquiries";
  }

  if (pathname.endsWith("/inventory")) {
    return "Inventory Management";
  }

  if (pathname.endsWith("/issue-material")) {
    return "Issue Material";
  }

  if (pathname.endsWith("/challans")) {
    return "Challan Management";
  }

  if (pathname.endsWith("/return-material")) {
    return "Return Material";
  }

  if (pathname.endsWith("/return-challans")) {
    return "Bills";
  }

  if (pathname.endsWith("/payments")) {
    return "Payment Management";
  }

  if (pathname.endsWith("/quotation")) {
    return "Quotation / Estimate";
  }

  if (pathname.endsWith("/customers")) {
    return "Customer Dashboard";
  }
  if (pathname.endsWith("/expenses")) return "Expenses";

  return "Business Overview";
}

// =====================================================
// OWNER DASHBOARD
// =====================================================

function OwnerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [owner, setOwner] =
    useState(null);

  const [dashboardData, setDashboardData] =
    useState({
      inquiries: [],
      inventory: [],
      customers: [],
      materialIssues: [],
      returns: [],
      sales: [],
      salesData: [],
      totals: {
        totalSales: 0,
        totalPaid: 0,
        pendingPayments: 0,
      },
    });

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  // =====================================================
  // CHECK LOGIN
  // =====================================================

  useEffect(() => {
    const token =
      localStorage.getItem(
        "ownerToken"
      );

    if (!token) {
      navigate(
        "/owner-login",
        {
          replace: true,
        }
      );

      return;
    }

    const savedOwner =
      localStorage.getItem(
        "ownerData"
      );

    if (savedOwner) {
      try {
        setOwner(
          JSON.parse(savedOwner)
        );
      } catch {
        localStorage.removeItem(
          "ownerData"
        );
      }
    }
  }, [navigate]);

  // =====================================================
  // PARSE API RESPONSE
  // =====================================================

  const parseResponse =
    useCallback(
      async (response) => {
        const text =
          await response.text();

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
      },
      []
    );

  // =====================================================
  // HANDLE UNAUTHORIZED
  // =====================================================

  const handleUnauthorized =
    useCallback(
      (status) => {
        if (
          status === 401 ||
          status === 403
        ) {
          localStorage.removeItem(
            "ownerToken"
          );

          localStorage.removeItem(
            "ownerData"
          );

          navigate(
            "/owner-login",
            {
              replace: true,
            }
          );

          return true;
        }

        return false;
      },
      [navigate]
    );

  // =====================================================
  // COMMON OWNER API
  // =====================================================

  const fetchOwnerApi =
    useCallback(
      async (
        endpoint,
        options = {}
      ) => {
        const token =
          localStorage.getItem(
            "ownerToken"
          );

        if (!token) {
          navigate(
            "/owner-login",
            {
              replace: true,
            }
          );

          return null;
        }

        const response =
          await fetch(
            `${API_URL}${endpoint}`,
            {
              ...options,

              headers: {
                Accept:
                  "application/json",

                Authorization:
                  `Bearer ${token}`,

                ...(options.headers || {}),
              },
            }
          );

        const data =
          await parseResponse(
            response
          );

        if (
          handleUnauthorized(
            response.status
          )
        ) {
          return null;
        }

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Request failed with status ${response.status}`
          );
        }

        return data;
      },
      [
        handleUnauthorized,
        navigate,
        parseResponse,
      ]
    );

  // =====================================================
  // LOAD COMPLETE DASHBOARD
  // =====================================================

  const loadDashboardData =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setErrorMessage("");

          const [
            inquiriesData,
            inventoryData,
            optionsData,
            issuesData,
            returnsData,
            salesData,
            summaryData,
          ] =
            await Promise.all([
              fetchOwnerApi(
                "/inquiries"
              ),

              fetchOwnerApi(
                "/inventory"
              ),

              fetchOwnerApi(
                "/material-issues/options"
              ),

              fetchOwnerApi(
                "/material-issues"
              ),

              fetchOwnerApi(
                "/returns"
              ),

              fetchOwnerApi(
                "/sales"
              ),

              fetchOwnerApi(
                "/sales/summary"
              ),
            ]);

          setDashboardData({
            inquiries:
              inquiriesData?.inquiries ||
              [],

            inventory:
              inventoryData?.inventory ||
              [],

            customers:
              optionsData?.customers ||
              [],

            materialIssues:
              issuesData?.issues ||
              [],

            returns:
              returnsData?.returns ||
              [],

            sales:
              salesData?.sales ||
              [],

            salesData:
              summaryData?.sales ||
              [],

            totals:
              summaryData?.totals ||
              {
                totalSales: 0,
                totalPaid: 0,
                pendingPayments: 0,
              },
          });
        } catch (error) {
          console.error(
            "Dashboard loading error:",
            error
          );

          setErrorMessage(
            error.message ||
              "Unable to load dashboard data"
          );
        } finally {
          setLoading(false);
        }
      },
      [fetchOwnerApi]
    );

  // =====================================================
  // LOAD DATA
  // =====================================================

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // =====================================================
  // ACTIVE RENTERS
  // =====================================================

  const activeRenters =
    useMemo(() => {
      const returnedByIssue =
        new Map();

      for (
        const item of
          dashboardData.returns
      ) {
        const id =
          item.materialIssue?._id ||
          item.materialIssue;

        if (!id) {
          continue;
        }

        const key = String(id);

        returnedByIssue.set(
          key,
          (
            returnedByIssue.get(
              key
            ) || 0
          ) +
            Number(
              item.quantity || 0
            )
        );
      }

      const activeCustomerIds =
        new Set();

      for (
        const issue of
          dashboardData.materialIssues
      ) {
        const issued =
          Number(
            issue.quantity || 0
          );

        const returned =
          Number(
            returnedByIssue.get(
              String(issue._id)
            ) || 0
          );

        const outstanding =
          Math.max(
            0,
            issued - returned
          );

        if (outstanding > 0) {
          const id =
            issue.customer?._id ||
            issue.customer;

          if (id) {
            activeCustomerIds.add(
              String(id)
            );
          }
        }
      }

      return activeCustomerIds.size;
    },
    [
      dashboardData.materialIssues,
      dashboardData.returns,
    ]);

  // =====================================================
  // NEW INQUIRIES
  // =====================================================

  const newInquiryCount =
    dashboardData.inquiries.filter(
      (item) =>
        item.status === "New"
    ).length;

  // =====================================================
  // LOGOUT
  // =====================================================

  function handleLogout() {
    localStorage.removeItem(
      "ownerToken"
    );

    localStorage.removeItem(
      "ownerData"
    );

    navigate(
      "/owner-login",
      {
        replace: true,
      }
    );
  }

  // =====================================================
  // OUTLET CONTEXT
  // =====================================================

  const outletContext = {
    owner,

    token:
      localStorage.getItem(
        "ownerToken"
      ),

    API_URL,

    loading,

    errorMessage,

    dashboardData,

    activeRenters,

    reloadDashboard:
      loadDashboardData,

    fetchOwnerApi,
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="owner-dashboard-layout">

      {/* ================= SIDEBAR ================= */}

      <aside className="owner-dashboard-sidebar">

        <div className="owner-dashboard-logo">

          <div className="owner-dashboard-logo-mark">
            SJ
          </div>

          <div>
            <h2>Shyam Ji</h2>
            <span>Owner Panel</span>
          </div>

        </div>

        <nav className="owner-dashboard-nav">

          {/* Overview */}

          <NavLink
            to="/owner-dashboard"
            end
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Overview
          </NavLink>

          {/* Rental Sales */}

          <NavLink
            to="/owner-dashboard/sales"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Rental Sales
          </NavLink>

          {/* Inquiries */}

          <NavLink
            to="/owner-dashboard/inquiries"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Inquiries
          </NavLink>

          {/* Inventory */}

          <NavLink
            to="/owner-dashboard/inventory"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Inventory
          </NavLink>

          {/* Issue Material */}

          <NavLink
            to="/owner-dashboard/issue-material"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Issue Material
          </NavLink>

          {/* Challans */}

          <NavLink
            to="/owner-dashboard/challans"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Challans
          </NavLink>

          {/* Return Material */}

          <NavLink
            to="/owner-dashboard/return-material"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Return Material
          </NavLink>

          <NavLink to="/owner-dashboard/return-challans" className={({ isActive }) => isActive ? "active-owner-nav-link" : ""}>Bills</NavLink>

          {/* Customer Dashboard */}
          <NavLink
            to="/owner-dashboard/customers"
            className={({ isActive }) => isActive ? "active-owner-nav-link" : ""}
          >
            Customers
          </NavLink>

          {/* Quotation: intentionally separate from challans */}
          <NavLink
            to="/owner-dashboard/quotation"
            className={({ isActive }) => isActive ? "active-owner-nav-link" : ""}
          >
            Quotation
          </NavLink>

          <NavLink to="/owner-dashboard/expenses" className={({ isActive }) => isActive ? "active-owner-nav-link" : ""}>Expenses</NavLink>

          {/* Payments */}

          <NavLink
            to="/owner-dashboard/payments"
            className={({ isActive }) =>
              isActive
                ? "active-owner-nav-link"
                : ""
            }
          >
            Payments
          </NavLink>

        </nav>

        <button
          className="owner-logout-button"
          type="button"
          onClick={handleLogout}
        >
          Logout
        </button>

      </aside>

      {/* ================= MAIN ================= */}

      <main className="owner-dashboard-main">

        {/* HEADER */}

        <header className="owner-dashboard-header">

          <div>
            <p className="owner-dashboard-eyebrow">
              Owner dashboard
            </p>

            <h1>
              {getPageTitle(
                location.pathname
              )}
            </h1>
          </div>

          <div className="owner-profile">

            <span className="owner-avatar">
              {owner?.name
                ?.charAt(0)
                ?.toUpperCase() ||
                "O"}
            </span>

            <div>

              <strong>
                {owner?.name ||
                  "Store Owner"}
              </strong>

              <small>
                {owner?.email ||
                  "Owner account"}
              </small>

            </div>

          </div>

        </header>

        {/* ================= STATS ================= */}

        <section className="owner-dashboard-stats">

          <article className="owner-stat-card">

            <span className="owner-stat-label">
              Total Rental Sales
            </span>

            <strong>
              ₹
              {Number(
                dashboardData.totals
                  .totalSales || 0
              ).toLocaleString(
                "en-IN"
              )}
            </strong>

            <small>
              All non-cancelled records
            </small>

          </article>

          <article className="owner-stat-card">

            <span className="owner-stat-label">
              Pending Payment
            </span>

            <strong>
              ₹
              {Number(
                dashboardData.totals
                  .pendingPayments ||
                  0
              ).toLocaleString(
                "en-IN"
              )}
            </strong>

            <small>
              Amount still outstanding
            </small>

          </article>

          <article className="owner-stat-card">

            <span className="owner-stat-label">
              Active Renters
            </span>

            <strong>
              {activeRenters}
            </strong>

            <small>
              Customers with material still out
            </small>

          </article>

          <article className="owner-stat-card owner-highlight-stat">

            <span className="owner-stat-label">
              New Inquiries
            </span>

            <strong>
              {newInquiryCount}
            </strong>

            <small>
              Unprocessed customer inquiries
            </small>

          </article>

        </section>

        {/* ================= PAGE CONTENT ================= */}

        <div className="owner-dashboard-content">

          {loading ? (

            <section className="owner-dashboard-panel">

              <div className="owner-empty-state">
                Loading dashboard...
              </div>

            </section>

          ) : errorMessage ? (

            <section className="owner-dashboard-panel">

              <div className="owner-dashboard-error">
                {errorMessage}
              </div>

              <button
                className="inventory-submit-button"
                type="button"
                onClick={
                  loadDashboardData
                }
              >
                Try Again
              </button>

            </section>

          ) : (

            <Outlet
              context={outletContext}
            />

          )}

        </div>

      </main>
    </div>
  );
}

export default OwnerDashboard;