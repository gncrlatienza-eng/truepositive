import { api } from "./api";

// Shared by AgentEnrollmentPanel (fresh agent) and the Settings -> Sources
// "Redeploy" button (existing agent, rotated key) — one file, config baked
// in server-side. Avoids the browser silently blocking a second automatic
// download from the same click, which a two-file version used to hit.
export async function downloadWindowsAgent({ id, key, url = api.defaults.baseURL }) {
  const response = await api.post("/agents/download/windows", { url, id, key }, { responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "truepositive-agent.exe";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// The primary Windows download: a real installer, generic for every org
// (no per-agent config baked in, unlike downloadWindowsAgent above — the
// installed app asks for it on first launch instead). No auth header
// needed, so a plain link works, unlike the POST/blob dance above.
export function downloadWindowsInstaller() {
  const link = document.createElement("a");
  link.href = `${api.defaults.baseURL}/agents/download/windows-installer`;
  link.download = "truepositive-agent-setup.exe";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
