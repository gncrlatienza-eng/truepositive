CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: str) -> str:
    """Prefix values that a spreadsheet app would interpret as a formula.

    Shared between every CSV export in the app (logs, alerts, ...) — this is
    a real injection vector (CSV formula injection / "DDE injection"), not a
    cosmetic concern, so it belongs in one place rather than being
    reimplemented per-exporter.
    """
    if value and value[0] in CSV_FORMULA_TRIGGERS:
        return "'" + value
    return value
