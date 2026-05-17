---
name: financial-analysis
description: Analyze financial data — statements, ratios, forecasts, budgeting, and investment evaluation
brain_region: prefrontal
weight: 1.0
tags: [finance, analysis, accounting, ratios, budgeting, investment, valuation]
when_to_use: |
  When analyzing financial data, reviewing financial statements,
  calculating ratios, building budgets, evaluating investments,
  or working with accounting data and metrics.
---
# Financial Analysis

## Core Principles
- Always verify data sources and recalc key figures
- Present assumptions explicitly before conclusions
- Use consistent time periods (quarterly, annually)
- Flag estimates vs. actuals clearly

## Key Financial Statements

### Income Statement (Profit & Loss)
- Revenue → Gross Profit (Revenue - COGS) → Operating Income → Net Income
- Margin analysis: gross margin, operating margin, net margin

### Balance Sheet
- Assets = Liabilities + Equity (must balance)
- Current Ratio = Current Assets / Current Liabilities
- Debt-to-Equity = Total Liabilities / Total Equity

### Cash Flow Statement
- Operating / Investing / Financing activities
- Free Cash Flow = Operating Cash Flow - CapEx
- Always check if net income ≈ operating cash flow (quality of earnings)

## Ratio Analysis

### Profitability
- Gross Margin = (Revenue - COGS) / Revenue
- Operating Margin = Operating Income / Revenue
- Net Margin = Net Income / Revenue
- ROE = Net Income / Shareholder Equity
- ROA = Net Income / Total Assets
- ROIC = NOPAT / Invested Capital

### Liquidity
- Current Ratio = Current Assets / Current Liabilities
- Quick Ratio = (Current Assets - Inventory) / Current Liabilities
- Cash Ratio = Cash / Current Liabilities

### Efficiency
- Inventory Turnover = COGS / Average Inventory
- Receivables Turnover = Revenue / Average Receivables
- Asset Turnover = Revenue / Average Total Assets

### Leverage
- Debt/Equity = Total Debt / Total Equity
- Interest Coverage = EBIT / Interest Expense
- Debt/EBITDA = Total Debt / EBITDA

### Valuation
- P/E = Price / Earnings per Share
- P/B = Price / Book Value per Share
- EV/EBITDA = Enterprise Value / EBITDA
- DCF: discount projected Free Cash Flows at WACC

## Tool Usage
- Use `db_query` for pulling financial data from the workspace database
- Use `read_csv` / `write_csv` for financial data files
- Use `generate_pdf` or `create_markdown` for financial reports
- Use `create_diagram` for ratio trend charts (via mermaid)

## Analysis Workflow
1. Gather raw data (statements, ratios, benchmarks)
2. Calculate key ratios and metrics
3. Compare against industry benchmarks and historical trends
4. Identify risks, anomalies, and improvement areas
5. Present findings with clear assumptions and limitations
6. Generate visualizations where helpful (tables > charts for precision)
