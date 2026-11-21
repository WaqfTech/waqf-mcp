// stats-report prints gateway usage aggregates from production D1.
//
// It shells out to wrangler, reusing the operator's existing D1 auth. No secret
// is read or printed. The output is the same shape a future daily rollup and a
// public stats page would consume.
package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"
)

type metricRow struct {
	Value    string  `json:"value"`
	Calls    int64   `json:"calls"`
	Errors   int64   `json:"errors"`
	CacheHit int64   `json:"cache_hits"`
	AvgMs    float64 `json:"avg_ms"`
	MaxMs    int64   `json:"max_ms"`
}

type summary struct {
	Calls         int64   `json:"calls"`
	Errors        int64   `json:"errors"`
	CacheHits     int64   `json:"cache_hits"`
	UniqueClients int64   `json:"unique_clients"`
	AvgMs         float64 `json:"avg_ms"`
	MaxMs         int64   `json:"max_ms"`
}

type report struct {
	GeneratedAt string                 `json:"generated_at"`
	Since       string                 `json:"since"`
	Days        int                    `json:"days"`
	Public      bool                   `json:"public"`
	Summary     summary                `json:"summary"`
	Dimensions  map[string][]metricRow `json:"dimensions"`
}

var dimensions = map[string]string{
	"provider": "COALESCE(upstream_provider, 'gateway')",
	"country":  "COALESCE(country, 'unknown')",
	"client":   "COALESCE(client_app, 'unknown')",
	"tool":     "COALESCE(tool_name, '(non-tool)')",
	"method":   "method",
	"status":   "CAST(status_code AS TEXT)",
}

var displayOrder = []string{"provider", "tool", "country", "client", "method", "status", "trend"}

func main() {
	days := flag.Int("days", 30, "lookback window in days")
	sinceFlag := flag.String("since", "", "RFC3339 start timestamp; overrides -days")
	dimension := flag.String("dimension", "all", "provider, country, client, tool, method, status, trend, or all")
	format := flag.String("format", "table", "table, markdown, csv, or json")
	database := flag.String("db", "waqf-app", "D1 database name")
	remote := flag.Bool("remote", true, "query the remote database (false uses local D1)")
	public := flag.Bool("public", false, "public-safe view: drop method/status and suppress small rows")
	minCalls := flag.Int64("min-calls", 10, "suppress rows below this call count when -public is set")
	flag.Parse()

	if *days < 1 || *days > 3650 {
		fail("-days must be between 1 and 3650")
	}
	if *format != "table" && *format != "markdown" && *format != "csv" && *format != "json" {
		fail("-format must be table, markdown, csv, or json")
	}
	if *dimension != "all" {
		if _, ok := dimensions[*dimension]; !ok && *dimension != "trend" {
			fail("-dimension must be all, trend, or one of: provider, country, client, tool, method, status")
		}
	}

	sinceTime := time.Now().UTC().AddDate(0, 0, -*days)
	if *sinceFlag != "" {
		parsed, err := time.Parse(time.RFC3339, *sinceFlag)
		if err != nil {
			fail("-since must be an RFC3339 timestamp, for example 2026-11-21T07:09:30Z")
		}
		sinceTime = parsed.UTC()
	}
	since := sinceTime.Format("2006-01-02T15:04:05.000Z")
	result := report{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Since:       since,
		Days:        int(time.Since(sinceTime).Hours() / 24),
		Public:      *public,
		Dimensions:  map[string][]metricRow{},
	}

	result.Summary = mustSummary(*database, *remote, since)

	selected := displayOrder
	if *dimension != "all" {
		selected = []string{*dimension}
	}
	for _, name := range selected {
		if *public && (name == "method" || name == "status") {
			continue
		}
		rows := mustRows(*database, *remote, since, name)
		if *public {
			rows = publicFilter(rows, *minCalls)
		}
		result.Dimensions[name] = rows
	}

	switch *format {
	case "json":
		encoded, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			fail("encode json: " + err.Error())
		}
		fmt.Println(string(encoded))
	case "table", "markdown", "csv":
		printReport(result, *format, *public)
	default:
		fail("unsupported format")
	}
}

func mustSummary(database string, remote bool, since string) summary {
	sql := fmt.Sprintf(`
		SELECT COUNT(*) AS calls,
		       SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors,
		       SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) AS cache_hits,
		       COUNT(DISTINCT client_ip_hash) AS unique_clients,
		       ROUND(AVG(latency_ms), 1) AS avg_ms,
		       MAX(latency_ms) AS max_ms
		FROM mcp_logs
		WHERE timestamp >= '%s'
	`, since)
	rows, err := queryRows(database, remote, sql)
	if err != nil {
		fail(err.Error())
	}
	if len(rows) == 0 {
		return summary{}
	}
	row := rows[0]
	return summary{
		Calls:         intValue(row["calls"]),
		Errors:        intValue(row["errors"]),
		CacheHits:     intValue(row["cache_hits"]),
		UniqueClients: intValue(row["unique_clients"]),
		AvgMs:         floatValue(row["avg_ms"]),
		MaxMs:         intValue(row["max_ms"]),
	}
}

func mustRows(database string, remote bool, since, dimension string) []metricRow {
	expr := dimensions[dimension]
	order := "calls DESC"
	limit := 50
	if dimension == "trend" {
		expr = "substr(timestamp, 1, 10)"
		order = "value ASC"
		limit = 400
	}
	sql := fmt.Sprintf(`
		SELECT %s AS value,
		       COUNT(*) AS calls,
		       SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors,
		       SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) AS cache_hits,
		       ROUND(AVG(latency_ms), 1) AS avg_ms,
		       MAX(latency_ms) AS max_ms
		FROM mcp_logs
		WHERE timestamp >= '%s'
		GROUP BY value
		ORDER BY %s
		LIMIT %d
	`, expr, since, order, limit)

	rows, err := queryRows(database, remote, sql)
	if err != nil {
		fail(err.Error())
	}
	out := make([]metricRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, metricRow{
			Value:    stringValue(row["value"]),
			Calls:    intValue(row["calls"]),
			Errors:   intValue(row["errors"]),
			CacheHit: intValue(row["cache_hits"]),
			AvgMs:    floatValue(row["avg_ms"]),
			MaxMs:    intValue(row["max_ms"]),
		})
	}
	return out
}

func queryRows(database string, remote bool, sql string) ([]map[string]any, error) {
	args := []string{"d1", "execute", database, "--json", "--command", sql}
	if remote {
		args = append(args, "--remote")
	}
	cmd := exec.Command("wrangler", args...)
	if root := repoRoot(); root != "" {
		cmd.Dir = root
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return nil, fmt.Errorf("wrangler d1 execute failed: %s", detail)
	}

	var parsed []struct {
		Results []map[string]any `json:"results"`
	}
	decoder := json.NewDecoder(bytes.NewReader(out))
	decoder.UseNumber()
	if err := decoder.Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode wrangler json: %w", err)
	}
	if len(parsed) == 0 {
		return nil, nil
	}
	return parsed[0].Results, nil
}

func printReport(result report, format string, public bool) {
	if format == "csv" {
		printCSV(result)
		return
	}

	fmt.Printf("Gateway stats: since %s\n", result.Since)
	if public {
		fmt.Println("Public-safe view: method/status omitted, small rows suppressed.")
	}
	fmt.Printf("Calls %d | errors %d (%.1f%%) | cache hits %d (%.1f%%) | unique clients %d\n",
		result.Summary.Calls,
		result.Summary.Errors,
		percent(result.Summary.Errors, result.Summary.Calls),
		result.Summary.CacheHits,
		percent(result.Summary.CacheHits, result.Summary.Calls),
		result.Summary.UniqueClients,
	)
	fmt.Printf("Avg latency %.1f ms | max %d ms\n\n", result.Summary.AvgMs, result.Summary.MaxMs)

	for _, name := range displayOrder {
		rows, ok := result.Dimensions[name]
		if !ok {
			continue
		}
		title := strings.ToUpper(name[:1]) + name[1:]
		fmt.Printf("=== %s ===\n", title)
		if format == "markdown" {
			printMarkdown(rows)
		} else {
			printTable(rows)
		}
		fmt.Println()
	}
}

func printTable(rows []metricRow) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "VALUE\tCALLS\tERRORS\tERR%\tCACHE%\tAVG_MS\tMAX_MS")
	for _, row := range rows {
		fmt.Fprintf(w, "%s\t%d\t%d\t%.1f\t%.1f\t%.1f\t%d\n",
			row.Value, row.Calls, row.Errors,
			percent(row.Errors, row.Calls),
			percent(row.CacheHit, row.Calls),
			row.AvgMs, row.MaxMs,
		)
	}
	w.Flush()
}

func printMarkdown(rows []metricRow) {
	fmt.Println("| Value | Calls | Errors | Err% | Cache% | Avg ms | Max ms |")
	fmt.Println("|---|---:|---:|---:|---:|---:|---:|")
	for _, row := range rows {
		fmt.Printf("| %s | %d | %d | %.1f | %.1f | %.1f | %d |\n",
			row.Value, row.Calls, row.Errors,
			percent(row.Errors, row.Calls),
			percent(row.CacheHit, row.Calls),
			row.AvgMs, row.MaxMs,
		)
	}
}

func printCSV(result report) {
	w := csv.NewWriter(os.Stdout)
	_ = w.Write([]string{"dimension", "value", "calls", "errors", "cache_hits", "avg_ms", "max_ms"})
	for _, name := range displayOrder {
		for _, row := range result.Dimensions[name] {
			_ = w.Write([]string{
				name, row.Value,
				strconv.FormatInt(row.Calls, 10),
				strconv.FormatInt(row.Errors, 10),
				strconv.FormatInt(row.CacheHit, 10),
				strconv.FormatFloat(row.AvgMs, 'f', 1, 64),
				strconv.FormatInt(row.MaxMs, 10),
			})
		}
	}
	w.Flush()
}

func publicFilter(rows []metricRow, minCalls int64) []metricRow {
	out := make([]metricRow, 0, len(rows))
	for _, row := range rows {
		if row.Calls >= minCalls {
			out = append(out, row)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].Calls > out[j].Calls
	})
	return out
}

func percent(part, total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(part) * 100 / float64(total)
}

func intValue(v any) int64 {
	switch n := v.(type) {
	case json.Number:
		i, _ := n.Int64()
		return i
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	case string:
		i, _ := strconv.ParseInt(n, 10, 64)
		return i
	default:
		return 0
	}
}

func floatValue(v any) float64 {
	switch n := v.(type) {
	case json.Number:
		f, _ := n.Float64()
		return f
	case float64:
		return n
	case int64:
		return float64(n)
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	default:
		return 0
	}
}

func stringValue(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

// repoRoot walks up to the repository root so wrangler reads the same account
// and database context no matter which directory launched the report.
func repoRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "workers.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
