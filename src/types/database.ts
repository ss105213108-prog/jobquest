export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      resume_profiles: {
        Row: { user_id: string; name: string; skills: Json; projects: Json; experience: Json | null; education: Json | null; career_directions: Json; parsed_data: Json | null; created_at: string; updated_at: string }
        Insert: { user_id: string; name?: string; skills?: Json; projects?: Json; experience?: Json | null; education?: Json | null; career_directions?: Json; parsed_data?: Json | null; created_at?: string; updated_at?: string }
        Update: { user_id?: string; name?: string; skills?: Json; projects?: Json; experience?: Json | null; education?: Json | null; career_directions?: Json; parsed_data?: Json | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      job_preferences: {
        Row: { user_id: string; source: string; keyword: string; location: string; sort_by: string; created_at: string; updated_at: string }
        Insert: { user_id: string; source: string; keyword?: string; location?: string; sort_by?: string; created_at?: string; updated_at?: string }
        Update: { user_id?: string; source?: string; keyword?: string; location?: string; sort_by?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      user_job_actions: {
        Row: { user_id: string; job_key: string; source: string; favorite: boolean; viewed: boolean; applied: boolean; rejected: boolean; created_at: string; updated_at: string; job_snapshot: Json | null }
        Insert: { user_id: string; job_key: string; source: string; favorite?: boolean; viewed?: boolean; applied?: boolean; rejected?: boolean; created_at?: string; updated_at?: string; job_snapshot?: Json | null }
        Update: { user_id?: string; job_key?: string; source?: string; favorite?: boolean; viewed?: boolean; applied?: boolean; rejected?: boolean; created_at?: string; updated_at?: string; job_snapshot?: Json | null }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
