// Command stats-report prints gateway usage aggregates from production D1.
//
// This thin entry point imports the report package so the documented
// `go run ./scripts/stats-report/main.go ...` form works: file-mode compilation
// only sees this file, and the package import brings in the rest.
package main

import (
	"os"

	"waqf-mcp/stats-report/report"
)

func main() {
	report.Run(os.Args[1:])
}
