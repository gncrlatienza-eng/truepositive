"""Unit tests for report_service._kpi()'s trend/trend_good split.

Regression coverage for a real bug found via live verification: `trend`
used to be flipped by `lower_is_better`, so the frontend's arrow (mapped
directly from `trend`) contradicted the actual numeric change -- e.g.
alerts going 2 -> 4 (a real increase) rendered a down arrow. `trend` must
always match the arithmetic sign of the change; `trend_good` is the only
field that should depend on `lower_is_better`.
"""

from app.services.report_service import _kpi


def test_increase_not_lower_is_better_is_up_and_good():
    kpi = _kpi("Events ingested", 40, 40, 20, lower_is_better=False)
    assert kpi["trend"] == "up"
    assert kpi["trend_good"] is True
    assert kpi["delta_pct"] == 100.0


def test_decrease_not_lower_is_better_is_down_and_not_good():
    kpi = _kpi("Events ingested", 10, 10, 20, lower_is_better=False)
    assert kpi["trend"] == "down"
    assert kpi["trend_good"] is False


def test_increase_lower_is_better_is_up_but_not_good():
    # The exact regression case: alerts created 2 -> 4 is a real increase
    # (more alerts), which is bad -- the arrow must still point up (that's
    # what actually happened numerically); only the color/verdict flips.
    kpi = _kpi("Alerts created", 4, 4, 2, lower_is_better=True)
    assert kpi["trend"] == "up"
    assert kpi["trend_good"] is False
    assert kpi["delta_pct"] == 100.0


def test_decrease_lower_is_better_is_down_and_good():
    # Critical alerts 2 -> 1: a real decrease, and a good one.
    kpi = _kpi("Critical alerts", 1, 1, 2, lower_is_better=True)
    assert kpi["trend"] == "down"
    assert kpi["trend_good"] is True
    assert kpi["delta_pct"] == -50.0


def test_no_previous_value_is_flat_with_no_verdict():
    kpi = _kpi("Mean time to triage", "-", 0, 0, lower_is_better=True)
    assert kpi["trend"] == "flat"
    assert kpi["trend_good"] is None
    assert kpi["delta_pct"] is None


def test_zero_delta_is_flat_and_good():
    kpi = _kpi("Events ingested", 10, 10, 10, lower_is_better=False)
    assert kpi["trend"] == "flat"
    assert kpi["trend_good"] is True
    assert kpi["delta_pct"] == 0.0
