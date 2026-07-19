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
      clone_jobs: {
        Row: {
          active_refinement_id: string | null
          created_at: string
          ditto_job_id: string | null
          error: string | null
          files_path: string | null
          framework: string
          id: string
          last_event: Json | null
          mode: string
          refined_at: string | null
          refined_brief: string | null
          refined_error: string | null
          refined_path: string | null
          refined_status: string | null
          result: Json | null
          source_url: string
          status: string
          styling: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_refinement_id?: string | null
          created_at?: string
          ditto_job_id?: string | null
          error?: string | null
          files_path?: string | null
          framework?: string
          id?: string
          last_event?: Json | null
          mode?: string
          refined_at?: string | null
          refined_brief?: string | null
          refined_error?: string | null
          refined_path?: string | null
          refined_status?: string | null
          result?: Json | null
          source_url: string
          status?: string
          styling?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_refinement_id?: string | null
          created_at?: string
          ditto_job_id?: string | null
          error?: string | null
          files_path?: string | null
          framework?: string
          id?: string
          last_event?: Json | null
          mode?: string
          refined_at?: string | null
          refined_brief?: string | null
          refined_error?: string | null
          refined_path?: string | null
          refined_status?: string | null
          result?: Json | null
          source_url?: string
          status?: string
          styling?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clone_jobs_active_refinement_id_fkey"
            columns: ["active_refinement_id"]
            isOneToOne: false
            referencedRelation: "clone_refinements"
            referencedColumns: ["id"]
          },
        ]
      }
      clone_refinements: {
        Row: {
          audit: string | null
          brief: string | null
          changes: string | null
          created_at: string
          error: string | null
          id: string
          job_id: string
          model: string | null
          preview_path: string | null
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          audit?: string | null
          brief?: string | null
          changes?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          model?: string | null
          preview_path?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version: number
        }
        Update: {
          audit?: string | null
          brief?: string | null
          changes?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          model?: string | null
          preview_path?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clone_refinements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "clone_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          auth_token: string | null
          created_at: string
          enabled: boolean
          id: string
          last_checked_at: string | null
          last_error: string | null
          name: string
          tools: Json | null
          transport: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          auth_token?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          name: string
          tools?: Json | null
          transport?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          auth_token?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          name?: string
          tools?: Json | null
          transport?: string
          updated_at?: string
          url?: string
          user_id?: string
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
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
