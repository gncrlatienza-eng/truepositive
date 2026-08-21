import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { wz } from "./onboardingTheme";

const TEAM_SIZES = ["1-5 analysts", "6-20 analysts", "21-50 analysts", "51-100 analysts", "100+ analysts"];

function strengthLevel(pw) {
  if (!pw) return 0;
  const hasLen = pw.length >= 8;
  const hasUpperLower = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  if (hasLen && hasUpperLower && hasNumber && hasSymbol) return 3;
  if (hasLen && hasUpperLower && hasNumber) return 2;
  return 1;
}

const STRENGTH_COLOR = { 1: wz.error, 2: wz.warning, 3: wz.success };

function sanitizeSlug(v) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 32);
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontFamily: wz.font.mono,
        fontWeight: 600,
        color: "#8b95a5",
        letterSpacing: 0.8,
        textTransform: "uppercase",
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 15,
        fontFamily: wz.font.sans,
        fontWeight: 600,
        color: wz.textSecondary,
        marginBottom: 9,
      }}
    >
      {children}
    </label>
  );
}

function HelperText({ error, children }) {
  if (!children) return null;
  return (
    <div
      style={{
        fontSize: 13,
        fontFamily: wz.font.sans,
        color: error ? wz.error : "#9aa3af",
        marginTop: 7,
      }}
    >
      {error ? `✗ ${children}` : children}
    </div>
  );
}

export default function OnboardingStep1({ onNext }) {
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [teamSize, setTeamSize] = useState(TEAM_SIZES[0]);
  const [slug, setSlug] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [touched, setTouched] = useState({});

  const strength = strengthLevel(password);
  const nameError = touched.fullName && fullName.trim().length < 2 ? "At least 2 characters" : "";
  const confirmError =
    touched.confirmPassword && confirmPassword && confirmPassword !== password ? "Passwords don't match" : "";
  const slugError =
    touched.slug && slug && (slug.length < 3 || /^-|-$/.test(slug))
      ? "3-32 characters, no leading/trailing hyphen"
      : "";

  const canSubmit =
    fullName.trim().length >= 2 &&
    email &&
    strength >= 2 &&
    confirmPassword === password &&
    orgName.trim().length >= 3 &&
    slug.length >= 3 &&
    agreeTerms;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ fullName: true, slug: true, confirmPassword: true });
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await signup({
        full_name: fullName,
        email,
        password,
        org_name: orgName,
        team_size: teamSize,
        workspace_slug: slug,
        agree_terms: agreeTerms,
      });
      onNext();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Check the form for errors and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 38, fontWeight: 600, color: wz.textPrimary, fontFamily: wz.font.sans, margin: 0 }}>
          Create your workspace
        </h1>
        <p style={{ fontSize: 16, color: "#a0a0a0", lineHeight: 1.5, marginTop: 10 }}>
          Set up your first SOC environment. You can add teammates and new environments later.
        </p>
      </div>

      {error && (
        <div style={{ fontSize: 14, fontFamily: wz.font.sans, color: wz.error, marginBottom: 24 }}>✗ {error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${wz.border}` }}>
          <SectionLabel>YOUR IDENTITY</SectionLabel>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel htmlFor="fullName">Full name</FieldLabel>
            <input
              id="fullName"
              className="tp-wizard-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => {
                setFocusedField(null);
                setTouched((t) => ({ ...t, fullName: true }));
              }}
              placeholder="Enter your full name"
            />
            <HelperText error={!!nameError}>{nameError}</HelperText>
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <input
              id="email"
              className="tp-wizard-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="Enter your work email"
            />
            <HelperText>Used to log in and receive alerts</HelperText>
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                className="tp-wizard-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="Enter a password"
                style={{ paddingRight: 66 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 6,
                  top: 0,
                  height: 52,
                  padding: "0 12px",
                  background: "none",
                  border: "none",
                  color: wz.textMuted,
                  fontFamily: wz.font.sans,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {password ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9 }}>
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: i <= strength ? STRENGTH_COLOR[strength] : wz.border,
                    }}
                  />
                ))}
              </div>
            ) : (
              <HelperText>Min. 8 characters, with uppercase, lowercase, and a number.</HelperText>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <div style={{ position: "relative" }}>
              <input
                id="confirmPassword"
                className="tp-wizard-input"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => {
                  setFocusedField(null);
                  setTouched((t) => ({ ...t, confirmPassword: true }));
                }}
                placeholder="Re-enter your password"
                style={{ paddingRight: 66 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 6,
                  top: 0,
                  height: 52,
                  padding: "0 12px",
                  background: "none",
                  border: "none",
                  color: wz.textMuted,
                  fontFamily: wz.font.sans,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
            <HelperText error={!!confirmError}>{confirmError}</HelperText>
          </div>
        </div>

        <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${wz.border}` }}>
          <SectionLabel>YOUR ORGANIZATION</SectionLabel>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel htmlFor="orgName">Organization name</FieldLabel>
            <input
              id="orgName"
              className="tp-wizard-input"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Enter your organization name"
            />
            <HelperText>Your company, hospital, agency, or team name.</HelperText>
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel htmlFor="teamSize">Team size</FieldLabel>
            <select
              id="teamSize"
              className="tp-wizard-select"
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              onFocus={() => setFocusedField("teamSize")}
              onBlur={() => setFocusedField(null)}
            >
              {TEAM_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <HelperText>Helps us recommend features and capacity.</HelperText>
          </div>

          <div>
            <FieldLabel htmlFor="slug">Workspace name</FieldLabel>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${focusedField === "slug" ? wz.accent : wz.border}`,
                borderRadius: 999,
                padding: "0 24px",
                height: 54,
                boxShadow: focusedField === "slug" ? "0 0 0 3px rgba(6, 182, 212, 0.18)" : "none",
                transition: "border-color 150ms ease, box-shadow 150ms ease",
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  fontFamily: wz.font.mono,
                  color: "#8b95a5",
                  whiteSpace: "nowrap",
                }}
              >
                truepositive.io/
              </span>
              <input
                id="slug"
                className="tp-wizard-input-mono"
                value={slug}
                onChange={(e) => setSlug(sanitizeSlug(e.target.value))}
                onFocus={() => setFocusedField("slug")}
                onBlur={() => {
                  setFocusedField(null);
                  setTouched((t) => ({ ...t, slug: true }));
                }}
                placeholder="e.g. acme-corp"
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  flex: 1,
                  height: 52,
                  padding: 0,
                  color: wz.textPrimary,
                  fontWeight: 400,
                }}
              />
            </div>
            <HelperText error={!!slugError}>
              {slugError || "Lowercase, alphanumeric, hyphens. Permanent—cannot change."}
            </HelperText>
          </div>
        </div>

        <div style={{ marginBottom: 40, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            className="tp-wizard-checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            id="agree-terms"
          />
          <label
            htmlFor="agree-terms"
            style={{
              fontSize: 14,
              fontFamily: wz.font.sans,
              color: wz.textSecondary,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
          >
            I agree to the <span className="tp-wizard-terms-link">terms</span> and confirm I am authorized to collect
            security telemetry for this organization.
          </label>
        </div>

        <button type="submit" className="tp-wizard-btn-primary" disabled={submitting || !canSubmit}>
          {submitting && <span className="tp-wizard-spinner" />}
          {submitting ? "Creating…" : "Create workspace"}
        </button>

        <div
          style={{ textAlign: "center", marginTop: 18, fontSize: 14, fontFamily: wz.font.sans, color: wz.textMuted }}
        >
          Already have an account?{" "}
          <Link to="/login" style={{ color: wz.accent }}>
            Log in
          </Link>
        </div>
      </form>
    </div>
  );
}
