---
name: spreadsheet-analysis
description: Analyze data in spreadsheets
brain_region: prefrontal
weight: 1.0
tags: [spreadsheet, excel, google-sheets, data, analysis]
when_to_use: |
  When analyzing data in Excel or Google Sheets,
  creating dashboards, or manipulating data.
---
# Spreadsheet Analysis

## Core Functions

### Aggregation
- SUM, COUNT, AVERAGE
- SUMIF, COUNTIF
- Pivot tables

### Lookup
- VLOOKUP, HLOOKUP
- XLOOKUP (newer)
- INDEX/MATCH

### Logic
- IF, IFS
- AND, OR, NOT
- IFERROR

### Date
- TODAY, NOW
- DATEDIF
- YEAR, MONTH, DAY

## Analysis Patterns

### Data Cleaning
- Remove duplicates
- Text to columns
- Trim whitespace
- Find/replace

### Segmentation
- IF statements
- Nested IFs
- IFS for multiple cases

### Time Analysis
- Date groupings
- Fiscal periods
- Aging reports

### Dashboard Elements
- Charts
- Conditional formatting
- Slicers
- KPIs

## Best Practices

### Structure
- Header row
- One type per column
- No merged cells in data

### Naming
- Clear headers
- Consistent format
- No spaces in names

### Calculations
- Use formulas, not hardcoded
- Document complex formulas
- Check for errors

## Common Patterns

### Summary Table
```
= Pivot table >
  Row: Category
  Values: SUM Amount
```

### Running Total
```
=SUM($B$2:B2)
```

### Percentage of Total
```
=B2/SUM(B:B)
```

### Ranking
```
=RANK(B2, B:B)
```