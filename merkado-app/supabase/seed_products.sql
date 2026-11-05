-- Placeholder product list derived from MerkaDo_EDA/data/aling-nena-sales-q1-2026.csv
-- until the partner store's real list is known.
-- sort_order = rank by total units sold in Q1 2026.

insert into public.products (product, unit, pack_multiplier, price, sort_order) values
  ('Pandesal',               'pc',    1,   3.00,  1),
  ('Egg',                    'pc',    1,   9.00,  2),
  ('Ice Candy',              'pc',    1,   5.00,  3),
  ('Kopiko 3-in-1',          'pc',    1,   8.00,  4),
  ('Shampoo Sachet',         'pc',    1,   8.00,  5),
  ('Nescafe 3-in-1',         'pc',    1,   9.00,  6),
  ('Lucky Me Pancit Canton', 'pc',    1,  15.00,  7),
  ('Tide Sachet',            'pc',    1,  12.00,  8),
  ('Coke Mismo',             'pc',    1,  20.00,  9),
  ('Sky Flakes',             'pc',    1,   8.00, 10),
  ('Rice',                   'kilo',  1,  55.00, 11),
  ('Royal Mismo',            'pc',    1,  20.00, 12),
  ('Piattos',                'pc',    1,  17.00, 13),
  ('Lucky Me Beef Noodles',  'pc',    1,  13.00, 14),
  ('Cooking Oil Pouch',      'pc',    1,  25.00, 15),
  ('Sugar',                  'kilo',  1,  70.00, 16),
  ('Palmolive Soap',         'pc',    1,  30.00, 17),
  ('Bottled Water 500ml',    'pc',    1,  15.00, 18),
  ('Cellphone Load 50',      'pc',    1,  50.00, 19),
  ('Datu Puti Soy Sauce',    'pc',    1,  18.00, 20),
  ('Tasty Bread',            'pc',    1,  65.00, 21),
  ('Cellphone Load 100',     'pc',    1, 100.00, 22),
  -- pack variants
  ('Pandesal',               'bag',  10,  30.00, 23),
  ('Shampoo Sachet',         'banig',12,  96.00, 24),
  ('Kopiko 3-in-1',          'banig',12,  96.00, 25)
on conflict (product, unit) do nothing;

-- CSV names 'Rice (kilo)' / 'Sugar (kilo)' are stored as product 'Rice'/'Sugar'
-- with unit 'kilo' because products.product forbids brackets.
