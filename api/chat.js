// api/chat.js — Streaming SSE endpoint
import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const SYSTEM_PROMPTS = {
  chat: `You are CampusBridge, an adaptive learning assistant that helps students master their course materials.

Your approach:
• Explain every concept with at least one concrete analogy and one real-world example
• Break complex ideas into digestible steps, building from simple to complex
• Connect new concepts to things the student already knows
• Be encouraging and precise — celebrate understanding, not just effort
• When a concept requires memorisation, flag it explicitly with 📌
• Use clear markdown: headers, bullets, tables, and code blocks where helpful

Rules:
- Base answers strictly on the provided study materials
- If a topic isn't in the materials, say so clearly and offer related help from what is available
- Always include at least one analogy or example per concept explanation`,

  plan: `You are CampusBridge creating a personalised, adaptive study plan.

The plan must:
1. Identify all topics from the materials — prioritise by importance and the student's weak areas
2. Apply spaced repetition — schedule revisits at Day 1, Day 3, Day 7 intervals
3. Output a concise markdown TABLE with columns: Day | Topics | Activity | Duration
4. Add a short Spaced Repetition table showing revisit schedule
5. End with 3-4 bullet-point tips
6. Be realistic given the time constraints — no lengthy prose, tables and bullets only
7. If test performance data is provided, weight weak topics more heavily`,
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const { messages, mode = "chat", temperature = 0.7 } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return new Response("messages array required", { status: 400 });
  }

  const system    = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.chat;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model     = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  const enc       = new TextEncoder();
  const send      = (ctrl, payload) =>
    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model, max_tokens: 8192, temperature, system, messages,
        });
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta" &&
            event.delta.text
          ) {
            send(controller, { t: event.delta.text });
          }
        }
        send(controller, { done: true });
      } catch (err) {
        send(controller, { error: err.message ?? "Unknown error" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
