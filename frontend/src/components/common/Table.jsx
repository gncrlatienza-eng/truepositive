import { useMemo, useState } from "react";
import { theme } from "../../styles/theme";
import { Button } from "./Button";

// Compact run of page numbers with ellipsis for large counts, e.g.
// [0, 1, 2, '…', 44] when on page 0 of 45 — always shows first, last, and
// a small window around the current page so jumping to either end is one
// click regardless of how many pages exist.
function pageNumbers(current, count) {
  const pages = new Set([0, count - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < count).sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withGaps.push("…");
    withGaps.push(p);
  });
  return withGaps;
}

// Sortable, paginated table for Logs/Alerts. `columns`: [{ key, label,
// sortable, sortValue?, render?, align? }].
//
// Two pagination modes:
// - Client (default, no `onPageChange`): `rows` is the whole result set,
//   the table slices+sorts it locally — unchanged from how this component
//   always worked.
// - Server (`onPageChange` provided): `rows` is just the current page's
//   rows, `page`/`pageCount` describe where we are in the *true* total, and
//   clicking a page number calls `onPageChange` to fetch it. Column-header
//   sort in this mode only reorders the current page's rows (the backend
//   doesn't support arbitrary server-side sort columns) — a real, if
//   smaller-scoped, convenience rather than a silent full-dataset claim.
export function Table({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  emptyMessage = "No data",
  onRowClick,
  page,
  pageCount,
  onPageChange,
}) {
  const serverPaginated = typeof onPageChange === "function";

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [localPage, setLocalPage] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const accessor = col?.sortValue || ((row) => row[sortKey]);
    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const clientPageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const effectivePageCount = serverPaginated ? Math.max(1, pageCount) : clientPageCount;
  const effectivePage = serverPaginated
    ? Math.min(page, effectivePageCount - 1)
    : Math.min(localPage, clientPageCount - 1);
  const pageRows = serverPaginated
    ? sortedRows
    : sortedRows.slice(effectivePage * pageSize, effectivePage * pageSize + pageSize);

  function toggleSort(col) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    if (!serverPaginated) setLocalPage(0);
  }

  function goToPage(p) {
    const clamped = Math.max(0, Math.min(effectivePageCount - 1, p));
    if (serverPaginated) onPageChange(clamped);
    else setLocalPage(clamped);
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: theme.space[6], textAlign: "center", color: theme.color.textFaint, fontSize: 13 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* Only this region scrolls — the column headers stay pinned via
          `position: sticky` (see .tp-table th in index.css) and the pager
          below sits outside this scroll container entirely, so it's always
          visible without hunting for it at the bottom of a long list. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto" }}>
        <table className="tp-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  data-sortable={!!col.sortable}
                  onClick={() => toggleSort(col)}
                  style={{ textAlign: col.align || "left" }}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align || "left" }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {effectivePageCount > 1 && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 6,
            padding: theme.space[3],
            borderTop: `1px solid ${theme.color.border}`,
          }}
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={effectivePage === 0}
            onClick={() => goToPage(effectivePage - 1)}
          >
            Prev
          </Button>
          {pageNumbers(effectivePage, effectivePageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} style={{ fontSize: 12, color: theme.color.textFaint, padding: "0 4px" }}>
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                variant={p === effectivePage ? "primary" : "secondary"}
                onClick={() => goToPage(p)}
                style={{ minWidth: 30, padding: "6px 10px" }}
              >
                {p + 1}
              </Button>
            ),
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={effectivePage >= effectivePageCount - 1}
            onClick={() => goToPage(effectivePage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
