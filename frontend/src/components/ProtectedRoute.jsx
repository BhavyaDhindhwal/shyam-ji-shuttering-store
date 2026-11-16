import {
  Navigate,
  Outlet,
} from "react-router-dom";

function ProtectedRoute() {
  const token =
    localStorage.getItem("ownerToken");

  if (!token) {
    return (
      <Navigate
        to="/owner-login"
        replace
      />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;