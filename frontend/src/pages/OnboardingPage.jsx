import { useState } from "react";
import { Link } from "react-router-dom";
import { wz } from "../components/onboarding/onboardingTheme";
import "../components/onboarding/onboarding.css";
import OnboardingStep1 from "../components/onboarding/OnboardingStep1";
import OnboardingStep2 from "../components/onboarding/OnboardingStep2";
import OnboardingStep3 from "../components/onboarding/OnboardingStep3";

const STEPS = [
  { n: 1, title: "Account", desc: "Your details" },
  { n: 2, title: "Deploy", desc: "Install agent" },
  { n: 3, title: "Integrate", desc: "Connect sources" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [agentId, setAgentId] = useState(null);

  function goTo(n) {
    if (n <= maxStep) setStep(n);
  }

  function advance(n) {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  }

  return (
    <div style={{ minHeight: "100vh", background: wz.bg, color: wz.textPrimary, fontFamily: wz.font.sans }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: 64,
          background: wz.bg,
          borderBottom: `1px solid ${wz.border}`,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 700, fontFamily: wz.font.sans, letterSpacing: "-0.01em" }}>
          <span style={{ color: wz.textPrimary }}>True</span>
          <span style={{ color: wz.accent }}>Positive</span>
        </div>
        <div
          style={{
            fontSize: 14,
            fontFamily: wz.font.mono,
            color: wz.textMuted,
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          {step} / 3
        </div>
        <Link
          to="/"
          className="tp-wizard-exit"
          style={{ fontSize: 13, fontFamily: wz.font.sans, color: wz.textMuted, textDecoration: "none" }}
        >
          Exit setup
        </Link>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
        <div
          className="tp-wizard-sidebar"
          style={{
            width: 280,
            flexShrink: 0,
            background: wz.sidebarBg,
            borderRight: `1px solid ${wz.border}`,
            padding: "28px 0",
            position: "sticky",
            top: 64,
            height: "calc(100vh - 64px)",
            overflow: "auto",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontFamily: wz.font.mono,
              fontWeight: 600,
              color: "#8b95a5",
              letterSpacing: 0.8,
              padding: "0 22px",
              marginBottom: 24,
            }}
          >
            SETUP WIZARD
          </div>
          {STEPS.map((s) => {
            const active = s.n === step;
            const reachable = s.n <= maxStep;
            return (
              <div
                key={s.n}
                className={`tp-wizard-sidebar-step${active ? " active" : ""}`}
                onClick={() => goTo(s.n)}
                style={{ cursor: reachable ? "pointer" : "default" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontFamily: wz.font.mono,
                      fontWeight: 700,
                      flexShrink: 0,
                      background: active ? wz.accent : reachable ? "#3a4557" : wz.textMuted,
                      color: active ? wz.onAccentLight : reachable ? wz.textSecondary : wz.sidebarBg,
                    }}
                  >
                    {s.n < step ? "✓" : s.n}
                  </span>
                  <span
                    style={{
                      fontSize: 17,
                      fontFamily: wz.font.sans,
                      fontWeight: active ? 700 : 600,
                      color: active ? wz.textPrimary : reachable ? wz.textSecondary : wz.textMuted,
                    }}
                  >
                    {s.title}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontFamily: wz.font.sans,
                    color: wz.textMuted,
                    marginLeft: 48,
                  }}
                >
                  {s.desc}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="tp-wizard-content"
          style={{ flex: 1, background: wz.bg, overflow: "auto", padding: "40px 60px" }}
        >
          <div style={{ maxWidth: 800 }}>
            {step === 1 && <OnboardingStep1 onNext={() => advance(2)} />}
            {step === 2 && (
              <OnboardingStep2 onBack={() => goTo(1)} onNext={() => advance(3)} onAgentCreated={setAgentId} />
            )}
            {step === 3 && <OnboardingStep3 onBack={() => goTo(2)} agentId={agentId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
