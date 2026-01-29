import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ ENV missing");
  console.error("VITE_SUPABASE_URL =", url);
  console.error("VITE_SUPABASE_ANON_KEY exists =", !!key);
  process.exit(1);
}

console.log("✅ Supabase ENV OK");

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("products")
  .select("id, product_code, product_name, jan_code, created_at")
  .eq("user_id", "demo-user-001")
  .order("created_at", { ascending: false })
  .limit(5);

if (error) {
  console.error("❌ Supabase query error:", error);
  process.exit(1);
}

console.log("✅ products rows:", data?.length ?? 0);
console.log(data);
