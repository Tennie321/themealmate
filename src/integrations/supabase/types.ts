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
      catalog_items: {
        Row: {
          aisle: string
          allergens: string[]
          brand: string | null
          calories: number
          carbs_g: number
          category: string
          created_at: string
          diet_tags: string[]
          fat_g: number
          id: string
          image_url: string | null
          in_stock: boolean
          is_single_serving: boolean
          last_seen_at: string
          name: string
          price_cents: number
          protein_g: number
          serving_label: string
          source_url: string | null
          store_chain: string
          tags: string[]
        }
        Insert: {
          aisle?: string
          allergens?: string[]
          brand?: string | null
          calories: number
          carbs_g?: number
          category: string
          created_at?: string
          diet_tags?: string[]
          fat_g?: number
          id?: string
          image_url?: string | null
          in_stock?: boolean
          is_single_serving?: boolean
          last_seen_at?: string
          name: string
          price_cents?: number
          protein_g?: number
          serving_label?: string
          source_url?: string | null
          store_chain: string
          tags?: string[]
        }
        Update: {
          aisle?: string
          allergens?: string[]
          brand?: string | null
          calories?: number
          carbs_g?: number
          category?: string
          created_at?: string
          diet_tags?: string[]
          fat_g?: number
          id?: string
          image_url?: string | null
          in_stock?: boolean
          is_single_serving?: boolean
          last_seen_at?: string
          name?: string
          price_cents?: number
          protein_g?: number
          serving_label?: string
          source_url?: string | null
          store_chain?: string
          tags?: string[]
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          adherence_pct: number
          calories_actual: number
          calories_target: number
          created_at: string
          id: string
          notes: string | null
          plan_date: string
          plan_id: string | null
          protein_actual: number
          protein_target: number
          reflection: string | null
          user_id: string
        }
        Insert: {
          adherence_pct?: number
          calories_actual?: number
          calories_target?: number
          created_at?: string
          id?: string
          notes?: string | null
          plan_date: string
          plan_id?: string | null
          protein_actual?: number
          protein_target?: number
          reflection?: string | null
          user_id: string
        }
        Update: {
          adherence_pct?: number
          calories_actual?: number
          calories_target?: number
          created_at?: string
          id?: string
          notes?: string | null
          plan_date?: string
          plan_id?: string | null
          protein_actual?: number
          protein_target?: number
          reflection?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_meals: {
        Row: {
          calories: number
          created_at: string
          id: string
          logged_on: string
          name: string
          protein_g: number
          source: string | null
          user_id: string
        }
        Insert: {
          calories?: number
          created_at?: string
          id?: string
          logged_on?: string
          name: string
          protein_g?: number
          source?: string | null
          user_id: string
        }
        Update: {
          calories?: number
          created_at?: string
          id?: string
          logged_on?: string
          name?: string
          protein_g?: number
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          catalog_item_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          catalog_item_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          catalog_item_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          plan_date: string
          status: Database["public"]["Enums"]["plan_status"]
          total_calories: number
          total_cost_cents: number
          total_protein: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          plan_date: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_calories?: number
          total_cost_cents?: number
          total_protein?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          plan_date?: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_calories?: number
          total_cost_cents?: number
          total_protein?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          id: string
          kind: string
          read: boolean
          sent_at: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          id?: string
          kind: string
          read?: boolean
          sent_at?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          id?: string
          kind?: string
          read?: boolean
          sent_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_items: {
        Row: {
          catalog_item_id: string
          consumed: boolean
          created_at: string
          id: string
          is_locked: boolean
          meal_slot: Database["public"]["Enums"]["meal_slot"]
          plan_id: string
          position: number
          servings: number
          user_id: string
        }
        Insert: {
          catalog_item_id: string
          consumed?: boolean
          created_at?: string
          id?: string
          is_locked?: boolean
          meal_slot: Database["public"]["Enums"]["meal_slot"]
          plan_id: string
          position?: number
          servings?: number
          user_id: string
        }
        Update: {
          catalog_item_id?: string
          consumed?: boolean
          created_at?: string
          id?: string
          is_locked?: boolean
          meal_slot?: Database["public"]["Enums"]["meal_slot"]
          plan_id?: string
          position?: number
          servings?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          body: string | null
          comment_count: number
          created_at: string
          id: string
          image_url: string | null
          kind: Database["public"]["Enums"]["post_kind"]
          like_count: number
          meta: Json
          user_id: string
        }
        Insert: {
          body?: string | null
          comment_count?: number
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: Database["public"]["Enums"]["post_kind"]
          like_count?: number
          meta?: Json
          user_id: string
        }
        Update: {
          body?: string | null
          comment_count?: number
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: Database["public"]["Enums"]["post_kind"]
          like_count?: number
          meta?: Json
          user_id?: string
        }
        Relationships: []
      }
      preferences: {
        Row: {
          allergies: string[]
          diet_tags: string[]
          dislikes: string[]
          favorite_brands: string[]
          health_preference: string
          plan_mode: string
          single_serving_only: boolean
          taste_profile: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string[]
          diet_tags?: string[]
          dislikes?: string[]
          favorite_brands?: string[]
          health_preference?: string
          plan_mode?: string
          single_serving_only?: boolean
          taste_profile?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string[]
          diet_tags?: string[]
          dislikes?: string[]
          favorite_brands?: string[]
          health_preference?: string
          plan_mode?: string
          single_serving_only?: boolean
          taste_profile?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_premium: boolean
          last_briefing_date: string | null
          last_digest_date: string | null
          onboarded: boolean
          plan_expires_at: string | null
          plan_tier: string
          plans_generated_count: number
          plans_generated_on: string | null
          premium_expires_at: string | null
          reminder_times: Json
          reminders_enabled: boolean
          streak_freeze_count: number
          streak_freeze_reset_date: string | null
          streak_freeze_used_on: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_premium?: boolean
          last_briefing_date?: string | null
          last_digest_date?: string | null
          onboarded?: boolean
          plan_expires_at?: string | null
          plan_tier?: string
          plans_generated_count?: number
          plans_generated_on?: string | null
          premium_expires_at?: string | null
          reminder_times?: Json
          reminders_enabled?: boolean
          streak_freeze_count?: number
          streak_freeze_reset_date?: string | null
          streak_freeze_used_on?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_premium?: boolean
          last_briefing_date?: string | null
          last_digest_date?: string | null
          onboarded?: boolean
          plan_expires_at?: string | null
          plan_tier?: string
          plans_generated_count?: number
          plans_generated_on?: string | null
          premium_expires_at?: string | null
          reminder_times?: Json
          reminders_enabled?: boolean
          streak_freeze_count?: number
          streak_freeze_reset_date?: string | null
          streak_freeze_used_on?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          referred_email: string | null
          referred_user_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referred_email?: string | null
          referred_user_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referred_email?: string | null
          referred_user_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          catalog_item_id: string
          checked: boolean
          created_at: string
          id: string
          list_id: string
          qty: number
          substituted_with_id: string | null
          user_id: string
        }
        Insert: {
          catalog_item_id: string
          checked?: boolean
          created_at?: string
          id?: string
          list_id: string
          qty?: number
          substituted_with_id?: string | null
          user_id: string
        }
        Update: {
          catalog_item_id?: string
          checked?: boolean
          created_at?: string
          id?: string
          list_id?: string
          qty?: number
          substituted_with_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_substituted_with_id_fkey"
            columns: ["substituted_with_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["shopping_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["shopping_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["shopping_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          chain: string
          city: string | null
          created_at: string
          id: string
          name: string
          state: string | null
          website: string | null
        }
        Insert: {
          chain: string
          city?: string | null
          created_at?: string
          id?: string
          name: string
          state?: string | null
          website?: string | null
        }
        Update: {
          chain?: string
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          state?: string | null
          website?: string | null
        }
        Relationships: []
      }
      taste_signals: {
        Row: {
          catalog_item_id: string
          created_at: string
          id: string
          signal: Database["public"]["Enums"]["taste_signal"]
          user_id: string
          weight: number
        }
        Insert: {
          catalog_item_id: string
          created_at?: string
          id?: string
          signal: Database["public"]["Enums"]["taste_signal"]
          user_id: string
          weight?: number
        }
        Update: {
          catalog_item_id?: string
          created_at?: string
          id?: string
          signal?: Database["public"]["Enums"]["taste_signal"]
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "taste_signals_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_key: string
          earned_at: string
          id: string
          meta: Json
          user_id: string
        }
        Insert: {
          badge_key: string
          earned_at?: string
          id?: string
          meta?: Json
          user_id: string
        }
        Update: {
          badge_key?: string
          earned_at?: string
          id?: string
          meta?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          biometrics: Json
          calorie_target: number
          daily_budget_cents: number
          goal_type: Database["public"]["Enums"]["goal_type"]
          meal_targets: Json | null
          protein_target: number
          start_weight_kg: number | null
          target_weight_kg: number | null
          tdee: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          biometrics?: Json
          calorie_target?: number
          daily_budget_cents?: number
          goal_type?: Database["public"]["Enums"]["goal_type"]
          meal_targets?: Json | null
          protein_target?: number
          start_weight_kg?: number | null
          target_weight_kg?: number | null
          tdee?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          biometrics?: Json
          calorie_target?: number
          daily_budget_cents?: number
          goal_type?: Database["public"]["Enums"]["goal_type"]
          meal_targets?: Json | null
          protein_target?: number
          start_weight_kg?: number | null
          target_weight_kg?: number | null
          tdee?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_store: {
        Row: {
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_store_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          created_at: string
          id: string
          logged_on: string
          note: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_profiles: {
        Args: { _ids: string[] }
        Returns: {
          display_name: string
          id: string
        }[]
      }
    }
    Enums: {
      goal_type: "cut" | "lean_bulk" | "maintain" | "custom"
      meal_slot: "breakfast" | "lunch" | "dinner" | "snack" | "drink"
      plan_status: "active" | "completed" | "archived"
      post_kind: "progress" | "update" | "meal" | "share"
      shopping_status: "open" | "completed"
      taste_signal: "liked" | "disliked" | "swapped_out" | "eaten" | "favorited"
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
    Enums: {
      goal_type: ["cut", "lean_bulk", "maintain", "custom"],
      meal_slot: ["breakfast", "lunch", "dinner", "snack", "drink"],
      plan_status: ["active", "completed", "archived"],
      post_kind: ["progress", "update", "meal", "share"],
      shopping_status: ["open", "completed"],
      taste_signal: ["liked", "disliked", "swapped_out", "eaten", "favorited"],
    },
  },
} as const
