# MerkaDo EDA Notebook: Setup and Implementation Plan

This plan covers setting up and running `merkado_eda.ipynb`, from the first test on the proxy data to the weekly runs on the partner store log.

- **Weeks 1–3:** run the notebook on the Aling Nena proxy CSV. This only tests the code, so its results are not findings.
- **From Week 3:** run it on the partner store log. These are the results you report.

---

## 1. Folder setup

Keep one project folder with this layout. The notebook uses paths relative to this folder.

```
MerkaDo_EDA/
├── merkado_eda.ipynb        # the notebook
├── requirements.txt         # library versions
├── plan.md                  # this file
├── data/
│   ├── aling-nena-sales-q1-2026.csv          # proxy data (Weeks 1–3)
│   ├── mock_store_log_template_example.csv   # example of the store-log format
│   └── store_log.csv                         # MASTER partner store log (you create this)
├── outputs/                 # tables and figures, overwritten each run
└── reports/                 # your saved copy of each week's outputs (week03/, week04/, ...)
```

- **Back up `data/store_log.csv`** (e.g. on Google Drive) after every weekly update. It is the only record of past weeks, because the models keep nothing between runs.

---

## 2. Environment setup (one time, per group member)

**Option A: local machine (recommended)**

1. Install Python 3.10 or newer from python.org. On Windows, tick "Add Python to PATH".
2. Open a terminal in `MerkaDo_EDA/` and run:
   ```bash
   python -m venv .venv
   # Windows:        .venv\Scripts\activate
   # macOS / Linux:  source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Start Jupyter with `jupyter notebook`, or open the `.ipynb` in VS Code and pick the `.venv` interpreter.

**Option B: Google Colab (no install)**

1. Upload `merkado_eda.ipynb` to Colab.
2. Run this in the first cell:
   ```python
   !pip install -q mlxtend==0.23.4 statsmodels==0.15.0
   ```
3. Upload your CSV with the Files panel into a `data/` folder.
4. Download the `outputs/` folder after each run, because Colab files are deleted when the session ends.

**Tested with:** Python 3.10.12, pandas 2.3.3, numpy 2.2.6, statsmodels 0.15.0, scikit-learn 1.7.2, mlxtend 0.23.4, scipy 1.15.3, matplotlib 3.10.9, seaborn 0.13.2.

---

## 3. Smoke test on the proxy data (Week 1)

1. Open the notebook and leave `DATA_PATH` as `data/aling-nena-sales-q1-2026.csv`.
2. Click **Run All**. It takes about 1 minute.
3. Check that `outputs/eda_summary.txt` starts with these lines:
   ```
   - Names: 22 raw -> 22 standard ({'exact': 22}).
   - 494 rows, 90 days, 22 products; 0 missing values; 5 duplicate rows (flagged).
   ```
4. Run it again with `DATA_PATH = 'data/mock_store_log_template_example.csv'`. This tests the branches that use transaction IDs, closed days, pack sizes and name matching.
   - Expected result: "1 closed and 1 unlogged days", and "Lucky Me Pancit Cantoon" matched to "Lucky Me Pancit Canton".

If both runs finish without a red error cell, the setup is done.

---

## 4. Partner store log format

Give the owner a paper form or a Google Sheet with these columns. Use **one row per item per transaction**: a customer buying 2 pandesal and 1 Kopiko is 2 rows with the same `Trans_ID`.

| Column | Required? | Example | Notes |
|---|---|---|---|
| `Date` | Required | `2026-11-02` | Use the YYYY-MM-DD format |
| `Product` | Required | `Kopiko 3-in-1` | Use the product-list spelling where possible |
| `Qty` | Required | `2` | In the unit written in `Unit` |
| `Trans_ID` | Strongly recommended | `T00016` | Same ID for every item in one purchase. Needed for basket analysis |
| `Time` | Optional | `06:08` | Used for the time-of-day pattern |
| `Unit` | Optional | `pc`, `banig`, `bag` | Converted to base units using `PACK_TABLE` |
| `UnitPrice`, `UnitCost` | Optional | `8.0`, `6.0` | Used for sales, profit and the SRP check |
| `PaymentType` | Optional | `Cash` / `GCash` / `Utang` | Used for the utang share |
| `Stockout_Flag` | Recommended | `0` / `1` | 1 if the item ran out that day. Needed for lost-demand estimates |
| `Is_Rainy` | Optional | `0` / `1` | Used for the rain effect |
| `Store_Open` | Recommended | `1` / `0` | Write one row with `0` on days the store is closed |

Logging rules for the owner:

- **Closed day:** write one row with the date and `Store_Open = 0`.
- **Open day with no sales of an item:** write nothing for that item.
- **Item ran out:** set `Stockout_Flag = 1` on that item's rows for that day. If it didn't sell at all, add a row with `Qty = 0` and `Stockout_Flag = 1`.

Different header names are fine (e.g. `Qty Sold`, `Trans ID`). Add them to `COLUMN_MAP` (Section 5).

---

## 5. Configure the notebook for the store log (Week 3, one time)

Edit **Section 0. Configuration** only. You don't need to change any other cell.

| Setting | Set it to |
|---|---|
| `DATA_PATH` | `'data/store_log.csv'` |
| `DATASET_LABEL` | `'Partner store log, Sta. Mesa'` |
| `COLUMN_MAP` | Add any header in your file that differs, e.g. `'Qty Sold': 'Qty'` |
| `ADD_MOCK_STOCKOUTS` | `False` |
| `ALIASES` | Spelling variants seen in the log, in lower case: `{'kopiko blk': 'Kopiko Black Twin', ...}` |
| `CANONICAL_PRODUCTS` | Optional: the store's official product list, if you have one |
| `PACK_TABLE` | Pack sizes the store sells: `{('Shampoo Sachet', 'banig'): 12, ('Pandesal', 'bag'): 10}` |
| `SRP_PER_UNIT` | DTI SRP per selling unit. Include only exact brand and size matches from the 11 May 2026 bulletin |
| `PAYDAY_DAYS` | Keep `{14, 15, 16, 29, 30, 31, 1}` unless the area's paydays differ |
| `TOP_N` | Number of products to forecast individually (default 6) |

Leave `HOLDOUT_DAYS`, `MIN_SELLING_DAYS`, `MIN_PAIR_BASKETS`, `CROSTON_ALPHA` and `INTERVAL` at their defaults.

**Tip:** after the first run on the store log, open `outputs/name_mapping.csv`. For every row marked `fuzzy (check)` or `unmatched (check)`:
- If the match is correct, add it to `ALIASES`.
- If it's wrong, give it its own alias.

Then run the notebook again.

---

## 6. Weekly routine (every Sunday, from Week 1 of logging)

| Step | Who | Action |
|---|---|---|
| 1 | Encoder | Type or export the week's log, then **append** the new rows to the bottom of `data/store_log.csv`. Never overwrite earlier weeks |
| 2 | Encoder | Back up `store_log.csv` |
| 3 | Analyst | Open the notebook and click **Run All** |
| 4 | Analyst | Check the data quality results: `name_mapping.csv`, outlier list, unlogged days, and `weekly_summary.csv` (changes above ±30%) |
| 5 | Analyst | Fix any logging errors in `store_log.csv` (with the owner if needed), update `ALIASES`/`PACK_TABLE`, and run again |
| 6 | Analyst | Copy `outputs/` to `reports/weekNN/` |
| 7 | Group | From Week 3: fill in the owner report from the outputs (Section 8 of this plan) and hand it to the owner |

What each week produces:

| Logging week | Days in file | What to use from the run |
|---|---|---|
| Week 1 | ~7 | Data quality checks only. Do a one-day trial on Day 1 to catch format problems early |
| Week 2 | ~14 | Data quality checks, ABC analysis, early weekday pattern. No owner report yet |
| Week 3 | ~21 | First forecasts and the first owner report. Treat payday/rain effects as early signals |
| Week 4 | ~28 | Final evaluation for the paper: 7-day MAE, bias, MASE, Fisher-tested basket rules |
| Week 5+ | 35+ | Weekly re-fit. After ~8 weeks the 80% ranges become reliable |

---

## 7. What the notebook does (by section)

| Notebook section | CRISP-DM phase | Main output |
|---|---|---|
| 0 Configuration | — | Settings |
| 1 Load, name standardization, pack conversion | Data Preparation | `name_mapping.csv` |
| 2 Data quality (duplicates, closed/unlogged days, outliers, price vs. SRP) | Data Understanding | Printed tables |
| 3 Sales overview and payment mix | Data Understanding | Printed tables |
| 4 ABC / Pareto | Data Understanding | `abc_analysis.csv`, `fig_abc_pareto.png` |
| 5 Demand type (ADI / CV²) | Data Understanding | `demand_types.csv`, `fig_demand_types.png` |
| 6 Time patterns and payday/weekend/rain regression | Data Understanding | `fig_time_patterns.png`, `fig_weekday_heatmap.png` |
| 7 Basket EDA and Apriori (≥ 5 baskets, Fisher test) | Modeling | `apriori_rules.csv`, `fig_baskets.png` |
| 8 Stockouts and lost demand | Data Preparation | Printed table |
| 9 Week-over-week summary | Data Understanding | `weekly_summary.csv` |
| 10 Forecast check (1-day and 7-day, MAE / bias / MASE) | Evaluation | `forecast_1day_mae.csv`, `forecast_7day_mae.csv` |
| 11 Restock suggestion with 80% range | Deployment | `restock_next7.csv` |
| 12 Summary | — | `eda_summary.txt` |

---

## 8. From outputs to the owner report (Week 3 onward)

| Report block | Source file | Rule |
|---|---|---|
| **Restock Soon** | `restock_next7.csv` | List the item if the forecast is above current stock on hand. Tell the owner to stock up to the "Suggested stock" value |
| **Bundle / Shelve Together** | `apriori_rules.csv` | Use only rows with `significant = True` and `baskets >= 5`. Pick the top 2–3 by lift |
| **Slow-Moving** | `abc_analysis.csv` + `demand_types.csv` | C items that are intermittent or lumpy |

Write each item as one short Taglish line, e.g. "Mag-stock ng ~49 Kopiko 3-in-1 ngayong linggo."

---

## 9. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `Missing required columns: {...}` | Header names differ | Add them to `COLUMN_MAP` |
| `ModuleNotFoundError: mlxtend` | Libraries not installed in this environment | Activate `.venv` and run `pip install -r requirements.txt` |
| Same product appears twice in the tables | Spelling variant not matched | Add it to `ALIASES` |
| Dates look wrong or out of order | Mixed date formats | Use `YYYY-MM-DD` everywhere in the CSV |
| "Day-level groups" warning in Section 7 | No `Trans_ID` column | Log `Trans_ID`. Without it, the bundle results can't be used |
| "fewer than 8 backtest weeks" note | Short log | Expected in Weeks 3–7. Report the range as rough |
| Holt-Winters falls back to the moving average | Fewer than 14 days | Wait until Week 3 for forecasts |

---

## 10. Checklist

- [ ] Python environment installed and the smoke test passes on both sample CSVs (Week 1)
- [ ] Store-log template agreed with the owner; one-day logging trial done (Week 1, Day 1)
- [ ] `store_log.csv` created, appended weekly and backed up
- [ ] Section 0 configured for the store log: `DATA_PATH`, `COLUMN_MAP`, `ALIASES`, `PACK_TABLE`, `ADD_MOCK_STOCKOUTS = False`
- [ ] Weekly data quality review done before each re-fit
- [ ] `outputs/` copied to `reports/weekNN/` every week
- [ ] Owner report delivered weekly from Week 3
- [ ] Week 4 results (7-day MAE, bias, MASE, significant rules) copied into the final paper
