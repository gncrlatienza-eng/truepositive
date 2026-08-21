import { Link } from "react-router-dom";
import { theme } from "../../styles/theme";

// Login and Signup-step-1 both render their form inside this — a plain
// flat backdrop with the form floating as a centered card. Replaces the
// old full-page split-screen AuthShell for these two flows; the rest of
// onboarding (steps 2-3) stays the existing full-page wizard, which needs
// more room than a modal fits. No animation, no blur — a static dim scrim
// is enough to focus attention on the card.
export default function AuthModalShell({ children }) {
  return (
    <div
      className="tp-authmodal-shell"
      style={{ background: theme.color.background, color: theme.color.text, fontFamily: theme.font.body }}
    >
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
