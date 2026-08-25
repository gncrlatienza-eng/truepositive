import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import Modal from "../common/Modal";
import { Button } from "../common/Button";
import { exportReportPdf } from "../../api/reports";
import { useToast } from "../common/Toast";

// Separate from ReportViewModal on purpose: that component renders
// already-in-memory report.data with zero network cost, while this one
// needs an async PDF fetch + blob lifecycle -- keeping them apart avoids
// mixing an async/loading concern into what's otherwise a fast, synchronous
// view. Shared by both LibraryTab's row action and the top-level ExportMenu
// so there's exactly one PDF-preview code path instead of two independent
// download handlers.
export default function ReportPdfModal({ open, onClose, reportId, filename }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!open || !reportId) return undefined;
    setLoading(true);
    setBlobUrl(null);
    let url;
    let cancelled = false;
    exportReportPdf(reportId)
      .then((blob) => {
        if (cancelled) return;
        url = window.URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) showToast("Could not load the PDF preview.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [open, reportId, showToast]);

  function handleDownload() {
    if (!blobUrl) return;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handlePrint() {
    document.getElementById("tp-report-pdf-frame")?.contentWindow?.print();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report PDF"
      width={880}
      footer={
        <>
          <Button variant="secondary" onClick={handlePrint} disabled={!blobUrl}>
            Print
          </Button>
          <Button variant="primary" onClick={handleDownload} disabled={!blobUrl}>
            Download
          </Button>
        </>
      }
    >
      <div
        style={{
          height: "72vh",
          background: "#ffffff",
          borderRadius: theme.radius.md,
          overflow: "hidden",
          display: "flex",
          alignItems: loading ? "center" : "stretch",
          justifyContent: loading ? "center" : "stretch",
        }}
      >
        {loading && <div style={{ padding: 40, textAlign: "center", color: "#333" }}>Loading preview…</div>}
        {!loading && blobUrl && (
          <iframe
            id="tp-report-pdf-frame"
            src={blobUrl}
            title="Report PDF preview"
            width="100%"
            height="100%"
            style={{ border: "none" }}
          />
        )}
      </div>
    </Modal>
  );
}
