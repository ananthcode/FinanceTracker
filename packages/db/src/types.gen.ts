
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "app": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"hook_custom_access_token":
{ Args: { "event": Json }; Returns: Json
                           },
"is_active_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_max_hits": number,"p_window_seconds": number }; Returns: boolean
                           },
"record_sign_in":
{ Args: { "p_device": string,"p_method": string }; Returns: undefined
                           },
"redact_details":
{ Args: { "p_details": Json }; Returns: Json
                           },
"set_environment":
{ Args: { "p_name": string }; Returns: string
                           },
"write_audit":
{ Args: { "p_action": Database["public"]['Enums']["audit_action"],"p_actor_id": string,"p_actor_ref": string,"p_details"?: Json,"p_device_type"?: string,"p_target_id": string,"p_target_ref": string,"p_target_type": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_events": {
                  Row: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string | null,"actor_ref": string | null,"details": NonNullable<Json>,"device_type": string | null,"id": number,"occurred_at": string,"target_id": string | null,"target_ref": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"actor_ref"?: string | null,"details"?: NonNullable<Json>,"device_type"?: string | null,"id"?: never,"occurred_at"?: string,"target_id"?: string | null,"target_ref"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"actor_ref"?: string | null,"details"?: NonNullable<Json>,"device_type"?: string | null,"id"?: never,"occurred_at"?: string,"target_id"?: string | null,"target_ref"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_user_id": string | null,"created_at": string,"delivery_status": Database["public"]['Enums']["invitation_delivery_status"] | null,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["invitation_status"],"superseded_by": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"created_at"?: string,"delivery_status"?: Database["public"]['Enums']["invitation_delivery_status"] | null,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["invitation_status"],"superseded_by"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"created_at"?: string,"delivery_status"?: Database["public"]['Enums']["invitation_delivery_status"] | null,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["invitation_status"],"superseded_by"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_superseded_by_fkey"
      columns: ["superseded_by"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"email": string,"last_sign_in_at": string | null,"privacy_notice_shown_at": string | null,"role": Database["public"]['Enums']["user_role"],"setup_completed_at": string | null,"status": Database["public"]['Enums']["access_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"email": string,"last_sign_in_at"?: string | null,"privacy_notice_shown_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"setup_completed_at"?: string | null,"status"?: Database["public"]['Enums']["access_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string,"last_sign_in_at"?: string | null,"privacy_notice_shown_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"setup_completed_at"?: string | null,"status"?: Database["public"]['Enums']["access_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_preferences": {
                  Row: {
                    "base_currency": string,"date_format": Database["public"]['Enums']["date_format"],"fy_start_month": number,"number_format": Database["public"]['Enums']["number_format"],"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_currency"?: string,"date_format"?: Database["public"]['Enums']["date_format"],"fy_start_month"?: number,"number_format"?: Database["public"]['Enums']["number_format"],"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "base_currency"?: string,"date_format"?: Database["public"]['Enums']["date_format"],"fy_start_month"?: number,"number_format"?: Database["public"]['Enums']["number_format"],"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "access_status": "active"|"disabled","audit_action": "invitation_created"|"invitation_resent"|"invitation_revoked"|"invitation_accepted"|"invitation_expired"|"invitation_delivery_failed"|"owner_recovered"|"user_disabled"|"user_enabled"|"user_erased"|"sign_in_succeeded"|"sign_in_failed"|"sign_in_locked"|"password_reset_requested"|"password_reset_completed"|"signed_out"|"preference_changed"|"setup_completed"|"app_lock_enabled"|"app_lock_disabled","date_format": "dd-MMM-yyyy"|"dd/MM/yyyy"|"yyyy-MM-dd","invitation_delivery_status": "sent"|"failed","invitation_status": "pending"|"accepted"|"revoked"|"superseded","number_format": "indian"|"international","user_role": "owner"|"member"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "app": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "access_status": ["active", "disabled"],"audit_action": ["invitation_created", "invitation_resent", "invitation_revoked", "invitation_accepted", "invitation_expired", "invitation_delivery_failed", "owner_recovered", "user_disabled", "user_enabled", "user_erased", "sign_in_succeeded", "sign_in_failed", "sign_in_locked", "password_reset_requested", "password_reset_completed", "signed_out", "preference_changed", "setup_completed", "app_lock_enabled", "app_lock_disabled"],"date_format": ["dd-MMM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"],"invitation_delivery_status": ["sent", "failed"],"invitation_status": ["pending", "accepted", "revoked", "superseded"],"number_format": ["indian", "international"],"user_role": ["owner", "member"]
          }
        }
} as const
