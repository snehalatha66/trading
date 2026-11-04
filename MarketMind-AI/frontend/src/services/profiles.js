import { supabase } from "./supabase";

export async function ensureUserProfile(user) {
  if (!user.email) {
    throw new Error("Supabase did not return an email for this user.");
  }

  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_uid", user.id)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (profile) {
    return;
  }

  const { error: insertError } = await supabase.from("profiles").insert({
    auth_uid: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name ?? null,
  });

  if (insertError) {
    throw insertError;
  }
}
