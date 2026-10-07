// Generated from the Supabase project schema (P1-08). Do not edit by hand —
// regenerate after every migration (Supabase MCP generate_typescript_types).
// Money columns are bigint fils in Postgres and arrive as integer numbers.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          organization_id: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          organization_id: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          organization_id?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_periods_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          ct_tag: string | null
          id: string
          is_active: boolean
          is_control: boolean
          name: string
          organization_id: string
          parent_id: string | null
          report_group: string | null
          subtype: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          ct_tag?: string | null
          id?: string
          is_active?: boolean
          is_control?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          report_group?: string | null
          subtype?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          ct_tag?: string | null
          id?: string
          is_active?: boolean
          is_control?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          report_group?: string | null
          subtype?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_ct_tag_fkey"
            columns: ["ct_tag"]
            isOneToOne: false
            referencedRelation: "ct_tags"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_organization_id_fkey"
            columns: ["parent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          firm_id: string | null
          id: number
          occurred_at: string
          organization_id: string | null
          reason: string | null
          row_id: string | null
          table_name: string
          txid: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          firm_id?: string | null
          id?: never
          occurred_at?: string
          organization_id?: string | null
          reason?: string | null
          row_id?: string | null
          table_name: string
          txid?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          firm_id?: string | null
          id?: never
          occurred_at?: string
          organization_id?: string | null
          reason?: string | null
          row_id?: string | null
          table_name?: string
          txid?: number
        }
        Relationships: []
      }
      coa_template_accounts: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          ct_tag: string | null
          id: string
          is_control: boolean
          name: string
          report_group: string | null
          subtype: string | null
          template_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          ct_tag?: string | null
          id?: string
          is_control?: boolean
          name: string
          report_group?: string | null
          subtype?: string | null
          template_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          ct_tag?: string | null
          id?: string
          is_control?: boolean
          name?: string
          report_group?: string | null
          subtype?: string | null
          template_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coa_template_accounts_ct_tag_fkey"
            columns: ["ct_tag"]
            isOneToOne: false
            referencedRelation: "ct_tags"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "coa_template_accounts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "coa_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      coa_templates: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      compliance_rules: {
        Row: {
          anchor: Database["public"]["Enums"]["compliance_anchor"]
          applies_when: string | null
          created_at: string
          created_by: string | null
          is_active: boolean
          key: string
          kind: Database["public"]["Enums"]["compliance_kind"]
          offset_config_key: string | null
          offset_days: number | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anchor: Database["public"]["Enums"]["compliance_anchor"]
          applies_when?: string | null
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          key: string
          kind: Database["public"]["Enums"]["compliance_kind"]
          offset_config_key?: string | null
          offset_days?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anchor?: Database["public"]["Enums"]["compliance_anchor"]
          applies_when?: string | null
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          key?: string
          kind?: Database["public"]["Enums"]["compliance_kind"]
          offset_config_key?: string | null
          offset_days?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_rules_offset_config_key_fkey"
            columns: ["offset_config_key"]
            isOneToOne: false
            referencedRelation: "config_keys"
            referencedColumns: ["key"]
          },
        ]
      }
      config_keys: {
        Row: {
          created_at: string
          created_by: string | null
          formula: string | null
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          value_type: Database["public"]["Enums"]["config_value_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          formula?: string | null
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
          value_type: Database["public"]["Enums"]["config_value_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          formula?: string | null
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value_type?: Database["public"]["Enums"]["config_value_type"]
        }
        Relationships: []
      }
      config_values: {
        Row: {
          created_at: string
          created_by: string | null
          key: string
          last_verified: string | null
          legal_reference: string | null
          needs_verification: boolean
          updated_at: string
          updated_by: string | null
          value: Json
          version_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          key: string
          last_verified?: string | null
          legal_reference?: string | null
          needs_verification?: boolean
          updated_at?: string
          updated_by?: string | null
          value: Json
          version_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          key?: string
          last_verified?: string | null
          legal_reference?: string | null
          needs_verification?: boolean
          updated_at?: string
          updated_by?: string | null
          value?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_values_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "config_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "config_values_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      config_versions: {
        Row: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          based_on: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          label: string
          status: Database["public"]["Enums"]["config_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          based_on?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          label: string
          status?: Database["public"]["Enums"]["config_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          based_on?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          label?: string
          status?: Database["public"]["Enums"]["config_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "config_versions_based_on_fkey"
            columns: ["based_on"]
            isOneToOne: false
            referencedRelation: "config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_tags: {
        Row: {
          addback_key: string | null
          code: string
          created_at: string
          created_by: string | null
          label: string
          legal_reference: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          addback_key?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          label: string
          legal_reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          addback_key?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          label?: string
          legal_reference?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ct_tags_addback_key_fkey"
            columns: ["addback_key"]
            isOneToOne: false
            referencedRelation: "config_keys"
            referencedColumns: ["key"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          minor_units: number
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          minor_units?: number
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          minor_units?: number
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          key: string
          subject: string
          updated_at: string
          updated_by: string | null
          variables: string[]
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          key: string
          subject: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          key?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Relationships: []
      }
      emirates: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          name: string
          updated_at: string
          updated_by: string | null
          vat_box: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
          vat_box: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
          vat_box?: string
        }
        Relationships: [
          {
            foreignKeyName: "emirates_vat_box_fkey"
            columns: ["vat_box"]
            isOneToOne: true
            referencedRelation: "vat_boxes"
            referencedColumns: ["code"]
          },
        ]
      }
      firm_members: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          firm_id: string
          role: Database["public"]["Enums"]["firm_role"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          firm_id: string
          role: Database["public"]["Enums"]["firm_role"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          firm_id?: string
          role?: Database["public"]["Enums"]["firm_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_members_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_settings: {
        Row: {
          created_at: string
          created_by: string | null
          firm_id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          firm_id: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          firm_id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "firm_settings_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          emirate_code: string | null
          id: string
          is_platform_owner: boolean
          legal_name: string
          logo_path: string | null
          status: Database["public"]["Enums"]["firm_status"]
          tax_agent_number: string | null
          trn: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          emirate_code?: string | null
          id?: string
          is_platform_owner?: boolean
          legal_name: string
          logo_path?: string | null
          status?: Database["public"]["Enums"]["firm_status"]
          tax_agent_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          emirate_code?: string | null
          id?: string
          is_platform_owner?: boolean
          legal_name?: string
          logo_path?: string | null
          status?: Database["public"]["Enums"]["firm_status"]
          tax_agent_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firms_emirate_code_fkey"
            columns: ["emirate_code"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["code"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          firm_id: string
          full_name: string | null
          id: string
          invited_by: string | null
          link_copied_at: string | null
          organization_id: string | null
          role: string
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
          updated_by: string | null
          valid_to: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          firm_id: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          link_copied_at?: string | null
          organization_id?: string | null
          role: string
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
          updated_by?: string | null
          valid_to?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          firm_id?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          link_copied_at?: string | null
          organization_id?: string | null
          role?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
          updated_by?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          amount_fcy: number | null
          created_at: string
          created_by: string | null
          credit: number
          currency: string
          debit: number
          description: string | null
          fx_rate: number
          id: string
          journal_id: string
          line_no: number
          organization_id: string
          supply_emirate: string | null
          tax_code: string | null
          updated_at: string
          updated_by: string | null
          vat_amount: number
        }
        Insert: {
          account_id: string
          amount_fcy?: number | null
          created_at?: string
          created_by?: string | null
          credit?: number
          currency?: string
          debit?: number
          description?: string | null
          fx_rate?: number
          id?: string
          journal_id: string
          line_no: number
          organization_id: string
          supply_emirate?: string | null
          tax_code?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
        }
        Update: {
          account_id?: string
          amount_fcy?: number | null
          created_at?: string
          created_by?: string | null
          credit?: number
          currency?: string
          debit?: number
          description?: string | null
          fx_rate?: number
          id?: string
          journal_id?: string
          line_no?: number
          organization_id?: string
          supply_emirate?: string | null
          tax_code?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_organization_id_fkey"
            columns: ["account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "journal_lines_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_lines_journal_id_organization_id_fkey"
            columns: ["journal_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "journal_lines_supply_emirate_fkey"
            columns: ["supply_emirate"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_lines_tax_code_fkey"
            columns: ["tax_code"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      journals: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          journal_no: string | null
          memo: string | null
          organization_id: string
          posted_at: string | null
          prepared_by: string | null
          reversal_of: string | null
          source: Database["public"]["Enums"]["journal_source"]
          source_id: string | null
          status: Database["public"]["Enums"]["journal_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_date: string
          id?: string
          journal_no?: string | null
          memo?: string | null
          organization_id: string
          posted_at?: string | null
          prepared_by?: string | null
          reversal_of?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          journal_no?: string | null
          memo?: string | null
          organization_id?: string
          posted_at?: string | null
          prepared_by?: string | null
          reversal_of?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_reversal_of_organization_id_fkey"
            columns: ["reversal_of", "organization_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          next_value: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          next_value?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          next_value?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string
          created_by: string | null
          granted_by: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          updated_by: string | null
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          granted_by?: string | null
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          granted_by?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          base_currency: string
          brand_color: string | null
          created_at: string
          created_by: string | null
          ct_regime: Database["public"]["Enums"]["ct_regime"]
          ct_trn: string | null
          emirate_code: string
          firm_id: string
          fy_start_month: number
          id: string
          industry: string | null
          legal_name: string
          licence_authority: string | null
          licence_expiry: string | null
          licence_no: string | null
          manager_id: string | null
          prior_year_revenue: number
          status: Database["public"]["Enums"]["org_status"]
          trade_name: string | null
          trn: string | null
          updated_at: string
          updated_by: string | null
          vat_first_period_end: string | null
          vat_period: Database["public"]["Enums"]["vat_period"] | null
          vat_registered: boolean
        }
        Insert: {
          base_currency?: string
          brand_color?: string | null
          created_at?: string
          created_by?: string | null
          ct_regime?: Database["public"]["Enums"]["ct_regime"]
          ct_trn?: string | null
          emirate_code: string
          firm_id: string
          fy_start_month?: number
          id?: string
          industry?: string | null
          legal_name: string
          licence_authority?: string | null
          licence_expiry?: string | null
          licence_no?: string | null
          manager_id?: string | null
          prior_year_revenue?: number
          status?: Database["public"]["Enums"]["org_status"]
          trade_name?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_first_period_end?: string | null
          vat_period?: Database["public"]["Enums"]["vat_period"] | null
          vat_registered?: boolean
        }
        Update: {
          base_currency?: string
          brand_color?: string | null
          created_at?: string
          created_by?: string | null
          ct_regime?: Database["public"]["Enums"]["ct_regime"]
          ct_trn?: string | null
          emirate_code?: string
          firm_id?: string
          fy_start_month?: number
          id?: string
          industry?: string | null
          legal_name?: string
          licence_authority?: string | null
          licence_expiry?: string | null
          licence_no?: string | null
          manager_id?: string | null
          prior_year_revenue?: number
          status?: Database["public"]["Enums"]["org_status"]
          trade_name?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_first_period_end?: string | null
          vat_period?: Database["public"]["Enums"]["vat_period"] | null
          vat_registered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "organizations_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organizations_emirate_code_fkey"
            columns: ["emirate_code"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organizations_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          is_super_admin: boolean
          last_sign_in_at: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id: string
          is_super_admin?: boolean
          last_sign_in_at?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_super_admin?: boolean
          last_sign_in_at?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tax_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          input_box: string | null
          is_active: boolean
          label: string
          output_box: string | null
          output_by_emirate: boolean
          pint_category: string | null
          rate_key: string | null
          recoverable: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          input_box?: string | null
          is_active?: boolean
          label: string
          output_box?: string | null
          output_by_emirate?: boolean
          pint_category?: string | null
          rate_key?: string | null
          recoverable?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          input_box?: string | null
          is_active?: boolean
          label?: string
          output_box?: string | null
          output_by_emirate?: boolean
          pint_category?: string | null
          rate_key?: string | null
          recoverable?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_codes_input_box_fkey"
            columns: ["input_box"]
            isOneToOne: false
            referencedRelation: "vat_boxes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tax_codes_output_box_fkey"
            columns: ["output_box"]
            isOneToOne: false
            referencedRelation: "vat_boxes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tax_codes_rate_key_fkey"
            columns: ["rate_key"]
            isOneToOne: false
            referencedRelation: "config_keys"
            referencedColumns: ["key"]
          },
        ]
      }
      tax_periods: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string
          end_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_period_kind"]
          organization_id: string
          start_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date: string
          end_date: string
          id?: string
          kind: Database["public"]["Enums"]["tax_period_kind"]
          organization_id: string
          start_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string
          end_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["tax_period_kind"]
          organization_id?: string
          start_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_boxes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          has_adjustment_column: boolean
          has_amount_column: boolean
          has_vat_column: boolean
          is_total: boolean
          label: string
          section: string
          sort: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          has_adjustment_column?: boolean
          has_amount_column: boolean
          has_vat_column: boolean
          is_total?: boolean
          label: string
          section: string
          sort: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          has_adjustment_column?: boolean
          has_amount_column?: boolean
          has_vat_column?: boolean
          is_total?: boolean
          label?: string
          section?: string
          sort?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: never; Returns: string }
      approve_config_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: undefined
      }
      config_value: { Args: { p_key: string; p_on?: string }; Returns: Json }
      create_client: {
        Args: {
          p_accountant_ids?: string[]
          p_books_start: string
          p_ct_regime?: Database["public"]["Enums"]["ct_regime"]
          p_ct_trn?: string
          p_emirate_code: string
          p_fy_start_month?: number
          p_industry?: string
          p_legal_name: string
          p_licence_authority?: string
          p_licence_expiry?: string
          p_licence_no?: string
          p_manager_id?: string
          p_prior_year_revenue?: number
          p_trade_name?: string
          p_trn?: string
          p_vat_first_period_end?: string
          p_vat_period?: Database["public"]["Enums"]["vat_period"]
          p_vat_registered?: boolean
        }
        Returns: string
      }
      create_invitation: {
        Args: { p_email: string; p_full_name: string; p_role: string }
        Returns: {
          email: string
          expires_at: string
          firm_name: string
          full_name: string
          invitation_id: string
          inviter_name: string
          role: string
        }[]
      }
      lock_period: {
        Args: { p_period_id: string; p_reason?: string }
        Returns: undefined
      }
      mark_invite_link_copied: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      post_journal: { Args: { p_journal_id: string }; Returns: string }
      reopen_period: {
        Args: { p_period_id: string; p_reason: string }
        Returns: undefined
      }
      reverse_journal: {
        Args: { p_date?: string; p_journal_id: string; p_reason: string }
        Returns: string
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_super_admin: {
        Args: { p_reason: string; p_user: string; p_value: boolean }
        Returns: undefined
      }
      set_user_status: {
        Args: {
          p_reason: string
          p_status: Database["public"]["Enums"]["user_status"]
          p_user: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      compliance_anchor:
        | "vat_period_end"
        | "fy_end"
        | "licence_expiry"
        | "fixed_date"
      compliance_kind: "vat" | "ct" | "licence" | "einvoicing"
      config_status: "draft" | "approved"
      config_value_type: "bp" | "fils" | "days" | "months" | "date" | "rate"
      ct_regime: "standard" | "sbr" | "qfzp"
      doc_type:
        | "journal"
        | "sales_invoice"
        | "credit_note"
        | "receipt"
        | "payment"
      firm_role: "firm_admin" | "firm_accountant"
      firm_status: "active" | "suspended"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      journal_source:
        | "manual"
        | "sale"
        | "purchase"
        | "receipt"
        | "payment"
        | "bank"
        | "opening"
        | "reversal"
        | "vat"
        | "ct"
      journal_status: "draft" | "pending" | "posted" | "reversed"
      org_role:
        | "firm_accountant"
        | "client_owner"
        | "client_staff"
        | "read_only"
      org_status: "onboarding" | "active" | "archived"
      period_status: "open" | "locked"
      tax_period_kind: "vat" | "ct"
      user_status: "active" | "suspended"
      vat_period: "quarterly" | "monthly"
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
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      compliance_anchor: [
        "vat_period_end",
        "fy_end",
        "licence_expiry",
        "fixed_date",
      ],
      compliance_kind: ["vat", "ct", "licence", "einvoicing"],
      config_status: ["draft", "approved"],
      config_value_type: ["bp", "fils", "days", "months", "date", "rate"],
      ct_regime: ["standard", "sbr", "qfzp"],
      doc_type: [
        "journal",
        "sales_invoice",
        "credit_note",
        "receipt",
        "payment",
      ],
      firm_role: ["firm_admin", "firm_accountant"],
      firm_status: ["active", "suspended"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      journal_source: [
        "manual",
        "sale",
        "purchase",
        "receipt",
        "payment",
        "bank",
        "opening",
        "reversal",
        "vat",
        "ct",
      ],
      journal_status: ["draft", "pending", "posted", "reversed"],
      org_role: [
        "firm_accountant",
        "client_owner",
        "client_staff",
        "read_only",
      ],
      org_status: ["onboarding", "active", "archived"],
      period_status: ["open", "locked"],
      tax_period_kind: ["vat", "ct"],
      user_status: ["active", "suspended"],
      vat_period: ["quarterly", "monthly"],
    },
  },
} as const
