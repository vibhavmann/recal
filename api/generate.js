// api/generate.js — Full JSON response endpoint (tests, mastery/topics)
import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const SYSTEM_PROMPTS = {
  test: `You are CampusBridge generating an adaptive practice test. Output ONLY valid JSON — no markdown fences, no prose, no extra text.

Schema:
{
  "questions": [
    {
      "type": "mcq",
      "question": "Clear, specific question?",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": "A",
      "brief_explanation": "One-sentence summary of why the correct answer is right.",
      "full_explanation": "2-4 sentences explaining the concept for students who got it wrong.",
      "topic": "Topic name from materials",
      "difficulty": "easy|medium|hard",
      "needs_memorization": false
    },
    {
      "type": "short",
      "question": "Open-ended question requiring explanation?",
      "model_answer": "Full 2-4 sentence model answer.",
      "key_points": ["Point 1", "Point 2", "Point 3"],
      "topic": "Topic name",
      "difficulty": "easy|medium|hard",
      "needs_memorization": false
    }
  ]
}

Guidelines:
- MCQ distractors must be plausible, not obviously wrong
- Vary difficulty based on the requested level
- Mark needs_memorization true only for verbatim facts/formulas
- Base every question strictly on the study material provided
- If weak topics are listed, generate more questions on those topics`,

  topics: `You are CampusBridge extracting a mastery map. Output ONLY valid JSON — no markdown, no extra text.

Schema:
{
  "topics": [
    {
      "name": "Main Topic Name",
      "subtopics": ["Subtopic A", "Subtopic B"],
      "importance": "high|medium|low",
      "prerequisites": ["Topic that must be understood first"],
      "summary": "1-2 sentence summary of this topic."
    }
  ]
}

Guidelines: Be exhaustive. High importance = tested frequently or foundational. Include every distinct topic and subtopic.`,
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on the server." }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const { messages, mode = "test", temperature = 0.3 } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return new Response("messages array required", { status: 400 });
  }

  const system    = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.test;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model     = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  const enc       = new TextEncoder();
  const send      = (ctrl, payload) =>
    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model, max_tokens: 4096, temperature, system, messages,
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
      "Content-Type":     "text/event-stream",
      "Cache-Control":    "no-cache, no-transform",
      "X-Accel-Buffering":"no",
      ...CORS_HEADERS,
    },
  });
}
