// api/generate.js — Full JSON response endpoint (practice tests + topic extraction)
// Returns the complete text so the client can parse structured JSON.
import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const SYSTEM_PROMPTS = {
  test: `You are Recal generating a practice test. Output ONLY valid JSON — no markdown fences, no prose, no extra text whatsoever. Any deviation from JSON will break the app.

Schema:
{
  "questions": [
    {
      "type": "mcq",
      "question": "Clear, specific question text?",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": "A",
      "brief_explanation": "One-sentence summary of why the answer is correct.",
      "full_explanation": "2-4 sentences with detailed explanation for students who got it wrong. Reference the study material.",
      "topic": "Topic name from materials",
      "difficulty": "easy|medium|hard",
      "needs_memorization": false
    },
    {
      "type": "short",
      "question": "Clear, open-ended question requiring explanation?",
      "model_answer": "Full 2-4 sentence model answer a student should aim for.",
      "key_points": ["Key point 1 that must be mentioned", "Key point 2", "Key point 3"],
      "topic": "Topic name from materials",
      "difficulty": "easy|medium|hard",
      "needs_memorization": false
    }
  ]
}

Guidelines:
- MCQ distractors must be plausible, not obviously wrong
- Questions must test genuine understanding, not just definition recall
- Mark needs_memorization: true only for facts that must be memorised verbatim (dates, constants, formulas, definitions)
- Vary difficulty according to the requested level
- Base every question directly on the provided study material`,

  topics: `You are Recal extracting a structured topic map. Output ONLY valid JSON — no markdown fences, no extra text.

Schema:
{
  "topics": [
    {
      "name": "Main Topic Name",
      "subtopics": ["Subtopic A", "Subtopic B", "Subtopic C"],
      "importance": "high|medium|low",
      "prerequisites": ["Name of another topic that should be understood first"],
      "summary": "1-2 sentence summary of what this topic covers and why it matters."
    }
  ]
}

Guidelines:
- Be exhaustive — extract every significant topic and subtopic
- Importance: high = core concept, frequently tested; medium = supporting concept; low = supplementary detail
- Prerequisites: only list topics that genuinely block understanding of this one
- Keep topic names concise but specific (prefer "Cellular Respiration" over "Biology Topic 3")`,
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

  const { messages, mode = "test", temperature = 0.3 } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return new Response("messages array required", { status: 400 });
  }

  const system = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.test;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      temperature,
      system,
      messages,
    });

    const content = response.content[0]?.text ?? "";
    return new Response(JSON.stringify({ content }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
