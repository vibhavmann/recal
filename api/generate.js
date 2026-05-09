// api/generate.js — Full JSON response endpoint (tests, topics, flashcards)
import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "edge" };

const SYSTEM_PROMPTS = {
  test: `You are Recal generating a practice test. Output ONLY valid JSON — no markdown fences, no prose, no extra text.

Schema:
{
  "questions": [
    {
      "type": "mcq",
      "question": "Clear, specific question?",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": "A",
      "brief_explanation": "One-sentence summary of why the correct answer is right.",
      "full_explanation": "2-4 sentences with detailed explanation for students who got it wrong.",
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

Guidelines: MCQ distractors must be plausible. Mark needs_memorization true only for verbatim facts. Base every question on the study material.`,

  topics: `You are Recal extracting a structured topic map. Output ONLY valid JSON — no markdown, no extra text.

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

Guidelines: Be exhaustive. High importance = core concept tested frequently. Include every distinct topic and subtopic found in the materials.`,

  flashcards: `You are Recal generating study flashcards. Output ONLY valid JSON — no markdown fences, no prose.

Schema:
{
  "cards": [
    {
      "front": "Concise term, concept, or question (1-2 short lines)",
      "back": "Clear explanation in 2-4 sentences. Then on a new line: Example: [concrete real-world example]. Add 📌 at the very start if verbatim memorisation is needed.",
      "topic": "Topic name from materials",
      "difficulty": "easy|medium|hard"
    }
  ]
}

Guidelines:
- Front: short enough to read at a glance — a term, formula, question, or concept
- Back: explanation first, then a concrete example on its own line
- Every card must be self-contained and understandable without others
- Vary difficulty across the deck
- Flag with 📌 only when the exact wording/formula/list must be memorised verbatim`,
};

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on the server." }), { status: 500, headers: CORS });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response("Invalid JSON body", { status: 400 }); }

  const { messages, mode = "test", temperature = 0.3 } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return new Response(JSON.stringify({ error: "messages array required" }), { status: 400, headers: CORS });
  }

  const system = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.test;

  // Init inside handler — safer for Edge Runtime cold starts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model     = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

  try {
    // Use streaming internally so Edge Runtime connection stays alive during long generations
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 8192,
      temperature,
      system,
      messages,
    });

    let content = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        content += event.delta.text;
      }
    }

    return new Response(JSON.stringify({ content }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? "Unknown error" }), { status: 500, headers: CORS });
  }
}
