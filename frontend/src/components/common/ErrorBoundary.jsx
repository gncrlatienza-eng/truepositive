import { Component } from "react";
import { theme } from "../../styles/theme";
import { Button } from "./Button";

// Contains a render crash to the routed page content instead of unmounting
// the whole app (sidebar/topbar included) — see MetricPanel's stale-response
// race for a real example this was built to catch.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 40,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</div>
          <div style={{ fontSize: 14, color: theme.color.textMuted, maxWidth: 420 }}>
            This page hit an unexpected error. Reloading usually fixes it.
          </div>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
