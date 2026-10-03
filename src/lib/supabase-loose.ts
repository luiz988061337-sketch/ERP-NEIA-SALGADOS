import { supabase } from "@/integrations/supabase/client";
// Untyped access for tables that exist in extra migrations but not in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseLoose = supabase as any;
