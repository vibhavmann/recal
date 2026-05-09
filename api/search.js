// api/search.js — DuckDuckGo HTML search proxy (no API key required)
// Fetches DDG HTML results and returns top-5 as JSON.
export const config = { runtime: "edge" };

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function decodeHTML(str) {
  return (str ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").trim();
}

function parseResults(html) {
  // DDG HTML: titles in .result__a, snippets in .result__snippet, urls in .result__url
  const titles   = [...html.matchAll(/class="result__a"[^>]*>([^<]{3,150})</g)].map(m => decodeHTML(m[1]));
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]{10,600}?)<\/a>/g)].map(m => decodeHTML(m[1]));
  const urls     = [...html.matchAll(/class="result__url"[^>]*>[\s\S]*?<[^>]+>([^<]{5,200})</g)].map(m => decodeHTML(m[1]));

  const results = [];
  const count   = Math.min(titles.length, snippets.length, 5);
  for (let i = 0; i < count; i++) {
    if (snippets[i]?.length >= 15) {
      results.push({ title: titles[i] ?? `Result ${i + 1}`, snippet: snippets[i], url: urls[i] ?? "" });
    }
  }
  return results;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const { query } = body;
  if (!query?.trim()) return new Response(JSON.stringify({ error: "query required", results: [] }), { status: 400, headers: CORS });

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=en-us`;
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://duckduckgo.com/",
      },
    });

    if (!res.ok) throw new Error(`DDG returned ${res.status}`);

    const html    = await res.text();
    const results = parseResults(html);

    return new Response(JSON.stringify({ results }), { headers: CORS });
  } catch (err) {
    // Return empty results rather than hard-failing — Claude can still answer from docs
    return new Response(JSON.stringify({ results: [], warning: err.message }), { headers: CORS });
  }
}
