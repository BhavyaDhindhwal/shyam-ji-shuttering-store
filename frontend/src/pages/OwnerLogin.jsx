import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./OwnerLogin.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

function OwnerLogin() {
  const navigate = useNavigate();

  const [step, setStep] = useState("login");

  const [form, setForm] = useState({
    email: "",
    password: "",
    otp: "",
  });

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState({
    type: "",
    text: "",
  });

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setMessage({
      type: "",
      text: "",
    });
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!form.email.trim() || !form.password) {
      setMessage({
        type: "error",
        text: "Please enter your email and password.",
      });

      return;
    }

    setLoading(true);

    setMessage({
      type: "loading",
      text: "Checking owner credentials...",
    });

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Invalid email or password."
        );
      }

      // Password verified.
      // JWT will be stored only after OTP verification.
      setStep("otp");

      setMessage({
        type: "success",
        text:
          data.message ||
          "OTP has been sent to your registered email.",
      });
    } catch (error) {
      console.error("Login error:", error);

      setMessage({
        type: "error",
        text:
          error.message ||
          "Unable to login.",
      });
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------
  // RESEND OTP
  // ------------------------------------------
  async function handleResendOtp() {
    if (!form.email.trim()) {
      return;
    }

    setLoading(true);

    setMessage({
      type: "loading",
      text: "Sending a new OTP...",
    });

    try {
      const response = await fetch(
        `${API_URL}/auth/request-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email: form.email.trim(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to resend OTP."
        );
      }

      setMessage({
        type: "success",
        text:
          data.message ||
          "A new OTP has been sent.",
      });
    } catch (error) {
      console.error("Resend OTP error:", error);

      setMessage({
        type: "error",
        text:
          error.message ||
          "Unable to resend OTP.",
      });
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------
  // STEP 2: VERIFY OTP
  // ------------------------------------------
  async function handleVerifyOtp(event) {
    event.preventDefault();

    if (!/^\d{6}$/.test(form.otp)) {
      setMessage({
        type: "error",
        text: "Please enter the 6-digit OTP.",
      });

      return;
    }

    setLoading(true);

    setMessage({
      type: "loading",
      text: "Verifying OTP...",
    });

    try {
      const response = await fetch(
        `${API_URL}/auth/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email: form.email.trim(),
            otp: form.otp,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            "OTP verification failed."
        );
      }

      // ----------------------------------------
      // GET JWT TOKEN FROM BACKEND RESPONSE
      // ----------------------------------------
      const token =
        data.token ||
        data.accessToken ||
        data.jwt;

      if (!token) {
        throw new Error(
          "Login succeeded but no authentication token was received."
        );
      }

      // ----------------------------------------
      // SAVE AUTHENTICATION DATA
      // ----------------------------------------
      localStorage.setItem(
        "ownerToken",
        token
      );

      localStorage.setItem(
        "ownerData",
        JSON.stringify({
          email: form.email.trim(),
          ...(data.owner || {}),
        })
      );

      // ----------------------------------------
      // SUCCESS MESSAGE
      // ----------------------------------------
      setMessage({
        type: "success",
        text: "OTP verified. Opening dashboard...",
      });

      // ----------------------------------------
      // GO TO OWNER DASHBOARD
      // ----------------------------------------
      navigate("/owner-dashboard", {
        replace: true,
      });
    } catch (error) {
      console.error(
        "OTP verification error:",
        error
      );

      setMessage({
        type: "error",
        text:
          error.message ||
          "Unable to verify OTP.",
      });
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------
  // BACK TO LOGIN
  // ------------------------------------------
  function goBackToLogin() {
    setStep("login");

    setForm((previous) => ({
      ...previous,
      otp: "",
    }));

    setMessage({
      type: "",
      text: "",
    });
  }

  return (
    <main className="owner-login-page">

      <div className="owner-login-background" />

      <section className="owner-login-shell">

        {/* ------------------------------------ */}
        {/* LEFT BRAND PANEL */}
        {/* ------------------------------------ */}

        <div className="owner-login-brand">

          <a
            href="/"
            className="owner-brand"
          >
            <span className="owner-brand-mark">
              SJ
            </span>

            <span>
              <strong>
                Shyam Ji
              </strong>

              <small>
                Shuttering Store
              </small>
            </span>
          </a>

          <div className="owner-brand-content">

            <p className="owner-eyebrow">
              PRIVATE MANAGEMENT PORTAL
            </p>

            <h1>
              Manage your
              <span>
                business with clarity.
              </span>
            </h1>

            <p>
              Access inventory, customers,
              material issues, challans,
              rental sales and payment records from
              one secure dashboard.
            </p>

          </div>

          <div className="owner-brand-footer">

            <span>
              OWNER ONLY
            </span>

            <span>
              SECURE ACCESS
            </span>

            <span>
              DIGITAL MANAGEMENT
            </span>

          </div>

        </div>

        {/* ------------------------------------ */}
        {/* LOGIN CARD */}
        {/* ------------------------------------ */}

        <div className="owner-login-card">

          <div className="owner-card-emblem">
            SJ
          </div>

          {/* ================================== */}
          {/* LOGIN STEP */}
          {/* ================================== */}

          {step === "login" ? (
            <>
              <div className="owner-card-heading">

                <p>
                  OWNER ACCESS
                </p>

                <h2>
                  Welcome back.
                </h2>

                <span>
                  Sign in to continue to the
                  management dashboard.
                </span>

              </div>

              <form
                onSubmit={handleLogin}
                className="owner-form"
              >

                <label htmlFor="owner-email">
                  Email address
                </label>

                <input
                  id="owner-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="owner@example.com"
                  autoComplete="email"
                  required
                />

                <label htmlFor="owner-password">
                  Password
                </label>

                <input
                  id="owner-password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />

                <button
                  type="submit"
                  className="owner-primary-button"
                  disabled={loading}
                >
                  {loading
                    ? "Checking..."
                    : "Continue"}
                </button>

              </form>
            </>
          ) : (
            <>
              {/* ================================ */}
              {/* OTP STEP */}
              {/* ================================ */}

              <div className="owner-card-heading">

                <p>
                  EMAIL VERIFICATION
                </p>

                <h2>
                  Verify your OTP.
                </h2>

                <span>
                  Enter the 6-digit code sent
                  to your registered email.
                </span>

              </div>

              <form
                onSubmit={handleVerifyOtp}
                className="owner-form"
              >

                <label htmlFor="owner-otp">
                  One-Time Password
                </label>

                <input
                  id="owner-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={form.otp}
                  onChange={handleChange}
                  placeholder="000000"
                  required
                />

                <button
                  type="submit"
                  className="owner-primary-button"
                  disabled={loading}
                >
                  {loading
                    ? "Verifying..."
                    : "Verify & Enter"}
                </button>

                <button
                  type="button"
                  className="owner-secondary-button"
                  onClick={handleResendOtp}
                  disabled={loading}
                >
                  Resend OTP
                </button>

                <button
                  type="button"
                  className="owner-back-button"
                  onClick={goBackToLogin}
                  disabled={loading}
                >
                  ← Use another email
                </button>

              </form>
            </>
          )}

          {/* ------------------------------------ */}
          {/* MESSAGE */}
          {/* ------------------------------------ */}

          {message.text && (
            <div
              className={`owner-message ${message.type}`}
              role="status"
            >
              {message.text}
            </div>
          )}

          {/* ------------------------------------ */}
          {/* SECURITY NOTE */}
          {/* ------------------------------------ */}

          <div className="owner-security-note">

            <span>
              🔒
            </span>

            <p>
              This portal is restricted to
              authorised store management.
            </p>

          </div>

          {/* ------------------------------------ */}
          {/* HOME LINK */}
          {/* ------------------------------------ */}

          <a
            href="/"
            className="owner-home-link"
          >
            ← Back to public website
          </a>

        </div>

      </section>

    </main>
  );
}

export default OwnerLogin;