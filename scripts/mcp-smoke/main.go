// Command mcp-smoke exercises every advertised MCP tool, resource and prompt
// over the public HTTP endpoint and records status, latency, bytes and errors.
//
// It is deliberately read-only. It uses no credentials and no admin endpoints.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"text/tabwriter"
	"time"
)

const defaultBase = "https://mcp.waqf.app/mcp"

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *rpcError       `json:"error"`
}

type toolDefinition struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type toolResult struct {
	IsError bool `json:"isError"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
}

type resourceDefinition struct {
	URI  string `json:"uri"`
	Name string `json:"name"`
}

type promptDefinition struct {
	Name      string `json:"name"`
	Arguments []struct {
		Name     string `json:"name"`
		Required bool   `json:"required"`
	} `json:"arguments"`
}

type attempt struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	HTTPStatus int    `json:"http_status"`
	LatencyMs  int64  `json:"latency_ms"`
	Bytes      int    `json:"bytes"`
	Class      string `json:"class"`
	Detail     string `json:"detail,omitempty"`
}

type smokeReport struct {
	BaseURL     string    `json:"base_url"`
	StartedAt   time.Time `json:"started_at"`
	FinishedAt  time.Time `json:"finished_at"`
	Initialize  attempt   `json:"initialize"`
	ToolCount   int       `json:"tool_count"`
	ToolMissing []string  `json:"tool_missing_args"`
	Attempts    []attempt `json:"attempts"`
	Summary     string    `json:"summary"`
}

type client struct {
	base      string
	http      *http.Client
	userAgent string
}

var toolArgs = map[string]map[string]any{
	"waqf_quran_get_ayah":      {"surah": 1, "ayah": 1},
	"waqf_hadith_search":       {"query": "الصلاة", "limit": 3},
	"waqf_turath_search_books": {"query": "الصلاة"},
	"waqf_search_scholarship":  {"query": "الصلاة"},
	"waqf_books_search":        {"query": "الصلاة", "limit": 3},
	"waqf_books_read_page":     {"fileId": 65664, "pageNumber": 247, "maxChars": 2000},

	"tafsir_net__fetch_ayah":            {"surah": 1, "ayah": 1},
	"tafsir_net__fetch_tafsir":          {"surah": 1, "ayah": 1},
	"tafsir_net__list_tafsir_sources":   {},
	"tafsir_net__list_science_sources":  {},
	"tafsir_net__list_all_sources":      {},
	"tafsir_net__list_sources_for_ayah": {"surah": 1, "ayah": 1},
	"tafsir_net__fetch_nuzool_reason":   {"surah": 1, "ayah": 1},
	"tafsir_net__fetch_surah_info":      {"surah": 1},
	"tafsir_net__analyze_word":          {"surah": 1, "ayah": 1, "word_no": 1},
	"tafsir_net__find_root_occurrences": {"root": "كتب", "limit": 3},
	"tafsir_net__get_root_stats":        {"root": "كتب"},
	"tafsir_net__get_qeraat_variants":   {"surah": 1, "ayah": 1},
	"tafsir_net__search_quran_text":     {"query": "الصلاة", "limit": 3},
	"tafsir_net__search_in_tafsir":      {"query": "الصلاة", "limit": 3},
	"tafsir_net__get_quran_overview":    {},
	"tafsir_net__get_page_fawaed":       {"page": 1},
	"tafsir_net__get_surah_statistics":  {"surah": 1},

	"bahouth__get_verse":             {"verse_key": "1:1"},
	"bahouth__list_surah_verses":     {"surah_id": 112},
	"bahouth__list_verse_words":      {"verse_key": "1:1"},
	"bahouth__find_root":             {"root_text": "كتب"},
	"bahouth__list_root_verses":      {"root_text": "كتب", "limit": 3},
	"bahouth__list_verse_properties": {"verse_key": "1:1"},
	"bahouth__list_verse_qiraat":     {"verse_key": "1:1"},
	"bahouth__list_verse_topics":     {"verse_key": "1:1"},
	"bahouth__list_topic_verses":     {"topic_id": 126, "limit": 3},

	"turath__discover_turath": {"q": "الصلاة", "kind": "books", "limit": 3},
	"turath__search_turath":   {"q": "الصلاة", "limit": 3},
	"turath__get_book":        {"book_id": 2051},
	"turath__get_page":        {"book_id": 2051, "page_id": 1203},
	"turath__get_author":      {"author_id": 614},

	"maheralfahel__list-books":     {},
	"maheralfahel__get-book":       {"id": "ilal"},
	"maheralfahel__list-media":     {},
	"maheralfahel__search-content": {"query": "الصلاة"},
	"maheralfahel__get-site-info":  {},

	"fihris__search_islamic_sources": {"query": "الصلاة"},
	"fihris__list_indexed_sources":   {},

	"aljam3__search":          {"q": "الصلاة", "per_page": 3},
	"aljam3__list_books":      {"q": "الصلاة", "per_page": 3},
	"aljam3__get_book":        {"id": 34672, "per_page": 2},
	"aljam3__get_page":        {"file_id": 65664, "page_number": 247, "max_chars": 2000},
	"aljam3__list_authors":    {"q": "ابن", "per_page": 3},
	"aljam3__list_categories": {"per_page": 3},
	"aljam3__list_libraries":  {"per_page": 3},

	"shamela__shamela_find":        {"keywords": []string{"الصلاة"}},
	"shamela__shamela_find_scoped": {"query": "الصلاة", "limit": 3},
	"shamela__shamela_open":        {"book_id": 587, "page_id": 95, "max_chars": 2000},
	"shamela__shamela_open_many":   {"pages": []map[string]any{{"book_id": 587, "page_id": 95}, {"book_id": 6161, "page_id": 233}}, "max_total_chars": 4000},
}

func main() {
	base := flag.String("base", defaultBase, "MCP endpoint URL")
	delay := flag.Duration("delay", 200*time.Millisecond, "pause between tool calls")
	timeout := flag.Duration("timeout", 45*time.Second, "HTTP timeout per request")
	jsonOut := flag.String("json", "", "optional path for a JSON report")
	strict := flag.Bool("strict", false, "exit non-zero on transport/protocol errors, missing tools or missing sample arguments")
	strictTools := flag.Bool("strict-tools", false, "also exit non-zero on unexpected tool errors")
	expectTools := flag.Int("expect-tools", 55, "expected advertised tool count; 0 disables")
	flag.Parse()

	c := &client{
		base:      *base,
		http:      &http.Client{Timeout: *timeout},
		userAgent: "WaqfMCP-Smoke/1.0 (+https://mcp.waqf.dev)",
	}

	report := smokeReport{BaseURL: *base, StartedAt: time.Now().UTC()}
	if init, err := c.initialize(); err != nil {
		fail("initialize: " + err.Error())
	} else {
		report.Initialize = init
	}

	// A notification must be accepted with 202 and no body.
	notification, err := c.notification()
	if err != nil {
		fail("notifications/initialized: " + err.Error())
	}
	report.Attempts = append(report.Attempts, notification)

	tools, err := c.listTools("?suite=all")
	if err != nil {
		fail("tools/list: " + err.Error())
	}
	report.ToolCount = len(tools)
	for _, tool := range tools {
		if _, ok := toolArgs[tool.Name]; !ok {
			report.ToolMissing = append(report.ToolMissing, tool.Name)
		}
	}

	resources, err := c.listResources()
	if err != nil {
		fail("resources/list: " + err.Error())
	}
	prompts, err := c.listPrompts()
	if err != nil {
		fail("prompts/list: " + err.Error())
	}

	for _, tool := range tools {
		args := toolArgs[tool.Name]
		if args == nil {
			args = map[string]any{}
		}
		attempt := c.callTool(tool.Name, args)
		report.Attempts = append(report.Attempts, attempt)
		time.Sleep(*delay)
	}

	for _, resource := range resources {
		attempt := c.readResource(resource.URI)
		attempt.Name = resource.Name + " (" + resource.URI + ")"
		report.Attempts = append(report.Attempts, attempt)
		time.Sleep(*delay)
	}

	for _, prompt := range prompts {
		args := promptArgs(prompt)
		attempt := c.getPrompt(prompt.Name, args)
		report.Attempts = append(report.Attempts, attempt)
		time.Sleep(*delay)
	}

	// Baseline and security/transport checks.
	report.Attempts = append(report.Attempts, c.ping())
	report.Attempts = append(report.Attempts, c.listToolsAttempt("?suite=core", "core tools/list"))
	report.Attempts = append(report.Attempts, c.unknownTool())
	report.Attempts = append(report.Attempts, c.getJSON())
	report.Attempts = append(report.Attempts, c.getSSE())
	report.Attempts = append(report.Attempts, c.optionsCORS())
	report.Attempts = append(report.Attempts, c.securityProbe("/.env"))
	report.Attempts = append(report.Attempts, c.securityProbe("/.git/config"))
	report.Attempts = append(report.Attempts, c.securityProbe("/api/stats"))

	if devInit, err := c.initializeAt("https://mcp.waqf.dev/mcp"); err != nil {
		report.Attempts = append(report.Attempts, attempt{Kind: "transport", Name: "mcp.waqf.dev initialize", Class: "HTTP_ERROR", Detail: err.Error()})
	} else {
		devInit.Name = "mcp.waqf.dev initialize"
		report.Attempts = append(report.Attempts, devInit)
	}

	report.FinishedAt = time.Now().UTC()
	report.Summary = summarize(report.Attempts)
	printReport(report)
	if *jsonOut != "" {
		encoded, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			fail("encode json: " + err.Error())
		}
		if err := os.WriteFile(*jsonOut, append(encoded, '\n'), 0o644); err != nil {
			fail("write json: " + err.Error())
		}
		fmt.Fprintf(os.Stderr, "wrote %s\n", *jsonOut)
	}

	if *strict {
		failures := strictFailures(report, *expectTools, *strictTools)
		if len(failures) > 0 {
			fmt.Fprintln(os.Stderr, "strict smoke check failed:")
			for _, failure := range failures {
				fmt.Fprintln(os.Stderr, "- "+failure)
			}
			os.Exit(1)
		}
		fmt.Println("strict smoke check passed")
	}
}

func strictFailures(report smokeReport, expectTools int, strictTools bool) []string {
	var failures []string
	if expectTools > 0 && report.ToolCount != expectTools {
		failures = append(failures, fmt.Sprintf("tools listed %d, expected %d", report.ToolCount, expectTools))
	}
	if len(report.ToolMissing) > 0 {
		failures = append(failures, "missing sample arguments: "+strings.Join(report.ToolMissing, ", "))
	}
	for _, a := range report.Attempts {
		switch a.Class {
		case "HTTP_ERROR", "PROTOCOL_ERROR":
			failures = append(failures, fmt.Sprintf("%s %s: %s (%s)", a.Kind, a.Name, a.Class, a.Detail))
		case "TOOL_ERROR":
			if strictTools && a.Name != "waqf_search" {
				failures = append(failures, fmt.Sprintf("%s %s: %s (%s)", a.Kind, a.Name, a.Class, a.Detail))
			}
		}
	}
	return failures
}

func (c *client) initialize() (attempt, error) {
	return c.initializeAt(c.base)
}

func (c *client) initializeAt(base string) (attempt, error) {
	body := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": "2025-06-18",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "WaqfMCP-Smoke", "version": "1.0.0"},
		},
	}
	res, err := c.post(base, body)
	if err != nil {
		return attempt{}, err
	}
	a := c.toAttempt("initialize", "initialize", res)
	if a.Class != "OK" {
		return a, nil
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = "invalid JSON: " + err.Error()
		return a, nil
	}
	if parsed.Error != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = fmt.Sprintf("%d %s", parsed.Error.Code, parsed.Error.Message)
		return a, nil
	}
	var initResult struct {
		ProtocolVersion string `json:"protocolVersion"`
		ServerInfo      struct {
			Name string `json:"name"`
		} `json:"serverInfo"`
	}
	_ = json.Unmarshal(parsed.Result, &initResult)
	a.Class = "OK"
	a.Detail = fmt.Sprintf("%s %s", initResult.ServerInfo.Name, initResult.ProtocolVersion)
	return a, nil
}

func (c *client) notification() (attempt, error) {
	body := map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}
	start := time.Now()
	req, err := http.NewRequest("POST", c.base, bytes.NewReader(mustJSON(body)))
	if err != nil {
		return attempt{}, err
	}
	c.setHeaders(req)
	res, err := c.http.Do(req)
	if err != nil {
		return attempt{}, err
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	a := attempt{
		Kind: "transport", Name: "notifications/initialized", HTTPStatus: res.StatusCode,
		LatencyMs: time.Since(start).Milliseconds(), Bytes: len(payload),
		Class: "OK", Detail: "202 with no body",
	}
	if res.StatusCode != 202 {
		a.Class = "HTTP_ERROR"
		a.Detail = fmt.Sprintf("expected 202, got %d", res.StatusCode)
	}
	return a, nil
}

func (c *client) listTools(query string) ([]toolDefinition, error) {
	body := map[string]any{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": map[string]any{}}
	res, err := c.post(c.base+query, body)
	if err != nil {
		return nil, err
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("%d %s", parsed.Error.Code, parsed.Error.Message)
	}
	var wrapper struct {
		Tools []toolDefinition `json:"tools"`
	}
	if err := json.Unmarshal(parsed.Result, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Tools, nil
}

func (c *client) listToolsAttempt(query, name string) attempt {
	body := map[string]any{"jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": map[string]any{}}
	res, err := c.post(c.base+query, body)
	if err != nil {
		return attempt{Kind: "transport", Name: name, Class: "HTTP_ERROR", Detail: err.Error()}
	}
	a := c.toAttempt("transport", name, res)
	if a.Class != "OK" {
		return a
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil || parsed.Error != nil {
		a.Class = "PROTOCOL_ERROR"
		return a
	}
	var wrapper struct {
		Tools []toolDefinition `json:"tools"`
	}
	_ = json.Unmarshal(parsed.Result, &wrapper)
	a.Class = "OK"
	a.Detail = fmt.Sprintf("%d tools", len(wrapper.Tools))
	return a
}

func (c *client) listResources() ([]resourceDefinition, error) {
	body := map[string]any{"jsonrpc": "2.0", "id": 4, "method": "resources/list"}
	res, err := c.post(c.base, body)
	if err != nil {
		return nil, err
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("%d %s", parsed.Error.Code, parsed.Error.Message)
	}
	var wrapper struct {
		Resources []resourceDefinition `json:"resources"`
	}
	if err := json.Unmarshal(parsed.Result, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Resources, nil
}

func (c *client) listPrompts() ([]promptDefinition, error) {
	body := map[string]any{"jsonrpc": "2.0", "id": 5, "method": "prompts/list"}
	res, err := c.post(c.base, body)
	if err != nil {
		return nil, err
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("%d %s", parsed.Error.Code, parsed.Error.Message)
	}
	var wrapper struct {
		Prompts []promptDefinition `json:"prompts"`
	}
	if err := json.Unmarshal(parsed.Result, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Prompts, nil
}

func (c *client) callTool(name string, args map[string]any) attempt {
	body := map[string]any{
		"jsonrpc": "2.0",
		"id":      10,
		"method":  "tools/call",
		"params":  map[string]any{"name": name, "arguments": args},
	}
	res, err := c.post(c.base, body)
	if err != nil {
		return attempt{Kind: "tool", Name: name, Class: "HTTP_ERROR", Detail: err.Error()}
	}
	a := c.toAttempt("tool", name, res)
	if a.Class != "OK" {
		return a
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = "invalid JSON: " + err.Error()
		return a
	}
	if parsed.Error != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = fmt.Sprintf("%d %s", parsed.Error.Code, parsed.Error.Message)
		return a
	}
	var result toolResult
	if err := json.Unmarshal(parsed.Result, &result); err != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = "invalid tool result: " + err.Error()
		return a
	}
	if result.IsError {
		a.Class = "TOOL_ERROR"
		a.Detail = truncate(firstText(result), 220)
		return a
	}
	a.Class = "OK"
	a.Detail = truncate(firstText(result), 160)
	return a
}

func (c *client) readResource(uri string) attempt {
	body := map[string]any{
		"jsonrpc": "2.0",
		"id":      11,
		"method":  "resources/read",
		"params":  map[string]any{"uri": uri},
	}
	res, err := c.post(c.base, body)
	if err != nil {
		return attempt{Kind: "resource", Name: uri, Class: "HTTP_ERROR", Detail: err.Error()}
	}
	a := c.toAttempt("resource", uri, res)
	if a.Class != "OK" {
		return a
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = "invalid JSON"
		return a
	}
	if parsed.Error != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = fmt.Sprintf("%d %s", parsed.Error.Code, parsed.Error.Message)
		return a
	}
	var wrapper struct {
		Contents []struct {
			Text string `json:"text"`
		} `json:"contents"`
	}
	_ = json.Unmarshal(parsed.Result, &wrapper)
	a.Class = "OK"
	if len(wrapper.Contents) > 0 {
		a.Detail = truncate(wrapper.Contents[0].Text, 160)
	} else {
		a.Detail = "empty contents"
	}
	return a
}

func (c *client) getPrompt(name string, args map[string]string) attempt {
	body := map[string]any{
		"jsonrpc": "2.0",
		"id":      12,
		"method":  "prompts/get",
		"params":  map[string]any{"name": name, "arguments": args},
	}
	res, err := c.post(c.base, body)
	if err != nil {
		return attempt{Kind: "prompt", Name: name, Class: "HTTP_ERROR", Detail: err.Error()}
	}
	a := c.toAttempt("prompt", name, res)
	if a.Class != "OK" {
		return a
	}
	var parsed rpcResponse
	if err := json.Unmarshal(res.body, &parsed); err != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = "invalid JSON"
		return a
	}
	if parsed.Error != nil {
		a.Class = "PROTOCOL_ERROR"
		a.Detail = fmt.Sprintf("%d %s", parsed.Error.Code, parsed.Error.Message)
		return a
	}
	var wrapper struct {
		Messages []struct {
			Content struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"messages"`
	}
	_ = json.Unmarshal(parsed.Result, &wrapper)
	a.Class = "OK"
	if len(wrapper.Messages) > 0 {
		a.Detail = truncate(wrapper.Messages[0].Content.Text, 160)
	} else {
		a.Detail = "empty messages"
	}
	return a
}

func (c *client) ping() attempt {
	body := map[string]any{"jsonrpc": "2.0", "id": 13, "method": "ping"}
	res, err := c.post(c.base, body)
	if err != nil {
		return attempt{Kind: "transport", Name: "ping", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	a := c.toAttempt("transport", "ping", res)
	return a
}

func (c *client) unknownTool() attempt {
	return c.callTool("waqf_search", map[string]any{"query": "test"})
}

func (c *client) getJSON() attempt {
	start := time.Now()
	req, err := http.NewRequest("GET", c.base, nil)
	if err != nil {
		return attempt{Kind: "transport", Name: "GET /mcp JSON", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	c.setHeaders(req)
	req.Header.Set("Accept", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return attempt{Kind: "transport", Name: "GET /mcp JSON", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	a := attempt{Kind: "transport", Name: "GET /mcp JSON", HTTPStatus: res.StatusCode, LatencyMs: time.Since(start).Milliseconds(), Bytes: len(payload), Class: "OK", Detail: "discovery JSON"}
	if res.StatusCode != 200 {
		a.Class = "HTTP_ERROR"
		a.Detail = fmt.Sprintf("expected 200, got %d", res.StatusCode)
	}
	return a
}

func (c *client) getSSE() attempt {
	start := time.Now()
	req, err := http.NewRequest("GET", c.base, nil)
	if err != nil {
		return attempt{Kind: "transport", Name: "GET /mcp SSE", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	c.setHeaders(req)
	req.Header.Set("Accept", "text/event-stream")
	res, err := c.http.Do(req)
	if err != nil {
		return attempt{Kind: "transport", Name: "GET /mcp SSE", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	a := attempt{Kind: "transport", Name: "GET /mcp SSE", HTTPStatus: res.StatusCode, LatencyMs: time.Since(start).Milliseconds(), Bytes: len(payload), Class: "OK", Detail: "finite SSE endpoint event"}
	if res.StatusCode != 200 || !bytes.Contains(payload, []byte("event: endpoint")) {
		a.Class = "HTTP_ERROR"
		a.Detail = "missing finite endpoint event"
	}
	return a
}

func (c *client) optionsCORS() attempt {
	start := time.Now()
	req, err := http.NewRequest("OPTIONS", c.base, nil)
	if err != nil {
		return attempt{Kind: "transport", Name: "OPTIONS /mcp CORS", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	c.setHeaders(req)
	req.Header.Set("Origin", "https://example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	res, err := c.http.Do(req)
	if err != nil {
		return attempt{Kind: "transport", Name: "OPTIONS /mcp CORS", Class: "HTTP_ERROR", Detail: err.Error()}
	}
	defer res.Body.Close()
	io.Copy(io.Discard, res.Body)
	a := attempt{Kind: "transport", Name: "OPTIONS /mcp CORS", HTTPStatus: res.StatusCode, LatencyMs: time.Since(start).Milliseconds(), Class: "OK", Detail: res.Header.Get("Access-Control-Allow-Origin")}
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != "*" {
		a.Class = "HTTP_ERROR"
		a.Detail = fmt.Sprintf("status=%d allow-origin=%q", res.StatusCode, res.Header.Get("Access-Control-Allow-Origin"))
	}
	return a
}

func (c *client) securityProbe(path string) attempt {
	origin := c.base
	if idx := strings.LastIndex(origin, "/mcp"); idx >= 0 {
		origin = origin[:idx]
	}
	start := time.Now()
	req, err := http.NewRequest("GET", origin+path, nil)
	if err != nil {
		return attempt{Kind: "security", Name: path, Class: "HTTP_ERROR", Detail: err.Error()}
	}
	req.Header.Set("User-Agent", c.userAgent)
	res, err := c.http.Do(req)
	if err != nil {
		return attempt{Kind: "security", Name: path, Class: "HTTP_ERROR", Detail: err.Error()}
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	a := attempt{Kind: "security", Name: path, HTTPStatus: res.StatusCode, LatencyMs: time.Since(start).Milliseconds(), Bytes: len(payload), Class: "OK", Detail: fmt.Sprintf("status %d", res.StatusCode)}
	if res.StatusCode != 401 && res.StatusCode != 403 && res.StatusCode != 404 {
		a.Class = "HTTP_ERROR"
	}
	return a
}

func (c *client) toAttempt(kind, name string, res *httpResult) attempt {
	a := attempt{Kind: kind, Name: name, HTTPStatus: res.status, LatencyMs: res.latency.Milliseconds(), Bytes: len(res.body), Class: "OK"}
	if res.status != 200 {
		a.Class = "HTTP_ERROR"
		a.Detail = fmt.Sprintf("HTTP %d: %s", res.status, truncate(string(res.body), 160))
	}
	return a
}

type httpResult struct {
	status  int
	body    []byte
	latency time.Duration
}

func (c *client) post(url string, body map[string]any) (*httpResult, error) {
	start := time.Now()
	req, err := http.NewRequest("POST", url, bytes.NewReader(mustJSON(body)))
	if err != nil {
		return nil, err
	}
	c.setHeaders(req)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 12<<20))
	if err != nil {
		return nil, err
	}
	return &httpResult{status: res.StatusCode, body: payload, latency: time.Since(start)}, nil
}

func (c *client) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("User-Agent", c.userAgent)
}

func promptArgs(prompt promptDefinition) map[string]string {
	switch prompt.Name {
	case "study_ayah", "compare_tafsirs", "tajweed_lesson":
		return map[string]string{"surah": "1", "ayah": "1"}
	case "root_study":
		return map[string]string{"root": "كتب"}
	case "surah_overview":
		return map[string]string{"surah": "1"}
	default:
		return map[string]string{}
	}
}

func firstText(result toolResult) string {
	for _, block := range result.Content {
		if block.Type == "text" && block.Text != "" {
			return block.Text
		}
	}
	if len(result.Content) > 0 {
		return result.Content[0].Text
	}
	return ""
}

func printReport(report smokeReport) {
	fmt.Printf("MCP smoke: %s\n", report.BaseURL)
	fmt.Printf("tools listed: %d | missing args: %d | window: %s -> %s\n", report.ToolCount, len(report.ToolMissing), report.StartedAt.Format(time.RFC3339), report.FinishedAt.Format(time.RFC3339))
	if len(report.ToolMissing) > 0 {
		fmt.Printf("missing args: %s\n", strings.Join(report.ToolMissing, ", "))
	}

	var ok, toolErrors, protocolErrors, httpErrors int
	var latencies []int64
	for _, a := range report.Attempts {
		latencies = append(latencies, a.LatencyMs)
		switch a.Class {
		case "OK":
			ok++
		case "TOOL_ERROR":
			toolErrors++
		case "PROTOCOL_ERROR":
			protocolErrors++
		default:
			httpErrors++
		}
	}
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	fmt.Printf("results: ok=%d tool_errors=%d protocol_errors=%d http_errors=%d\n", ok, toolErrors, protocolErrors, httpErrors)
	if len(latencies) > 0 {
		fmt.Printf("latency: p50=%dms p95=%dms max=%dms\n", percentile(latencies, 50), percentile(latencies, 95), latencies[len(latencies)-1])
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "KIND\tNAME\tHTTP\tMS\tBYTES\tCLASS\tDETAIL")
	for _, a := range report.Attempts {
		fmt.Fprintf(w, "%s\t%s\t%d\t%d\t%d\t%s\t%s\n", a.Kind, a.Name, a.HTTPStatus, a.LatencyMs, a.Bytes, a.Class, truncate(a.Detail, 110))
	}
	w.Flush()

	var failures []attempt
	for _, a := range report.Attempts {
		if a.Class != "OK" {
			failures = append(failures, a)
		}
	}
	sort.SliceStable(failures, func(i, j int) bool { return failures[i].LatencyMs > failures[j].LatencyMs })
	if len(failures) > 0 {
		fmt.Println("\nNon-OK results:")
		for _, a := range failures {
			fmt.Printf("- %s %s: %s (%s)\n", a.Kind, a.Name, a.Class, truncate(a.Detail, 220))
		}
	}
}

func summarize(attempts []attempt) string {
	var ok, toolErrors, protocolErrors, httpErrors int
	for _, a := range attempts {
		switch a.Class {
		case "OK":
			ok++
		case "TOOL_ERROR":
			toolErrors++
		case "PROTOCOL_ERROR":
			protocolErrors++
		default:
			httpErrors++
		}
	}
	return fmt.Sprintf("ok=%d tool_errors=%d protocol_errors=%d http_errors=%d", ok, toolErrors, protocolErrors, httpErrors)
}

func percentile(sorted []int64, p int) int64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := (len(sorted) - 1) * p / 100
	return sorted[idx]
}

func mustJSON(v any) []byte {
	encoded, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return encoded
}

func truncate(s string, max int) string {
	s = strings.ReplaceAll(strings.ReplaceAll(s, "\n", " "), "\t", " ")
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
