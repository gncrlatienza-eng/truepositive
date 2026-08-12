import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import AuthShell from "../components/auth/AuthShell";
import { Field, TextInput, PrimaryButton, OutlineButton, ErrorBanner } from "../components/auth/fields";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ email, password }, remember);
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h2 style={{ fontSize: 30 }}>Log in to TruePositive</h2>
      <p
        style={{ fontSize: 16, color: theme.color.textMuted, marginTop: theme.space[3], marginBottom: theme.space[7] }}
      >
        Welcome back — enter your credentials to continue.
      </p>

      <ErrorBanner>{error}</ErrorBanner>

      <form onSubmit={handleSubmit}>
        <Field label="Work email">
          <TextInput
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />
        </Field>

        <Field
          label={
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Password</span>
              <span style={{ color: theme.color.accent, cursor: "pointer" }}>Forgot?</span>
            </div>
          }
        >
          <div style={{ position: "relative" }}>
            <TextInput
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={{ paddingRight: 66 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                padding: "0 12px",
                background: "none",
                border: "none",
                color: theme.color.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space[2],
            fontSize: 14,
            color: theme.color.textMuted,
            marginBottom: theme.space[6],
          }}
        >
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me signed in for 30 days
        </label>

        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Continue"}
        </PrimaryButton>
      </form>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: theme.space[3],
          margin: `${theme.space[6]}px 0`,
          color: theme.color.textFaint,
          fontSize: 13,
        }}
      >
        <div style={{ flex: 1, height: 1, background: theme.color.border }} />
        OR
        <div style={{ flex: 1, height: 1, background: theme.color.border }} />
      </div>

      <OutlineButton type="button" disabled title="SSO isn't configured yet">
        Continue with SSO (Okta)
      </OutlineButton>

      <div
        style={{
          marginTop: theme.space[7],
          display: "flex",
          justifyContent: "space-between",
          fontSize: 14,
          color: theme.color.textMuted,
        }}
      >
        <Link to="/" style={{ color: theme.color.textMuted }}>
          ← Back
        </Link>
        <span>
          No account?{" "}
          <Link to="/onboarding" style={{ color: theme.color.accent }}>
            Request access
          </Link>
        </span>
      </div>
    </AuthShell>
  );
}
