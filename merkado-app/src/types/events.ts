import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types (CONTRACT §3)
// ---------------------------------------------------------------------------

export type Payment = 'Cash' | 'GCash' | 'Utang';

export interface EventBase {
  id: string;
  date: string; // 'YYYY-MM-DD', Manila local
  time: string; // 'HH:MM:SS', Manila local
  device_id: string;
}

export interface SaleLine {
  product_id: number;
  qty: number;
  unit_price: number | null;
}

export type AppEvent =
  | (EventBase & { type: 'sale'; payment: Payment; items: SaleLine[] })
  | (EventBase & { type: 'stockout'; product_id: number })
  | (EventBase & { type: 'rainy' | 'closed' })
  | (EventBase & { type: 'stock_count'; product_id: number; count: number })
  | (EventBase & { type: 'void'; trans_id: string });

export interface OutboxRow {
  seq?: number;
  event: AppEvent;
  status: 'pending' | 'rejected';
  attempts: number;
  reason?: string;
  created_at: number;
}

export interface SubmitResult {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: string }[];
  server_time: string;
}

// ---------------------------------------------------------------------------
// zod schemas (mirror the database checks in CONTRACT §2.1)
// ---------------------------------------------------------------------------

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}:\d{2}$/;

export const paymentSchema = z.enum(['Cash', 'GCash', 'Utang']);

const idSchema = z.string().min(1);
const dateSchema = z.string().regex(dateRe, 'invalid date');
const timeSchema = z.string().regex(timeRe, 'invalid time');
const deviceIdSchema = z.string().min(1);

const productIdSchema = z.number().int().positive();

export const saleLineSchema = z.object({
  product_id: productIdSchema,
  qty: z.number().int().positive(), // qty integer > 0
  unit_price: z.number().nonnegative().nullable(),
});

const baseShape = {
  id: idSchema,
  date: dateSchema,
  time: timeSchema,
  device_id: deviceIdSchema,
};

const saleSchema = z.object({
  ...baseShape,
  type: z.literal('sale'),
  payment: paymentSchema,
  items: z.array(saleLineSchema).min(1, 'sale has no items'),
});

const stockoutSchema = z.object({
  ...baseShape,
  type: z.literal('stockout'),
  product_id: productIdSchema,
});

const dayEventSchema = z.object({
  ...baseShape,
  type: z.enum(['rainy', 'closed']),
});

const stockCountSchema = z.object({
  ...baseShape,
  type: z.literal('stock_count'),
  product_id: productIdSchema,
  count: z.number().int().nonnegative(), // count integer >= 0
});

const voidSchema = z.object({
  ...baseShape,
  type: z.literal('void'),
  trans_id: z.string().min(1),
});

export const appEventSchema: z.ZodType<AppEvent> = z
  .discriminatedUnion('type', [
    saleSchema,
    stockoutSchema,
    dayEventSchema,
    stockCountSchema,
    voidSchema,
  ])
  .superRefine((ev, ctx) => {
    if (ev.type === 'sale') {
      const ids = ev.items.map((i) => i.product_id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate product_id in sale',
          path: ['items'],
        });
      }
    }
  }) as unknown as z.ZodType<AppEvent>;

export const submitResultSchema: z.ZodType<SubmitResult> = z.object({
  accepted: z.array(z.string()),
  duplicates: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
  server_time: z.string(),
});
