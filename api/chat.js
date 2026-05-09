// api/chat.js — Streaming SSE endpoint (chat + study plan)
// Runs on Vercel Edge Runtime; ANTHROPIC_API_KEY stays server-side.
import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const SYSTEM_PROMPTS = {
  chat: `You are Recal, an adaptive learning assistant that helps college students study effectively from their uploaded course materials.

Your capabilities:
• Explain concepts clearly with relatable analogies and concrete examples
• Break down complex ideas into simpler components with multiple angles when needed
• Generate adaptive practice tests at multiple cognitive levels
• Create personalised study plans using spaced repetition principles
• Identify topics, subtopics, and prerequisite relationships
• Connect ideas across different parts of the materials

Rules:
- Always base your answers strictly on the provided study material excerpts
- If a topic isn't covered in the materials, politely say so and offer related help
- Use clear markdown formatting: headers, bullets, numbered lists, tables, code blocks where relevant
- Be encouraging and supportive while maintaining academic rigour
- When rote memorisation is required, explicitly flag it with a 📌 note
- With every concept explanation, include at least one concrete example`,

  plan: `You are Recal creating a detailed, personalised study plan. The student has provided their exam date, daily available hours, and any specific concerns.

Your plan must:
1. Identify all major topics and subtopics from the materials
2. Prioritise by importance and difficulty
3. Apply spaced repetition — revisit key topics multiple times at increasing intervals
4. Suggest concrete active recall techniques (not passive re-reading) for each topic type
5. Include buffer days for review and unexpected delays
6. Be realistic given the time constraints
7. Use markdown tables, headers, and checkboxes for clarity

Be encouraging and specific. Name actual topics from the materials, not generic advice.`,
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

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, mode = "chat", temperature = 0.7 } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return new Response("messages array required", { status: 400 });
  }

  const system = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.chat;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

  const enc = new TextEncoder();
  const send = (ctrl, payload) =>
    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model,
          max_tokens: 8192,
          temperature,
          system,
          messages,
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
