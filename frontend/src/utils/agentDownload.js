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
  link.download = "tp_agent.exe";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
