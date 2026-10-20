import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "./config";
import { createClient } from "./server";

export async function requireProfile(expectedRole) {
  if (!hasSupabaseConfig()) return null;

  const supabase = await createClient();
  const { data: { claims }, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.sub) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", claims.sub)
    .single();

  if (profileError || !profile) redirect("/login?error=profile");
  if (profile.role !== expectedRole) redirect(profile.role === "therapist" ? "/therapist" : "/patient");

  return profile;
}
