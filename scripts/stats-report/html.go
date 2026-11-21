package main

import (
	"fmt"
	"html"
	"strconv"
	"strings"
	"time"
)

const htmlStyles = `
:root {
  --ink: #112b38;
  --ink-2: #1d4350;
  --paper: #eef5f2;
  --surface: #ffffff;
  --tide: #2e7d76;
  --lime: #c6ee67;
  --clay: #e6a37a;
  --clay-ink: #a5522b;
  --muted: #5f7a76;
  --line: rgba(17, 43, 56, .12);
  --shadow: 0 24px 60px -44px rgba(17, 43, 56, .55);
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--tide); text-underline-offset: 3px; }
.wrap { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
.hero {
  position: relative;
  overflow: hidden;
  color: var(--paper);
  background:
    radial-gradient(900px 320px at 88% -18%, rgba(198, 238, 103, .18), transparent 62%),
    radial-gradient(620px 360px at 0% 118%, rgba(46, 125, 118, .45), transparent 60%),
    var(--ink);
  padding: 64px 0 52px;
}
.hero::after {
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--lime), var(--tide), var(--clay));
}
.hero-row { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; justify-content: space-between; }
.hero h1 {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(2.6rem, 6vw, 4.6rem);
  line-height: .98;
  letter-spacing: -.04em;
  margin: .18em 0 .25em;
}
.eyebrow {
  display: inline-block;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--tide);
}
.hero .eyebrow { color: var(--lime); }
.lede { max-width: 62ch; color: rgba(238, 245, 242, .78); font-size: 1.05rem; margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 28px; }
.chip {
  border: 1px solid rgba(238, 245, 242, .2);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: .78rem;
  color: rgba(238, 245, 242, .8);
}
.chip strong { color: var(--paper); font-weight: 600; }
.download {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--lime);
  color: #112b38;
  text-decoration: none;
  font-weight: 650;
  font-size: .85rem;
  padding: 11px 16px;
  border-radius: 999px;
  white-space: nowrap;
  transition: transform .15s ease;
}
.download:hover { transform: translateY(-1px); }
main { padding: 34px 0 20px; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: -54px; position: relative; z-index: 2; }
.kpi {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 16px 18px 15px;
  box-shadow: var(--shadow);
}
.kpi .label { font-size: .68rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.kpi .value { font-size: clamp(1.5rem, 2.8vw, 2.2rem); font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; margin-top: 4px; }
.kpi .note { font-size: .72rem; color: var(--muted); margin-top: 2px; }
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 22px;
  box-shadow: var(--shadow);
  margin-top: 18px;
}
.panel-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.panel h2 { margin: .15em 0 0; font-size: 1.35rem; letter-spacing: -.02em; }
.panel .note { margin: 0; color: var(--muted); font-size: .82rem; max-width: 52ch; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th {
  text-align: start;
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 8px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
td { padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr:hover { background: rgba(46, 125, 118, .045); }
tr:last-child td { border-bottom: 0; }
.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
.name { font-weight: 600; }
.err { color: var(--clay-ink); }
.share { min-width: 110px; }
.share-track { height: 7px; background: var(--line); border-radius: 999px; overflow: hidden; }
.share-fill { height: 100%; background: linear-gradient(90deg, var(--tide), var(--lime)); border-radius: 999px; }
.chart { width: 100%; height: auto; display: block; }
.grid { stroke: var(--line); stroke-width: 1; }
.axis { fill: var(--muted); font-size: 11px; font-family: var(--sans); }
.legend-row { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; color: var(--muted); font-size: .78rem; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
.dot.tide { background: var(--tide); }
.dot.clay { background: var(--clay); }
.dot.lime { background: #9bc23e; }
.dot.ink { background: var(--ink-2); }
.dot.muted { background: #8aa6a1; }
.topic-grid { display: grid; grid-template-columns: 230px 1fr; gap: 30px; align-items: center; }
.donut { width: 210px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; margin: 0 auto; }
.donut-hole {
  width: 64%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface);
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
}
.donut-hole strong { font-size: 1.5rem; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.donut-hole span { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; }
.topic-list { display: grid; gap: 10px; }
.topic-row { display: grid; grid-template-columns: 14px 1fr auto auto; gap: 10px; align-items: center; font-size: .9rem; }
.topic-row .topic-name { font-weight: 600; }
.topic-row .topic-calls { color: var(--muted); font-variant-numeric: tabular-nums; }
.method { margin-top: 34px; }
.method-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.method-card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px; }
.method-card h3 { margin: 0 0 4px; font-size: .95rem; }
.method-card p { margin: 0; color: var(--muted); font-size: .82rem; }
.method-card code {
  display: block;
  margin-top: 8px;
  padding: 9px 10px;
  background: var(--paper);
  border-radius: 10px;
  font-family: var(--mono);
  font-size: .72rem;
  overflow-wrap: anywhere;
  color: var(--ink);
}
.footer { margin-top: 40px; padding: 22px 0 40px; border-top: 1px solid var(--line); color: var(--muted); font-size: .78rem; }
.footer code { font-family: var(--mono); font-size: .74rem; }
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.empty { color: var(--muted); font-size: .9rem; margin: 0; }
.data-note { margin: 12px 4px 0; color: var(--muted); font-size: .78rem; }
@media (max-width: 900px) {
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .topic-grid { grid-template-columns: 1fr; }
  .method-grid { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .wrap { width: calc(100% - 28px); }
  .hero { padding: 44px 0 40px; }
  .hero-row { align-items: flex-start; }
  .kpis { margin-top: -36px; }
  .panel { padding: 16px; }
  .hide-sm { display: none; }
  .donut { width: 170px; }
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0b1d24;
    --surface: #112b38;
    --ink: #eef5f2;
    --ink-2: #d7e7e2;
    --muted: #9fb8b2;
    --line: rgba(238, 245, 242, .13);
    --clay-ink: #f0a57c;
    --shadow: 0 24px 60px -44px rgba(0, 0, 0, .9);
  }
  .hero { background: radial-gradient(900px 320px at 88% -18%, rgba(198, 238, 103, .14), transparent 62%), radial-gradient(620px 360px at 0% 118%, rgba(46, 125, 118, .32), transparent 60%), #07161c; }
  .method-card code { background: #0b1d24; }
}
@media print {
  body { background: #fff; }
  .hero { background: #fff; color: #000; padding: 24px 0; }
  .hero::after, .download { display: none; }
  .lede, .chip { color: #333; }
  .panel, .kpi, .method-card { box-shadow: none; border-color: #ddd; break-inside: avoid; }
}
`

func renderHTML(r report) string {
	source := r.Source
	if source == "" {
		source = "rollup"
	}
	latest := r.LatestDay
	if latest == "" {
		latest = "not rolled up yet"
	}
	view := "Internal view"
	if r.Public {
		view = fmt.Sprintf("Public-safe view · cells below %d calls omitted", r.MinCalls)
	}

	var b strings.Builder
	b.WriteString(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waqf MCP Gateway — Usage Analytics</title>
<meta name="description" content="Aggregated daily usage across the Waqf MCP federation. No personal data.">
<meta property="og:title" content="Waqf MCP Gateway — Usage Analytics">
<meta property="og:description" content="Provider, country, client and tool usage across the Waqf MCP federation.">
<meta name="theme-color" content="#112b38">
<style>`)
	b.WriteString(htmlStyles)
	b.WriteString(`</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <div class="hero-row">
      <div>
        <span class="eyebrow">Waqf MCP Federation Gateway</span>
        <h1>Usage<br>analytics</h1>
        <p class="lede">Aggregated daily usage across federated Islamic MCP providers. Built for understanding demand and sharing the shape of the network without exposing personal data.</p>
      </div>
      <a class="download" href="stats.json">Download JSON</a>
    </div>
`)
	fmt.Fprintf(&b, `<div class="chips"><span class="chip">Window <strong>%s</strong></span><span class="chip">Latest rollup <strong>%s</strong></span><span class="chip">Cron <strong>00:15 UTC</strong></span><span class="chip">%s</span></div>`,
		html.EscapeString(r.Since), html.EscapeString(latest), html.EscapeString(view))
	b.WriteString(`
  </div>
</header>
<main class="wrap">
`)
	writeKPIs(&b, r)
	b.WriteString(`<p class="data-note">Top-line calls and the daily trend include protocol traffic. Country and agent tables count tool calls only. This window includes historical protocol errors from before the notification fix.</p>`)
	writeTrend(&b, r)
	writeBarsSection(&b, r, "provider", "Providers", "Calls by provider route", "Upstream servers plus the gateway's internal and protocol paths.", 12)
	writeBarsSection(&b, r, "country", "Countries", "Tool calls by client country", "Edge IP geography, not language. Small cells are omitted in the public view.", 15)
	writeBarsSection(&b, r, "client", "AI agents", "Tool calls by client application", "Recognised from user-agent families; generic SDKs are grouped separately.", 12)
	writeBarsSection(&b, r, "tool", "Top tools", "Most-called tools", "Namespaced upstream tools and canonical waqf_* tools.", 15)
	writeTopics(&b, r)
	writeMethod(&b, r)
	b.WriteString(`</main>
`)
	fmt.Fprintf(&b, `<footer class="footer"><div class="wrap">Generated %s · Source <code>%s</code> · <a href="stats.json">stats.json</a> · <a href="https://github.com/waqftech/waqf-mcp">Repository</a></div></footer>`,
		html.EscapeString(r.GeneratedAt), html.EscapeString(source))
	b.WriteString(`
</body>
</html>
`)
	return b.String()
}

func writeKPIs(b *strings.Builder, r report) {
	cards := []struct{ label, value, note string }{
		{"Calls", formatInt(r.Summary.Calls), "tool and protocol"},
		{"Error rate", formatPct(r.Summary.Errors, r.Summary.Calls), formatInt(r.Summary.Errors) + " errors"},
		{"Cache hit rate", formatPct(r.Summary.CacheHits, r.Summary.Calls), formatInt(r.Summary.CacheHits) + " hits"},
		{"Unique client-days", formatInt(r.Summary.UniqueClients), "distinct hashed clients"},
		{"Avg latency", formatMs(r.Summary.AvgMs), "end-to-end"},
		{"Max latency", formatMs(float64(r.Summary.MaxMs)), "worst single call"},
		{"Providers", formatInt(int64(len(r.Dimensions["provider"]))), "with visible calls"},
		{"Countries", formatInt(int64(len(r.Dimensions["country"]))), "with visible calls"},
	}
	b.WriteString(`<section class="kpis" aria-label="Key metrics">`)
	for _, card := range cards {
		fmt.Fprintf(b, `<div class="kpi"><div class="label">%s</div><div class="value">%s</div><div class="note">%s</div></div>`,
			html.EscapeString(card.label), html.EscapeString(card.value), html.EscapeString(card.note))
	}
	b.WriteString(`</section>`)
}

func writeTrend(b *strings.Builder, r report) {
	rows := r.Dimensions["trend"]
	b.WriteString(`<section class="panel"><div class="panel-head"><div><span class="eyebrow">Daily shape</span><h2>Calls and errors</h2></div><p class="note">Each bar is a day. The clay base is errors; the teal body is successful traffic.</p></div>`)
	if len(rows) == 0 {
		b.WriteString(`<p class="empty">No daily rows in this window.</p></section>`)
		return
	}

	const width, height = 860.0, 250.0
	const left, right, top, bottom = 48.0, 16.0, 14.0, 34.0
	plotW := width - left - right
	plotH := height - top - bottom
	maxCalls := int64(1)
	for _, row := range rows {
		if row.Calls > maxCalls {
			maxCalls = row.Calls
		}
	}

	fmt.Fprintf(b, `<svg class="chart" viewBox="0 0 %.0f %.0f" role="img" aria-label="Daily calls with errors at the base of each bar">`, width, height)
	for i := 0; i <= 4; i++ {
		y := top + plotH - plotH*float64(i)/4
		value := float64(maxCalls) * float64(i) / 4
		fmt.Fprintf(b, `<line class="grid" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>`, left, y, width-right, y)
		fmt.Fprintf(b, `<text class="axis" x="%.1f" y="%.1f" text-anchor="end">%s</text>`, left-8, y+4, formatInt(int64(value)))
	}

	gap := plotW / float64(len(rows))
	barW := gap * 0.62
	if barW < 2 {
		barW = 2
	}
	if barW > 28 {
		barW = 28
	}
	for i, row := range rows {
		x := left + gap*(float64(i)+0.5) - barW/2
		hCalls := float64(row.Calls) / float64(maxCalls) * plotH
		if row.Calls > 0 && hCalls < 1 {
			hCalls = 1
		}
		y := top + plotH - hCalls
		fmt.Fprintf(b, `<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2" fill="var(--tide)"/>`, x, y, barW, hCalls)
		if row.Errors > 0 {
			hErrors := float64(row.Errors) / float64(maxCalls) * plotH
			if hErrors < 1 {
				hErrors = 1
			}
			fmt.Fprintf(b, `<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2" fill="var(--clay)"/>`, x, top+plotH-hErrors, barW, hErrors)
		}
		if i == 0 || i == len(rows)-1 || i%7 == 0 {
			fmt.Fprintf(b, `<text class="axis" x="%.1f" y="%.1f" text-anchor="middle">%s</text>`, x+barW/2, height-10, shortDay(row.Value))
		}
	}
	b.WriteString(`</svg>`)
	fmt.Fprintf(b, `<div class="legend-row"><span><span class="dot tide"></span> Calls</span><span><span class="dot clay"></span> Errors</span><span>Peak day: %s calls</span></div>`, formatInt(maxCalls))
	b.WriteString(`</section>`)
}

func writeBarsSection(b *strings.Builder, r report, dimension, eyebrow, title, note string, limit int) {
	rows := r.Dimensions[dimension]
	if dimension == "tool" {
		rows = filterToolRows(rows)
	}
	b.WriteString(`<section class="panel"><div class="panel-head"><div><span class="eyebrow">` + html.EscapeString(eyebrow) + `</span><h2>` + html.EscapeString(title) + `</h2></div><p class="note">` + html.EscapeString(note) + `</p></div>`)
	if len(rows) == 0 {
		b.WriteString(`<p class="empty">No rows in this window.</p></section>`)
		return
	}
	if len(rows) > limit {
		rows = rows[:limit]
	}
	maxCalls := int64(1)
	for _, row := range rows {
		if row.Calls > maxCalls {
			maxCalls = row.Calls
		}
	}

	nameHeader := map[string]string{"provider": "Provider", "country": "Country", "client": "Client", "tool": "Tool"}[dimension]
	clientHeader := "Clients"
	if r.Source == "rollup" {
		clientHeader = "Client-days"
	}

	b.WriteString(`<div class="table-wrap"><table><caption class="sr-only">` + html.EscapeString(title) + `</caption><thead><tr>`)
	fmt.Fprintf(b, `<th>%s</th><th class="num">Calls</th><th>Volume</th><th class="num">%s</th><th class="num">Errors</th><th class="num hide-sm">Cache</th><th class="num hide-sm">Avg</th>`,
		html.EscapeString(nameHeader), html.EscapeString(clientHeader))
	b.WriteString(`</tr></thead><tbody>`)
	for _, row := range rows {
		share := float64(row.Calls) / float64(maxCalls) * 100
		errClass := "num"
		if row.Errors > 0 {
			errClass = "num err"
		}
		fmt.Fprintf(b, `<tr><td><span class="name">%s</span></td><td class="num">%s</td><td><div class="share"><div class="share-track"><div class="share-fill" style="width:%.1f%%"></div></div></div></td><td class="num">%s</td><td class="%s">%s</td><td class="num hide-sm">%s</td><td class="num hide-sm">%s</td></tr>`,
			html.EscapeString(row.Value),
			formatInt(row.Calls),
			share,
			formatInt(row.Clients),
			errClass,
			formatInt(row.Errors),
			formatPct(row.CacheHit, row.Calls),
			formatMs(row.AvgMs),
		)
	}
	b.WriteString(`</tbody></table></div></section>`)
}

func writeTopics(b *strings.Builder, r report) {
	b.WriteString(`<section class="panel"><div class="panel-head"><div><span class="eyebrow">Demand</span><h2>What people ask for</h2></div><p class="note">Derived from tool families, not raw query text.</p></div>`)
	if len(r.Topics) == 0 {
		b.WriteString(`<p class="empty">Topic mix requires the tool dimension.</p></section>`)
		return
	}

	colors := []string{"#2e7d76", "#9bc23e", "#e6a37a", "#6d8f99", "#b7c9c4"}
	var stops []string
	cumulative := 0.0
	var total int64
	for i, topic := range r.Topics {
		total += topic.Calls
		end := cumulative + topic.Share
		if end > 100 {
			end = 100
		}
		stops = append(stops, fmt.Sprintf("%s %.2f%% %.2f%%", colors[i%len(colors)], cumulative, end))
		cumulative = end
	}
	gradient := "conic-gradient(" + strings.Join(stops, ", ") + ")"

	b.WriteString(`<div class="topic-grid"><div>`)
	fmt.Fprintf(b, `<div class="donut" style="background:%s" role="img" aria-label="Tool calls by topic"><div class="donut-hole"><strong>%s</strong><span>tool calls</span></div></div>`, gradient, formatInt(total))
	b.WriteString(`</div><div class="topic-list">`)
	for i, topic := range r.Topics {
		fmt.Fprintf(b, `<div class="topic-row"><span class="dot" style="background:%s"></span><span class="topic-name">%s</span><span class="topic-calls">%s calls</span><span class="topic-calls">%.1f%%</span></div>`,
			colors[i%len(colors)], html.EscapeString(topic.Name), formatInt(topic.Calls), topic.Share)
	}
	b.WriteString(`</div></div></section>`)
}

func writeMethod(b *strings.Builder, r report) {
	latest := r.LatestDay
	if latest == "" {
		latest = "not rolled up yet"
	}
	minCalls := r.MinCalls
	if minCalls == 0 {
		minCalls = 10
	}
	suppression := "Internal view; no suppression."
	if r.Public {
		suppression = fmt.Sprintf("Cells below %d calls are omitted in this public view.", minCalls)
	}

	b.WriteString(`<section class="method"><div class="panel-head"><div><span class="eyebrow">Method</span><h2>How to read this page</h2></div></div><div class="method-grid">`)
	fmt.Fprintf(b, `<div class="method-card"><h3>Source</h3><p>Daily rollups in <code>mcp_stats_daily</code>, generated by the <code>waqf-mcp-api</code> Worker.</p></div>`)
	fmt.Fprintf(b, `<div class="method-card"><h3>Freshness</h3><p>The cron runs daily at 00:15 UTC. Latest rollup: <strong>%s</strong>.</p></div>`, html.EscapeString(latest))
	fmt.Fprintf(b, `<div class="method-card"><h3>Privacy</h3><p>No raw queries, IP hashes, user agents, city or region. %s</p><p>Country and agent tables count tool calls only; the top-line calls and trend include protocol traffic.</p></div>`, html.EscapeString(suppression))
	fmt.Fprintf(b, `<div class="method-card"><h3>Regenerate</h3><p>Rebuild this page from the rollup.</p><code>go run ./scripts/stats-report/ -days 30 -public -min-calls 10 -format html -output analytics/index.html</code></div>`)
	b.WriteString(`</div></section>`)
}

func filterToolRows(rows []metricRow) []metricRow {
	out := make([]metricRow, 0, len(rows))
	for _, row := range rows {
		if row.Value != "(non-tool)" {
			out = append(out, row)
		}
	}
	return out
}

func shortDay(day string) string {
	parsed, err := time.Parse("2006-01-02", day)
	if err != nil {
		return day
	}
	return parsed.Format("Jan 2")
}

func formatInt(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	s := strconv.FormatInt(n, 10)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return sign + s
}

func formatPct(part, total int64) string {
	return fmt.Sprintf("%.1f%%", percent(part, total))
}

func formatMs(ms float64) string {
	if ms >= 1000 {
		return fmt.Sprintf("%.1f s", ms/1000)
	}
	return fmt.Sprintf("%.0f ms", ms)
}
