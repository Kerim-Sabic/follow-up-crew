export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          from_email: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          is_read: boolean
          lead_id: string | null
          mail_account_id: string | null
          sent_at: string
          snippet: string | null
          subject: string | null
          to_email: string | null
          user_id: string | null
          workspace: Database["public"]["Enums"]["workspace_key"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          from_email?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          mail_account_id?: string | null
          sent_at?: string
          snippet?: string | null
          subject?: string | null
          to_email?: string | null
          user_id?: string | null
          workspace?: Database["public"]["Enums"]["workspace_key"]
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          from_email?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          mail_account_id?: string | null
          sent_at?: string
          snippet?: string | null
          subject?: string | null
          to_email?: string | null
          user_id?: string | null
          workspace?: Database["public"]["Enums"]["workspace_key"]
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_mail_account_id_fkey"
            columns: ["mail_account_id"]
            isOneToOne: false
            referencedRelation: "mail_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stages: {
        Row: {
          base_status: Database["public"]["Enums"]["lead_status"]
          color: string
          created_at: string
          id: string
          is_builtin: boolean
          key: string
          label: string
          position: number
          workspace: Database["public"]["Enums"]["workspace_key"]
        }
        Insert: {
          base_status?: Database["public"]["Enums"]["lead_status"]
          color?: string
          created_at?: string
          id?: string
          is_builtin?: boolean
          key: string
          label: string
          position?: number
          workspace: Database["public"]["Enums"]["workspace_key"]
        }
        Update: {
          base_status?: Database["public"]["Enums"]["lead_status"]
          color?: string
          created_at?: string
          id?: string
          is_builtin?: boolean
          key?: string
          label?: string
          position?: number
          workspace?: Database["public"]["Enums"]["workspace_key"]
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          curation: string | null
          email: string | null
          evidence: string | null
          full_name: string | null
          id: string
          instagram_url: string | null
          last_touched_at: string | null
          last_touched_by: string | null
          match_note: string | null
          niche: string | null
          number: number | null
          owner_id: string | null
          score: number | null
          stage: string | null
          status: Database["public"]["Enums"]["lead_status"]
          username: string
          workspace: Database["public"]["Enums"]["workspace_key"]
        }
        Insert: {
          created_at?: string
          curation?: string | null
          email?: string | null
          evidence?: string | null
          full_name?: string | null
          id?: string
          instagram_url?: string | null
          last_touched_at?: string | null
          last_touched_by?: string | null
          match_note?: string | null
          niche?: string | null
          number?: number | null
          owner_id?: string | null
          score?: number | null
          stage?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          username: string
          workspace?: Database["public"]["Enums"]["workspace_key"]
        }
        Update: {
          created_at?: string
          curation?: string | null
          email?: string | null
          evidence?: string | null
          full_name?: string | null
          id?: string
          instagram_url?: string | null
          last_touched_at?: string | null
          last_touched_by?: string | null
          match_note?: string | null
          niche?: string | null
          number?: number | null
          owner_id?: string | null
          score?: number | null
          stage?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          username?: string
          workspace?: Database["public"]["Enums"]["workspace_key"]
        }
        Relationships: [
          {
            foreignKeyName: "leads_last_touched_by_fkey"
            columns: ["last_touched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_accounts: {
        Row: {
          app_user_id: string
          connection_key_ciphertext: string | null
          connector_id: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_synced_at: string | null
          reconnect_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          app_user_id: string
          connection_key_ciphertext?: string | null
          connector_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_synced_at?: string | null
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          app_user_id?: string
          connection_key_ciphertext?: string | null
          connector_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_synced_at?: string | null
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      lead_status: "not_contacted" | "contacted" | "replied" | "deal" | "dead"
      workspace_key: "docmesker" | "justin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lead_status: ["not_contacted", "contacted", "replied", "deal", "dead"],
      workspace_key: ["docmesker", "justin"],
    },
  },
} as const
