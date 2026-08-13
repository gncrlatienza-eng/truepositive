import { theme } from "../../styles/theme";

// Shared card chrome — dedupes the #1A1E2E/border/radius:8px block repeated
// across every dashboard panel and settings list in the mockup.
export function Card({ title, action, children, className = "", style, bodyStyle }) {
  return (
    <div className={`tp-card ${className}`.trim()} style={{ overflow: "hidden", ...style }}>
      {(title || action) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: theme.space[3],
            padding: `${theme.space[4]}px ${theme.space[5]}px`,
            borderBottom: `1px solid ${theme.color.border}`,
          }}
        >
          {title && <h3 style={{ fontSize: 17, margin: 0 }}>{title}</h3>}
          {action}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}
