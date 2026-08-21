import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { Card } from "../common/Card";
import { OutlineButton } from "../auth/fields";
import { api } from "../../utils/api";

const codeBoxStyle = {
  background: theme.color.background,
  border: `1px solid ${theme.color.border}`,
  borderRadius: theme.radius.sm,
  padding: theme.space[3],
  fontFamily: theme.font.mono,
  fontSize: 13,
  color: theme.color.text,
  overflowX: "auto",
  whiteSpace: "nowrap",
};

// A single copyable command/value: code box on the left, Copy button on the
// right. Mirrors the pattern already established in AgentCredentialsCard.jsx
// (kept local here rather than extracted, since this is the only other
// consumer so far).
function CopyRow({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: theme.space[3], alignItems: "center", marginBottom: theme.space[3] }}>
      <div style={{ ...codeBoxStyle, flex: 1 }}>$ {value}</div>
      <OutlineButton
        type="button"
        style={{ width: "auto", padding: "8px 14px", fontSize: 12, flexShrink: 0 }}
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </OutlineButton>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div style={{ display: "flex", gap: theme.space[4], marginBottom: theme.space[6] }}>
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `1px solid ${theme.color.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: theme.font.weight.semibold,
          color: theme.color.textMuted,
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: theme.font.weight.semibold, marginBottom: theme.space[2] }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: theme.color.textMuted, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

// Guided, doc-style setup for reaching this deployment over Tailscale
// instead of the public internet — see README.md's "Deploying over
// Tailscale" section for the same steps in plain-text form. Deliberately
// does NOT try to run any of this for the user: the backend runs inside a
// Docker container with no visibility into or control over the host
// machine's Tailscale daemon, so `tailscale serve` genuinely has to be run
// by a human on the host's own terminal. This page's job is to make those
// steps easy to find and copy, plus a couple of honest, client-only status
// checks — not to fake automation that isn't actually possible from here.
export default function NetworkTab() {
  const [apiOk, setApiOk] = useState(null); // null=checking, true/false=result

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const onTailnet = /\.ts\.net$/i.test(hostname);

  useEffect(() => {
    api
      .get("/health")
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <div>
      <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[5] }}>
        Make this deployment reachable from your other devices — or anyone you invite — over your own private Tailscale
        network, without exposing anything to your LAN or the public internet.
      </div>

      <Card title="Current connection" style={{ marginBottom: theme.space[6] }}>
        <div style={{ padding: theme.space[5] }}>
          <div style={{ display: "flex", alignItems: "center", gap: theme.space[3], marginBottom: theme.space[2] }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: onTailnet ? theme.color.safe.text : theme.color.textFaint,
              }}
            />
            <span style={{ fontSize: 14 }}>
              {onTailnet ? (
                <>
                  Viewing this page over Tailscale (<code style={{ fontFamily: theme.font.mono }}>{hostname}</code>)
                </>
              ) : (
                <>
                  Viewing this page at <code style={{ fontFamily: theme.font.mono }}>{hostname}</code> — not a Tailscale
                  address yet
                </>
              )}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: theme.space[3] }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  apiOk === null ? theme.color.textFaint : apiOk ? theme.color.safe.text : theme.color.danger.text,
              }}
            />
            <span style={{ fontSize: 14 }}>
              {apiOk === null
                ? "Checking API reachability…"
                : apiOk
                  ? "Backend API is reachable from this address"
                  : "Backend API is not reachable from this address"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: theme.color.textFaint, marginTop: theme.space[3] }}>
            Both checks are based only on what this browser page can see — they cannot detect whether{" "}
            <code style={{ fontFamily: theme.font.mono }}>tailscale serve</code> is currently running on the server,
            since that only runs directly in a terminal on the host machine.
          </div>
        </div>
      </Card>

      <Card title="Set up Tailscale access" style={{ marginBottom: theme.space[6] }}>
        <div style={{ padding: theme.space[5] }}>
          <Step n={1} title="Install Tailscale on the machine running this app's Docker containers">
            Free, from{" "}
            <a
              href="https://tailscale.com/download"
              target="_blank"
              rel="noreferrer"
              style={{ color: theme.color.accent }}
            >
              tailscale.com/download
            </a>
            , then sign in.
          </Step>

          <Step n={2} title="Find your Tailscale MagicDNS name">
            Run this on that machine — it is the <code style={{ fontFamily: theme.font.mono }}>DNSName</code> value,
            e.g. <code style={{ fontFamily: theme.font.mono }}>yourhost.tailnet-name.ts.net</code>.
            <CopyRow value="tailscale status" />
          </Step>

          <Step n={3} title="Set your .env">
            Copy <code style={{ fontFamily: theme.font.mono }}>env.example</code> to{" "}
            <code style={{ fontFamily: theme.font.mono }}>.env</code> if you have not already, then fill in real values
            for these — every one is required, the deployment refuses to start with a blank or default value:
            <div style={{ ...codeBoxStyle, whiteSpace: "pre", marginTop: theme.space[3] }}>
              {`TS_HOSTNAME=<your MagicDNS name from step 2>
POSTGRES_PASSWORD=<a real password>
JWT_SECRET=<a real random secret>
CREDENTIAL_ENCRYPTION_KEY=<see the comment above it in env.example>`}
            </div>
          </Step>

          <Step n={4} title="Start the stack with the Tailscale overlay">
            <CopyRow value="docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d --build" />
            This binds the backend and frontend to a loopback address only — nothing is exposed to your LAN, only to
            your tailnet in the next step.
          </Step>

          <Step n={5} title="Expose it to your tailnet (one-time)">
            Also on that same machine:
            <CopyRow value="tailscale serve --bg 3000" />
            If this is the first time anyone on your tailnet has used Serve, it will print a one-time approval link —
            open it and confirm in the Tailscale admin console. After that, this step does not need repeating; it keeps
            running in the background across reboots as long as Tailscale itself is running.
          </Step>

          <Step n={6} title="Visit it from another device">
            From any device signed into the same tailnet, browse to{" "}
            <code style={{ fontFamily: theme.font.mono }}>https://&lt;your MagicDNS name&gt;</code>. It is the exact
            same app — same login, same data — just reachable now from more than one machine.
          </Step>
        </div>
      </Card>

      <Card title="Inviting other people">
        <div style={{ padding: theme.space[5], fontSize: 13, color: theme.color.textMuted, lineHeight: 1.6 }}>
          Only devices on your tailnet can reach this deployment at all — Tailscale itself is the access gate, and the
          app login is still required on top of that. To let someone else in (family, a teammate), invite them from the{" "}
          <a
            href="https://login.tailscale.com/admin/users"
            target="_blank"
            rel="noreferrer"
            style={{ color: theme.color.accent }}
          >
            Tailscale admin console → Users
          </a>
          . Once they accept and install Tailscale themselves, they can reach the same URL and sign up or log in
          normally — Tailscale has no concept of accounts in this app, it only controls whether a device can reach the
          address at all.
          <div style={{ marginTop: theme.space[4] }}>
            If they want to run their own agent from their own machine, they generate credentials from Settings → Data
            sources while viewing the dashboard at your Tailscale address — the Server URL shown there resolves
            automatically to the correct tailnet-reachable address. To build the agent installer/exe itself (a local
            build step, not downloaded from anywhere), see the Building the Windows .exe and installer section in{" "}
            <code style={{ fontFamily: theme.font.mono }}>agent/README.md</code>.
          </div>
        </div>
      </Card>
    </div>
  );
}
