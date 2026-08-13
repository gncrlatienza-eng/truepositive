import { useMemo, useState } from "react";
import { theme } from "../../styles/theme";
import { Button } from "./Button";

// Sortable + paginated table, greenfield for Sprint 5+ to consume (Logs/Alerts
// tables). `columns`: [{ key, label, sortable, sortValue?, render?, align? }].
export function Table({ columns, rows, rowKey, pageSize = 10, emptyMessage = "No data" }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);

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

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(col) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(0);
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: theme.space[6], textAlign: "center", color: theme.color.textFaint, fontSize: 13 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
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
              <tr key={rowKey(row)}>
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
      {pageCount > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: theme.space[3],
            padding: theme.space[3],
          }}
        >
          <span style={{ fontSize: 12, color: theme.color.textMuted }}>
            Page {safePage + 1} of {pageCount}
          </span>
          <Button size="sm" variant="secondary" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
