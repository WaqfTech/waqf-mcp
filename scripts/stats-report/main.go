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
	Clients  int64   `json:"clients"`
	AvgMs    float64 `json:"avg_ms"`
	MaxMs    int64   `json:"max_ms"`
}

type topicRow struct {
	Name  string  `json:"name"`
	Calls int64   `json:"calls"`
	Share float64 `json:"share"`
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
	Source      string                 `json:"source"`
	Since       string                 `json:"since"`
	LatestDay   string                 `json:"latest_day"`
	Days        int                    `json:"days"`
	Public      bool                   `json:"public"`
	MinCalls    int64                  `json:"min_calls"`
	Summary     summary                `json:"summary"`
	Topics      []topicRow             `json:"topics"`
	Dimensions  map[string][]metricRow `json:"dimensions"`
}

var dimensions = map[string]string{
	"provider": "COALESCE(upstream_provider, 'gateway')",
	"country":  "COALESCE(country, 'unknown')",
	"client":   "COALESCE(client_app, 'unknown')",
	"tool":     "COALESCE(tool_name, '(non-tool)')",
	"method":   "method",
	"status":   "CAST(status_code AS TEXT)",
	"colo":     "COALESCE(colo, 'unknown')",
}

var displayOrder = []string{"provider", "tool", "country", "client", "method", "status", "colo", "trend"}

func main() {
	days := flag.Int("days", 30, "lookback window in days")
	sinceFlag := flag.String("since", "", "RFC3339 start timestamp; overrides -days")
	source := flag.String("source", "rollup", "rollup (mcp_stats_daily) or raw (mcp_logs)")
	dimension := flag.String("dimension", "all", "provider, country, client, tool, method, status, colo, trend, or all")
	format := flag.String("format", "table", "table, markdown, csv, json, or html")
	output := flag.String("output", "", "write html or json to a file instead of stdout")
	database := flag.String("db", "waqf-app", "D1 database name")
	remote := flag.Bool("remote", true, "query the remote database (false uses local D1)")
	public := flag.Bool("public", false, "public-safe view: drop method/status and suppress small rows")
	minCalls := flag.Int64("min-calls", 10, "suppress rows below this call count when -public is set")
	flag.Parse()

	if *days < 1 || *days > 3650 {
		fail("-days must be between 1 and 3650")
	}
	if *format != "table" && *format != "markdown" && *format != "csv" && *format != "json" && *format != "html" {
		fail("-format must be table, markdown, csv, json, or html")
	}
	if *source != "rollup" && *source != "raw" {
		fail("-source must be rollup or raw")
	}
	if *dimension != "all" {
		if _, ok := dimensions[*dimension]; !ok && *dimension != "trend" {
			fail("-dimension must be all, trend, or one of: provider, country, client, tool, method, status, colo")
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
	if *source == "rollup" {
		// Rollups are day-granular; make the reported window match the data.
		sinceTime = time.Date(sinceTime.Year(), sinceTime.Month(), sinceTime.Day(), 0, 0, 0, 0, time.UTC)
	}
	since := sinceTime.Format("2006-01-02T15:04:05.000Z")
	sinceDay := sinceTime.Format("2006-01-02")
	result := report{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Source:      *source,
		Since:       since,
		Days:        int(time.Since(sinceTime).Hours() / 24),
		Public:      *public,
		MinCalls:    *minCalls,
		Dimensions:  map[string][]metricRow{},
	}

	result.Summary = mustSummary(*database, *remote, *source, since, sinceDay)
	if *source == "rollup" && result.Summary.Calls == 0 {
		fmt.Fprintln(os.Stderr, "No rollup rows in this window; run POST /api/stats/aggregate or use -source raw.")
	}

	selected := displayOrder
	if *dimension != "all" {
		selected = []string{*dimension}
	}
	for _, name := range selected {
		if *public && (name == "method" || name == "status" || name == "colo") {
			continue
		}
		rows := mustRows(*database, *remote, *source, since, sinceDay, name)
		if name == "tool" {
			// Handshakes and listings are not demand; keep them out of the
			// topic mix even though they are useful in the tool table.
			result.Topics = topicMix(filterToolRows(rows))
		}
		// The daily trend is ordered by date, not volume. Suppressing low
		// days or re-sorting by calls would break the time axis.
		if *public && name != "trend" {
			rows = publicFilter(rows, *minCalls)
		}
		result.Dimensions[name] = rows
	}
	if trend := result.Dimensions["trend"]; len(trend) > 0 {
		result.LatestDay = trend[len(trend)-1].Value
	}

	switch *format {
	case "json":
		encoded, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			fail("encode json: " + err.Error())
		}
		writeOutput(*output, append(encoded, '\n'))
	case "html":
		writeOutput(*output, []byte(renderHTML(result)))
	case "table", "markdown", "csv":
		if *output != "" {
			fail("-output is supported for html and json only")
		}
		printReport(result, *format, *public)
	default:
		fail("unsupported format")
	}
}

func writeOutput(path string, data []byte) {
	if path == "" {
		_, _ = os.Stdout.Write(data)
		return
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fail("create output directory: " + err.Error())
		}
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		fail("write output: " + err.Error())
	}
	fmt.Fprintf(os.Stderr, "wrote %s\n", path)
}

func topicForTool(tool string) string {
	switch {
	case strings.HasPrefix(tool, "waqf_quran"),
		strings.HasPrefix(tool, "tafsir_net__"),
		strings.HasPrefix(tool, "bahouth__"):
		return "Quran & tafsir"
	case strings.HasPrefix(tool, "waqf_hadith"),
		strings.HasPrefix(tool, "shamela__"):
		return "Hadith"
	case strings.HasPrefix(tool, "waqf_books"),
		strings.HasPrefix(tool, "waqf_turath"),
		strings.HasPrefix(tool, "aljam3__"),
		strings.HasPrefix(tool, "turath__"),
		strings.HasPrefix(tool, "maheralfahel__"):
		return "Books & heritage"
	case strings.HasPrefix(tool, "waqf_search"),
		strings.HasPrefix(tool, "fihris__"):
		return "Scholarship search"
	default:
		return "Other"
	}
}

func topicMix(rows []metricRow) []topicRow {
	totals := map[string]int64{}
	var total int64
	for _, row := range rows {
		topic := topicForTool(row.Value)
		totals[topic] += row.Calls
		total += row.Calls
	}
	out := make([]topicRow, 0, len(totals))
	for name, calls := range totals {
		out = append(out, topicRow{Name: name, Calls: calls, Share: percent(calls, total)})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Calls > out[j].Calls })
	return out
}

func mustSummary(database string, remote bool, source, since, sinceDay string) summary {
	rows, err := queryRows(database, remote, summarySQL(source, since, sinceDay))
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

func mustRows(database string, remote bool, source, since, sinceDay, dimension string) []metricRow {
	rows, err := queryRows(database, remote, dimensionSQL(source, dimension, since, sinceDay))
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
			Clients:  intValue(row["clients"]),
			AvgMs:    floatValue(row["avg_ms"]),
			MaxMs:    intValue(row["max_ms"]),
		})
	}
	return out
}

func summarySQL(source, since, sinceDay string) string {
	if source == "rollup" {
		return fmt.Sprintf(`
			SELECT SUM(calls) AS calls,
			       SUM(errors) AS errors,
			       SUM(cache_hits) AS cache_hits,
			       SUM(unique_clients) AS unique_clients,
			       ROUND(SUM(latency_sum_ms) * 1.0 / NULLIF(SUM(calls), 0), 1) AS avg_ms,
			       MAX(latency_max_ms) AS max_ms
			FROM mcp_stats_daily
			WHERE dimension = 'total' AND day >= '%s'
		`, sinceDay)
	}

	return fmt.Sprintf(`
		SELECT COUNT(*) AS calls,
		       SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors,
		       SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) AS cache_hits,
		       COUNT(DISTINCT client_ip_hash) AS unique_clients,
		       ROUND(AVG(latency_ms), 1) AS avg_ms,
		       MAX(latency_ms) AS max_ms
		FROM mcp_logs
		WHERE timestamp >= '%s'
	`, since)
}

func dimensionSQL(source, dimension, since, sinceDay string) string {
	if source == "rollup" {
		if dimension == "trend" {
			return fmt.Sprintf(`
				SELECT day AS value,
				       calls,
				       errors,
				       cache_hits,
				       unique_clients AS clients,
				       ROUND(latency_sum_ms * 1.0 / NULLIF(calls, 0), 1) AS avg_ms,
				       latency_max_ms AS max_ms
				FROM mcp_stats_daily
				WHERE dimension = 'total' AND day >= '%s'
				ORDER BY value ASC
				LIMIT 400
			`, sinceDay)
		}
		return fmt.Sprintf(`
			SELECT value,
			       SUM(calls) AS calls,
			       SUM(errors) AS errors,
			       SUM(cache_hits) AS cache_hits,
			       SUM(unique_clients) AS clients,
			       ROUND(SUM(latency_sum_ms) * 1.0 / NULLIF(SUM(calls), 0), 1) AS avg_ms,
			       MAX(latency_max_ms) AS max_ms
			FROM mcp_stats_daily
			WHERE dimension = '%s' AND day >= '%s'
			GROUP BY value
			ORDER BY calls DESC
			LIMIT 50
		`, dimension, sinceDay)
	}

	expr := dimensions[dimension]
	order := "calls DESC"
	limit := 50
	if dimension == "trend" {
		expr = "substr(timestamp, 1, 10)"
		order = "value ASC"
		limit = 400
	}
	return fmt.Sprintf(`
		SELECT %s AS value,
		       COUNT(*) AS calls,
		       SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors,
		       SUM(CASE WHEN is_cache_hit = 1 THEN 1 ELSE 0 END) AS cache_hits,
		       COUNT(DISTINCT client_ip_hash) AS clients,
		       ROUND(AVG(latency_ms), 1) AS avg_ms,
		       MAX(latency_ms) AS max_ms
		FROM mcp_logs
		WHERE timestamp >= '%s'
		GROUP BY value
		ORDER BY %s
		LIMIT %d
	`, expr, since, order, limit)
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

	fmt.Printf("Gateway stats: since %s (source: %s)\n", result.Since, result.Source)
	if public {
		fmt.Println("Public-safe view: method/status/colo omitted, small rows suppressed.")
	}
	clientLabel := "unique clients"
	if result.Source == "rollup" {
		clientLabel = "unique client-days"
	}
	fmt.Printf("Calls %d | errors %d (%.1f%%) | cache hits %d (%.1f%%) | %s %d\n",
		result.Summary.Calls,
		result.Summary.Errors,
		percent(result.Summary.Errors, result.Summary.Calls),
		result.Summary.CacheHits,
		percent(result.Summary.CacheHits, result.Summary.Calls),
		clientLabel,
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
