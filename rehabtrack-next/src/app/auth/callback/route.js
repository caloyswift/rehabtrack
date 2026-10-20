import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next") || "/patient";
  const safePath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/patient";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (safePath === "/patient") {
        const { data: { user } } = await supabase.auth.getUser();
        const patientCode = user?.user_metadata?.patient_code;
        if (typeof patientCode === "string" && patientCode.trim()) {
          const { error: linkError } = await supabase.rpc("link_current_patient", {
            p_patient_code: patientCode,
          });
          if (linkError) {
            return NextResponse.redirect(new URL("/patient?link=failed", requestUrl.origin));
          }
        }
      }

      return NextResponse.redirect(new URL(safePath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation", requestUrl.origin));
}
