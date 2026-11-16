import { useState } from "react";
import { Link } from "react-router-dom";
import "./HomePage.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const services = [
  {
    number: "01",
    title: "Shuttering Material",
    text: "Rental support for formwork and construction-site requirements with organised material records.",
  },
  {
    number: "02",
    title: "Organised Rentals",
    text: "Customer details, material issues and stock movement are managed through one digital workflow.",
  },
  {
    number: "03",
    title: "Professional Challans",
    text: "Clear rental challans with customer, material, quantity and issue-date information.",
  },
];

const materials = [
  "Farma",
  "Scaffolding",
  "Jacks",
  "Base Jacks",
  "Chali",
  "Other Shuttering Material",
];

function HomePage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    material: "",
    message: "",
  });

  const [status, setStatus] = useState({
    type: "",
    message: "",
  });

  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setStatus({
      type: "",
      message: "",
    });

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const phone = form.phone.replace(/\D/g, "");

    if (phone.length !== 10) {
      setStatus({
        type: "error",
        message: "Please enter a valid 10-digit phone number.",
      });

      return;
    }

    if (!form.name.trim()) {
      setStatus({
        type: "error",
        message: "Please enter your name.",
      });

      return;
    }

    if (!form.material) {
      setStatus({
        type: "error",
        message: "Please select the required material.",
      });

      return;
    }

    if (!form.message.trim()) {
      setStatus({
        type: "error",
        message: "Please describe your requirement.",
      });

      return;
    }

    setSubmitting(true);

    setStatus({
      type: "loading",
      message: "Sending your inquiry...",
    });

    try {
      const response = await fetch(`${API_URL}/inquiries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          phone,
          material: form.material,
          message: form.message.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to submit inquiry."
        );
      }

      setForm({
        name: "",
        phone: "",
        material: "",
        message: "",
      });

      setStatus({
        type: "success",
        message:
          "Thank you. Your inquiry has been submitted successfully.",
      });
    } catch (error) {
      console.error("Inquiry submission error:", error);

      setStatus({
        type: "error",
        message:
          error.message ||
          "Unable to submit inquiry. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="publication-home">

      {/* ================= NAVBAR ================= */}

      <header className="public-navbar">

        <a
          className="public-brand"
          href="#top"
          aria-label="Shyam Ji Shuttering Store home"
        >
          <span className="public-brand-mark">
            SJ
          </span>

          <span className="public-brand-text">
            <strong>Shyam Ji</strong>
            <small>Shuttering Store</small>
          </span>
        </a>

        <nav
          className="public-nav"
          aria-label="Main navigation"
        >
          <a href="#services">
            Services
          </a>

          <a href="#materials">
            Materials
          </a>

          <a href="#process">
            How It Works
          </a>

          <a href="#contact">
            Contact
          </a>

          <Link
            className="public-nav-button"
            to="/owner-login"
          >
            Owner Access
          </Link>
        </nav>

      </header>

      {/* ================= HERO ================= */}

      <section
        className="public-hero"
        id="top"
      >

        <div className="public-hero-overlay" />

        <div className="public-hero-content">

          <p className="public-eyebrow">
            CONSTRUCTION RENTAL • DIGITAL MANAGEMENT
          </p>

          <h1>
            Reliable shuttering,
            <span>
              managed with clarity.
            </span>
          </h1>

          <p className="public-hero-copy">
            Shyam Ji Shuttering Store provides
            organised shuttering-material rental
            support for contractors, builders and
            construction projects.
          </p>

          <div className="public-hero-actions">

            <a
              className="public-gold-button"
              href="#contact"
            >
              Send an Inquiry
            </a>

            <a
              className="public-outline-button"
              href="#services"
            >
              Explore Services
            </a>

          </div>

          <div className="public-hero-note">

            <span>
              01
            </span>

            <p>
              Material • Customer • Challan • Records
            </p>

          </div>

        </div>

        <div
          className="public-hero-panel"
          aria-label="Digital management highlights"
        >

          <div className="public-panel-top">
            <span>
              SHYAM JI
            </span>

            <span>
              EST. RENTAL SERVICE
            </span>
          </div>

          <div className="public-panel-emblem">
            SJ
          </div>

          <h2>
            One place for your rental workflow.
          </h2>

          <p>
            Keep customer requests, material
            movement and rental documentation
            organised from inquiry to challan.
          </p>

          <div className="public-panel-line" />

          <div className="public-panel-points">

            <span>
              Material Tracking
            </span>

            <span>
              Customer Records
            </span>

            <span>
              Rental Challans
            </span>

          </div>

        </div>

      </section>

      {/* ================= TRUST STRIP ================= */}

      <section
        className="public-trust-strip"
        aria-label="Store capabilities"
      >

        <div>
          <strong>01</strong>
          <span>Material Rental</span>
        </div>

        <div>
          <strong>02</strong>
          <span>Customer Records</span>
        </div>

        <div>
          <strong>03</strong>
          <span>Stock Management</span>
        </div>

        <div>
          <strong>04</strong>
          <span>Rental Challans</span>
        </div>

      </section>

      {/* ================= SERVICES ================= */}

      <section
        className="public-section public-services"
        id="services"
      >

        <div className="public-section-heading">

          <div>

            <p className="public-eyebrow">
              WHAT WE PROVIDE
            </p>

            <h2>
              Built around the needs
              of a working construction site.
            </h2>

          </div>

          <p>
            A straightforward rental experience
            backed by organised records and a
            dedicated digital management system.
          </p>

        </div>

        <div className="public-service-grid">

          {services.map((service) => (
            <article
              className="public-service-card"
              key={service.number}
            >

              <span>
                {service.number}
              </span>

              <div className="public-card-rule" />

              <h3>
                {service.title}
              </h3>

              <p>
                {service.text}
              </p>

            </article>
          ))}

        </div>

      </section>

      {/* ================= MATERIALS ================= */}

      <section
        className="public-material-section"
        id="materials"
      >

        <div className="public-material-copy">

          <p className="public-eyebrow">
            MATERIAL RANGE
          </p>

          <h2>
            Essential shuttering support,
            clearly recorded.
          </h2>

          <p>
            Material availability and rental
            movement are maintained through the
            store's digital inventory workflow.
            Availability can vary by current
            rental commitments.
          </p>

          <a
            className="public-text-link"
            href="#contact"
          >
            Ask about availability →
          </a>

        </div>

        <div className="public-material-list">

          {materials.map(
            (material, index) => (
              <div
                className="public-material-row"
                key={material}
              >

                <span>
                  {String(index + 1).padStart(2, "0")}
                </span>

                <strong>
                  {material}
                </strong>

                <span className="public-row-arrow">
                  ↗
                </span>

              </div>
            )
          )}

        </div>

      </section>

      {/* ================= PROCESS ================= */}

      <section
        className="public-process public-section"
        id="process"
      >

        <div className="public-section-heading compact">

          <div>

            <p className="public-eyebrow">
              SIMPLE PROCESS
            </p>

            <h2>
              From inquiry to rental record.
            </h2>

          </div>

        </div>

        <div className="public-process-grid">

          <div className="public-process-card">

            <span>
              01
            </span>

            <h3>
              Tell us what you need
            </h3>

            <p>
              Share your material requirement
              and contact details.
            </p>

          </div>

          <div className="public-process-card">

            <span>
              02
            </span>

            <h3>
              Confirm the rental
            </h3>

            <p>
              Material and customer information
              are recorded clearly.
            </p>

          </div>

          <div className="public-process-card">

            <span>
              03
            </span>

            <h3>
              Issue & document
            </h3>

            <p>
              Material movement can be tracked
              with a professional challan.
            </p>

          </div>

        </div>

      </section>

      {/* ================= CONTACT ================= */}

      <section
        className="public-contact"
        id="contact"
      >

        <div className="public-contact-copy">

          <p className="public-eyebrow">
            START A CONVERSATION
          </p>

          <h2>
            Need shuttering material
            for your next project?
          </h2>

          <p>
            Send your requirement and the store
            team can follow up with the relevant
            rental details.
          </p>

          <div className="public-contact-details">

            <div>
              <span>
                STORE
              </span>

              <strong>
                Shyam Ji Shuttering Store
              </strong>
            </div>

            <div>
              <span>
                SERVICE
              </span>

              <strong>
                Shuttering Material Rental
              </strong>
            </div>

            <div>
              <span>
                MANAGEMENT
              </span>

              <strong>
                Digital Business Management System
              </strong>
            </div>

          </div>

        </div>

        {/* ================= INQUIRY FORM ================= */}

        <form
          className="public-inquiry-form"
          onSubmit={handleSubmit}
        >

          <div className="public-form-heading">

            <span>
              INQUIRY
            </span>

            <h3>
              Tell us what you need.
            </h3>

          </div>

          <label htmlFor="public-name">
            Name
          </label>

          <input
            id="public-name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Your name"
            autoComplete="name"
            required
          />

          <label htmlFor="public-phone">
            Phone
          </label>

          <input
            id="public-phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="10-digit phone number"
            inputMode="numeric"
            maxLength={10}
            autoComplete="tel"
            required
          />

          <label htmlFor="public-material">
            Material
          </label>

          <select
            id="public-material"
            name="material"
            value={form.material}
            onChange={handleChange}
            required
          >

            <option value="">
              Select material
            </option>

            <option value="Scaffolding">
              Scaffolding
            </option>

            <option value="Farma">
              Farma
            </option>

            <option value="Jack">
              Jack
            </option>

            <option value="Base Jack">
              Base Jack
            </option>

            <option value="Chali">
              Chali
            </option>

            <option value="Other">
              Other
            </option>

          </select>

          <label htmlFor="public-message">
            Requirement
          </label>

          <textarea
            id="public-message"
            name="message"
            value={form.message}
            onChange={handleChange}
            placeholder="Quantity, project requirement or preferred date"
            rows={5}
            required
          />

          <button
            className="public-submit-button"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Sending..."
              : "Submit Inquiry"}
          </button>

          {status.message && (
            <p
              className={`public-form-status ${status.type}`}
              role="status"
            >
              {status.message}
            </p>
          )}

        </form>

      </section>

      {/* ================= FOOTER ================= */}

      <footer className="public-footer">

        <div>

          <strong>
            Shyam Ji Shuttering Store
          </strong>

          <span>
            Digital Promotional and Business
            Management System
          </span>

        </div>

        <div className="public-footer-links">

          <a href="#top">
            Back to top ↑
          </a>

          <Link to="/owner-login">
            Owner Access
          </Link>

        </div>

      </footer>

    </main>
  );
}

export default HomePage;
