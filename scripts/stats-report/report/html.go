package report

import (
	"fmt"
	"html"
	"strconv"
	"strings"
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
  --arabic: "Noto Sans Arabic", "Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif;
  --arabic-display: "Noto Naskh Arabic", "Amiri", "Noto Kufi Arabic", serif;
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
html[lang="ar"] body { font-family: var(--arabic); }
a { color: var(--tide); text-underline-offset: 3px; }
.wrap { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
.hero {
  position: relative;
  overflow: hidden;
  color: #eef5f2;
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
html[lang="ar"] .hero h1,
html[lang="ar"] .panel h2,
html[lang="ar"] .method-card h3 {
  font-family: var(--arabic-display);
  letter-spacing: 0;
}
html[lang="ar"] .hero h1 { line-height: 1.18; font-size: clamp(2.4rem, 5.4vw, 4.1rem); }
.eyebrow {
  display: inline-block;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--tide);
}
html[lang="ar"] .eyebrow { letter-spacing: .04em; }
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
.chip strong { color: #eef5f2; font-weight: 600; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.lang-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(238, 245, 242, .25);
  color: #eef5f2;
  text-decoration: none;
  font-size: .82rem;
  padding: 10px 14px;
  border-radius: 999px;
  white-space: nowrap;
}
.lang-switch:hover { border-color: var(--lime); color: var(--lime); }
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
html[lang="ar"] .name { direction: ltr; unicode-bidi: isolate; }
.err { color: var(--clay-ink); }
.share { min-width: 110px; }
.share-track { height: 7px; background: var(--line); border-radius: 999px; overflow: hidden; }
.share-fill { height: 100%; background: linear-gradient(90deg, var(--tide), var(--lime)); border-radius: 999px; }
.chart { width: 100%; height: auto; display: block; direction: ltr; }
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
  direction: ltr;
  text-align: start;
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
    --tide: #5fb7ae;
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
  .hero::after, .download, .lang-switch { display: none; }
  .lede, .chip { color: #333; }
  .panel, .kpi, .method-card { box-shadow: none; border-color: #ddd; break-inside: avoid; }
}
`

func renderHTML(r report, lang string) string {
	loc := localeFor(lang)
	source := r.Source
	if source == "" {
		source = "rollup"
	}
	latest := r.LatestDay
	if latest == "" {
		latest = tr(lang, "latest_empty")
	}
	view := tr(lang, "internal_view")
	if r.Public {
		view = fmt.Sprintf(tr(lang, "public_safe"), r.MinCalls)
	}

	var b strings.Builder
	b.WriteString(`<!doctype html>
<html lang="`)
	b.WriteString(html.EscapeString(loc.code))
	b.WriteString(`" dir="`)
	b.WriteString(html.EscapeString(loc.dir))
	b.WriteString(`">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
`)
	fmt.Fprintf(&b, `<title>%s</title>
<meta name="description" content="%s">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
<meta property="og:locale" content="%s">
<meta property="og:locale:alternate" content="%s">
<meta name="theme-color" content="#112b38">
<link rel="alternate" hreflang="%s" href="%s">
<link rel="alternate" hreflang="%s" href="%s">
<style>`,
		html.EscapeString(tr(lang, "title")),
		html.EscapeString(tr(lang, "description")),
		html.EscapeString(tr(lang, "og_title")),
		html.EscapeString(tr(lang, "og_description")),
		html.EscapeString(loc.ogLocale),
		html.EscapeString(loc.ogLocaleForOther()),
		html.EscapeString(loc.code), html.EscapeString(loc.selfHref),
		html.EscapeString(loc.otherCode), html.EscapeString(loc.otherHref),
	)
	b.WriteString(htmlStyles)
	b.WriteString(`</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <div class="hero-row">
      <div>
`)
	fmt.Fprintf(&b, `<span class="eyebrow">%s</span>`, html.EscapeString(tr(lang, "eyebrow")))
	fmt.Fprintf(&b, `<h1>%s<br>%s</h1>`, html.EscapeString(tr(lang, "h1a")), html.EscapeString(tr(lang, "h1b")))
	fmt.Fprintf(&b, `<p class="lede">%s</p>`, html.EscapeString(tr(lang, "lede")))
	b.WriteString(`      </div>
      <div class="hero-actions">
`)
	fmt.Fprintf(&b, `<a class="lang-switch" href="%s" lang="%s" dir="%s">%s</a>`,
		html.EscapeString(loc.otherHref), html.EscapeString(loc.otherCode), html.EscapeString(loc.otherDir), html.EscapeString(loc.otherName))
	fmt.Fprintf(&b, `<a class="download" href="%s">%s</a>`, html.EscapeString(loc.jsonHref), html.EscapeString(tr(lang, "download")))
	b.WriteString(`      </div>
    </div>
`)
	fmt.Fprintf(&b, `<div class="chips"><span class="chip">%s <strong>%s</strong></span><span class="chip">%s <strong>%s</strong></span><span class="chip">%s <strong>%s</strong></span><span class="chip">%s</span></div>`,
		html.EscapeString(tr(lang, "window")), ltr(lang, r.Since),
		html.EscapeString(tr(lang, "latest")), ltr(lang, latest),
		html.EscapeString(tr(lang, "cron")), ltr(lang, "00:15 UTC"),
		html.EscapeString(view))
	b.WriteString(`
  </div>
</header>
<main class="wrap">
`)
	writeKPIs(&b, r, lang)
	fmt.Fprintf(&b, `<p class="data-note">%s</p>`, html.EscapeString(tr(lang, "data_note")))
	writeTrend(&b, r, lang)
	writeBarsSection(&b, r, "provider", tr(lang, "providers_eyebrow"), tr(lang, "providers_title"), tr(lang, "providers_note"), lang, 12)
	writeBarsSection(&b, r, "country", tr(lang, "countries_eyebrow"), tr(lang, "countries_title"), tr(lang, "countries_note"), lang, 15)
	writeBarsSection(&b, r, "client", tr(lang, "agents_eyebrow"), tr(lang, "agents_title"), tr(lang, "agents_note"), lang, 12)
	writeBarsSection(&b, r, "tool", tr(lang, "tools_eyebrow"), tr(lang, "tools_title"), tr(lang, "tools_note"), lang, 15)
	writeTopics(&b, r, lang)
	writeMethod(&b, r, lang)
	b.WriteString(`</main>
`)
	fmt.Fprintf(&b, `<footer class="footer"><div class="wrap">%s</div></footer>`,
		fmt.Sprintf(tr(lang, "footer"), ltr(lang, r.GeneratedAt), html.EscapeString(source), html.EscapeString(loc.jsonHref)))
	b.WriteString(`
</body>
</html>
`)
	return b.String()
}

func (loc locale) ogLocaleForOther() string {
	if loc.otherCode == "ar" {
		return "ar_AR"
	}
	return "en_US"
}

func writeKPIs(b *strings.Builder, r report, lang string) {
	cards := []struct{ label, value, note string }{
		{tr(lang, "kpi_calls"), formatInt(r.Summary.Calls), tr(lang, "kpi_calls_note")},
		{tr(lang, "kpi_errors"), formatPct(r.Summary.Errors, r.Summary.Calls), fmt.Sprintf(tr(lang, "kpi_errors_note"), formatInt(r.Summary.Errors))},
		{tr(lang, "kpi_cache"), formatPct(r.Summary.CacheHits, r.Summary.Calls), fmt.Sprintf(tr(lang, "kpi_cache_note"), formatInt(r.Summary.CacheHits))},
		{tr(lang, "kpi_clients"), formatInt(r.Summary.UniqueClients), tr(lang, "kpi_clients_note")},
		{tr(lang, "kpi_avg"), formatMs(r.Summary.AvgMs), tr(lang, "kpi_avg_note")},
		{tr(lang, "kpi_max"), formatMs(float64(r.Summary.MaxMs)), tr(lang, "kpi_max_note")},
		{tr(lang, "kpi_providers"), formatInt(int64(len(r.Dimensions["provider"]))), tr(lang, "kpi_providers_note")},
		{tr(lang, "kpi_countries"), formatInt(int64(len(r.Dimensions["country"]))), tr(lang, "kpi_countries_note")},
	}
	b.WriteString(`<section class="kpis" aria-label="` + html.EscapeString(tr(lang, "kpi_calls")) + `">`)
	for _, card := range cards {
		fmt.Fprintf(b, `<div class="kpi"><div class="label">%s</div><div class="value">%s</div><div class="note">%s</div></div>`,
			html.EscapeString(card.label), ltr(lang, card.value), html.EscapeString(card.note))
	}
	b.WriteString(`</section>`)
}

func writeTrend(b *strings.Builder, r report, lang string) {
	rows := r.Dimensions["trend"]
	b.WriteString(`<section class="panel"><div class="panel-head"><div><span class="eyebrow">` + html.EscapeString(tr(lang, "trend_eyebrow")) + `</span><h2>` + html.EscapeString(tr(lang, "trend_title")) + `</h2></div><p class="note">` + html.EscapeString(tr(lang, "trend_note")) + `</p></div>`)
	if len(rows) == 0 {
		b.WriteString(`<p class="empty">` + html.EscapeString(tr(lang, "no_daily")) + `</p></section>`)
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

	fmt.Fprintf(b, `<svg class="chart" viewBox="0 0 %.0f %.0f" role="img" aria-label="%s">`, width, height, html.EscapeString(tr(lang, "trend_aria")))
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
			fmt.Fprintf(b, `<text class="axis" x="%.1f" y="%.1f" text-anchor="middle">%s</text>`, x+barW/2, height-10, html.EscapeString(shortDay(row.Value, lang)))
		}
	}
	b.WriteString(`</svg>`)
	fmt.Fprintf(b, `<div class="legend-row"><span><span class="dot tide"></span> %s</span><span><span class="dot clay"></span> %s</span><span>%s</span></div>`,
		html.EscapeString(tr(lang, "legend_calls")), html.EscapeString(tr(lang, "legend_errors")),
		fmt.Sprintf(tr(lang, "peak_day"), ltr(lang, formatInt(maxCalls))))
	b.WriteString(`</section>`)
}

func writeBarsSection(b *strings.Builder, r report, dimension, eyebrow, title, note, lang string, limit int) {
	rows := r.Dimensions[dimension]
	if dimension == "tool" {
		rows = filterToolRows(rows)
	}
	b.WriteString(`<section class="panel"><div class="panel-head"><div><span class="eyebrow">` + html.EscapeString(eyebrow) + `</span><h2>` + html.EscapeString(title) + `</h2></div><p class="note">` + html.EscapeString(note) + `</p></div>`)
	if len(rows) == 0 {
		b.WriteString(`<p class="empty">` + html.EscapeString(tr(lang, "no_rows")) + `</p></section>`)
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

	nameHeader := tr(lang, "table_name_"+dimension)
	clientHeader := tr(lang, "table_clients")
	if r.Source == "rollup" {
		clientHeader = tr(lang, "table_client_days")
	}

	b.WriteString(`<div class="table-wrap"><table><caption class="sr-only">` + html.EscapeString(title) + `</caption><thead><tr>`)
	fmt.Fprintf(b, `<th>%s</th><th class="num">%s</th><th>%s</th><th class="num">%s</th><th class="num">%s</th><th class="num hide-sm">%s</th><th class="num hide-sm">%s</th>`,
		html.EscapeString(nameHeader), html.EscapeString(tr(lang, "table_calls")), html.EscapeString(tr(lang, "table_volume")),
		html.EscapeString(clientHeader), html.EscapeString(tr(lang, "table_errors")),
		html.EscapeString(tr(lang, "table_cache")), html.EscapeString(tr(lang, "table_avg")))
	b.WriteString(`</tr></thead><tbody>`)
	for _, row := range rows {
		share := float64(row.Calls) / float64(maxCalls) * 100
		errClass := "num"
		if row.Errors > 0 {
			errClass = "num err"
		}
		fmt.Fprintf(b, `<tr><td><span class="name">%s</span></td><td class="num">%s</td><td><div class="share"><div class="share-track"><div class="share-fill" style="width:%.1f%%"></div></div></div></td><td class="num">%s</td><td class="%s">%s</td><td class="num hide-sm">%s</td><td class="num hide-sm">%s</td></tr>`,
			html.EscapeString(displayValue(lang, dimension, row.Value)),
			ltr(lang, formatInt(row.Calls)),
			share,
			ltr(lang, formatInt(row.Clients)),
			errClass,
			ltr(lang, formatInt(row.Errors)),
			ltr(lang, formatPct(row.CacheHit, row.Calls)),
			ltr(lang, formatMs(row.AvgMs)),
		)
	}
	b.WriteString(`</tbody></table></div></section>`)
}

func writeTopics(b *strings.Builder, r report, lang string) {
	b.WriteString(`<section class="panel"><div class="panel-head"><div><span class="eyebrow">` + html.EscapeString(tr(lang, "topics_eyebrow")) + `</span><h2>` + html.EscapeString(tr(lang, "topics_title")) + `</h2></div><p class="note">` + html.EscapeString(tr(lang, "topics_note")) + `</p></div>`)
	if len(r.Topics) == 0 {
		b.WriteString(`<p class="empty">` + html.EscapeString(tr(lang, "no_topics")) + `</p></section>`)
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
	fmt.Fprintf(b, `<div class="donut" style="background:%s" role="img" aria-label="%s"><div class="donut-hole"><strong>%s</strong><span>%s</span></div></div>`,
		gradient, html.EscapeString(tr(lang, "topics_title")), formatInt(total), html.EscapeString(tr(lang, "topic_calls_short")))
	b.WriteString(`</div><div class="topic-list">`)
	for i, topic := range r.Topics {
		fmt.Fprintf(b, `<div class="topic-row"><span class="dot" style="background:%s"></span><span class="topic-name">%s</span><span class="topic-calls">%s</span><span class="topic-calls">%s</span></div>`,
			colors[i%len(colors)], html.EscapeString(topicLabel(lang, topic.Name)),
			fmt.Sprintf(tr(lang, "topic_calls"), ltr(lang, formatInt(topic.Calls))),
			ltr(lang, fmt.Sprintf("%.1f%%", topic.Share)))
	}
	b.WriteString(`</div></div></section>`)
}

func writeMethod(b *strings.Builder, r report, lang string) {
	latest := r.LatestDay
	if latest == "" {
		latest = tr(lang, "latest_empty")
	}
	minCalls := r.MinCalls
	if minCalls == 0 {
		minCalls = 10
	}
	suppression := tr(lang, "suppression_internal")
	if r.Public {
		suppression = fmt.Sprintf(tr(lang, "suppression_public"), minCalls)
	}

	b.WriteString(`<section class="method"><div class="panel-head"><div><span class="eyebrow">` + html.EscapeString(tr(lang, "method_eyebrow")) + `</span><h2>` + html.EscapeString(tr(lang, "method_title")) + `</h2></div></div><div class="method-grid">`)
	fmt.Fprintf(b, `<div class="method-card"><h3>%s</h3><p>%s</p></div>`, html.EscapeString(tr(lang, "source_title")), tr(lang, "source_text"))
	fmt.Fprintf(b, `<div class="method-card"><h3>%s</h3><p>%s</p></div>`, html.EscapeString(tr(lang, "freshness_title")), fmt.Sprintf(tr(lang, "freshness_text"), ltr(lang, latest)))
	fmt.Fprintf(b, `<div class="method-card"><h3>%s</h3><p>%s</p><p>%s</p></div>`, html.EscapeString(tr(lang, "privacy_title")), fmt.Sprintf(tr(lang, "privacy_text"), html.EscapeString(suppression)), html.EscapeString(tr(lang, "tool_only_note")))
	fmt.Fprintf(b, `<div class="method-card"><h3>%s</h3><p>%s</p><code>%s</code></div>`, html.EscapeString(tr(lang, "regenerate_title")), html.EscapeString(tr(lang, "regenerate_text")), html.EscapeString(tr(lang, "regenerate_command")))
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

func ltr(lang, value string) string {
	if lang == "ar" {
		return `<bdi dir="ltr">` + html.EscapeString(value) + `</bdi>`
	}
	return html.EscapeString(value)
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
