import { theme } from "../../styles/theme";

const TESTIMONIAL = {
  quote: "We cut 1,400 nightly alerts down to 19 worth reading. The tuning loop is the whole product.",
  name: "Marisol Duarte",
  title: "SOC Lead, Northwind Health",
};

export default function AuthShell({ children }) {
  return (
    <div
      className="tp-auth-shell"
      style={{
        background: theme.color.background,
        color: theme.color.text,
        fontFamily: theme.font.body,
      }}
    >
      <div className="tp-auth-shell-hero">
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
          True<span style={{ color: theme.color.accent }}>Positive</span>
        </div>
        <blockquote style={{ margin: 0, maxWidth: 440 }}>
          <p style={{ fontSize: 27, lineHeight: 1.4, color: theme.color.text, fontWeight: 500 }}>
            &ldquo;{TESTIMONIAL.quote}&rdquo;
          </p>
          <footer style={{ marginTop: theme.space[5], color: theme.color.textMuted, fontSize: 15 }}>
            <div
              style={{
                display: "inline-block",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: theme.color.accent,
                marginRight: theme.space[2],
                verticalAlign: "middle",
              }}
            />
            <span style={{ verticalAlign: "middle" }}>
              {TESTIMONIAL.name} &middot; {TESTIMONIAL.title}
            </span>
          </footer>
        </blockquote>
      </div>

      <div className="tp-auth-shell-content">
        <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
      </div>
    </div>
  );
}
