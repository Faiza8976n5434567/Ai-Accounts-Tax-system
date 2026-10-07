/** The browser's Supabase client. Only the public URL and publishable key are used here —
 *  every row is protected by Row-Level Security in the database (Spec 04 S-2.1). */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { parseAuthRedirect } from "./auth";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** `vite build --mode demo` (automated browser tests only) shows the POC demo without sign-in.
 *  Normal builds always require sign-in; the demo uses browser-only sample data. */
export const DEMO_MODE = import.meta.env.MODE === "demo";

/** What an emailed link brought back — read before the client consumes the address bar. */
export const linkOnArrival = parseAuthRedirect(typeof window === "undefined" ? "" : window.location.hash);

export const supabase = url && key
  ? createClient<Database>(url, key, {
      auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    })
  : null;
