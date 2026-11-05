import datetime as dt
from pathlib import Path

import pandas as pd

BASE_COLS = ['Date', 'Time', 'Trans_ID', 'Product', 'Unit', 'Qty', 'UnitPrice',
             'PaymentType', 'Pack_Multiplier']

VIEWS = ['v_sales_log', 'v_day_events', 'v_stock_latest', 'v_products']


def _date_str(v):
    if isinstance(v, dt.date):
        return v.isoformat()
    return pd.to_datetime(v).date().isoformat()


def _time_str(v):
    if isinstance(v, dt.time):
        return v.strftime('%H:%M:%S')
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return '00:00:00'
    return pd.to_datetime(str(v)).strftime('%H:%M:%S')


def _pack_multiplier(product, unit, sales_log, stock_latest, products):
    for df in (products, sales_log, stock_latest):
        if df is None or df.empty or 'Pack_Multiplier' not in df:
            continue
        m = df[(df['Product'] == product) & (df['Unit'] == unit)]
        if len(m):
            return int(m['Pack_Multiplier'].iloc[0])
    return 1


def events_to_log(sales_log, day_events, stock_latest, products=None):
    out = sales_log[BASE_COLS].copy()
    if len(out):
        out['Date'] = [_date_str(v) for v in out['Date']]
        out['Time'] = [_time_str(v) for v in out['Time']]
        out['Qty'] = out['Qty'].astype(int)
        out['Pack_Multiplier'] = out['Pack_Multiplier'].astype(int)

    ev = day_events.copy()
    if len(ev):
        ev['Date'] = [_date_str(v) for v in ev['Date']]
        ev['Time'] = [_time_str(v) for v in ev['Time']]
    stockouts = ev[ev['Type'] == 'stockout'] if len(ev) else ev
    rainy_dates = set(ev.loc[ev['Type'] == 'rainy', 'Date']) if len(ev) else set()
    closed = ev[ev['Type'] == 'closed'] if len(ev) else ev

    if len(stockouts):
        key = pd.Series(list(zip(out['Date'], out['Product'], out['Unit'])), index=out.index)
        out['Stockout_Flag'] = key.isin(set(zip(stockouts['Date'], stockouts['Product'],
                                              stockouts['Unit']))).astype(int)
        present = set(zip(out['Date'], out['Product']))
        extra = []
        for _, r in stockouts.iterrows():
            if (r['Date'], r['Product']) not in present:
                extra.append({'Date': r['Date'], 'Time': r['Time'], 'Trans_ID': None,
                              'Product': r['Product'], 'Unit': r['Unit'], 'Qty': 0,
                              'UnitPrice': float('nan'), 'PaymentType': None,
                              'Pack_Multiplier': _pack_multiplier(r['Product'], r['Unit'],
                                                                  sales_log, stock_latest,
                                                                  products),
                              'Stockout_Flag': 1})
        if extra:
            out = pd.concat([out, pd.DataFrame(extra, columns=out.columns)],
                            ignore_index=True)

    if rainy_dates:
        out['Is_Rainy'] = out['Date'].isin(rainy_dates).astype(int)

    if len(closed):
        out['Store_Open'] = 1
        first = closed.sort_values(['Date', 'Time'], kind='mergesort').groupby('Date').first()
        extra = [{'Date': d, 'Time': r['Time'], 'Trans_ID': None, 'Product': '', 'Unit': None,
                  'Qty': 0, 'UnitPrice': float('nan'), 'PaymentType': None, 'Pack_Multiplier': 1,
                  'Store_Open': 0}
                 for d, r in first.iterrows()]
        for c in ('Stockout_Flag', 'Is_Rainy'):
            if c in out.columns:
                for row in extra:
                    row[c] = 0
        out = pd.concat([out, pd.DataFrame(extra, columns=out.columns)], ignore_index=True)
        out['Store_Open'] = out['Store_Open'].astype(int)
        if 'Is_Rainy' in out.columns:
            out['Is_Rainy'] = out['Date'].isin(rainy_dates).astype(int)

    out = out.sort_values(['Date', 'Time'], kind='mergesort').reset_index(drop=True)

    stock = {}
    if len(stock_latest):
        base = stock_latest['Count'].astype(int) * stock_latest['Pack_Multiplier'].astype(int)
        stock = base.groupby(stock_latest['Product']).sum().astype(int).to_dict()
    return out, stock


def _read(conn, sql):
    # pd.read_sql on a SA connection trips a pandas-3/psycopg2 params bug; go through SA text().
    import sqlalchemy as sa
    res = conn.execute(sa.text(sql))
    return pd.DataFrame(res.all(), columns=list(res.keys()))


def from_db(url, out=Path('outputs'), backup=True):
    import sqlalchemy as sa
    # Supabase gives postgresql:// URIs; we ship psycopg2-binary, so pick that driver explicitly.
    if url.startswith(('postgresql://', 'postgres://')):
        url = url.replace('postgres://', 'postgresql+psycopg2://', 1).replace(
            'postgresql://', 'postgresql+psycopg2://', 1)
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            frames = {v: _read(conn, f'select * from reporting.{v}') for v in VIEWS}
            backups = {}
            if backup:
                names = _read(conn,
                              "select table_name from information_schema.views "
                              "where table_schema='reporting' and "
                              "(table_name like 'v\\_%' or table_name like 'raw\\_%') order by 1")
                backups = {n: _read(conn, f'select * from reporting."{n}"')
                           for n in names['table_name']}
        if backups:
            dest = Path(out) / 'backup' / dt.date.today().isoformat()
            dest.mkdir(parents=True, exist_ok=True)
            for n, df in backups.items():
                df.to_csv(dest / f'{n}.csv', index=False)
    finally:
        engine.dispose()
    return events_to_log(frames['v_sales_log'], frames['v_day_events'],
                         frames['v_stock_latest'], frames['v_products'])
