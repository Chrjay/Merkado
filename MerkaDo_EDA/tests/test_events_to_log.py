import datetime as dt

import pandas as pd
import pytest

from merkado_db import BASE_COLS, events_to_log


def sales(rows):
    return pd.DataFrame(rows, columns=BASE_COLS)


def events(rows):
    return pd.DataFrame(rows, columns=['Date', 'Time', 'Type', 'Product', 'Unit'])


def stock(rows):
    return pd.DataFrame(rows, columns=['Product', 'Unit', 'Count', 'Pack_Multiplier', 'Date'])


EMPTY_SALES = sales([])
EMPTY_EVENTS = events([])
EMPTY_STOCK = stock([])


def sale_row(date='2026-11-02', time='07:45:00', product='Kopiko 3-in-1', unit='pc',
             qty=2, price=8.0, pm=1):
    return [date, time, 'T00001', product, unit, qty, price, 'Cash', pm]


def test_plain_sales_only_base_cols():
    s = sales([sale_row(), sale_row(product='Pandesal', price=3.0)])
    out, st = events_to_log(s, EMPTY_EVENTS, EMPTY_STOCK)
    assert list(out.columns) == BASE_COLS
    assert len(out) == 2
    row = out.iloc[0]
    assert row['Date'] == '2026-11-02'
    assert row['Time'] == '07:45:00'
    assert row['Trans_ID'] == 'T00001'
    assert row['Qty'] == 2
    assert row['UnitPrice'] == 8.0
    assert row['PaymentType'] == 'Cash'
    assert st == {}


def test_date_and_time_objects_normalized():
    s = sales([[dt.date(2026, 11, 2), dt.time(7, 45), 'T1', 'Pandesal', 'pc', 1, 3.0, 'Cash', 1]])
    out, _ = events_to_log(s, EMPTY_EVENTS, EMPTY_STOCK)
    assert out.iloc[0]['Date'] == '2026-11-02'
    assert out.iloc[0]['Time'] == '07:45:00'


def test_pack_multiplier_preserved():
    s = sales([sale_row(product='Kopiko Black Twin', unit='banig', qty=1, price=96.0, pm=12)])
    out, _ = events_to_log(s, EMPTY_EVENTS, EMPTY_STOCK)
    assert out.iloc[0]['Pack_Multiplier'] == 12


def test_stockout_with_same_day_sale_flags_row():
    s = sales([sale_row(), sale_row(product='Pandesal', price=3.0)])
    e = events([['2026-11-02', '10:00:00', 'stockout', 'Kopiko 3-in-1', 'pc']])
    out, _ = events_to_log(s, e, EMPTY_STOCK)
    assert 'Stockout_Flag' in out.columns
    assert 'Is_Rainy' not in out.columns and 'Store_Open' not in out.columns
    assert len(out) == 2
    kopiko = out[out['Product'] == 'Kopiko 3-in-1'].iloc[0]
    pandesal = out[out['Product'] == 'Pandesal'].iloc[0]
    assert kopiko['Stockout_Flag'] == 1
    assert pandesal['Stockout_Flag'] == 0


def test_stockout_no_same_day_sale_appends_synthetic_from_products():
    products = pd.DataFrame(
        [[1, 'Lucky Me Pancit Canton', 'pack', 48, 380.0, 1, True]],
        columns=['Product_ID', 'Product', 'Unit', 'Pack_Multiplier', 'Price', 'Sort_Order', 'Active'])
    s = sales([sale_row(product='Pandesal', price=3.0)])
    e = events([['2026-11-02', '10:00:00', 'stockout', 'Lucky Me Pancit Canton', 'pack']])
    out, _ = events_to_log(s, e, EMPTY_STOCK, products=products)
    assert len(out) == 2
    syn = out[out['Product'] == 'Lucky Me Pancit Canton'].iloc[0]
    assert syn['Qty'] == 0
    assert syn['Stockout_Flag'] == 1
    assert syn['Pack_Multiplier'] == 48
    assert syn['Unit'] == 'pack'
    assert syn['Time'] == '10:00:00'
    assert pd.isna(syn['Trans_ID'])
    assert pd.isna(syn['UnitPrice'])
    assert pd.isna(syn['PaymentType'])


def test_stockout_synthetic_pack_multiplier_falls_back_to_sales_log():
    s = sales([sale_row(product='Pandesal', price=3.0),
               sale_row(date='2026-11-01', product='Lucky Me Pancit Canton', unit='pack', pm=48)])
    e = events([['2026-11-02', '10:00:00', 'stockout', 'Lucky Me Pancit Canton', 'pack']])
    out, _ = events_to_log(s, e, EMPTY_STOCK)
    syn = out[(out['Date'] == '2026-11-02') & (out['Product'] == 'Lucky Me Pancit Canton')].iloc[0]
    assert syn['Pack_Multiplier'] == 48


def test_rainy_flags_all_rows_of_date():
    s = sales([sale_row(), sale_row(date='2026-11-03', product='Pandesal', price=3.0)])
    e = events([['2026-11-02', '12:00:00', 'rainy', None, None]])
    out, _ = events_to_log(s, e, EMPTY_STOCK)
    assert 'Is_Rainy' in out.columns
    assert out[out['Date'] == '2026-11-02']['Is_Rainy'].eq(1).all()
    assert out[out['Date'] == '2026-11-03']['Is_Rainy'].eq(0).all()


def test_closed_appends_one_row_store_open():
    s = sales([sale_row(), sale_row(date='2026-11-03', product='Pandesal', price=3.0)])
    e = events([['2026-11-04', '00:00:00', 'closed', None, None],
                ['2026-11-02', '12:00:00', 'rainy', None, None]])
    out, _ = events_to_log(s, e, EMPTY_STOCK)
    assert 'Store_Open' in out.columns
    closed = out[out['Store_Open'] == 0]
    assert len(closed) == 1
    crow = closed.iloc[0]
    assert crow['Date'] == '2026-11-04'
    assert crow['Product'] == ''
    assert crow['Qty'] == 0
    assert crow['Pack_Multiplier'] == 1
    assert pd.isna(crow['Trans_ID'])
    assert out[out['Store_Open'] == 1].shape[0] == 2
    # closed row follows the rainy-date rule for Is_Rainy (2026-11-04 not rainy)
    assert crow['Is_Rainy'] == 0
    assert 'Stockout_Flag' not in out.columns  # no stockout events


def test_no_events_no_optional_columns():
    s = sales([sale_row()])
    out, _ = events_to_log(s, EMPTY_EVENTS, EMPTY_STOCK)
    for c in ('Stockout_Flag', 'Is_Rainy', 'Store_Open'):
        assert c not in out.columns


def test_stock_conversion_base_units():
    st = stock([['Kopiko 3-in-1', 'banig', 2, 12, '2026-11-05'],
                ['Kopiko 3-in-1', 'pc', 5, 1, '2026-11-05'],
                ['Pandesal', 'bag', 1, 10, '2026-11-05']])
    _, sd = events_to_log(EMPTY_SALES, EMPTY_EVENTS, st)
    assert sd == {'Kopiko 3-in-1': 29, 'Pandesal': 10}


def test_empty_sales_log_still_returns_synthetic_rows():
    e = events([['2026-11-02', '10:00:00', 'stockout', 'Kopiko 3-in-1', 'pc']])
    out, _ = events_to_log(EMPTY_SALES, e, EMPTY_STOCK)
    assert len(out) == 1
    assert out.iloc[0]['Stockout_Flag'] == 1
    assert out.iloc[0]['Pack_Multiplier'] == 1  # no source found -> default 1


def test_inputs_not_mutated():
    s = sales([sale_row()])
    e = events([['2026-11-02', '12:00:00', 'rainy', None, None]])
    sc = s.copy(deep=True)
    events_to_log(s, e, EMPTY_STOCK)
    pd.testing.assert_frame_equal(s, sc)
