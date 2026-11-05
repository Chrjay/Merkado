// Hand-written to match the output shape of `supabase gen types typescript`.
// There is no live Supabase project yet (CONTRACT: deviations). Tables and the
// two RPCs mirror merkado-app/supabase/schema.sql (CONTRACT §2).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          product_id: number;
          product: string;
          unit: string;
          pack_multiplier: number;
          price: number | null;
          sort_order: number;
          active: boolean;
        };
        Insert: {
          product_id?: number;
          product: string;
          unit?: string;
          pack_multiplier?: number;
          price?: number | null;
          sort_order?: number;
          active?: boolean;
        };
        Update: {
          product_id?: number;
          product?: string;
          unit?: string;
          pack_multiplier?: number;
          price?: number | null;
          sort_order?: number;
          active?: boolean;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          trans_id: string;
          sale_date: string;
          sale_time: string;
          payment: string;
          device_id: string | null;
          received_at: string;
          voided: boolean;
          voided_at: string | null;
        };
        Insert: {
          trans_id: string;
          sale_date: string;
          sale_time: string;
          payment: string;
          device_id?: string | null;
          received_at?: string;
          voided?: boolean;
          voided_at?: string | null;
        };
        Update: {
          trans_id?: string;
          sale_date?: string;
          sale_time?: string;
          payment?: string;
          device_id?: string | null;
          received_at?: string;
          voided?: boolean;
          voided_at?: string | null;
        };
        Relationships: [];
      };
      sale_items: {
        Row: {
          trans_id: string;
          line_no: number;
          product_id: number;
          qty: number;
          unit_price: number | null;
        };
        Insert: {
          trans_id: string;
          line_no: number;
          product_id: number;
          qty: number;
          unit_price?: number | null;
        };
        Update: {
          trans_id?: string;
          line_no?: number;
          product_id?: number;
          qty?: number;
          unit_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_items_trans_id_fkey';
            columns: ['trans_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['trans_id'];
          },
          {
            foreignKeyName: 'sale_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['product_id'];
          },
        ];
      };
      day_events: {
        Row: {
          event_id: string;
          event_date: string;
          event_time: string;
          type: string;
          product_id: number | null;
          device_id: string | null;
          received_at: string;
        };
        Insert: {
          event_id: string;
          event_date: string;
          event_time: string;
          type: string;
          product_id?: number | null;
          device_id?: string | null;
          received_at?: string;
        };
        Update: {
          event_id?: string;
          event_date?: string;
          event_time?: string;
          type?: string;
          product_id?: number | null;
          device_id?: string | null;
          received_at?: string;
        };
        Relationships: [];
      };
      stock_counts: {
        Row: {
          event_id: string;
          count_date: string;
          count_time: string;
          product_id: number;
          count: number;
          device_id: string | null;
          received_at: string;
        };
        Insert: {
          event_id: string;
          count_date: string;
          count_time: string;
          product_id: number;
          count: number;
          device_id?: string | null;
          received_at?: string;
        };
        Update: {
          event_id?: string;
          count_date?: string;
          count_time?: string;
          product_id?: number;
          count?: number;
          device_id?: string | null;
          received_at?: string;
        };
        Relationships: [];
      };
      store_users: {
        Row: { user_id: string; role: string };
        Insert: { user_id: string; role: string };
        Update: { user_id?: string; role?: string };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      submit_events: {
        Args: { p_events: Json };
        Returns: Json;
      };
      void_sale: {
        Args: { p_trans_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
