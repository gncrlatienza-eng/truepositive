import { useState } from "react";
import { theme } from "../../styles/theme";
import { ALL_SCOPE, resolveScopeOption, useScope } from "../../context/ScopeContext";
import DeployRelayChildModal from "../agents/DeployRelayChildModal";

// Radial FAB scope picker — ported from reference/Scope Switcher.dc.html
// (a static design mockup) into real React, then upgraded to match
// reference/"Scope Switcher.dc (1).html"'s richer switching transition: a
// full-screen overlay with crossfading from/to device icons + labels and a
// progress bar, replacing that first version's plain toast entirely (the
// (1) mockup drops the toast section outright — this follows suit). The
// mockup's class-based setState/componentWillUnmount become useState/
// ScopeContext's phase state machine; its hardcoded SCOPES array becomes
// real listAgents() data (via useScope()). Interaction (stacked options
// translating out from the FAB, a scrim, the geometry formula, the
// transition's exact timings/easing curves) are kept identical to the
// mockups — only the data source and state model changed. Label reads
// "SWITCHING MACHINE", not the mockup's "SWITCHING SCOPE" — this app calls
// the thing being switched a machine/device everywhere else in its copy.
// No separate "current scope" pill (removed per explicit user request) —
// the FAB's own icon is the indicator instead (see its own comment below).
// Not shown at all until the org has a hub (a primary agent) — before that
// point there's nothing meaningful to switch between yet (this app's whole
// "which machine" framing starts once a device is marked primary, not just
// once any agent exists), and the radial menu's own "Deploy a device"
// option (a dashed-border "+" chip) is the quick way to add another device
// under the hub once it does exist, right alongside Settings → Sources'
// equivalent "Deploy a device under the hub" panel — same modal, same
// relay-child creation, just reachable from wherever the user already is.
const PITCH = 74;
const BASE_Y = -84;

function GlobeIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HostIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2.5" y="4" width="12.5" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 19h5M9 13v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="17.5" y="6.5" width="4.5" height="12.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19 9.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="19.75" cy="16.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function NodeIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="5" width="14" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 18.5h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const ICON_BY_KIND = { globe: GlobeIcon, host: HostIcon, node: NodeIcon };
// Synthetic option id for the radial menu's "deploy a device" action — kept
// out of the real id space (agent ids are UUIDs, "all" is the only other
// reserved word) so it can never collide with a real scope.
const DEPLOY_OPTION_ID = "__deploy__";

function ScopeTransitionOverlay({ transition, agents }) {
  const { phase, fromId, toId } = transition;
  const visible = phase !== "idle";
  const swapped = phase === "swap" || phase === "out";
  const from = resolveScopeOption(fromId, agents);
  const to = resolveScopeOption(toId, agents);
  const FromIcon = ICON_BY_KIND[from.kind] || NodeIcon;
  const ToIcon = ICON_BY_KIND[to.kind] || NodeIcon;

  // Just the motion (transform/opacity/transition) — kept separate from
  // positioning so it can compose cleanly into both the icon wrapper
  // (needs `inset:0` to fill the circle) and the label wrapper (needs
  // `left:0;right:0` only). Mixing `inset` and `left`/`right` as sibling
  // keys in one spread would have the shorthand silently clobber the
  // longhand — kept apart specifically to avoid that.
  const fromMotion = {
    transform: swapped ? "translateY(-26px) scale(0.86)" : "translateY(0) scale(1)",
    opacity: swapped ? 0 : 1,
    transition: "transform 0.6s cubic-bezier(0.5,0,0.2,1), opacity 0.44s ease",
  };
  const toMotion = {
    transform: swapped ? "translateY(0) scale(1)" : "translateY(26px) scale(0.86)",
    opacity: swapped ? 1 : 0,
    transition: "transform 0.6s cubic-bezier(0.2,1.05,0.3,1), opacity 0.5s ease",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150, // above TopBar's own zIndex:100 — a full takeover, not content-area-only
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(7, 7, 7, 0.55)",
        backdropFilter: "blur(18px)",
        opacity: visible && phase !== "out" ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.34s ease",
      }}
    >
      <div
        style={{
          fontFamily: theme.font.mono,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.22em",
          color: "#aaaaaa",
          marginBottom: 38,
        }}
      >
        SWITCHING MACHINE
      </div>

      <div
        style={{
          position: "relative",
          width: 152,
          height: 152,
          borderRadius: "50%",
          border: `1px solid ${theme.color.border}`,
          background: "#0e0e0e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666666",
            ...fromMotion,
          }}
        >
          <FromIcon size={54} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.color.accent,
            ...toMotion,
          }}
        >
          <ToIcon size={54} />
        </div>
      </div>

      <div style={{ position: "relative", width: 460, maxWidth: "90vw", height: 40, marginTop: 36 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "#6a6a6a",
            ...fromMotion,
          }}
        >
          {from.label}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: theme.color.text,
            ...toMotion,
          }}
        >
          {to.label}
        </div>
      </div>

      <div
        style={{
          fontFamily: theme.font.mono,
          fontSize: 13,
          letterSpacing: "0.1em",
          color: "#9a9a9a",
          marginTop: 14,
          opacity: swapped ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        {to.meta}
      </div>

      <div style={{ width: 260, height: 3, background: "#202020", marginTop: 46, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: theme.color.accent,
            width: swapped ? "100%" : "6%",
            transition: "width 1.25s cubic-bezier(0.35,0,0.2,1)",
          }}
        />
      </div>
    </div>
  );
}

export default function ScopeSwitcher() {
  const { scope, setScope, agents, refreshAgents, transition } = useScope();
  const [open, setOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  const hub = agents.find((a) => a.is_primary) || null;

  const activeId = scope.mode === "agent" ? scope.agentId : "all";

  const options = [
    // Always first (topmost / furthest from the FAB — see the `fromTop`
    // math below) — an action, not a scope choice, so `pick()` below routes
    // it to opening the deploy modal instead of ever calling setScope.
    // Placed at the top of the stack per explicit user request, so it reads
    // as the standout action rather than sitting closest to the FAB among
    // the scope choices themselves.
    hub && {
      id: DEPLOY_OPTION_ID,
      Icon: PlusIcon,
      label: "Deploy a device",
      meta: `UNDER ${hub.name.toUpperCase()}`,
      isAction: true,
    },
    { id: "all", Icon: GlobeIcon, ...resolveScopeOption("all", agents) },
    ...agents.map((a) => ({
      id: a.id,
      Icon: a.is_primary ? HostIcon : NodeIcon,
      ...resolveScopeOption(a.id, agents),
    })),
  ].filter(Boolean);

  // Falls back to "all" by id, not options[0] -- the deploy action now sits
  // first in the array (see above), and this fallback (only reachable in
  // the brief window before ScopeContext reconciles a stale/deleted scope)
  // should still land on the globe icon, never the "+" one.
  const active = options.find((o) => o.id === activeId) || options.find((o) => o.id === "all") || options[0];

  function pick(id) {
    setOpen(false);
    if (id === DEPLOY_OPTION_ID) {
      setDeployOpen(true);
      return;
    }
    if (id === activeId) return; // re-picking the current scope is a no-op, matches the mockup
    setScope(id === "all" ? ALL_SCOPE : { mode: "agent", agentId: id });
  }

  // Hidden entirely until there's a hub (primary agent) — before that, an
  // org typically has at most one direct-connect device and nothing to
  // meaningfully switch between yet; the whole "which machine" concept in
  // this app is tied to marking one as primary, not just having any agent
  // at all. Placed after the hooks above (not before) so their call order
  // stays unconditional across renders, per the Rules of Hooks.
  if (!hub) return null;

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(6, 6, 6, 0.72)",
            transition: "opacity 0.28s ease",
          }}
        />
      )}

      <div style={{ position: "fixed", bottom: 48, right: 48, zIndex: 70, width: 0, height: 0 }}>
        {options.map((opt, i) => {
          const fromTop = options.length - 1 - i;
          const y = BASE_Y - fromTop * PITCH;
          const x = -Math.min(fromTop, 2) * 14;
          const isActive = opt.id === activeId;
          return (
            <div
              key={opt.id}
              onClick={() => pick(opt.id)}
              style={{
                position: "absolute",
                bottom: 14,
                right: 14,
                display: "flex",
                alignItems: "center",
                gap: 14,
                transform: open ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` : "translate(0px, 0px) scale(0.4)",
                opacity: open ? 1 : 0,
                pointerEvents: open ? "auto" : "none",
                transition: "transform 0.34s cubic-bezier(0.22,1.2,0.36,1), opacity 0.24s ease",
                cursor: "pointer",
              }}
            >
              <div style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: theme.color.text, lineHeight: 1.3 }}>
                  {opt.label}
                </div>
                <div
                  style={{
                    fontFamily: theme.font.mono,
                    fontSize: 10.5,
                    letterSpacing: "0.06em",
                    color: theme.color.textFaint,
                    marginTop: 3,
                  }}
                >
                  {opt.meta}
                </div>
              </div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: isActive ? theme.color.accent : theme.color.raised,
                  border: opt.isAction
                    ? `1px dashed ${theme.color.accent}`
                    : `1px solid ${isActive ? theme.color.accent : theme.color.borderStrong}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: opt.isAction ? theme.color.accent : isActive ? theme.color.background : theme.color.text,
                  boxShadow: "0 10px 26px -8px rgba(0,0,0,0.8)",
                }}
              >
                <opt.Icon />
              </div>
            </div>
          );
        })}

        {/* FAB — no separate "current scope" pill anymore (removed per
            explicit user request, for a cleaner look): this icon itself
            *is* the indicator, showing the currently active machine's own
            icon (globe/host/node, via active.Icon) whenever the menu is
            closed, swapping to the close "X" only while the menu is open. */}
        <div
          onClick={() => setOpen((v) => !v)}
          className={open ? undefined : "tp-scope-fab-pulse"}
          style={{
            "--tp-pulse-color": theme.color.accent,
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: open ? theme.color.raised : theme.color.accent,
            border: `1px solid ${open ? theme.color.borderStrong : theme.color.accent}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: open ? theme.color.text : theme.color.background,
            boxShadow: "0 16px 40px -10px rgba(0,212,255,0.45)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.22,1.2,0.36,1), background 0.25s ease",
          }}
        >
          {open ? <CloseIcon /> : <active.Icon />}
        </div>
      </div>

      <ScopeTransitionOverlay transition={transition} agents={agents} />

      <DeployRelayChildModal
        open={deployOpen}
        hub={hub}
        onClose={() => setDeployOpen(false)}
        onChildCreated={refreshAgents}
      />
    </>
  );
}
