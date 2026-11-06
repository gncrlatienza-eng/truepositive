import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../utils/api";
import AuthModalShell from "../components/auth/AuthModalShell";
import { ErrorBanner } from "../components/auth/fields";

// /demo: signs straight into the read-only demo workspace, so the README and
// landing page can link to a working dashboard with no signup.
export default function DemoPage() {
  const { demoLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; one sign-in is enough.
    if (started.current) return;
    started.current = true;
    demoLogin()
      .then(() => navigate("/app", { replace: true }))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't open the demo.")));
  }, [demoLogin, navigate]);

  return (
    <AuthModalShell>
      <h2 style={{ fontSize: 30 }}>TruePositive demo</h2>
      {error ? (
        <>
          <ErrorBanner>{error}</ErrorBanner>
          <Link to="/" style={{ color: theme.color.accent, fontSize: 14 }}>
            ← Back
          </Link>
        </>
      ) : (
        <p style={{ fontSize: 16, color: theme.color.textMuted, marginTop: theme.space[3] }}>
          Opening the demo workspace… The server may take up to a minute to wake up.
        </p>
      )}
    </AuthModalShell>
  );
}
