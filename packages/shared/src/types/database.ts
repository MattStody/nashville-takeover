// Supabase schema types, from generate_typescript_types on the deployed
// schema (relationship metadata omitted; the apps join in code). Regenerate
// after every migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OpSource = Database['public']['Enums']['op_source'];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          device_id: string | null;
          entity: string;
          entity_id: string | null;
          event_id: string | null;
          id: number;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          device_id?: string | null;
          entity: string;
          entity_id?: string | null;
          event_id?: string | null;
          id?: never;
          reason?: string | null;
        };
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
        Relationships: [];
      };
      check_ins: {
        Row: {
          device_id: string | null;
          event_id: string;
          id: string;
          luma_synced_at: string | null;
          op_id: string;
          received_at: string;
          scanned_at: string;
          source: OpSource;
          staff_user_id: string;
          ticket_id: string;
          undo_reason: string | null;
          undone_at: string | null;
          undone_by: string | null;
        };
        Insert: {
          device_id?: string | null;
          event_id: string;
          id?: string;
          luma_synced_at?: string | null;
          op_id: string;
          received_at?: string;
          scanned_at: string;
          source: OpSource;
          staff_user_id: string;
          ticket_id: string;
          undo_reason?: string | null;
          undone_at?: string | null;
          undone_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['check_ins']['Insert']>;
        Relationships: [];
      };
      event_content: {
        Row: {
          body: string | null;
          created_at: string;
          event_id: string;
          id: string;
          image_path: string | null;
          kind: Database['public']['Enums']['content_kind'];
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          image_path?: string | null;
          kind: Database['public']['Enums']['content_kind'];
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['event_content']['Insert']>;
        Relationships: [];
      };
      events: {
        Row: {
          accent_color: string | null;
          created_at: string;
          description: string | null;
          ends_at: string;
          hero_image_path: string | null;
          id: string;
          logo_path: string | null;
          luma_event_id: string | null;
          name: string;
          primary_color: string | null;
          slug: string;
          starts_at: string;
          status: Database['public']['Enums']['event_status'];
          timezone: string;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
        };
        Insert: {
          accent_color?: string | null;
          created_at?: string;
          description?: string | null;
          ends_at: string;
          hero_image_path?: string | null;
          id?: string;
          logo_path?: string | null;
          luma_event_id?: string | null;
          name: string;
          primary_color?: string | null;
          slug: string;
          starts_at: string;
          status?: Database['public']['Enums']['event_status'];
          timezone?: string;
          updated_at?: string;
          venue_address?: string | null;
          venue_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['events']['Insert']>;
        Relationships: [];
      };
      guests: {
        Row: {
          approval_status: string;
          created_at: string;
          email: string;
          event_id: string;
          guest_key: string;
          id: string;
          luma_guest_id: string;
          name: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          approval_status: string;
          created_at?: string;
          email: string;
          event_id: string;
          guest_key: string;
          id?: string;
          luma_guest_id: string;
          name?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['guests']['Insert']>;
        Relationships: [];
      };
      lineup_favorites: {
        Row: { created_at: string; lineup_item_id: string; user_id: string };
        Insert: { created_at?: string; lineup_item_id: string; user_id: string };
        Update: { created_at?: string; lineup_item_id?: string; user_id?: string };
        Relationships: [];
      };
      lineup_items: {
        Row: {
          artist: string;
          created_at: string;
          description: string | null;
          ends_at: string;
          event_id: string;
          id: string;
          image_path: string | null;
          stage: string;
          starts_at: string;
          updated_at: string;
        };
        Insert: {
          artist: string;
          created_at?: string;
          description?: string | null;
          ends_at: string;
          event_id: string;
          id?: string;
          image_path?: string | null;
          stage: string;
          starts_at: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['lineup_items']['Insert']>;
        Relationships: [];
      };
      luma_key_aliases: {
        Row: { created_at: string; event_id: string; guest_id: string; key: string; ticket_id: string | null };
        Insert: { created_at?: string; event_id: string; guest_id: string; key: string; ticket_id?: string | null };
        Update: Partial<Database['public']['Tables']['luma_key_aliases']['Insert']>;
        Relationships: [];
      };
      luma_sync_runs: {
        Row: {
          cursor: string | null;
          error: string | null;
          event_id: string;
          finished_at: string | null;
          guests_upserted: number;
          id: string;
          started_at: string;
          started_by: string | null;
          status: Database['public']['Enums']['sync_status'];
          tickets_upserted: number;
          trigger: Database['public']['Enums']['sync_trigger'];
          updated_at: string;
        };
        Insert: {
          cursor?: string | null;
          error?: string | null;
          event_id: string;
          finished_at?: string | null;
          guests_upserted?: number;
          id?: string;
          started_at?: string;
          started_by?: string | null;
          status?: Database['public']['Enums']['sync_status'];
          tickets_upserted?: number;
          trigger: Database['public']['Enums']['sync_trigger'];
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['luma_sync_runs']['Insert']>;
        Relationships: [];
      };
      luma_webhook_receipts: {
        Row: { delivery_id: string; event_type: string; luma_event_id: string | null; received_at: string };
        Insert: { delivery_id: string; event_type: string; luma_event_id?: string | null; received_at?: string };
        Update: Partial<Database['public']['Tables']['luma_webhook_receipts']['Insert']>;
        Relationships: [];
      };
      notification_reads: {
        Row: { notification_id: string; read_at: string; user_id: string };
        Insert: { notification_id: string; read_at?: string; user_id: string };
        Update: { notification_id?: string; read_at?: string; user_id?: string };
        Relationships: [];
      };
      notifications: {
        Row: {
          audience_ticket_type_ids: string[] | null;
          body: string;
          created_at: string;
          created_by: string | null;
          event_id: string;
          id: string;
          sent_at: string | null;
          sent_by: string | null;
          title: string;
        };
        Insert: {
          audience_ticket_type_ids?: string[] | null;
          body: string;
          created_at?: string;
          created_by?: string | null;
          event_id: string;
          id?: string;
          sent_at?: string | null;
          sent_by?: string | null;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      perk_redemptions: {
        Row: {
          device_id: string | null;
          event_id: string;
          id: string;
          kind: Database['public']['Enums']['redemption_kind'];
          op_id: string;
          perk_id: string;
          quantity: number;
          reason: string | null;
          received_at: string;
          scanned_at: string;
          source: OpSource;
          staff_user_id: string;
          ticket_id: string;
        };
        Insert: {
          device_id?: string | null;
          event_id: string;
          id?: string;
          kind: Database['public']['Enums']['redemption_kind'];
          op_id: string;
          perk_id: string;
          quantity: number;
          reason?: string | null;
          received_at?: string;
          scanned_at: string;
          source: OpSource;
          staff_user_id: string;
          ticket_id: string;
        };
        Update: Partial<Database['public']['Tables']['perk_redemptions']['Insert']>;
        Relationships: [];
      };
      perks: {
        Row: {
          created_at: string;
          description: string | null;
          event_id: string;
          icon: string | null;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          event_id: string;
          icon?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: Partial<Database['public']['Tables']['perks']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          is_admin: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          is_admin?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      push_tokens: {
        Row: { platform: string; token: string; updated_at: string; user_id: string };
        Insert: { platform: string; token: string; updated_at?: string; user_id: string };
        Update: { platform?: string; token?: string; updated_at?: string; user_id?: string };
        Relationships: [];
      };
      sponsor_activations: {
        Row: {
          created_at: string;
          cta_url: string | null;
          description: string | null;
          event_id: string;
          id: string;
          location: string | null;
          logo_path: string | null;
          sort_order: number;
          sponsor_name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          cta_url?: string | null;
          description?: string | null;
          event_id: string;
          id?: string;
          location?: string | null;
          logo_path?: string | null;
          sort_order?: number;
          sponsor_name: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sponsor_activations']['Insert']>;
        Relationships: [];
      };
      sponsor_views: {
        Row: { id: number; sponsor_activation_id: string; user_id: string; viewed_at: string };
        Insert: { id?: never; sponsor_activation_id: string; user_id: string; viewed_at?: string };
        Update: { id?: never; sponsor_activation_id?: string; user_id?: string; viewed_at?: string };
        Relationships: [];
      };
      staff_assignments: {
        Row: {
          created_at: string;
          created_by: string | null;
          event_id: string;
          role: Database['public']['Enums']['staff_role'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          event_id: string;
          role: Database['public']['Enums']['staff_role'];
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['staff_assignments']['Insert']>;
        Relationships: [];
      };
      staff_invites: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          event_id: string | null;
          id: string;
          invited_by: string | null;
          make_admin: boolean;
          role: Database['public']['Enums']['staff_role'] | null;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          event_id?: string | null;
          id?: string;
          invited_by?: string | null;
          make_admin?: boolean;
          role?: Database['public']['Enums']['staff_role'] | null;
        };
        Update: Partial<Database['public']['Tables']['staff_invites']['Insert']>;
        Relationships: [];
      };
      ticket_type_perks: {
        Row: { event_id: string; perk_id: string; quantity: number; ticket_type_id: string };
        Insert: { event_id: string; perk_id: string; quantity: number; ticket_type_id: string };
        Update: { event_id?: string; perk_id?: string; quantity?: number; ticket_type_id?: string };
        Relationships: [];
      };
      ticket_types: {
        Row: {
          admits_entry: boolean;
          created_at: string;
          event_id: string;
          id: string;
          is_hidden: boolean;
          luma_ticket_type_id: string;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          admits_entry?: boolean;
          created_at?: string;
          event_id: string;
          id?: string;
          is_hidden?: boolean;
          luma_ticket_type_id: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['ticket_types']['Insert']>;
        Relationships: [];
      };
      tickets: {
        Row: {
          created_at: string;
          event_id: string;
          guest_id: string;
          id: string;
          luma_ticket_id: string;
          status: string;
          ticket_key: string | null;
          ticket_type_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          guest_id: string;
          id?: string;
          luma_ticket_id: string;
          status?: string;
          ticket_key?: string | null;
          ticket_type_id: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      perk_redemption_ledger: {
        Row: {
          balance_after: number | null;
          device_id: string | null;
          event_id: string | null;
          id: string | null;
          kind: Database['public']['Enums']['redemption_kind'] | null;
          op_id: string | null;
          over_limit: boolean | null;
          perk_id: string | null;
          quantity: number | null;
          reason: string | null;
          received_at: string | null;
          scanned_at: string | null;
          source: OpSource | null;
          staff_user_id: string | null;
          ticket_id: string | null;
        };
        Relationships: [];
      };
      ticket_check_in_status: {
        Row: {
          check_in_id: string | null;
          checked_in_at: string | null;
          checked_in_by: string | null;
          checked_in_device_id: string | null;
          checked_in_source: OpSource | null;
          event_id: string | null;
          scan_count: number | null;
          ticket_id: string | null;
        };
        Relationships: [];
      };
      ticket_perk_balances: {
        Row: {
          allowance: number | null;
          event_id: string | null;
          perk_id: string | null;
          perk_name: string | null;
          remaining: number | null;
          ticket_id: string | null;
          used: number | null;
          valid_from: string | null;
          valid_until: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      adjust_perk: {
        Args: { p_op_id: string; p_perk_id: string; p_quantity: number; p_reason: string; p_ticket_id: string };
        Returns: Json;
      };
      internal_secret: { Args: { p_name: string }; Returns: string };
      link_my_guests: { Args: never; Returns: number };
      luma_record_key_alias: {
        Args: { p_event_id: string; p_key: string; p_luma_guest_id: string; p_luma_ticket_id?: string };
        Returns: undefined;
      };
      luma_upsert_guests: { Args: { p_event_id: string; p_guests: Json }; Returns: Json };
      luma_upsert_ticket_types: { Args: { p_event_id: string; p_types: Json }; Returns: number };
      my_event_role: { Args: { p_event_id: string }; Returns: string };
      register_push_token: { Args: { p_platform: string; p_token: string }; Returns: undefined };
      record_check_in: {
        Args: {
          p_device_id?: string;
          p_op_id: string;
          p_scanned_at?: string;
          p_source?: OpSource;
          p_ticket_id: string;
        };
        Returns: Json;
      };
      record_perk_redemption: {
        Args: {
          p_device_id?: string;
          p_op_id: string;
          p_perk_id: string;
          p_quantity?: number;
          p_scanned_at?: string;
          p_source?: OpSource;
          p_ticket_id: string;
        };
        Returns: Json;
      };
      resolve_check_in_key: {
        Args: { p_event_id: string; p_key: string };
        Returns: { guest_id: string; matched_by: string; ticket_id: string }[];
      };
      undo_check_in: { Args: { p_check_in_id: string; p_reason: string }; Returns: undefined };
    };
    Enums: {
      content_kind: 'faq' | 'info' | 'map';
      event_status: 'draft' | 'published' | 'archived';
      op_source: 'online' | 'offline' | 'manual';
      redemption_kind: 'redeem' | 'adjust';
      staff_role: 'staff' | 'manager';
      sync_status: 'running' | 'succeeded' | 'failed';
      sync_trigger: 'manual' | 'cron' | 'webhook';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])> = (PublicSchema['Tables'] &
  PublicSchema['Views'])[T] extends { Row: infer R }
  ? R
  : never;
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
