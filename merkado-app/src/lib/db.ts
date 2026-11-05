import Dexie, { type Table } from 'dexie';
import type { OutboxRow, Payment, SaleLine } from '../types/events';

/** Product cached from the server so the grid works offline. */
export interface Product {
  product_id: number;
  product: string;
  unit: string;
  pack_multiplier: number;
  price: number | null;
  sort_order: number;
  active: boolean;
}

/** A sale as stored on the server, used for the Ngayon screen. */
export interface ServerSale {
  trans_id: string;
  sale_date: string;
  sale_time: string;
  payment: Payment;
  voided: boolean;
  items: SaleLine[];
}

/** Arbitrary key/value metadata (device_id, server clock skew, last sale date…). */
export interface MetaRow {
  key: string;
  value: unknown;
}

export class MerkaDoDB extends Dexie {
  outbox!: Table<OutboxRow, number>;
  products!: Table<Product, number>;
  todaySales!: Table<ServerSale, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('merkado');
    this.version(1).stores({
      // ++seq = auto-incrementing primary key; status/created_at indexed for queries
      outbox: '++seq, status, created_at',
      products: 'product_id, sort_order, active',
      todaySales: 'trans_id, sale_date',
      meta: 'key',
    });
  }
}

export const db = new MerkaDoDB();
