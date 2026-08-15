// Real, agent-observed health for a data source — never guessed. `status` is
// the user's own active/paused toggle; `last_status`/`last_status_reason`
// come straight from the agent's per-cycle report to
// POST /agents/{id}/sources/status, so "red" always has a real reason behind
// it rather than a fabricated diagnosis.
export function computeSourceHealth(source, agents) {
  if (source.status === "paused") {
    return {
      color: "grey",
      label: "Paused",
      reason: "You paused this source. Resume it to start collecting again.",
    };
  }

  if (source.type === "remote") {
    return {
      color: "red",
      label: "Not working",
      reason: "Remote (SSH) collection isn't implemented yet — this source is configured but nothing reads it.",
    };
  }

  if (!source.agent_id) {
    return {
      color: "yellow",
      label: "Enabled, not collecting",
      reason: "Not assigned to an agent yet. Edit this source and pick an agent to start collecting.",
    };
  }

  const agent = agents.find((a) => a.id === source.agent_id);
  if (agent && agent.status !== "connected") {
    return {
      color: "yellow",
      label: "Enabled, not collecting",
      reason: `The assigned agent (${agent.name}) is ${agent.status} — this source will resume once it reconnects.`,
    };
  }

  if (!source.last_collected_at) {
    return {
      color: "yellow",
      label: "Enabled, not collecting yet",
      reason: "Waiting for the agent's next collection cycle (every 30 seconds).",
    };
  }

  if (source.last_status === "error") {
    return {
      color: "red",
      label: "Not working",
      reason: source.last_status_reason || "The agent's last collection attempt failed.",
    };
  }

  return {
    color: "green",
    label: "Active",
    reason: "Collecting normally — the agent's last attempt succeeded.",
  };
}

export const HEALTH_COLOR_HEX = {
  green: "ok",
  yellow: "high",
  red: "critical",
  grey: null,
};
