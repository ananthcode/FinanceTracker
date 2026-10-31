
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
"_apply_category":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_group":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_one":
{ Args: { "p_change": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_payee":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_person_rate":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_tag":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_apply_transaction":
{ Args: { "p_change_id": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_kind": string,"p_options": Json,"p_received_at": string,"p_user": string }; Returns: Json
                           },
"_bump_version":
{ Args: { "p_field": string,"p_hlc": string,"p_versions": Json }; Returns: Json
                           },
"_category_subtree":
{ Args: { "p_root": string,"p_user": string }; Returns: string[]
                           },
"_change_result":
{ Args: { "p_merge": Json,"p_renamed"?: string,"p_status": string }; Returns: Json
                           },
"_ctx_hlc":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_flow_of":
{ Args: { "p_action": Database["public"]['Enums']["person_action"],"p_given": Database["public"]['Enums']["money_flow"],"p_kind": Database["public"]['Enums']["transaction_kind"] }; Returns: Database["public"]['Enums']["money_flow"]
                           },
"_free_account_name":
{ Args: { "p_name": string,"p_user": string }; Returns: string
                           },
"_free_category_name":
{ Args: { "p_kind": Database["public"]['Enums']["category_kind"],"p_name": string,"p_parent": string,"p_user": string }; Returns: string
                           },
"_free_group_name":
{ Args: { "p_name": string,"p_user": string }; Returns: string
                           },
"_free_payee_name":
{ Args: { "p_name": string,"p_user": string }; Returns: string
                           },
"_free_tag_name":
{ Args: { "p_name": string,"p_user": string }; Returns: string
                           },
"_interest_amount":
{ Args: { "p_opening": number,"p_rate_e4": number }; Returns: number
                           },
"_load_demo":
{ Args: { "p_changes": Json,"p_device": string,"p_user": string }; Returns: Json
                           },
"_merge_category":
{ Args: { "p_hlc": string,"p_source": string,"p_target": string,"p_user": string }; Returns: undefined
                           },
"_merge_payee":
{ Args: { "p_hlc": string,"p_source": string,"p_target": string,"p_user": string }; Returns: undefined
                           },
"_merge_tag":
{ Args: { "p_hlc": string,"p_source": string,"p_target": string,"p_user": string }; Returns: undefined
                           },
"_my_reset_seq":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_propose_interest":
{ Args: { "p_today": string,"p_user": string }; Returns: number
                           },
"_relocate":
{ Args: { "p_change_id": string,"p_entity": string,"p_fields": Json,"p_hlc": string,"p_id": string,"p_user": string }; Returns: Json
                           },
"_repoint_category":
{ Args: { "p_hlc": string,"p_source": string,"p_target": string,"p_user": string }; Returns: number
                           },
"_repoint_payee":
{ Args: { "p_hlc": string,"p_merging": boolean,"p_source": string,"p_target": string,"p_user": string }; Returns: number
                           },
"_repoint_tag":
{ Args: { "p_hlc": string,"p_source": string,"p_target": string,"p_user": string }; Returns: number
                           },
"_reset_user_data":
{ Args: { "p_device": string,"p_user": string }; Returns: Json
                           },
"_set_change_context":
{ Args: { "p_change_id": string,"p_merge": Json,"p_renamed": boolean }; Returns: undefined
                           },
"_uuid_array":
{ Args: { "p": Json }; Returns: (string)[]
                           },
"_validate_transaction":
{ Args: { "p_check_active": boolean,"p_user": string,"t": Omit<Database["public"]['Tables']["transactions"]['Row'], Database["public"]['Tables']["transactions"]['ComputedFields']> }; Returns: undefined
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
"balance_movements":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"category_has_activity":
{ Args: { "p_category": string }; Returns: boolean
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
"load_demo_data":
{ Args: { "p_changes": Json,"p_device": string }; Returns: Json
                           },
"merge_field_versions":
{ Args: { "p_fields": (string)[],"p_hlc": string,"p_received_at": string,"p_versions": Json }; Returns: Json
                           },
"payee_has_activity":
{ Args: { "p_payee": string }; Returns: boolean
                           },
"person_balance_minor":
{ Args: { "p_payee": string }; Returns: number
                           },
"propose_interest":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"reset_and_load_demo":
{ Args: { "p_changes": Json,"p_device": string }; Returns: Json
                           },
"reset_my_data":
{ Args: { "p_device": string }; Returns: Json
                           },
"scrub_user_from_audit":
{ Args: { "p_email": string,"p_user": string }; Returns: string
                           },
"search_transactions":
{ Args: { "p_after"?: Json,"p_filters"?: Json,"p_limit"?: number }; Returns: Json
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
"start_categories":
{ Args: { "p_choice": Database["public"]['Enums']["categories_start"],"p_defaults": Json,"p_device"?: string }; Returns: Json
                           },
"tag_usage_count":
{ Args: { "p_tag": string }; Returns: number
                           },
"to_confirm_count":
{ Args: Record<PropertyKey, never>; Returns: number
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
                },"categories": {
                  Row: {
                    "colour": string,"created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"hidden": boolean,"icon": string,"id": string,"kind": Database["public"]['Enums']["category_kind"],"merged_into": string | null,"name": string,"parent_id": string | null,"server_seq": number,"state": Database["public"]['Enums']["record_state"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "colour": string,"created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"hidden"?: boolean,"icon": string,"id": string,"kind": Database["public"]['Enums']["category_kind"],"merged_into"?: string | null,"name": string,"parent_id"?: string | null,"server_seq": number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "colour"?: string,"created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"hidden"?: boolean,"icon"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["category_kind"],"merged_into"?: string | null,"name"?: string,"parent_id"?: string | null,"server_seq"?: number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_merged_into_user_id_fkey"
      columns: ["merged_into","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "categories_parent_id_user_id_kind_fkey"
      columns: ["parent_id","user_id","kind"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id","kind"]
    }
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
                },"payees": {
                  Row: {
                    "created_at": string,"default_category_id": string | null,"deleted_at": string | null,"field_versions": NonNullable<Json>,"hidden": boolean,"id": string,"include_in_net_worth": boolean,"interest_mode": Database["public"]['Enums']["interest_mode"],"kind": Database["public"]['Enums']["payee_kind"],"merged_into": string | null,"name": string,"notes": string | null,"opening_balance_date": string | null,"opening_balance_minor": number,"server_seq": number,"state": Database["public"]['Enums']["record_state"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_category_id"?: string | null,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"hidden"?: boolean,"id": string,"include_in_net_worth"?: boolean,"interest_mode"?: Database["public"]['Enums']["interest_mode"],"kind": Database["public"]['Enums']["payee_kind"],"merged_into"?: string | null,"name": string,"notes"?: string | null,"opening_balance_date"?: string | null,"opening_balance_minor"?: number,"server_seq": number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"default_category_id"?: string | null,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"hidden"?: boolean,"id"?: string,"include_in_net_worth"?: boolean,"interest_mode"?: Database["public"]['Enums']["interest_mode"],"kind"?: Database["public"]['Enums']["payee_kind"],"merged_into"?: string | null,"name"?: string,"notes"?: string | null,"opening_balance_date"?: string | null,"opening_balance_minor"?: number,"server_seq"?: number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payees_default_category_id_user_id_fkey"
      columns: ["default_category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "payees_merged_into_user_id_fkey"
      columns: ["merged_into","user_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"person_rates": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"effective_month": string,"field_versions": NonNullable<Json>,"id": string,"payee_id": string,"rate_e4": number,"server_seq": number,"state": Database["public"]['Enums']["record_state"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"effective_month": string,"field_versions"?: NonNullable<Json>,"id": string,"payee_id": string,"rate_e4": number,"server_seq": number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"effective_month"?: string,"field_versions"?: NonNullable<Json>,"id"?: string,"payee_id"?: string,"rate_e4"?: number,"server_seq"?: number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_rates_payee_id_user_id_fkey"
      columns: ["payee_id","user_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["id","user_id"]
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
                },"tags": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"merged_into": string | null,"name": string,"server_seq": number,"state": Database["public"]['Enums']["record_state"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"merged_into"?: string | null,"name": string,"server_seq": number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"merged_into"?: string | null,"name"?: string,"server_seq"?: number,"state"?: Database["public"]['Enums']["record_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_merged_into_user_id_fkey"
      columns: ["merged_into","user_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string | null,"amount_minor": number,"category_id": string | null,"confirmed": boolean,"created_at": string,"date": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"flow": Database["public"]['Enums']["money_flow"],"generated": boolean,"id": string,"interest_month": string | null,"kind": Database["public"]['Enums']["transaction_kind"],"lines": NonNullable<Json>,"notes": string | null,"payee_id": string | null,"person_action": Database["public"]['Enums']["person_action"] | null,"reference": string | null,"server_seq": number,"state": Database["public"]['Enums']["record_state"],"status": Database["public"]['Enums']["transaction_status"],"tag_ids": (string)[],"time_of_day": string | null,"to_account_id": string | null,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount_minor": number,"category_id"?: string | null,"confirmed"?: boolean,"created_at"?: string,"date": string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"flow": Database["public"]['Enums']["money_flow"],"generated"?: boolean,"id": string,"interest_month"?: string | null,"kind": Database["public"]['Enums']["transaction_kind"],"lines"?: NonNullable<Json>,"notes"?: string | null,"payee_id"?: string | null,"person_action"?: Database["public"]['Enums']["person_action"] | null,"reference"?: string | null,"server_seq": number,"state"?: Database["public"]['Enums']["record_state"],"status"?: Database["public"]['Enums']["transaction_status"],"tag_ids"?: (string)[],"time_of_day"?: string | null,"to_account_id"?: string | null,"updated_at"?: string,"user_edited"?: boolean,"user_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_minor"?: number,"category_id"?: string | null,"confirmed"?: boolean,"created_at"?: string,"date"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"flow"?: Database["public"]['Enums']["money_flow"],"generated"?: boolean,"id"?: string,"interest_month"?: string | null,"kind"?: Database["public"]['Enums']["transaction_kind"],"lines"?: NonNullable<Json>,"notes"?: string | null,"payee_id"?: string | null,"person_action"?: Database["public"]['Enums']["person_action"] | null,"reference"?: string | null,"server_seq"?: number,"state"?: Database["public"]['Enums']["record_state"],"status"?: Database["public"]['Enums']["transaction_status"],"tag_ids"?: (string)[],"time_of_day"?: string | null,"to_account_id"?: string | null,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_user_id_fkey"
      columns: ["account_id","user_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_payee_id_user_id_fkey"
      columns: ["payee_id","user_id"]
isOneToOne: false
      referencedRelation: "payees"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_to_account_id_user_id_fkey"
      columns: ["to_account_id","user_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "accounts_view": Database["public"]['Enums']["accounts_view"],"base_currency": string,"categories_start": Database["public"]['Enums']["categories_start"] | null,"date_format": Database["public"]['Enums']["date_format"],"fy_start_month": number,"number_format": Database["public"]['Enums']["number_format"],"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accounts_view"?: Database["public"]['Enums']["accounts_view"],"base_currency"?: string,"categories_start"?: Database["public"]['Enums']["categories_start"] | null,"date_format"?: Database["public"]['Enums']["date_format"],"fy_start_month"?: number,"number_format"?: Database["public"]['Enums']["number_format"],"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "accounts_view"?: Database["public"]['Enums']["accounts_view"],"base_currency"?: string,"categories_start"?: Database["public"]['Enums']["categories_start"] | null,"date_format"?: Database["public"]['Enums']["date_format"],"fy_start_month"?: number,"number_format"?: Database["public"]['Enums']["number_format"],"timezone"?: string,"updated_at"?: string,"user_id"?: string
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
            "access_status": "active"|"disabled","account_type": "bank"|"cash"|"wallet"|"credit_card","accounts_view": "by_type"|"my_groups","audit_action": "invitation_created"|"invitation_resent"|"invitation_revoked"|"invitation_accepted"|"invitation_expired"|"invitation_delivery_failed"|"owner_recovered"|"user_disabled"|"user_enabled"|"user_erased"|"sign_in_succeeded"|"sign_in_failed"|"sign_in_locked"|"password_reset_requested"|"password_reset_completed"|"signed_out"|"preference_changed"|"setup_completed"|"app_lock_enabled"|"app_lock_disabled"|"account_created"|"account_edited"|"account_reordered"|"account_archived"|"account_restored"|"account_deleted"|"account_sync_renamed"|"account_group_created"|"account_group_renamed"|"account_group_reordered"|"account_group_deleted"|"category_created"|"category_edited"|"category_moved"|"category_hidden"|"category_unhidden"|"category_merged"|"category_deleted"|"category_sync_renamed"|"tag_created"|"tag_renamed"|"tag_merged"|"tag_deleted"|"tag_sync_renamed"|"payee_created"|"payee_edited"|"payee_hidden"|"payee_unhidden"|"payee_merged"|"payee_deleted"|"payee_sync_renamed"|"transaction_created"|"transaction_edited"|"transaction_confirmed"|"transaction_deleted"|"person_rate_created"|"person_rate_edited"|"person_rate_deleted"|"category_relocated"|"payee_relocated"|"demo_data_loaded"|"data_reset","categories_start": "suggested"|"empty","category_kind": "expense"|"income","date_format": "dd-MMM-yyyy"|"dd/MM/yyyy"|"yyyy-MM-dd","interest_mode": "none"|"automatic"|"manual","invitation_delivery_status": "sent"|"failed","invitation_status": "pending"|"accepted"|"revoked"|"superseded","money_flow": "out"|"in","number_format": "indian"|"international","payee_kind": "business"|"person","person_action": "lent"|"repaid_to"|"paid_on_behalf"|"borrowed"|"received_back"|"collected_on_behalf"|"adjustment","record_state": "active"|"archived"|"deleted","transaction_kind": "expense"|"income"|"refund"|"transfer"|"person"|"interest","transaction_status": "uncleared"|"cleared"|"follow_up"|"void","user_role": "owner"|"member"
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
            "access_status": ["active", "disabled"],"account_type": ["bank", "cash", "wallet", "credit_card"],"accounts_view": ["by_type", "my_groups"],"audit_action": ["invitation_created", "invitation_resent", "invitation_revoked", "invitation_accepted", "invitation_expired", "invitation_delivery_failed", "owner_recovered", "user_disabled", "user_enabled", "user_erased", "sign_in_succeeded", "sign_in_failed", "sign_in_locked", "password_reset_requested", "password_reset_completed", "signed_out", "preference_changed", "setup_completed", "app_lock_enabled", "app_lock_disabled", "account_created", "account_edited", "account_reordered", "account_archived", "account_restored", "account_deleted", "account_sync_renamed", "account_group_created", "account_group_renamed", "account_group_reordered", "account_group_deleted", "category_created", "category_edited", "category_moved", "category_hidden", "category_unhidden", "category_merged", "category_deleted", "category_sync_renamed", "tag_created", "tag_renamed", "tag_merged", "tag_deleted", "tag_sync_renamed", "payee_created", "payee_edited", "payee_hidden", "payee_unhidden", "payee_merged", "payee_deleted", "payee_sync_renamed", "transaction_created", "transaction_edited", "transaction_confirmed", "transaction_deleted", "person_rate_created", "person_rate_edited", "person_rate_deleted", "category_relocated", "payee_relocated", "demo_data_loaded", "data_reset"],"categories_start": ["suggested", "empty"],"category_kind": ["expense", "income"],"date_format": ["dd-MMM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"],"interest_mode": ["none", "automatic", "manual"],"invitation_delivery_status": ["sent", "failed"],"invitation_status": ["pending", "accepted", "revoked", "superseded"],"money_flow": ["out", "in"],"number_format": ["indian", "international"],"payee_kind": ["business", "person"],"person_action": ["lent", "repaid_to", "paid_on_behalf", "borrowed", "received_back", "collected_on_behalf", "adjustment"],"record_state": ["active", "archived", "deleted"],"transaction_kind": ["expense", "income", "refund", "transfer", "person", "interest"],"transaction_status": ["uncleared", "cleared", "follow_up", "void"],"user_role": ["owner", "member"]
          }
        }
} as const
