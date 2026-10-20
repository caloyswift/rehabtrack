import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 1200;

export async function POST(request) {
  const supabase = await createClient();
  const { data: { claims }, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.sub) {
    return Response.json({ error: "Sign in to use the health information assistant." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profileError || profile?.role !== "patient") {
    return Response.json({ error: "This assistant is available to patient accounts." }, { status: 403 });
  }

  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "The assistant is not configured yet. Add the Groq API key to the server environment." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid question." }, { status: 400 });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return Response.json({ error: "Please send a shorter conversation." }, { status: 400 });
  }

  const validMessages = messages.every((message) =>
    message && ["user", "assistant"].includes(message.role) &&
    typeof message.content === "string" && message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
  if (!validMessages || messages.at(-1)?.role !== "user") {
    return Response.json({ error: "Please send a valid question." }, { status: 400 });
  }

  let apiResponse;
  try {
    apiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content: "You are RehabTrack's health information assistant. Give brief, plain-language general educational information, especially about stroke rehabilitation and healthy recovery. You are not a clinician: do not diagnose, interpret a person's symptoms or records, prescribe treatment, recommend changing an exercise plan or medication, or claim certainty. If asked for personalized medical guidance, explain that only their healthcare professional can advise them and suggest contacting their therapist or clinician. If a message describes a possible emergency (such as new face drooping, arm weakness, speech trouble, severe breathing difficulty, chest pain, or loss of consciousness), tell them to contact local emergency services immediately and not wait for an online answer. Do not ask for or repeat names, contact details, or patient record information. If unsure, say so. Keep answers concise and supportive. Do not present yourself as a doctor."
          },
          ...messages.map(({ role, content }) => ({ role, content: content.trim() })),
        ],
        max_completion_tokens: 600,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The assistant is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }

  if (!apiResponse.ok) {
    return Response.json({ error: "The assistant could not answer right now. Please try again shortly." }, { status: 502 });
  }

  let result;
  try {
    result = await apiResponse.json();
  } catch {
    return Response.json({ error: "The assistant returned an unreadable response. Please try again." }, { status: 502 });
  }

  const answer = result?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    return Response.json({ error: "The assistant could not prepare an answer. Please try again." }, { status: 502 });
  }

  return Response.json({ answer });
}
