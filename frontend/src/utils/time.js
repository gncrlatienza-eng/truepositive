// Real backend timestamps (bucket_start, peak_hour_start, etc.) are UTC ISO
// strings — format them here rather than trusting any pre-baked label string
// from the backend, so times always reflect the viewer's own local clock
// (whatever timezone their browser/OS is set to) instead of wherever the
// server happens to be running.
export function formatLocalHour(isoTimestamp) {
  if (!isoTimestamp) return null;
  // 12-hour with AM/PM (not 24-hour) — minutes are included, not just the
  // hour, since a bucket that's exactly on the hour in UTC can still land on
  // e.g. :30 locally for a half-hour-offset timezone (India, Nepal, ...).
  return new Date(isoTimestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}
