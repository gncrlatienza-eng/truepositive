import { Link } from "react-router-dom";
import { theme } from "../../styles/theme";
import LandingPage from "../../pages/LandingPage";

// Login and Signup-step-1 both render their form inside this — presented as
// an overlay on top of the real landing page (blurred + dimmed behind it),
// matching the marketing mockup's own modal treatment, rather than a plain
// solid-color backdrop. The rest of onboarding (steps 2-3) stays the
// existing full-page wizard, which needs more room than a modal fits.
//
// The backdrop renders a real second <LandingPage/> instance (not a screenshot)
// so this looks correct even on a direct visit to /login, not just when
// arriving by clicking through from "/" — fixed+overflow:hidden clips it to
// one viewport-tall slice (the hero) regardless of its own internal scroll
// listeners, and pointer-events:none keeps it purely decorative.
export default function AuthModalShell({ children }) {
  return (
    <div className="tp-authmodal-shell" style={{ color: theme.color.text, fontFamily: theme.font.body }}>
      <div className="tp-authmodal-backdrop" aria-hidden="true">
        <LandingPage />
      </div>
      <div className="tp-authmodal-scrim" />

      <div className="tp-authmodal-topbar">
        <Link to="/" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" }}>
          <span style={{ color: theme.color.text }}>True</span>
          <span style={{ color: theme.color.accent }}>Positive</span>
        </Link>
      </div>

      <div className="tp-authmodal-center">
        <div className="tp-authmodal-card">
          <Link to="/" className="tp-authmodal-close" aria-label="Close">
            &times;
          </Link>
          {/* Only this inner body scrolls — see index.css's comment on
              .tp-authmodal-card for why that's what keeps the close button
              from scrolling away with a long form. */}
          <div className="tp-authmodal-card-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
