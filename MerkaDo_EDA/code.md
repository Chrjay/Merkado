# MerkaDo Code: Tech Stack and Build Plan

This document describes the code behind MerkaDo: the tools it uses, how data flows through it, how the notebook is organized, and how it is built and tested. For installation and the weekly run, see `plan.md`.

**Design rule: keep it simple.**
- One Jupyter notebook and one CSV file.
- No database, web app, or server.
- The group runs the notebook once a week and hands the one-page report to the owner.

---

## 1. Tech stack

| Layer | Tool | Why this tool |
|---|---|---|
| Data capture | Paper log or Google Sheets, exported as CSV | The owner already writes on paper; a CSV needs no software at the store |
| Storage | One master CSV, `data/store_log.csv`, backed up on Google Drive | Small data (a few thousand rows); easy to open and correct by hand |
| Language | Python 3.10+ | Standard for data science; the course tool |
| Environment | Jupyter Notebook (local, VS Code, or Google Colab) | Code, tables, and charts in one file; easy to present |
| Data handling | **pandas**, **numpy** | Load, clean, reshape and aggregate the log |
| Charts | **matplotlib**, **seaborn** | EDA figures saved as PNG for the paper |
| Statistics | **scipy** (Mann–Whitney, Fisher's exact), **statsmodels** (OLS regression, ACF, STL) | Tests whether payday, weekend, rain and basket patterns are real |
| Forecasting | **statsmodels** `ExponentialSmoothing` (Holt-Winters), **scikit-learn** `LinearRegression`, plus custom naive, 7-day MA and Croston (SBA) code | Simple, explainable models suited to 3–8 weeks of daily data |
| Basket analysis | **mlxtend** `apriori` and `association_rules` | Standard Apriori implementation |
| Name matching | Python `difflib` and `re` (built in) | Fuzzy matching of misspelled product names; nothing to install |
| Version control (optional) | Git and GitHub, or Google Drive versions | Keeps a history of notebook changes and weekly outputs |

Exact versions are pinned in `requirements.txt`.

Deliberately **not** used:
- **Deep learning (LSTM)**: too little data, hard to explain, and the 3.67 MAE "benchmark" was not reproducible.
- **Databases and dashboards**: not needed at this scale.
- **Cloud services and APIs**: the store has no reliable internet setup and the owner needs a printed report.

---

## 2. Architecture (data flow)

```
 Partner store (daily)                 Group (weekly)                              Owner (weekly, from Week 3)
 ─────────────────────                 ───────────────────────────────────────     ─────────────────────────
 Paper log / Google Sheet  ──encode──▶ data/store_log.csv (append new week)
                                               │
                                               ▼
                                       merkado_eda.ipynb  (Run All)
                                       ├─ 1  Load + map columns + names + pack units
                                       ├─ 2  Data quality checks
                                       ├─ 3–6  EDA (sales, ABC, demand type, time patterns)
                                       ├─ 7  Basket EDA + Apriori (+ Fisher test)
                                       ├─ 8  Stockouts / lost demand
                                       ├─ 9  Week-over-week check
                                       ├─ 10 Forecast backtest (1-day, 7-day)
                                       ├─ 11 Restock suggestion (80% range)
                                       └─ 12 Summary
                                               │
                                               ▼
                                       outputs/*.csv, *.png, eda_summary.txt
                                               │  copy to reports/weekNN/
                                               ▼
                                       Group fills the one-page Taglish report ──────▶ Restock Soon
                                                                                       Bundle / Shelve Together
                                                                                       Slow-Moving
```

The models keep nothing between runs. Each week they are re-fit from scratch on the whole CSV, so the CSV is the system's only memory.

---

## 3. Notebook structure

The notebook runs top to bottom, and each section uses variables from the ones before it. Only Section 0 is meant to be edited.

| # | Section | Key code | Output |
|---|---|---|---|
| 0 | Configuration | `DATA_PATH`, `COLUMN_MAP`, `ALIASES`, `PACK_TABLE`, `SRP_PER_UNIT`, `PAYDAY_DAYS`, thresholds | — |
| 1 | Load and standardize | `pd.read_csv` → `rename(COLUMN_MAP)` → `HAS` dict of optional columns; `Store_Open` splits closed days off | `df` |
| 1b | Names and pack units | `norm()`, `close_match()`, `standardize()`; `Base_Qty = Qty × pack multiplier` | `name_mapping.csv` |
| 2 | Data quality | Missing values, duplicates (removed if `Trans_ID` exists, else flagged), unlogged days filled with the same-weekday average, IQR outliers, price vs. cost and SRP | `daily` (date × product matrix) |
| 3 | Sales and payments | Totals, payment mix, utang share by product | Tables |
| 4 | ABC / Pareto | Cumulative sales share → A/B/C | `abc_analysis.csv`, `fig_abc_pareto.png` |
| 5 | Demand type | `classify()`: ADI / CV² → smooth, intermittent, erratic, lumpy | `demand_types.csv`, `fig_demand_types.png` |
| 6 | Time patterns | Weekday means, heatmap, `acf`, `STL`, `mw()` Mann–Whitney tests, `smf.ols('units ~ C(dow) + payday [+ rainy]')` | `fig_time_patterns.png`, `fig_weekday_heatmap.png` |
| 7 | Baskets | One-hot by `Trans_ID` (day-level fallback with warning) → `apriori` → `association_rules` → minimum count → `fisher_p()` | `apriori_rules.csv`, `fig_baskets.png` |
| 8 | Stockouts | Lost demand = 7-day rolling mean of in-stock days − actual, on stockout days. With recorded flags, `daily_fc = daily + lost` is the demand series used for forecasting | Table, `daily_fc` |
| 9 | Weekly batches | Units and sales per week; flags partial weeks and changes above ±30% | `weekly_summary.csv` |
| 10 | Forecast check | `make_X()`, `fc()`, `croston_sba()`, `backtest()`: rolling origin on `daily_fc`, MAE, bias, MASE | `forecast_1day_mae.csv`, `forecast_7day_mae.csv` |
| 11 | Restock | Best 7-day model re-fit on all days; 80% range from backtest errors | `restock_next7.csv` |
| 12 | Summary | Key numbers in plain text | `eda_summary.txt` |

### Core functions

| Function | Input → output | Notes |
|---|---|---|
| `norm(s)` | Name → lower-case, punctuation removed | Makes "KOPIKO 3-IN-1" equal "kopiko 3 in 1" |
| `close_match(n, candidates)` | Name → closest standard name or `None` | `difflib` with similarity ≥ `FUZZY_CUTOFF` (0.88); never merges names whose numbers differ (Load 50 vs. Load 100) |
| `standardize(raw)` | Raw name → (standard name, method) | Tries the alias table, then an exact match, then a fuzzy match; otherwise marks it unmatched |
| `classify(s)` | Daily series → demand type | Syntetos–Boylan cut-offs (ADI 1.32, CV² 0.49) |
| `croston_sba(y)` | Daily series → daily forecast | Croston with the SBA correction (× (1 − α/2)), α = 0.1 |
| `make_X(stock)` | Stockout flags → regression feature matrix | Trend, weekday dummies, payday, plus `rainy` and `stockout` when logged; 7 future rows included |
| `fc(model, train, h, X)` | Model name, history, horizon, features → h-day forecast | One interface for all 5 models; Holt-Winters falls back to the 7-day MA if fitting fails. For future days, rain = past rainy-day share and stockout = 0 (no peeking at the future) |
| `backtest(y, H, h)` | Series, test window, horizon → MAE, bias, MASE, errors | Re-fits at every origin; MASE is scaled by the naive model's in-sample error |
| `fisher_p(a, c)` | Rule → one-sided p-value | Is the pair bought together more often than chance? |

### Forecast models

| Model | How it forecasts | Best for |
|---|---|---|
| Naive (last week) | Same day last week | Baseline every model must beat |
| 7-day MA | Mean of the last 7 days | Stable items |
| Holt-Winters | Additive weekly season (`seasonal_periods=7`) | Items with a weekday pattern |
| Linear regression | Trend + weekday dummies + payday flag, plus rainy and stockout dummies when the log records them | Payday- and weather-sensitive items |
| Croston (SBA) | Average size ÷ average gap between sales | Intermittent items (most sari-sari SKUs) |

How the forecasts are judged:
- **Selection:** each series uses the model with the lowest **7-day-total MAE**, because restocking is a weekly decision.
- **Metrics:** bias shows under- or over-forecasting, and MASE compares items of different sizes.
- **MAPE is not used**, because many product-days are zero.

---

## 4. How the code is made (build steps)

| Step | Timing | Work | Status |
|---|---|---|---|
| 1 | Week 1 | Set up the environment, write the loader and column mapping, and do the smoke test on the Aling Nena proxy CSV | Done |
| 2 | Week 1 | EDA sections 3–6 and data quality checks | Done |
| 3 | Week 2 | Name standardization, pack conversion, closed vs. unlogged days | Done |
| 4 | Week 2 | Basket EDA, Apriori with minimum count and Fisher test | Done |
| 5 | Week 2 | Forecast backtest (5 models, 1-day and 7-day, MAE/bias/MASE), restock range | Done |
| 6 | Week 2 | Test on the mock store logs (clean and messy) | Done |
| 7 | Week 2 | Raise recorded stockout days to the rolling-mean demand estimate **before** forecasting (`daily_fc`) | Done |
| 8 | Week 2 | Add `rainy` and `stockout` dummies to the forecasting regression when those columns exist (`make_X`) | Done |
| 9 | Week 3 | First run on the real store log; fill `ALIASES` and `PACK_TABLE` from `name_mapping.csv` | To do |
| 10 | Week 3 (optional) | A short "owner report" cell that writes the three report blocks as Taglish text from `restock_next7.csv`, `apriori_rules.csv` and `abc_analysis.csv` | Optional |
| 11 | Week 4 | Final evaluation run; copy results into the paper | To do |

Steps 7 and 8 match the PDF's Methods section. They switch on only when the log has a recorded `Stockout_Flag` / `Is_Rainy` column, so the Aling Nena proxy results are unchanged (mock stockout flags are never fed into forecasts). They were tested on the mock store logs.

---

## 5. Testing approach

| Test data | Purpose | Expected result |
|---|---|---|
| `data/aling-nena-sales-q1-2026.csv` (online PH proxy) | Full run on 90 days without `Trans_ID` | Runs without errors; 494 rows, 22 products, 5 duplicates flagged, day-level basket warning |
| `data/mock_store_log_template_example.csv` (messy mock) | Tests every optional column: `Trans_ID`, `Store_Open`, `Unit`, `Stockout`, `is_rainy`, misspelled names | 1 closed and 1 unlogged day detected; misspellings merged; Load 50 and Load 100 kept separate; "Stockout correction for forecasting: applied" and "Regression features: trend, weekday, payday, rainy, stockout" printed |
| Clean mock log (24 days, random baskets) | Checks the Fisher test isn't fooled by chance | 0 significant rules, which is correct for random data |

Testing rules:
- After any code change, **Run All** on both sample CSVs and confirm there are no error cells.
- Compare `eda_summary.txt` with the expected lines in `plan.md`.
- Proxy and mock results are never reported as store findings. `DATASET_LABEL` is printed in every summary so the source is always visible.

---

## 6. Coding conventions

- **Settings:** all settings live in Section 0, and no other cell should need editing for a new dataset.
- **Optional columns:** every step that needs an optional column checks `HAS[...]` first and prints why it was skipped.
- **Units:** all quantities are in base units (`Base_Qty`) after Section 1b.
- **Outputs:** every output goes to `OUT` (`outputs/` by default). Never write into `data/`.
- **Evaluation:** use time-ordered splits only, never a random shuffle.
- **Reproducibility:** the mock stockouts use a fixed random seed (`default_rng(7)`), so runs are repeatable.
- **Style:** keep functions short and named for what they do; add comments only where the statistics need explaining.
