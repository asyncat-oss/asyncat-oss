#!/usr/bin/env python3
# requires-python = ">=3.13"
# dependencies = [
#     "marimo>=0.22.4",
#     "pandas>=2.3.3",
#     "plotly>=6.5.1",
#     "pyarrow>=22.0.0",
#     "pyzmq>=27.1.0",
#     "numpy>=1.26.0",
#     "scipy>=1.13.0",
# ]

import marimo

__generated_with = "0.23.1"
app = marimo.App()


@app.cell
def _(mo):
    mo.md(r"""
    ---
    # 🎓 Interactive Financial Analytics Portfolio
    **A Comprehensive Showcase of Data Science & Financial Analysis Skills**

        Combining Data Preparation (Week 2) | Interactive Visualizations (Week 3) | Dashboard Design (Week 4) | Web Scraping (Week 6) | PDF Processing (Week 7)
    """)
    return


@app.cell
def _():
    import marimo as mo
    import pandas as pd
    import numpy as np
    import plotly.express as px
    import plotly.graph_objects as go
    from scipy import stats

    return mo, np, pd, px


@app.cell
def _(pd):
    # Load and prepare data from gist (Week 2: Data Preparation)
    csv_url = (
        "https://gist.githubusercontent.com/DrAYim/80393243abdbb4bfe3b45fef58e8d3c8/raw/"
        "ed5cfd9f210bf80cb59a5f420bf8f2b88a9c2dcd/sp500_ZScore_AvgCostofDebt.csv"
    )

    df_main = pd.read_csv(csv_url)
    df_main = df_main.dropna(subset=["AvgCost_of_Debt", "Z_Score_lag", "Sector_Key"])
    df_main = df_main[(df_main["AvgCost_of_Debt"] < 5)]
    df_main["Debt_Cost_Percent"] = df_main["AvgCost_of_Debt"] * 100
    df_main["Market_Cap_B"] = df_main["Market_Cap"] / 1e9
    return (df_main,)


@app.cell
def _(df_main, mo):
    # Create comprehensive UI Controls (Week 4 Dashboard pattern)
    all_sectors = sorted(df_main["Sector_Key"].unique().tolist())
    sector_dropdown = mo.ui.multiselect(
        options=all_sectors,
        value=all_sectors[:5],
        label="🏢 Filter by Sector",
    )

    max_cap = int(df_main["Market_Cap_B"].max())
    cap_slider = mo.ui.slider(
        start=0,
        stop=200,
        step=10,
        value=0,
        label="💰 Min Market Cap ($ Billions)",
    )

    # Z-Score range filter
    zscore_slider = mo.ui.range_slider(
        start=-5,
        stop=20,
        step=0.5,
        value=(-5, 20),
        label="📈 Z-Score Range (Altman Score)",
    )
    return cap_slider, sector_dropdown, zscore_slider


@app.cell
def _(cap_slider, df_main, sector_dropdown, zscore_slider):
    # Reactive filtering based on user inputs
    filtered_data = df_main[
        (df_main["Sector_Key"].isin(sector_dropdown.value))
        & (df_main["Market_Cap_B"] >= cap_slider.value)
        & (df_main["Z_Score_lag"] >= zscore_slider.value[0])
        & (df_main["Z_Score_lag"] <= zscore_slider.value[1])
    ]

    # Calculate summary metrics
    company_count = len(filtered_data)
    avg_debt_cost = filtered_data["Debt_Cost_Percent"].mean()
    avg_zscore = filtered_data["Z_Score_lag"].mean()
    median_market_cap = filtered_data["Market_Cap_B"].median()
    return (
        avg_debt_cost,
        avg_zscore,
        company_count,
        filtered_data,
        median_market_cap,
    )


@app.cell
def _(filtered_data, px):
    # Plot 1: Interactive Scatter - Credit Risk Analysis (Week 2 + 3)
    fig_scatter = px.scatter(
        filtered_data,
        x="Z_Score_lag",
        y="Debt_Cost_Percent",
        color="Sector_Key",
        size="Market_Cap_B",
        hover_name="Name",
        hover_data={"Ticker": True, "Z_Score_lag": ":.2f", "Debt_Cost_Percent": ":.2f"},
        title="💡 Credit Risk Analysis: Cost of Debt vs. Financial Health (Altman Z-Score)",
        labels={
            "Z_Score_lag": "Altman Z-Score (Previous Year)",
            "Debt_Cost_Percent": "Avg. Cost of Debt (%)",
        },
        template="plotly_white",
        width=1000,
        height=600,
        custom_data=["Sector_Key"],
    )

    # Add reference lines for distress zones
    fig_scatter.add_vline(
        x=1.81,
        line_dash="dash",
        line_color="red",
        annotation=dict(
            text="⚠️ Distress Zone (Z < 1.81)",
            font=dict(color="red", size=10),
            x=0.5,
            xref="x",
            y=1.05,
            yref="paper",
            showarrow=False,
        ),
    )

    fig_scatter.add_vline(
        x=2.99,
        line_dash="dash",
        line_color="green",
        annotation=dict(
            text="✅ Safe Zone (Z > 2.99)",
            font=dict(color="green", size=10),
            x=3.5,
            xref="x",
            y=1.05,
            yref="paper",
            showarrow=False,
        ),
    )
    return (fig_scatter,)


@app.cell
def _(filtered_data, px):
    # Plot 2: Box Plot by Sector (Week 3 - Multiple visualizations)
    fig_box = px.box(
        filtered_data,
        x="Sector_Key",
        y="Debt_Cost_Percent",
        color="Sector_Key",
        title="📊 Debt Cost Distribution by Sector",
        labels={"Sector_Key": "Sector", "Debt_Cost_Percent": "Debt Cost (%)"},
        template="plotly_white",
        width=900,
        height=500,
    )

    fig_box.update_layout(showlegend=False, xaxis_tickangle=-45)
    return (fig_box,)


@app.cell
def _(filtered_data, px):
    # Plot 3: Histogram of Z-Scores (Week 2 - Statistical Analysis)
    fig_hist = px.histogram(
        filtered_data,
        x="Z_Score_lag",
        nbins=30,
        color="Sector_Key",
        title="📈 Distribution of Altman Z-Scores",
        labels={"Z_Score_lag": "Z-Score", "count": "Frequency"},
        template="plotly_white",
        width=900,
        height=500,
        barmode="overlay",
    )

    fig_hist.update_traces(opacity=0.7)
    return (fig_hist,)


@app.cell
def _(filtered_data, np, px):
    # Plot 4: Market Cap vs Debt Cost (Market Analysis)
    plot_data = filtered_data.copy()
    plot_data["Z_Score_Size"] = np.abs(plot_data["Z_Score_lag"]) + 1  # Use absolute value, add 1 to avoid very small sizes

    fig_market = px.scatter(
        plot_data,
        x="Market_Cap_B",
        y="Debt_Cost_Percent",
        color="Sector_Key",
        size="Z_Score_Size",
        hover_name="Name",
        title="💼 Company Size Impact on Borrowing Costs",
        labels={"Market_Cap_B": "Market Cap ($ Billions)", "Debt_Cost_Percent": "Debt Cost (%)"},
        template="plotly_white",
        width=900,
        height=500,
    )
    return (fig_market,)


@app.cell
def _(filtered_data, px):
    # Plot 5: Sector Summary - Count and Average Metrics
    sector_summary = (
        filtered_data.groupby("Sector_Key").agg(
            {
                "Name": "count",
                "Debt_Cost_Percent": "mean",
                "Z_Score_lag": "mean",
                "Market_Cap_B": "mean",
            }
        )
        .reset_index()
    )
    sector_summary.columns = ["Sector", "Company_Count", "Avg_Debt_Cost", "Avg_Z_Score", "Avg_Market_Cap"]

    fig_sector = px.bar(
        sector_summary,
        x="Sector",
        y=["Avg_Debt_Cost", "Avg_Z_Score"],
        title="🏭 Sector Comparison: Financial Metrics",
        labels={"value": "Value", "variable": "Metric"},
        barmode="group",
        template="plotly_white",
        width=900,
        height=500,
    )

    fig_sector.update_layout(xaxis_tickangle=-45)
    return (fig_sector,)


@app.cell
def _(filtered_data):
    # Calculate correlation for insights
    correlation = filtered_data[["Z_Score_lag", "Debt_Cost_Percent", "Market_Cap_B"]].corr()

    zscore_debt_corr = correlation.loc["Z_Score_lag", "Debt_Cost_Percent"]
    return (zscore_debt_corr,)


@app.cell
def _(
    avg_debt_cost,
    avg_zscore,
    company_count,
    median_market_cap,
    mo,
    zscore_debt_corr,
):
    # Create Key Metrics Dashboard
    metrics_display = mo.md(
        f"""
        ### 📊 Key Performance Metrics (Current Dashboard View)

        | Metric | Value |
        |--------|-------|
        | **Companies Analyzed** | {company_count:,} |
        | **Average Debt Cost** | {avg_debt_cost:.2f}% |
        | **Average Z-Score** | {avg_zscore:.2f} |
        | **Median Market Cap** | ${median_market_cap:.2f}B |
        | **Z-Score vs Debt Correlation** | {zscore_debt_corr:.3f} |

        **Key Insight:** A negative correlation indicates that companies with higher Z-Scores (better financial health)
        tend to have lower borrowing costs—which validates the financial theory behind credit risk assessment.
        """
    )
    return (metrics_display,)


@app.cell
def _(fig_box, fig_hist, fig_market, fig_sector, mo):
    # Tab 2: Advanced Analytics
    tab_analytics = mo.vstack([
        mo.md("## 🔬 Advanced Analytics"),
        mo.md("### Multiple perspectives on the same data"),
        mo.hstack([mo.ui.plotly(fig_box), mo.ui.plotly(fig_hist)]),
        mo.hstack([mo.ui.plotly(fig_market), mo.ui.plotly(fig_sector)]),
    ])
    return (tab_analytics,)


@app.cell
def _(mo):
    # Tab 3: CV & Professional Profile
    tab_cv = mo.md(
        """
        ### 👤 About Me

        **I'm a Data-Driven Financial Analyst**

        Passionate about transforming raw financial data into actionable insights using modern Python tools and interactive visualizations.

        **Core Competencies:**
        - 🐍 **Python Programming**: Data manipulation with Pandas, numerical analysis with NumPy, visualization with Plotly
        - 📊 **Financial Analysis**: Altman Z-Score, credit risk assessment, portfolio analysis
        - 📈 **Data Visualization**: Interactive dashboards, statistical plots, trend analysis
        - 💾 **Data Preparation**: ETL processes, data cleaning, outlier detection
        - 🎯 **Business Intelligence**: KPI tracking, sector analysis, comparative metrics

        **Education:**
        - **BSc Accounting & Finance**, Bayes Business School (2025 - Present)
        - Modules: Data Science & AI Tools, Financial Accounting, Investment Analysis

        **Projects:**
        1. **S&P 500 Credit Risk Analysis** - Analyzed 500+ companies using Altman Z-Score methodology
        2. **Interactive Financial Dashboards** - Built multi-tab analytical tools with real-time filtering
        3. **Data Visualization Suite** - Created publication-ready charts with Plotly

        **Why This Matters:**
        This portfolio demonstrates the complete data science workflow: from data collection and preparation (Week 2)
        through interactive visualization (Week 3) to polished dashboard design (Week 4). It showcases the ability to
        tell a data-driven story that informs decision-making.
        """
    )
    return (tab_cv,)


@app.cell
def _(mo):
    # Tab 4: Methodology & Key Insights
    tab_methodology = mo.md(
        """
        ### 📚 Methodology & Key Concepts

        **Altman Z-Score Framework:**
        - A discriminant function that combines five financial ratios
        - Predicts bankruptcy probability with historical accuracy
        - **Z > 2.99**: Safe Zone (low default risk)
        - **1.81 < Z < 2.99**: Grey Zone (moderate risk)
        - **Z < 1.81**: Distress Zone (high default risk)

        **Financial Health Metrics:**
        - **Working Capital / Total Assets**: Liquidity management efficiency
        - **Retained Earnings / Total Assets**: Long-term profitability
        - **EBIT / Total Assets**: Asset productivity
        - **Market Value of Equity / Book Value of Debt**: Market confidence vs obligations

        **Cost of Debt (Borrowing Cost):**
        - The annual percentage rate (APR) a company pays to borrow money
        - Inverse relationship with creditworthiness (higher risk = higher cost)
        - Critical for capital budgeting and NPV calculations

        **Data Sources:**
        - S&P 500 historical financial data
        - Market capitalization from financial APIs
        - Debt obligation metrics from balance sheets

        **Techniques Demonstrated:**
        ✅ Data loading and cleaning (handling missing values, outliers)
        ✅ Descriptive statistics (mean, median, correlation)
        ✅ Interactive visualizations (scatter plots, box plots, histograms)
        ✅ Sector-level analysis and comparison
        ✅ Risk classification and threshold-based segmentation
        """
    )
    return (tab_methodology,)


@app.cell
def _(mo):
    # Tab 5: Personal Interests
    tab_hobbies = mo.md(
        """
        ### 🎯 Beyond the Numbers

        **Interests & Hobbies:**

        📚 **Reading**: Fascinated by financial narratives and data science books
        - "The Intelligent Investor" by Benjamin Graham
        - "Thinking, Fast and Slow" by Daniel Kahneman

        ✈️ **Travel**: Exploring different financial markets and economies
        - London (2022): Financial district tours
        - New York (2023): Wall Street experience
        - Singapore (2024): Asian market insights

        🎮 **Gaming & Strategy**: Board games and strategy games enhance analytical thinking

        🏃 **Fitness**: Running and staying active for mental clarity

        💡 **Continuous Learning**: Regular updates on ML, AI, and fintech trends
        """
    )
    return (tab_hobbies,)


@app.cell
def _(cap_slider, mo, sector_dropdown, zscore_slider):
    # Tab 1 Control Panel (Integrated with the main dashboard)
    controls_panel = mo.vstack([
        mo.md("## 🎛️ Dashboard Controls"),
        mo.md("*Customize your analysis by selecting sectors and market cap range*"),
        sector_dropdown,
        cap_slider,
        zscore_slider,
        mo.md("")  # Spacing
    ])
    return (controls_panel,)


@app.cell
def _(
    cap_slider,
    controls_panel,
    fig_box,
    fig_hist,
    fig_market,
    fig_scatter,
    fig_sector,
    metrics_display,
    mo,
    sector_dropdown,
    tab_analytics,
    tab_cv,
    tab_hobbies,
    tab_methodology,
    zscore_slider,
):
    # Create the Dashboard tab with all components
    tab_dashboard = mo.vstack([
        mo.md("## 📊 Interactive Credit Risk Analyzer"),
        mo.callout(mo.md("**Filter by Sector, Market Cap, and Z-Score** to explore financial metrics across the S&P 500"), kind="info"),
        mo.hstack([sector_dropdown, cap_slider, zscore_slider], justify="center", gap=2),
        metrics_display,
        mo.md("### 📈 Main Analysis"),
        fig_scatter,
        mo.md("---"),
        mo.md("### 📊 Supporting Analytics"),
        mo.hstack([
            mo.vstack([
                mo.md("**Z-Score Distribution**"),
                fig_hist,
                mo.md("**Sector Risk Comparison**"),
                fig_box,
            ]),
            mo.vstack([
                mo.md("**Market Cap vs Debt Cost**"),
                fig_market,
                mo.md("**Sector Summary**"),
                fig_sector,
            ]),
        ]),
    ])

    # Tab 5: Web Scraping & PDF Processing (Weeks 6-7)
    tab_week6_7 = mo.md(
        """
        ### 🕷️ Web Scraping & PDF Processing (Weeks 6-7)

        **Complete Web Data Collection & Document Analysis Pipeline**

        ---

        #### Stage 1: Accept Cookies & Collect URLs

        - Uses **Playwright** (headless browser) to visit websites
        - Bypasses bot-detection with realistic browser fingerprints
        - Accepts cookie consent banners automatically
        - Extracts and filters URLs by topic keywords
        - Saves cookies and local storage for reuse

        **Technologies:** Playwright, Browser Stealth, Regex/Pattern Matching

        **Output:** `cookies.json`, `urls_raw.csv`, `urls_filtered.csv`

        ---

        #### Stage 2: Recursive Web Crawling

        - Performs depth-limited web crawling from seed URLs
        - Follows links matching keyword criteria (e.g., "sustainability", "ESG")
        - Avoids duplicates and redundant paths
        - Respects domain boundaries
        - Implements timeout mechanisms for long-running crawls
        - Filters non-HTML files (PDFs, images, archives)

        **Technologies:** Async Playwright, pandas, Signal Handling, URL Parsing

        **Output:** `allURLs.csv`, `pdfURLs.csv`, `visitedURLs.csv`

        ---

        #### Stage 3: Download, Analyze & Extract PDFs

        - Downloads PDF files using `curl` (bypasses TLS fingerprint detection)
        - Analyzes **text-searchable vs. scanned (image) PDFs**
        - For text PDFs: Direct keyword extraction with **PyMuPDF**
        - For scanned PDFs: Falls back to **Tesseract OCR**
        - Implements word normalization (accents, punctuation removal)
        - Extracts matching pages and saves with metadata filenames
        - Maintains download ledger to prevent re-downloading

        **Technologies:** curl,PyMuPDF, Tesseract OCR, NLTK, Unicode Normalization

        **Output:** Extracted PDFs with keyword metadata

        ---

        #### Real-World Applications

        🏢 Corporate sustainability report collection  
        📚 Academic paper organization  
        💼 Market intelligence gathering  
        📰 News article extraction  
        🔍 Document mining at scale  

        ---

        #### Skills Demonstrated

        ✅ Web Automation & Browser Control  
        ✅ Web Scraping & URL Collection  
        ✅ Bot Evasion Techniques  
        ✅ Async Programming  
        ✅ PDF Text Extraction  
        ✅ OCR for Scanned Documents  
        ✅ Text Normalization & NLP  
        ✅ Multi-stage Data Pipelines  
        ✅ Error Handling & Timeouts  
        ✅ Data Organization (pandas)  
        """
    )

    # Create the main tabbed interface with ALL components
    app_tabs = mo.ui.tabs({
        "📊 Dashboard": tab_dashboard,
        "🔬 Advanced Analytics": tab_analytics,
        "📚 Methodology": tab_methodology,
        "🕷️ Week 6-7: Web Scraping & PDF Processing": tab_week6_7,
        "👤 About Me": tab_cv,
        "🎯 Interests": tab_hobbies,
    })

    # Main app layout
    mo.md(
        f"""
        # 🎓 Interactive Financial Analytics Portfolio

        **Ram Nevaithanan's Comprehensive Data Science & Finance Showcase**

        ---

        ## Welcome! 👋

        This portfolio demonstrates proficiency in:
        - **Data Preparation & Cleaning** (Week 2)
        - **Interactive Visualizations** (Week 3)  
        - **Dashboard Design & Deployment** (Week 4)
        - **Web Scraping & Browser Automation** (Week 6)
        - **PDF Processing & OCR Extraction** (Week 7)

        ### Quick Start:
        Use the controls below to filter the data, then navigate the tabs to explore different analytical perspectives.

        ---

        ### 🎛️ Filter Controls

        {controls_panel}

        {metrics_display}

        ---

        ### Main Navigation

        {app_tabs}
        """
    )
    return


if __name__ == "__main__":
    app.run()
