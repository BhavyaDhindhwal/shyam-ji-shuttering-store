import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import HomePage from "./pages/HomePage";
import OwnerLogin from "./pages/OwnerLogin";
import OwnerDashboard from "./pages/OwnerDashboard";
import ChallanPreview from "./pages/ChallanPreview";

import ProtectedRoute from "./components/ProtectedRoute";

import OverviewPage from "./pages/owner/OverviewPage";
import SalesPage from "./pages/owner/SalesPage";
import InquiriesPage from "./pages/owner/InquiriesPage";
import InventoryPage from "./pages/owner/InventoryPage";
import IssueMaterialPage from "./pages/owner/IssueMaterialPage";
import ChallansPage from "./pages/owner/ChallansPage";
import ReturnMaterialPage from "./pages/owner/ReturnMaterialPage";
import ReturnChallansPage from "./pages/owner/ReturnChallansPage";
import PaymentsPage from "./pages/owner/PaymentsPage";
import QuotationPage from "./pages/owner/QuotationPage";
import CustomersPage from "./pages/owner/CustomersPage";
import ExpensesPage from "./pages/owner/ExpensesPage";

import "./App.css";

function App() {
  return (
    <Routes>
      {/* ================= PUBLIC ROUTES ================= */}

      <Route
        path="/"
        element={<HomePage />}
      />

      <Route
        path="/owner-login"
        element={<OwnerLogin />}
      />

      {/* ================= PROTECTED ROUTES ================= */}

      <Route element={<ProtectedRoute />}>
        <Route
          path="/owner/challan/:issueId"
          element={<ChallanPreview />}
        />

        <Route
          path="/owner-dashboard"
          element={<OwnerDashboard />}
        >
          {/* Overview */}
          <Route
            index
            element={<OverviewPage />}
          />

          {/* Sales */}
          <Route
            path="sales"
            element={<SalesPage />}
          />

          {/* Inquiries */}
          <Route
            path="inquiries"
            element={<InquiriesPage />}
          />

          {/* Inventory */}
          <Route
            path="inventory"
            element={<InventoryPage />}
          />

          {/* Issue Material */}
          <Route
            path="issue-material"
            element={<IssueMaterialPage />}
          />

          {/* Challans */}
          <Route
            path="challans"
            element={<ChallansPage />}
          />

          {/* Return Material */}
          <Route
            path="return-material"
            element={<ReturnMaterialPage />}
          />

          {/* Return Challans */}
          <Route path="return-challans" element={<ReturnChallansPage />} />

          {/* Payments */}
          <Route
            path="payments"
            element={<PaymentsPage />}
          />

          <Route
            path="quotation"
            element={<QuotationPage />}
          />

          <Route
            path="customers"
            element={<CustomersPage />}
          />
          <Route path="expenses" element={<ExpensesPage />} />
        </Route>
      </Route>

      {/* ================= FALLBACK ================= */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;