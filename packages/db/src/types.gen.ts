
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
            "_apply_account":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_group":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_one":
{ Args: { "p_change": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_change_result":
{ Args: { "p_merge": Json,"p_renamed"?: string,"p_status": string }; Returns: Json
                           },
"_free_account_name":
{ Args: { "p_name": string,"p_user": string }; Returns: string
                           },
"_free_group_name":
{ Args: { "p_name": string,"p_user": string }; Returns: string
                           },
"_set_change_context":
{ Args: { "p_change_id": string,"p_merge": Json,"p_renamed": boolean }; Returns: undefined
                           },
"account_balance_minor":
{ Args: { "p_account": string }; Returns: number
                           },
"account_has_activity":
{ Args: { "p_account": string }; Returns: boolean
                           },
"admin_audit_feed":
{ Args: { "p_cursor"?: number,"p_limit"?: number }; Returns: {
              "action": Database["public"]['Enums']["audit_action"],"actor_ref": string,"id": number,"occurred_at": string,"target_ref": string
            }[]
                           },
"admin_list_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"display_name": string,"email": string,"last_sign_in_at": string,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["access_status"],"user_id": string
            }[]
                           },
"apply_changes":
{ Args: { "p_changes": Json,"p_device": string }; Returns: Json
                           },
"clear_failed_sign_ins":
{ Args: { "p_email": string }; Returns: undefined
                           },
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
"merge_field_versions":
{ Args: { "p_fields": (string)[],"p_hlc": string,"p_received_at": string,"p_versions": Json }; Returns: Json
                           },
"pull_changes":
{ Args: { "p_cursor": number,"p_limit"?: number }; Returns: Json
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
"register_failed_sign_in":
{ Args: { "p_email": string }; Returns: Json
                           },
"scrub_user_from_audit":
{ Args: { "p_email": string,"p_user": string }; Returns: string
                           },
"set_environment":
{ Args: { "p_name": string }; Returns: string
                           },
"set_user_status":
{ Args: { "p_actor": string,"p_status": Database["public"]['Enums']["access_status"],"p_user": string }; Returns: undefined
                           },
"sign_in_lock_status":
{ Args: { "p_email": string }; Returns: Json
                           },
"transfer_owner":
{ Args: { "p_new_owner": string }; Returns: undefined
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
            "account_groups": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"name": string,"server_seq": number,"sort_key": string,"state": Database["public"]['Enums']["record_state"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"name": string,"server_seq": number,"sort_key": string,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"name"?: string,"server_seq"?: number,"sort_key"?: string,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"accounts": {
                  Row: {
                    "archived_at": string | null,"colour": string,"created_at": string,"credit_limit_minor": number | null,"currency": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"group_id": string | null,"icon": string,"id": string,"include_in_net_worth": boolean,"name": string,"notes": string | null,"opening_balance_date": string,"opening_balance_minor": number,"server_seq": number,"sort_key": string,"state": Database["public"]['Enums']["record_state"],"type": Database["public"]['Enums']["account_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"colour": string,"created_at"?: string,"credit_limit_minor"?: number | null,"currency": string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"group_id"?: string | null,"icon": string,"id": string,"include_in_net_worth"?: boolean,"name": string,"notes"?: string | null,"opening_balance_date": string,"opening_balance_minor": number,"server_seq": number,"sort_key": string,"state"?: Database["public"]['Enums']["record_state"],"type": Database["public"]['Enums']["account_type"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"colour"?: string,"created_at"?: string,"credit_limit_minor"?: number | null,"currency"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"group_id"?: string | null,"icon"?: string,"id"?: string,"include_in_net_worth"?: boolean,"name"?: string,"notes"?: string | null,"opening_balance_date"?: string,"opening_balance_minor"?: number,"server_seq"?: number,"sort_key"?: string,"state"?: Database["public"]['Enums']["record_state"],"type"?: Database["public"]['Enums']["account_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_group_id_user_id_fkey"
      columns: ["group_id","user_id"]
isOneToOne: false
      referencedRelation: "account_groups"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"audit_events": {
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
            "access_status": "active"|"disabled","account_type": "bank"|"cash"|"wallet"|"credit_card","accounts_view": "by_type"|"my_groups","audit_action": "invitation_created"|"invitation_resent"|"invitation_revoked"|"invitation_accepted"|"invitation_expired"|"invitation_delivery_failed"|"owner_recovered"|"user_disabled"|"user_enabled"|"user_erased"|"sign_in_succeeded"|"sign_in_failed"|"sign_in_locked"|"password_reset_requested"|"password_reset_completed"|"signed_out"|"preference_changed"|"setup_completed"|"app_lock_enabled"|"app_lock_disabled"|"account_created"|"account_edited"|"account_reordered"|"account_archived"|"account_restored"|"account_deleted"|"account_sync_renamed"|"account_group_created"|"account_group_renamed"|"account_group_reordered"|"account_group_deleted","date_format": "dd-MMM-yyyy"|"dd/MM/yyyy"|"yyyy-MM-dd","invitation_delivery_status": "sent"|"failed","invitation_status": "pending"|"accepted"|"revoked"|"superseded","number_format": "indian"|"international","record_state": "active"|"archived"|"deleted","user_role": "owner"|"member"
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
            "access_status": ["active", "disabled"],"account_type": ["bank", "cash", "wallet", "credit_card"],"accounts_view": ["by_type", "my_groups"],"audit_action": ["invitation_created", "invitation_resent", "invitation_revoked", "invitation_accepted", "invitation_expired", "invitation_delivery_failed", "owner_recovered", "user_disabled", "user_enabled", "user_erased", "sign_in_succeeded", "sign_in_failed", "sign_in_locked", "password_reset_requested", "password_reset_completed", "signed_out", "preference_changed", "setup_completed", "app_lock_enabled", "app_lock_disabled", "account_created", "account_edited", "account_reordered", "account_archived", "account_restored", "account_deleted", "account_sync_renamed", "account_group_created", "account_group_renamed", "account_group_reordered", "account_group_deleted"],"date_format": ["dd-MMM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"],"invitation_delivery_status": ["sent", "failed"],"invitation_status": ["pending", "accepted", "revoked", "superseded"],"number_format": ["indian", "international"],"record_state": ["active", "archived", "deleted"],"user_role": ["owner", "member"]
          }
        }
} as const
