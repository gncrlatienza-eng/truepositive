import { useNavigate } from "react-router-dom";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { OutlineButton } from "../components/auth/fields";

// Placeholder for the authenticated landing spot. The real app shell
// (sidebar, dashboard) is Sprint 4 scope per docs/SPRINT_PLAN.md.
export default function AppHomePage() {
  const { user, org, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space[4],
        background: theme.color.background,
        color: theme.color.text,
        fontFamily: theme.font.body,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600 }}>
        You&rsquo;re in, <strong>{user?.full_name}</strong>.
      </div>
      <div style={{ fontSize: 17, color: theme.color.textMuted }}>{org?.name}</div>
      <div style={{ color: theme.color.textFaint, fontSize: 14, maxWidth: 420, textAlign: "center" }}>
        This is a placeholder — the real app shell (sidebar, dashboard) lands in Sprint 4.
      </div>
      <OutlineButton type="button" style={{ width: "auto" }} onClick={handleLogout}>
        Log out
      </OutlineButton>
    </div>
  );
}
