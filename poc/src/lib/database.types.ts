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
      asp_providers: {
        Row: {
          accreditation_no: string | null
          connector: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
          updated_at: string
          updated_by: string | null
          verified_on: string
          website: string | null
        }
        Insert: {
          accreditation_no?: string | null
          connector?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status: string
          updated_at?: string
          updated_by?: string | null
          verified_on?: string
          website?: string | null
        }
        Update: {
          accreditation_no?: string | null
          connector?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_on?: string
          website?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          purchase_bill_id: string | null
          sales_invoice_id: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          purchase_bill_id?: string | null
          sales_invoice_id?: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          purchase_bill_id?: string | null
          sales_invoice_id?: string | null
          sha256?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_purchase_bill_id_organization_id_fkey"
            columns: ["purchase_bill_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "attachments_sales_invoice_id_organization_id_fkey"
            columns: ["sales_invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      bank_accounts: {
        Row: {
          account_id: string
          bank_name: string | null
          column_mapping: Json | null
          created_at: string
          created_by: string | null
          currency: string
          iban_last4: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          bank_name?: string | null
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          currency?: string
          iban_last4?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          bank_name?: string | null
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          currency?: string
          iban_last4?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_account_id_organization_id_fkey"
            columns: ["account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bank_accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string
          book_balance: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          period_end: string
          prepared_by: string | null
          snapshot: Json
          statement_balance: number
          status: Database["public"]["Enums"]["document_status"]
          unreconciled_bank: number
          unreconciled_book: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id: string
          book_balance: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          period_end: string
          prepared_by?: string | null
          snapshot: Json
          statement_balance: number
          status?: Database["public"]["Enums"]["document_status"]
          unreconciled_bank: number
          unreconciled_book: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string
          book_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          period_end?: string
          prepared_by?: string | null
          snapshot?: Json
          statement_balance?: number
          status?: Database["public"]["Enums"]["document_status"]
          unreconciled_bank?: number
          unreconciled_book?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_book_lines"
            referencedColumns: ["bank_account_id", "organization_id"]
          },
          {
            foreignKeyName: "bank_reconciliations_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          bank_account_id: string
          closing_balance: number | null
          created_at: string
          created_by: string | null
          duplicate_count: number
          file_name: string
          file_sha256: string
          id: string
          imported_count: number
          line_count: number
          organization_id: string
          period_end: string | null
          period_start: string | null
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number | null
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          file_name: string
          file_sha256: string
          id?: string
          imported_count?: number
          line_count?: number
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number | null
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          file_name?: string
          file_sha256?: string
          id?: string
          imported_count?: number
          line_count?: number
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bank_statements_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_book_lines"
            referencedColumns: ["bank_account_id", "organization_id"]
          },
          {
            foreignKeyName: "bank_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          bank_account_id: string
          created_at: string
          created_by: string | null
          dedupe_hash: string
          description: string
          id: string
          journal_line_id: string | null
          matched_at: string | null
          matched_by: string | null
          organization_id: string
          reference: string | null
          statement_id: string
          status: Database["public"]["Enums"]["bank_txn_status"]
          txn_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          balance?: number | null
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          dedupe_hash: string
          description: string
          id?: string
          journal_line_id?: string | null
          matched_at?: string | null
          matched_by?: string | null
          organization_id: string
          reference?: string | null
          statement_id: string
          status?: Database["public"]["Enums"]["bank_txn_status"]
          txn_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          balance?: number | null
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          dedupe_hash?: string
          description?: string
          id?: string
          journal_line_id?: string | null
          matched_at?: string | null
          matched_by?: string | null
          organization_id?: string
          reference?: string | null
          statement_id?: string
          status?: Database["public"]["Enums"]["bank_txn_status"]
          txn_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bank_transactions_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_book_lines"
            referencedColumns: ["bank_account_id", "organization_id"]
          },
          {
            foreignKeyName: "bank_transactions_journal_line_id_fkey"
            columns: ["journal_line_id"]
            isOneToOne: true
            referencedRelation: "journal_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_id_organization_id_fkey"
            columns: ["statement_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      bill_checks: {
        Row: {
          check_code: string
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          label: string
          organization_id: string
          passed: boolean
          purchase_bill_id: string
          severity: Database["public"]["Enums"]["check_severity"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          check_code: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          label: string
          organization_id: string
          passed: boolean
          purchase_bill_id: string
          severity: Database["public"]["Enums"]["check_severity"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          check_code?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          label?: string
          organization_id?: string
          passed?: boolean
          purchase_bill_id?: string
          severity?: Database["public"]["Enums"]["check_severity"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_checks_purchase_bill_id_organization_id_fkey"
            columns: ["purchase_bill_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id", "organization_id"]
          },
        ]
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
      contacts: {
        Row: {
          address: string | null
          address_line1: string | null
          city: string | null
          country_code: string
          created_at: string
          created_by: string | null
          customer_type: string
          default_account_id: string | null
          default_tax_code: string | null
          einv_not_onboarded: boolean
          email: string | null
          emirate_code: string | null
          id: string
          is_active: boolean
          is_related_party: boolean
          kind: Database["public"]["Enums"]["contact_kind"]
          name: string
          organization_id: string
          passport_country: string | null
          payment_terms_days: number | null
          peppol_id: string | null
          peppol_scheme: string
          phone: string | null
          reg_authority: string | null
          reg_id: string | null
          reg_type: string | null
          region: string | null
          trn: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          customer_type?: string
          default_account_id?: string | null
          default_tax_code?: string | null
          einv_not_onboarded?: boolean
          email?: string | null
          emirate_code?: string | null
          id?: string
          is_active?: boolean
          is_related_party?: boolean
          kind: Database["public"]["Enums"]["contact_kind"]
          name: string
          organization_id: string
          passport_country?: string | null
          payment_terms_days?: number | null
          peppol_id?: string | null
          peppol_scheme?: string
          phone?: string | null
          reg_authority?: string | null
          reg_id?: string | null
          reg_type?: string | null
          region?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          customer_type?: string
          default_account_id?: string | null
          default_tax_code?: string | null
          einv_not_onboarded?: boolean
          email?: string | null
          emirate_code?: string | null
          id?: string
          is_active?: boolean
          is_related_party?: boolean
          kind?: Database["public"]["Enums"]["contact_kind"]
          name?: string
          organization_id?: string
          passport_country?: string | null
          payment_terms_days?: number | null
          peppol_id?: string | null
          peppol_scheme?: string
          phone?: string | null
          reg_authority?: string | null
          reg_id?: string | null
          reg_type?: string | null
          region?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_default_account_id_organization_id_fkey"
            columns: ["default_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contacts_default_tax_code_fkey"
            columns: ["default_tax_code"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "contacts_emirate_code_fkey"
            columns: ["emirate_code"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      einvoice_inbound: {
        Row: {
          created_at: string
          created_by: string | null
          doc_kind: string
          document_number: string
          einv_uuid: string
          id: string
          imported_at: string
          imported_by: string
          organization_id: string
          purchase_bill_id: string
          supplier_trn: string | null
          updated_at: string
          updated_by: string | null
          xml: string
          xml_sha256: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_kind: string
          document_number: string
          einv_uuid: string
          id?: string
          imported_at?: string
          imported_by: string
          organization_id: string
          purchase_bill_id: string
          supplier_trn?: string | null
          updated_at?: string
          updated_by?: string | null
          xml: string
          xml_sha256: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_kind?: string
          document_number?: string
          einv_uuid?: string
          id?: string
          imported_at?: string
          imported_by?: string
          organization_id?: string
          purchase_bill_id?: string
          supplier_trn?: string | null
          updated_at?: string
          updated_by?: string | null
          xml?: string
          xml_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_inbound_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_inbound_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_inbound_purchase_bill_id_organization_id_fkey"
            columns: ["purchase_bill_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      einvoice_submissions: {
        Row: {
          asp_provider_id: string
          asp_reference: string | null
          attempt: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          rejection_reason: string | null
          result_at: string | null
          result_by: string | null
          sales_invoice_id: string
          sent_at: string
          sent_by: string
          status: Database["public"]["Enums"]["einvoice_status"]
          updated_at: string
          updated_by: string | null
          xml_sha256: string
        }
        Insert: {
          asp_provider_id: string
          asp_reference?: string | null
          attempt: number
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          rejection_reason?: string | null
          result_at?: string | null
          result_by?: string | null
          sales_invoice_id: string
          sent_at?: string
          sent_by: string
          status?: Database["public"]["Enums"]["einvoice_status"]
          updated_at?: string
          updated_by?: string | null
          xml_sha256: string
        }
        Update: {
          asp_provider_id?: string
          asp_reference?: string | null
          attempt?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          rejection_reason?: string | null
          result_at?: string | null
          result_by?: string | null
          sales_invoice_id?: string
          sent_at?: string
          sent_by?: string
          status?: Database["public"]["Enums"]["einvoice_status"]
          updated_at?: string
          updated_by?: string | null
          xml_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_submissions_asp_provider_id_fkey"
            columns: ["asp_provider_id"]
            isOneToOne: false
            referencedRelation: "asp_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_submissions_result_by_fkey"
            columns: ["result_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_submissions_sales_invoice_id_organization_id_fkey"
            columns: ["sales_invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "einvoice_submissions_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          dedupe_key: string | null
          error: string | null
          id: string
          kind: string
          organization_id: string | null
          provider_id: string | null
          sent_at: string
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          dedupe_key?: string | null
          error?: string | null
          id?: string
          kind: string
          organization_id?: string | null
          provider_id?: string | null
          sent_at?: string
          status: string
          subject: string
          to_email: string
        }
        Update: {
          dedupe_key?: string | null
          error?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          provider_id?: string | null
          sent_at?: string
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      integrity_results: {
        Row: {
          check_code: string
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          label: string
          organization_id: string
          run_id: string
          status: Database["public"]["Enums"]["integrity_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          check_code: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          label: string
          organization_id: string
          run_id: string
          status: Database["public"]["Enums"]["integrity_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          check_code?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          label?: string
          organization_id?: string
          run_id?: string
          status?: Database["public"]["Enums"]["integrity_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrity_results_run_id_organization_id_fkey"
            columns: ["run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrity_latest"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "integrity_results_run_id_organization_id_fkey"
            columns: ["run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrity_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      integrity_runs: {
        Row: {
          created_at: string
          created_by: string | null
          errors: number
          id: string
          organization_id: string
          started_at: string
          status: Database["public"]["Enums"]["integrity_status"]
          trigger: string
          triggered_by: string | null
          updated_at: string
          updated_by: string | null
          warnings: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          errors?: number
          id?: string
          organization_id: string
          started_at?: string
          status: Database["public"]["Enums"]["integrity_status"]
          trigger: string
          triggered_by?: string | null
          updated_at?: string
          updated_by?: string | null
          warnings?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          errors?: number
          id?: string
          organization_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["integrity_status"]
          trigger?: string
          triggered_by?: string | null
          updated_at?: string
          updated_by?: string | null
          warnings?: number
        }
        Relationships: [
          {
            foreignKeyName: "integrity_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrity_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      items: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          default_price: number | null
          description: string | null
          exemption_reason: string | null
          hs_code: string | null
          id: string
          income_account_id: string | null
          is_active: boolean
          item_type: string
          name: string
          organization_id: string
          sac_code: string | null
          tax_code: string
          unit_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number | null
          description?: string | null
          exemption_reason?: string | null
          hs_code?: string | null
          id?: string
          income_account_id?: string | null
          is_active?: boolean
          item_type?: string
          name: string
          organization_id: string
          sac_code?: string | null
          tax_code?: string
          unit_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_price?: number | null
          description?: string | null
          exemption_reason?: string | null
          hs_code?: string | null
          id?: string
          income_account_id?: string | null
          is_active?: boolean
          item_type?: string
          name?: string
          organization_id?: string
          sac_code?: string | null
          tax_code?: string
          unit_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_income_account_id_organization_id_fkey"
            columns: ["income_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tax_code_fkey"
            columns: ["tax_code"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          amount_fcy: number | null
          contact_id: string | null
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
          contact_id?: string | null
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
          contact_id?: string | null
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
            foreignKeyName: "journal_lines_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
          contact_id: string | null
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
          contact_id?: string | null
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
          contact_id?: string | null
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
            foreignKeyName: "journals_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
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
          address: string | null
          address_line1: string | null
          address_line2: string | null
          asp_account_ref: string | null
          asp_live_from: string | null
          asp_provider_id: string | null
          asp_status: string
          bank_name: string | null
          base_currency: string
          brand_color: string | null
          city: string | null
          created_at: string
          created_by: string | null
          ct_regime: Database["public"]["Enums"]["ct_regime"]
          ct_trn: string | null
          emirate_code: string
          firm_id: string
          fy_start_month: number
          iban: string | null
          id: string
          industry: string | null
          legal_name: string
          licence_authority: string | null
          licence_expiry: string | null
          licence_no: string | null
          manager_id: string | null
          payment_means_code: string
          prior_year_revenue: number
          reg_type: string
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
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          asp_account_ref?: string | null
          asp_live_from?: string | null
          asp_provider_id?: string | null
          asp_status?: string
          bank_name?: string | null
          base_currency?: string
          brand_color?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          ct_regime?: Database["public"]["Enums"]["ct_regime"]
          ct_trn?: string | null
          emirate_code: string
          firm_id: string
          fy_start_month?: number
          iban?: string | null
          id?: string
          industry?: string | null
          legal_name: string
          licence_authority?: string | null
          licence_expiry?: string | null
          licence_no?: string | null
          manager_id?: string | null
          payment_means_code?: string
          prior_year_revenue?: number
          reg_type?: string
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
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          asp_account_ref?: string | null
          asp_live_from?: string | null
          asp_provider_id?: string | null
          asp_status?: string
          bank_name?: string | null
          base_currency?: string
          brand_color?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          ct_regime?: Database["public"]["Enums"]["ct_regime"]
          ct_trn?: string | null
          emirate_code?: string
          firm_id?: string
          fy_start_month?: number
          iban?: string | null
          id?: string
          industry?: string | null
          legal_name?: string
          licence_authority?: string | null
          licence_expiry?: string | null
          licence_no?: string | null
          manager_id?: string | null
          payment_means_code?: string
          prior_year_revenue?: number
          reg_type?: string
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
            foreignKeyName: "organizations_asp_provider_id_fkey"
            columns: ["asp_provider_id"]
            isOneToOne: false
            referencedRelation: "asp_providers"
            referencedColumns: ["id"]
          },
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
      payment_allocations: {
        Row: {
          advance_vat: number
          amount: number
          amount_fcy: number
          applied_on: string
          created_at: string
          created_by: string | null
          credit_amount: number | null
          id: string
          journal_id: string | null
          organization_id: string
          payment_id: string
          purchase_bill_id: string | null
          refund_id: string | null
          sales_invoice_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          advance_vat?: number
          amount: number
          amount_fcy: number
          applied_on: string
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          id?: string
          journal_id?: string | null
          organization_id: string
          payment_id: string
          purchase_bill_id?: string | null
          refund_id?: string | null
          sales_invoice_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          advance_vat?: number
          amount?: number
          amount_fcy?: number
          applied_on?: string
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          id?: string
          journal_id?: string | null
          organization_id?: string
          payment_id?: string
          purchase_bill_id?: string | null
          refund_id?: string | null
          sales_invoice_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_journal_id_organization_id_fkey"
            columns: ["journal_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_organization_id_fkey"
            columns: ["payment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "credit_balances"
            referencedColumns: ["payment_id", "organization_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_organization_id_fkey"
            columns: ["payment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payment_allocations_purchase_bill_id_organization_id_fkey"
            columns: ["purchase_bill_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payment_allocations_refund_id_organization_id_fkey"
            columns: ["refund_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "credit_balances"
            referencedColumns: ["payment_id", "organization_id"]
          },
          {
            foreignKeyName: "payment_allocations_refund_id_organization_id_fkey"
            columns: ["refund_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payment_allocations_sales_invoice_id_organization_id_fkey"
            columns: ["sales_invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      payments: {
        Row: {
          advance_emirate: string | null
          advance_vat: number
          amount: number
          amount_fcy: number
          approved_by: string | null
          auto_allocate: boolean
          bank_account_id: string
          bank_charges: number
          bank_charges_fcy: number
          bank_transaction_id: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          credit_aed: number
          credit_fcy: number
          currency: string
          fx_difference: number
          fx_rate: number
          id: string
          journal_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          notes: string | null
          organization_id: string
          payment_date: string
          payment_no: string | null
          posted_at: string | null
          prepared_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["document_status"]
          updated_at: string
          updated_by: string | null
          vat_advance: boolean
          writeoff: number
          writeoff_fcy: number
        }
        Insert: {
          advance_emirate?: string | null
          advance_vat?: number
          amount?: number
          amount_fcy: number
          approved_by?: string | null
          auto_allocate?: boolean
          bank_account_id: string
          bank_charges?: number
          bank_charges_fcy?: number
          bank_transaction_id?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          credit_aed?: number
          credit_fcy?: number
          currency?: string
          fx_difference?: number
          fx_rate?: number
          id?: string
          journal_id?: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          notes?: string | null
          organization_id: string
          payment_date: string
          payment_no?: string | null
          posted_at?: string | null
          prepared_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
          updated_by?: string | null
          vat_advance?: boolean
          writeoff?: number
          writeoff_fcy?: number
        }
        Update: {
          advance_emirate?: string | null
          advance_vat?: number
          amount?: number
          amount_fcy?: number
          approved_by?: string | null
          auto_allocate?: boolean
          bank_account_id?: string
          bank_charges?: number
          bank_charges_fcy?: number
          bank_transaction_id?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          credit_aed?: number
          credit_fcy?: number
          currency?: string
          fx_difference?: number
          fx_rate?: number
          id?: string
          journal_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_no?: string | null
          posted_at?: string | null
          prepared_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
          updated_by?: string | null
          vat_advance?: boolean
          writeoff?: number
          writeoff_fcy?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_advance_emirate_fkey"
            columns: ["advance_emirate"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bank_account_id_organization_id_fkey"
            columns: ["bank_account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: true
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_journal_id_organization_id_fkey"
            columns: ["journal_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_prepared_by_fkey"
            columns: ["prepared_by"]
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
      purchase_bill_lines: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          line_no: number
          net: number
          net_fcy: number
          organization_id: string
          purchase_bill_id: string
          quantity: number
          recoverable_vat: number
          tax_code: string
          unit_price: number
          updated_at: string
          updated_by: string | null
          vat: number
          vat_fcy: number
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          line_no: number
          net?: number
          net_fcy?: number
          organization_id: string
          purchase_bill_id: string
          quantity: number
          recoverable_vat?: number
          tax_code: string
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_fcy?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          line_no?: number
          net?: number
          net_fcy?: number
          organization_id?: string
          purchase_bill_id?: string
          quantity?: number
          recoverable_vat?: number
          tax_code?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_fcy?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bill_lines_account_id_organization_id_fkey"
            columns: ["account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_bill_lines_purchase_bill_id_organization_id_fkey"
            columns: ["purchase_bill_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_bill_lines_tax_code_fkey"
            columns: ["tax_code"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          approved_by: string | null
          bill_date: string
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          doc_type: Database["public"]["Enums"]["purchase_doc_type"]
          due_date: string
          fx_rate: number
          has_tax_invoice_heading: boolean
          id: string
          is_foreign_supplier: boolean
          is_opening: boolean
          journal_id: string | null
          net_total: number
          notes: string | null
          organization_id: string
          original_bill_id: string | null
          payable_total: number
          payable_total_fcy: number
          posted_at: string | null
          prepared_by: string | null
          recoverable_vat: number
          risk_level: Database["public"]["Enums"]["risk_level"]
          risk_score: number
          shows_recipient_details: boolean
          status: Database["public"]["Enums"]["document_status"]
          supplier_invoice_no: string
          supplier_trn_on_invoice: string | null
          updated_at: string
          updated_by: string | null
          vat_override_reason: string | null
          vat_recoverable_by_checks: boolean
          vat_total: number
        }
        Insert: {
          approved_by?: string | null
          bill_date: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_type?: Database["public"]["Enums"]["purchase_doc_type"]
          due_date: string
          fx_rate?: number
          has_tax_invoice_heading?: boolean
          id?: string
          is_foreign_supplier?: boolean
          is_opening?: boolean
          journal_id?: string | null
          net_total?: number
          notes?: string | null
          organization_id: string
          original_bill_id?: string | null
          payable_total?: number
          payable_total_fcy?: number
          posted_at?: string | null
          prepared_by?: string | null
          recoverable_vat?: number
          risk_level?: Database["public"]["Enums"]["risk_level"]
          risk_score?: number
          shows_recipient_details?: boolean
          status?: Database["public"]["Enums"]["document_status"]
          supplier_invoice_no: string
          supplier_trn_on_invoice?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_override_reason?: string | null
          vat_recoverable_by_checks?: boolean
          vat_total?: number
        }
        Update: {
          approved_by?: string | null
          bill_date?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_type?: Database["public"]["Enums"]["purchase_doc_type"]
          due_date?: string
          fx_rate?: number
          has_tax_invoice_heading?: boolean
          id?: string
          is_foreign_supplier?: boolean
          is_opening?: boolean
          journal_id?: string | null
          net_total?: number
          notes?: string | null
          organization_id?: string
          original_bill_id?: string | null
          payable_total?: number
          payable_total_fcy?: number
          posted_at?: string | null
          prepared_by?: string | null
          recoverable_vat?: number
          risk_level?: Database["public"]["Enums"]["risk_level"]
          risk_score?: number
          shows_recipient_details?: boolean
          status?: Database["public"]["Enums"]["document_status"]
          supplier_invoice_no?: string
          supplier_trn_on_invoice?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_override_reason?: string | null
          vat_recoverable_by_checks?: boolean
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_bills_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "purchase_bills_journal_id_organization_id_fkey"
            columns: ["journal_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_original_bill_id_organization_id_fkey"
            columns: ["original_bill_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_bills_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_lines: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          description: string
          exemption_reason: string | null
          hs_code: string | null
          id: string
          item_id: string | null
          item_type: string | null
          line_no: number
          net: number
          net_fcy: number
          organization_id: string
          quantity: number
          sac_code: string | null
          sales_invoice_id: string
          tax_code: string
          unit_code: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
          vat: number
          vat_fcy: number
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          description: string
          exemption_reason?: string | null
          hs_code?: string | null
          id?: string
          item_id?: string | null
          item_type?: string | null
          line_no: number
          net?: number
          net_fcy?: number
          organization_id: string
          quantity: number
          sac_code?: string | null
          sales_invoice_id: string
          tax_code: string
          unit_code?: string | null
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_fcy?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          exemption_reason?: string | null
          hs_code?: string | null
          id?: string
          item_id?: string | null
          item_type?: string | null
          line_no?: number
          net?: number
          net_fcy?: number
          organization_id?: string
          quantity?: number
          sac_code?: string | null
          sales_invoice_id?: string
          tax_code?: string
          unit_code?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_fcy?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_lines_account_id_organization_id_fkey"
            columns: ["account_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_item_fk"
            columns: ["item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_sales_invoice_id_organization_id_fkey"
            columns: ["sales_invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_tax_code_fkey"
            columns: ["tax_code"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          approved_by: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          credit_reason_code: string | null
          currency: string
          customer_reference: string | null
          doc_type: Database["public"]["Enums"]["sales_doc_type"]
          due_date: string
          einv_uuid: string
          fx_rate: number
          gross_total: number
          gross_total_fcy: number
          id: string
          incoterms: string | null
          invoice_no: string | null
          is_opening: boolean
          issue_date: string
          journal_id: string | null
          net_total: number
          notes: string | null
          organization_id: string
          original_invoice_id: string | null
          payment_means_code: string | null
          posted_at: string | null
          prepared_by: string | null
          prices_include_vat: boolean
          status: Database["public"]["Enums"]["document_status"]
          supply_date: string | null
          supply_emirate: string
          transaction_type: string
          updated_at: string
          updated_by: string | null
          vat_total: number
        }
        Insert: {
          approved_by?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          credit_reason_code?: string | null
          currency?: string
          customer_reference?: string | null
          doc_type?: Database["public"]["Enums"]["sales_doc_type"]
          due_date: string
          einv_uuid?: string
          fx_rate?: number
          gross_total?: number
          gross_total_fcy?: number
          id?: string
          incoterms?: string | null
          invoice_no?: string | null
          is_opening?: boolean
          issue_date: string
          journal_id?: string | null
          net_total?: number
          notes?: string | null
          organization_id: string
          original_invoice_id?: string | null
          payment_means_code?: string | null
          posted_at?: string | null
          prepared_by?: string | null
          prices_include_vat?: boolean
          status?: Database["public"]["Enums"]["document_status"]
          supply_date?: string | null
          supply_emirate: string
          transaction_type?: string
          updated_at?: string
          updated_by?: string | null
          vat_total?: number
        }
        Update: {
          approved_by?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          credit_reason_code?: string | null
          currency?: string
          customer_reference?: string | null
          doc_type?: Database["public"]["Enums"]["sales_doc_type"]
          due_date?: string
          einv_uuid?: string
          fx_rate?: number
          gross_total?: number
          gross_total_fcy?: number
          id?: string
          incoterms?: string | null
          invoice_no?: string | null
          is_opening?: boolean
          issue_date?: string
          journal_id?: string | null
          net_total?: number
          notes?: string | null
          organization_id?: string
          original_invoice_id?: string | null
          payment_means_code?: string | null
          posted_at?: string | null
          prepared_by?: string | null
          prices_include_vat?: boolean
          status?: Database["public"]["Enums"]["document_status"]
          supply_date?: string | null
          supply_emirate?: string
          transaction_type?: string
          updated_at?: string
          updated_by?: string | null
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_invoices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sales_invoices_journal_id_organization_id_fkey"
            columns: ["journal_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_original_invoice_id_organization_id_fkey"
            columns: ["original_invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_invoices_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_supply_emirate_fkey"
            columns: ["supply_emirate"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["code"]
          },
        ]
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
      vat_return_adjustments: {
        Row: {
          adjustment: number
          amount: number
          box_code: string
          created_at: string
          created_by: string | null
          id: string
          legal_reference: string | null
          organization_id: string
          reason: string
          updated_at: string
          updated_by: string | null
          vat: number
          vat_return_id: string
        }
        Insert: {
          adjustment?: number
          amount?: number
          box_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          legal_reference?: string | null
          organization_id: string
          reason: string
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_return_id: string
        }
        Update: {
          adjustment?: number
          amount?: number
          box_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legal_reference?: string | null
          organization_id?: string
          reason?: string
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_return_adjustments_box_code_fkey"
            columns: ["box_code"]
            isOneToOne: false
            referencedRelation: "vat_boxes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vat_return_adjustments_vat_return_id_organization_id_fkey"
            columns: ["vat_return_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "vat_returns"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      vat_return_boxes: {
        Row: {
          adjustment: number
          amount: number
          box_code: string
          created_at: string
          created_by: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
          vat: number
          vat_return_id: string
        }
        Insert: {
          adjustment?: number
          amount?: number
          box_code: string
          created_at?: string
          created_by?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_return_id: string
        }
        Update: {
          adjustment?: number
          amount?: number
          box_code?: string
          created_at?: string
          created_by?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          vat?: number
          vat_return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_return_boxes_box_code_fkey"
            columns: ["box_code"]
            isOneToOne: false
            referencedRelation: "vat_boxes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vat_return_boxes_vat_return_id_organization_id_fkey"
            columns: ["vat_return_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "vat_returns"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      vat_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          clearing_journal_id: string | null
          config_version_id: string | null
          created_at: string
          created_by: string | null
          filed_on: string | null
          fta_reference: string | null
          id: string
          organization_id: string
          prepared_by: string | null
          snapshot: Json | null
          snapshot_sha256: string | null
          status: Database["public"]["Enums"]["vat_return_status"]
          tax_period_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          clearing_journal_id?: string | null
          config_version_id?: string | null
          created_at?: string
          created_by?: string | null
          filed_on?: string | null
          fta_reference?: string | null
          id?: string
          organization_id: string
          prepared_by?: string | null
          snapshot?: Json | null
          snapshot_sha256?: string | null
          status?: Database["public"]["Enums"]["vat_return_status"]
          tax_period_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          clearing_journal_id?: string | null
          config_version_id?: string | null
          created_at?: string
          created_by?: string | null
          filed_on?: string | null
          fta_reference?: string | null
          id?: string
          organization_id?: string
          prepared_by?: string | null
          snapshot?: Json | null
          snapshot_sha256?: string | null
          status?: Database["public"]["Enums"]["vat_return_status"]
          tax_period_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_clearing_journal_id_fkey"
            columns: ["clearing_journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_config_version_id_fkey"
            columns: ["config_version_id"]
            isOneToOne: false
            referencedRelation: "config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_tax_period_id_fkey"
            columns: ["tax_period_id"]
            isOneToOne: true
            referencedRelation: "tax_periods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bank_book_lines: {
        Row: {
          amount: number | null
          bank_account_id: string | null
          description: string | null
          eligible: boolean | null
          entry_date: string | null
          journal_id: string | null
          journal_no: string | null
          line_id: string | null
          matched_txn: string | null
          memo: string | null
          organization_id: string | null
          txn_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_balances: {
        Row: {
          contact_id: string | null
          currency: string | null
          kind: Database["public"]["Enums"]["payment_kind"] | null
          left_aed: number | null
          left_fcy: number | null
          organization_id: string | null
          payment_date: string | null
          payment_id: string | null
          payment_no: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_latest: {
        Row: {
          created_at: string | null
          created_by: string | null
          errors: number | null
          id: string | null
          organization_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["integrity_status"] | null
          trigger: string | null
          triggered_by: string | null
          updated_at: string | null
          updated_by: string | null
          warnings: number | null
        }
        Relationships: [
          {
            foreignKeyName: "integrity_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrity_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      open_documents: {
        Row: {
          contact_id: string | null
          currency: string | null
          doc_date: string | null
          doc_kind: string | null
          doc_no: string | null
          due_date: string | null
          id: string | null
          open_aed: number | null
          open_fcy: number | null
          organization_id: string | null
          total_aed: number | null
          total_fcy: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: { Args: never; Returns: string }
      add_vat_adjustment: {
        Args: {
          p_adjustment: number
          p_amount: number
          p_box: string
          p_legal_reference?: string
          p_reason: string
          p_return_id: string
          p_vat: number
        }
        Returns: string
      }
      ageing: {
        Args: { p_as_of: string; p_organization_id: string; p_side: string }
        Returns: {
          contact_id: string
          contact_name: string
          currency: string
          days_overdue: number
          doc_date: string
          doc_no: string
          document_id: string
          due_date: string
          open_aed: number
          open_fcy: number
          total_aed: number
        }[]
      }
      approve_bank_reconciliation: {
        Args: { p_id: string }
        Returns: undefined
      }
      approve_config_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: undefined
      }
      approve_vat_return: { Args: { p_return_id: string }; Returns: string }
      auto_match_bank: { Args: { p_bank_account_id: string }; Returns: number }
      balance_sheet: {
        Args: { p_as_of: string; p_organization_id: string }
        Returns: {
          account_id: string
          amount: number
          code: string
          name: string
          report_group: string
          row_kind: string
          section: string
        }[]
      }
      bank_reconciliation_preview: {
        Args: { p_bank_account_id: string; p_end: string }
        Returns: Json
      }
      client_users: {
        Args: { p_organization_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          invited_by_name: string
          kind: string
          role: string
          status: string
          valid_from: string
          valid_to: string
        }[]
      }
      compliance_calendar: {
        Args: { p_from: string; p_to: string }
        Returns: {
          detail: string
          due_date: string
          kind: string
          legal_name: string
          organization_id: string
          period_end: string
          period_start: string
          rule_key: string
          status: string
          tab: string
          title: string
        }[]
      }
      config_value: { Args: { p_key: string; p_on?: string }; Returns: Json }
      contact_statement: {
        Args: {
          p_contact_id: string
          p_from: string
          p_organization_id: string
          p_side: string
          p_to: string
        }
        Returns: {
          balance: number
          credit: number
          debit: number
          description: string
          entry_date: string
          journal_id: string
          journal_no: string
          memo: string
          row_kind: string
          source: Database["public"]["Enums"]["journal_source"]
        }[]
      }
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
      create_client_invitation: {
        Args: {
          p_email: string
          p_full_name: string
          p_organization_id: string
          p_role: string
          p_valid_to?: string
        }
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
      delete_bank_reconciliation: { Args: { p_id: string }; Returns: undefined }
      delete_opening_document: { Args: { p_id: string }; Returns: undefined }
      delete_payment: { Args: { p_id: string }; Returns: undefined }
      delete_purchase_bill: { Args: { p_id: string }; Returns: undefined }
      delete_sales_invoice: { Args: { p_id: string }; Returns: undefined }
      delete_vat_adjustment: { Args: { p_id: string }; Returns: undefined }
      due_reminders: {
        Args: { p_today: string }
        Returns: {
          audience: string
          days_left: number
          dedupe_key: string
          detail: string
          due_date: string
          email: string
          full_name: string
          legal_name: string
          organization_id: string
          rule_key: string
          title: string
        }[]
      }
      faf_data: {
        Args: { p_end: string; p_organization_id: string; p_start: string }
        Returns: Json
      }
      firm_dashboard: {
        Args: never
        Returns: {
          ap_open: number
          ap_overdue: number
          ar_open: number
          ar_overdue: number
          bank_reconciled_to: string
          bank_unmatched: number
          integrity_checked_at: string
          integrity_status: string
          legal_name: string
          organization_id: string
          pending_bills: number
          pending_invoices: number
          pending_journals: number
          pending_payments: number
          pending_reconciliations: number
          pending_vat_returns: number
          revenue_365: number
          revenue_ytd: number
          vat_next_due: string
          vat_next_period_end: string
          vat_open_returns: number
          vat_overdue_returns: number
          vat_registered: boolean
        }[]
      }
      fy_start_of: {
        Args: { p_date: string; p_month: number }
        Returns: string
      }
      general_ledger: {
        Args: {
          p_account_id: string
          p_from: string
          p_organization_id: string
          p_to: string
        }
        Returns: {
          balance: number
          credit: number
          debit: number
          description: string
          entry_date: string
          journal_id: string
          journal_no: string
          line_no: number
          memo: string
          row_kind: string
          source: Database["public"]["Enums"]["journal_source"]
        }[]
      }
      import_bank_statement: {
        Args: {
          p_bank_account_id: string
          p_closing_balance?: number
          p_file_name: string
          p_file_sha256: string
          p_rows: Json
        }
        Returns: Json
      }
      import_contacts: {
        Args: { p_organization_id: string; p_rows: Json }
        Returns: Json
      }
      import_einvoice: {
        Args: {
          p_bill: Json
          p_meta: Json
          p_organization_id: string
          p_xml: string
        }
        Returns: string
      }
      lock_period: {
        Args: { p_period_id: string; p_reason?: string }
        Returns: undefined
      }
      mark_invite_link_copied: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      mark_vat_return_filed: {
        Args: {
          p_filed_on: string
          p_fta_reference: string
          p_return_id: string
        }
        Returns: undefined
      }
      match_bank_transaction: {
        Args: { p_line_id: string; p_txn_id: string }
        Returns: undefined
      }
      my_permissions: { Args: { p_organization_id: string }; Returns: string[] }
      opening_status: { Args: { p_organization_id: string }; Returns: Json }
      post_bank_line: {
        Args: { p_account_id: string; p_memo?: string; p_txn_id: string }
        Returns: string
      }
      post_journal: { Args: { p_journal_id: string }; Returns: string }
      post_opening_documents: {
        Args: { p_date: string; p_organization_id: string }
        Returns: number
      }
      post_payment: { Args: { p_id: string }; Returns: string }
      post_purchase_bill: {
        Args: { p_id: string; p_override_reason?: string }
        Returns: string
      }
      post_sales_invoice: { Args: { p_id: string }; Returns: string }
      profit_and_loss: {
        Args: { p_from: string; p_organization_id: string; p_to: string }
        Returns: {
          account_id: string
          amount: number
          code: string
          name: string
          report_group: string
          type: Database["public"]["Enums"]["account_type"]
        }[]
      }
      record_einvoice_result: {
        Args: {
          p_asp_reference?: string
          p_reason?: string
          p_status: string
          p_submission_id: string
        }
        Returns: undefined
      }
      record_einvoice_sent: {
        Args: {
          p_asp_reference?: string
          p_invoice_id: string
          p_xml_sha256: string
        }
        Returns: string
      }
      reject_journal: {
        Args: { p_journal_id: string; p_reason: string }
        Returns: undefined
      }
      reject_payment: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      reject_purchase_bill: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      reject_sales_invoice: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      reject_vat_return: {
        Args: { p_reason: string; p_return_id: string }
        Returns: undefined
      }
      remove_client_user: {
        Args: { p_membership_id: string; p_reason: string }
        Returns: undefined
      }
      reopen_period: {
        Args: { p_period_id: string; p_reason: string }
        Returns: undefined
      }
      reverse_journal: {
        Args: { p_date?: string; p_journal_id: string; p_reason: string }
        Returns: string
      }
      revoke_client_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      run_integrity_checks: {
        Args: { p_organization_id: string }
        Returns: string
      }
      save_bank_account: {
        Args: { p_doc: Json; p_id: string; p_organization_id: string }
        Returns: string
      }
      save_bank_mapping: {
        Args: { p_bank_account_id: string; p_mapping: Json }
        Returns: undefined
      }
      save_bank_reconciliation: {
        Args: {
          p_bank_account_id: string
          p_end: string
          p_statement_balance: number
        }
        Returns: string
      }
      save_journal_draft: {
        Args: {
          p_entry_date: string
          p_journal_id: string
          p_lines: Json
          p_memo: string
          p_organization_id: string
          p_source: Database["public"]["Enums"]["journal_source"]
        }
        Returns: string
      }
      save_opening_documents: {
        Args: { p_organization_id: string; p_rows: Json }
        Returns: number
      }
      save_payment: {
        Args: { p_doc: Json; p_id: string; p_organization_id: string }
        Returns: string
      }
      save_purchase_bill: {
        Args: { p_doc: Json; p_id: string; p_organization_id: string }
        Returns: string
      }
      save_sales_invoice: {
        Args: { p_doc: Json; p_id: string; p_organization_id: string }
        Returns: string
      }
      set_payment_bank_line: {
        Args: { p_payment_id: string; p_txn_id: string }
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
      start_vat_return: { Args: { p_tax_period_id: string }; Returns: string }
      submit_payment: { Args: { p_id: string }; Returns: undefined }
      submit_purchase_bill: { Args: { p_id: string }; Returns: undefined }
      submit_sales_invoice: { Args: { p_id: string }; Returns: undefined }
      submit_vat_return: { Args: { p_return_id: string }; Returns: undefined }
      trial_balance: {
        Args: { p_from: string; p_organization_id: string; p_to: string }
        Returns: {
          account_id: string
          closing: number
          code: string
          credit: number
          debit: number
          name: string
          opening: number
          report_group: string
          type: Database["public"]["Enums"]["account_type"]
        }[]
      }
      unmatch_bank_transaction: {
        Args: { p_txn_id: string }
        Returns: undefined
      }
      vat_box_lines: {
        Args: { p_box: string; p_tax_period_id: string }
        Returns: {
          amount: number
          description: string
          entry_date: string
          journal_id: string
          journal_no: string
          memo: string
          source: Database["public"]["Enums"]["journal_source"]
          tax_code: string
          vat: number
        }[]
      }
      vat_reconciliation: { Args: { p_tax_period_id: string }; Returns: Json }
      vat_return_preview: { Args: { p_tax_period_id: string }; Returns: Json }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      bank_txn_status: "unmatched" | "matched"
      check_severity: "error" | "warn" | "info"
      compliance_anchor:
        | "vat_period_end"
        | "fy_end"
        | "licence_expiry"
        | "fixed_date"
      compliance_kind: "vat" | "ct" | "licence" | "einvoicing"
      config_status: "draft" | "approved"
      config_value_type: "bp" | "fils" | "days" | "months" | "date" | "rate"
      contact_kind: "customer" | "supplier" | "both"
      ct_regime: "standard" | "sbr" | "qfzp"
      doc_type:
        | "journal"
        | "sales_invoice"
        | "credit_note"
        | "receipt"
        | "payment"
      document_status: "draft" | "pending" | "posted"
      einvoice_status: "sent" | "accepted" | "rejected"
      firm_role: "firm_admin" | "firm_accountant"
      firm_status: "active" | "suspended"
      integrity_status: "ok" | "warning" | "error"
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
      payment_kind:
        | "customer_receipt"
        | "supplier_payment"
        | "customer_refund"
        | "supplier_refund"
      period_status: "open" | "locked"
      purchase_doc_type: "bill" | "debit_note"
      risk_level: "low" | "medium" | "high"
      sales_doc_type: "invoice" | "credit_note"
      tax_period_kind: "vat" | "ct"
      user_status: "active" | "suspended"
      vat_period: "quarterly" | "monthly"
      vat_return_status: "draft" | "in_review" | "approved" | "filed"
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
      bank_txn_status: ["unmatched", "matched"],
      check_severity: ["error", "warn", "info"],
      compliance_anchor: [
        "vat_period_end",
        "fy_end",
        "licence_expiry",
        "fixed_date",
      ],
      compliance_kind: ["vat", "ct", "licence", "einvoicing"],
      config_status: ["draft", "approved"],
      config_value_type: ["bp", "fils", "days", "months", "date", "rate"],
      contact_kind: ["customer", "supplier", "both"],
      ct_regime: ["standard", "sbr", "qfzp"],
      doc_type: [
        "journal",
        "sales_invoice",
        "credit_note",
        "receipt",
        "payment",
      ],
      document_status: ["draft", "pending", "posted"],
      einvoice_status: ["sent", "accepted", "rejected"],
      firm_role: ["firm_admin", "firm_accountant"],
      firm_status: ["active", "suspended"],
      integrity_status: ["ok", "warning", "error"],
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
      payment_kind: [
        "customer_receipt",
        "supplier_payment",
        "customer_refund",
        "supplier_refund",
      ],
      period_status: ["open", "locked"],
      purchase_doc_type: ["bill", "debit_note"],
      risk_level: ["low", "medium", "high"],
      sales_doc_type: ["invoice", "credit_note"],
      tax_period_kind: ["vat", "ct"],
      user_status: ["active", "suspended"],
      vat_period: ["quarterly", "monthly"],
      vat_return_status: ["draft", "in_review", "approved", "filed"],
    },
  },
} as const
