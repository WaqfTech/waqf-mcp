package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPublicFilterDropsSmallCellsAndSorts(t *testing.T) {
	rows := []metricRow{
		{Value: "SA", Calls: 50},
		{Value: "US", Calls: 4},
		{Value: "EG", Calls: 20},
	}
	got := publicFilter(rows, 10)
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
	if got[0].Value != "SA" || got[1].Value != "EG" {
		t.Fatalf("unexpected order: %+v", got)
	}
}

func TestPercentHandlesZeroTotal(t *testing.T) {
	if got := percent(5, 0); got != 0 {
		t.Fatalf("expected 0, got %v", got)
	}
	if got := percent(25, 100); got != 25 {
		t.Fatalf("expected 25, got %v", got)
	}
}

func TestSQLSources(t *testing.T) {
	rollupSummary := summarySQL("rollup", "2026-11-21T00:00:00.000Z", "2026-11-20")
	if !strings.Contains(rollupSummary, "mcp_stats_daily") {
		t.Fatalf("rollup summary should read mcp_stats_daily: %s", rollupSummary)
	}
	if !strings.Contains(rollupSummary, "dimension = 'total'") {
		t.Fatalf("rollup summary should use the total row: %s", rollupSummary)
	}

	rawSummary := summarySQL("raw", "2026-11-21T00:00:00.000Z", "2026-11-20")
	if !strings.Contains(rawSummary, "mcp_logs") {
		t.Fatalf("raw summary should read mcp_logs: %s", rawSummary)
	}

	rollupProvider := dimensionSQL("rollup", "provider", "", "2026-11-20")
	if !strings.Contains(rollupProvider, "dimension = 'provider'") {
		t.Fatalf("rollup provider SQL missing dimension filter: %s", rollupProvider)
	}

	rawProvider := dimensionSQL("raw", "provider", "2026-11-21T00:00:00.000Z", "2026-11-20")
	if !strings.Contains(rawProvider, "COALESCE(upstream_provider") {
		t.Fatalf("raw provider SQL missing provider expression: %s", rawProvider)
	}

	trend := dimensionSQL("rollup", "trend", "", "2026-11-20")
	if !strings.Contains(trend, "SELECT day AS value") {
		t.Fatalf("rollup trend SQL should key on day: %s", trend)
	}
}

func TestNumericParsing(t *testing.T) {
	if got := intValue(json.Number("42")); got != 42 {
		t.Fatalf("intValue: expected 42, got %d", got)
	}
	if got := floatValue(json.Number("12.5")); got != 12.5 {
		t.Fatalf("floatValue: expected 12.5, got %v", got)
	}
	if got := stringValue("aljam3"); got != "aljam3" {
		t.Fatalf("stringValue: got %q", got)
	}
	if got := stringValue(nil); got != "" {
		t.Fatalf("stringValue(nil): got %q", got)
	}
}
