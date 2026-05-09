// app.js — CampusBridge main controller
import { DocumentStore } from "./documents.js";
import { marked }        from "https://esm.run/marked";
import DOMPurify         from "https://esm.run/dompurify";

marked.setOptions({ breaks: true, gfm: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const md      = text => DOMPurify.sanitize(marked.parse(text ?? ""));
const $       = id   => document.getElementById(id);
const scrollEnd = el => { el.scrollTop = el.scrollHeight; };

function fmtSize(bytes) {
  if (bytes < 1024)    return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function parseJSON(raw) {
  try { return JSON.parse(raw); } catch {}
  const stripped = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(stripped); } catch {}
  const m = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("Could not parse structured response — please try again.");
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function streamChat({ messages, mode = "chat", temperature = 0.7 }, onChunk) {
  const res = await fetch("/api/chat", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages, mode, temperature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "API request failed");
  }

  const reader = res.body.getReader();
  const dec    = new TextDecoder();
  let   buf    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const evt = JSON.parse(raw);
        if (evt.error) throw new Error(evt.error);
        if (evt.t) onChunk(evt.t);
        if (evt.done) return;
      } catch (e) {
        if (e.message !== "Unexpected end of JSON input") throw e;
      }
    }
  }
}

async function generate({ messages, mode, temperature = 0.3 }) {
  const res = await fetch("/api/generate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages, mode, temperature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "API request failed");
  }

  const reader = res.body.getReader();
  const dec    = new TextDecoder();
  let   buf    = "";
  let   full   = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const evt = JSON.parse(raw);
        if (evt.error) throw new Error(evt.error);
        if (evt.t) full += evt.t;
        if (evt.done) return full;
      } catch (e) {
        if (e.message !== "Unexpected end of JSON input") throw e;
      }
    }
  }
  if (!full) throw new Error("Empty response — please try again.");
  return full;
}

// ─── Welcome HTML ─────────────────────────────────────────────────────────────

const WELCOME_HTML = `
  <div class="welcome">
    <div class="welcome-logo">🎓</div>
    <h2>Welcome to CampusBridge!</h2>
    <p>Upload your study materials and ask me anything — I'll explain concepts clearly and help you master them.</p>
    <div class="feature-list">
      <div class="feature">🎯 Adaptive practice tests that adjust to your level</div>
      <div class="feature">💡 Concept explanations with analogies &amp; examples</div>
      <div class="feature">📊 Per-topic mastery tracking with checkboxes</div>
      <div class="feature">📅 Personalised study plans that update in real-time</div>
    </div>
  </div>`;

// ─── App ──────────────────────────────────────────────────────────────────────

class CampusBridgeApp {
  constructor() {
    this.store          = new DocumentStore();
    this.history        = [];
    this.mode           = "chat";
    this.generating     = false;
    this._topicsLoading = false;
    this.topicsData     = null;
    this.testState      = null;
    this.masteryScores  = {};

    this._initUser();
    this._bindTheme();
    this._bindSidebarMobile();
    this._bindSidebar();
    this._bindChat();
    this._bindNewChat();
    this._bindModes();
    this._bindTest();
    this._bindPlan();
    this._renderTestSetup();
    this._renderPlanSetup();
    this._renderMasteryEmpty();
  }

  // ── User memory ───────────────────────────────────────────────────────────────

  _initUser() {
    let id = localStorage.getItem("cb-user-id");
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem("cb-user-id", id);
    }
    this.userId = id;
    try {
      const saved = localStorage.getItem(`cb-mastery-${id}`);
      if (saved) this.masteryScores = JSON.parse(saved);
    } catch {}
  }

  _saveMastery() {
    localStorage.setItem(`cb-mastery-${this.userId}`, JSON.stringify(this.masteryScores));
  }

  // ── Theme ─────────────────────────────────────────────────────────────────────

  _bindTheme() {
    const current = document.documentElement.getAttribute("data-theme") ?? "light";
    $("theme-btn").textContent = current === "dark" ? "☀️" : "🌙";
    $("theme-btn").addEventListener("click", () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const next = dark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      $("theme-btn").textContent = next === "dark" ? "☀️" : "🌙";
      localStorage.setItem("cb-theme", next);
    });
  }

  // ── Generating state ──────────────────────────────────────────────────────────

  _setGenerating(bool) {
    this.generating = bool;
    $("send-btn").disabled = bool;
  }

  // ── New Chat ──────────────────────────────────────────────────────────────────

  _bindNewChat() {
    $("new-chat-btn").addEventListener("click", () => this._newChat());
  }

  _newChat() {
    this.history = [];
    this._setGenerating(false);
    $("chat-messages").innerHTML = WELCOME_HTML;
    $("chat-input").value = "";
    $("chat-input").style.height = "auto";
    this._switchMode("chat");
  }

  // ── Mobile sidebar ────────────────────────────────────────────────────────────

  _bindSidebarMobile() {
    const sidebar  = document.getElementById("sidebar");
    const overlay  = document.getElementById("sidebar-overlay");
    const openBtn  = $("sidebar-toggle");
    const closeBtn = $("sidebar-close");

    const open  = () => { sidebar.classList.add("open");  overlay.hidden = false; };
    const close = () => { sidebar.classList.remove("open"); overlay.hidden = true; };

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    overlay?.addEventListener("click", close);

    document.querySelectorAll(".mode-btn").forEach(btn =>
      btn.addEventListener("click", () => { if (window.innerWidth <= 700) close(); })
    );
    document.querySelectorAll(".qa-btn").forEach(btn =>
      btn.addEventListener("click", close)
    );
  }

  // ── Sidebar / Documents ───────────────────────────────────────────────────────

  _bindSidebar() {
    $("upload-btn").addEventListener("click", () => $("file-input").click());

    $("file-input").addEventListener("change", async e => {
      for (const f of [...e.target.files]) await this._addDocument(f);
      e.target.value = "";
    });

    const sidebar = document.querySelector(".sidebar");
    sidebar.addEventListener("dragover",  e => { e.preventDefault(); sidebar.classList.add("drag-over"); });
    sidebar.addEventListener("dragleave", () => sidebar.classList.remove("drag-over"));
    sidebar.addEventListener("drop", async e => {
      e.preventDefault();
      sidebar.classList.remove("drag-over");
      for (const f of [...e.dataTransfer.files]) await this._addDocument(f);
    });

    document.querySelectorAll(".qa-btn").forEach(btn =>
      btn.addEventListener("click", () => this._quickAction(btn.dataset.action))
    );
  }

  async _addDocument(file) {
    const okExts = [".txt", ".pdf", ".md", ".csv", ".markdown"];
    if (!okExts.some(e => file.name.toLowerCase().endsWith(e))) {
      this._toast(`Unsupported file type: ${file.name}`, "error"); return;
    }
    const item = this._addDocItem(file.name);
    try {
      const id = await this.store.addFile(file);
      this._finaliseDocItem(item, id, file.name, file.size);
      this._toast(`Added: ${file.name}`, "success");
      this.topicsData = null;
      if (this.mode === "mastery") this._renderMasteryEmpty();
    } catch (err) {
      item.dataset.state = "error";
      item.querySelector(".doc-status").textContent = "❌ Failed";
      this._toast(`Failed: ${err.message}`, "error");
    }
  }

  _addDocItem(name) {
    const list = $("doc-list");
    list.querySelector(".empty-docs")?.remove();
    const div = document.createElement("div");
    div.className     = "doc-item";
    div.dataset.state = "processing";
    div.innerHTML = `
      <span class="doc-icon">${name.endsWith(".pdf") ? "📄" : "📝"}</span>
      <div class="doc-info">
        <span class="doc-name">${name}</span>
        <span class="doc-status">Processing…</span>
      </div>
      <button class="doc-remove hidden" title="Remove">✕</button>`;
    list.appendChild(div);
    return div;
  }

  _finaliseDocItem(item, id, name, size) {
    item.dataset.state = "ready";
    item.querySelector(".doc-status").textContent = fmtSize(size);
    const btn = item.querySelector(".doc-remove");
    btn.classList.remove("hidden");
    btn.addEventListener("click", () => {
      this.store.removeDoc(id);
      item.remove();
      if (!this.store.hasContent) {
        $("doc-list").innerHTML = `
          <div class="empty-docs">
            <span>📚</span><p>No materials yet</p>
            <p>Upload PDFs, text files, or notes</p>
          </div>`;
      }
      this.topicsData = null;
      if (this.mode === "mastery") this._renderMasteryEmpty();
    });
  }

  _quickAction(action) {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }
    if (action === "generate-test") {
      this._switchMode("test");
      return;
    }
    if (action === "study-plan") {
      this._switchMode("plan");
      return;
    }
  }

  // ── Modes ─────────────────────────────────────────────────────────────────────

  _bindModes() {
    document.querySelectorAll(".mode-btn").forEach(btn =>
      btn.addEventListener("click", () => this._switchMode(btn.dataset.mode))
    );
  }

  _switchMode(mode) {
    this.mode = mode;
    document.querySelectorAll(".mode-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.mode === mode)
    );
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === `panel-${mode}`)
    );
    if (mode === "mastery") {
      if (this.topicsData) this._renderMastery();
      else if (this.store.hasContent) this._extractMastery();
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────

  _bindChat() {
    const input = $("chat-input");
    const btn   = $("send-btn");
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this._sendMessage(); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 160) + "px";
      btn.disabled = !input.value.trim() || this.generating;
    });
    btn.addEventListener("click", () => this._sendMessage());
  }

  async _sendMessage() {
    const input = $("chat-input");
    const text  = input.value.trim();
    if (!text || this.generating) return;

    this._setGenerating(true);
    input.value = "";
    input.style.height = "auto";

    this._appendMsg("user", text);
    const aiEl = this._appendMsg("ai", "", true);
    const box  = aiEl.querySelector(".msg-content");

    const docCtx = this.store.getContext(text, 12000);
    let userContent = text;
    if (docCtx) userContent = `=== Study Materials ===\n${docCtx}\n\n---\n\nMy question: ${text}`;

    const messages = [
      ...this.history.slice(-8),
      { role: "user", content: userContent },
    ];

    let full = "";
    try {
      await streamChat({ messages, mode: "chat" }, delta => {
        full += delta;
        box.innerHTML = md(full);
        scrollEnd($("chat-messages"));
      });
      this.history.push({ role: "user",      content: text });
      this.history.push({ role: "assistant", content: full });
    } catch (err) {
      box.innerHTML = `<span class="err-msg">⚠️ ${err.message}</span>`;
    }

    aiEl.querySelector(".msg-spinner")?.remove();
    this._setGenerating(false);
    $("chat-input").focus();
  }

  _appendMsg(role, text, streaming = false) {
    const container = $("chat-messages");
    container.querySelector(".welcome")?.remove();

    const div = document.createElement("div");
    div.className = `msg msg-${role}`;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "user" ? "👤" : "🎓";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    const content = document.createElement("div");
    content.className = "msg-content";
    if (text) content.innerHTML = role === "ai" ? md(text) : `<p>${text}</p>`;

    bubble.appendChild(content);

    if (streaming && !text) {
      const spinner = document.createElement("div");
      spinner.className = "msg-spinner";
      spinner.innerHTML = "<span></span><span></span><span></span>";
      bubble.appendChild(spinner);
    }

    div.appendChild(avatar);
    div.appendChild(bubble);
    container.appendChild(div);
    scrollEnd(container);
    return div;
  }

  // ── Practice Test ─────────────────────────────────────────────────────────────

  _bindTest() {
    $("panel-test").addEventListener("click", e => {
      if (e.target.id === "gen-test-btn")     this._generateTest();
      if (e.target.id === "restart-test-btn") this._renderTestSetup();
      if (e.target.id === "next-q-btn")       this._nextQuestion();
      if (e.target.id === "submit-short-btn") this._submitShortAnswer();
      if (e.target.classList.contains("mcq-opt")) this._selectMCQ(e.target);
    });
  }

  _renderTestSetup() {
    this.testState = null;
    // Build weak-topic hint from mastery scores
    const weakHint = Object.entries(this.masteryScores)
      .filter(([, v]) => v.pct < 0.6)
      .map(([topic]) => topic)
      .join(", ");

    $("panel-test").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>🎯 Adaptive Practice Test</h2>
          <p>Tests adapt to your level and focus on areas where you need the most practice.</p>
        </div>
        <div class="form-card">
          <div class="form-row">
            <div class="form-group">
              <label>Topic / Focus Area</label>
              <input id="test-topic" type="text"
                value="${weakHint}"
                placeholder="e.g. Chapter 3, Photosynthesis — or leave blank for all topics">
            </div>
          </div>
          <div class="form-row three-col">
            <div class="form-group">
              <label>Number of Questions</label>
              <select id="test-count">
                <option value="5">5 questions</option>
                <option value="8">8 questions</option>
                <option value="10" selected>10 questions</option>
              </select>
            </div>
            <div class="form-group">
              <label>Difficulty</label>
              <select id="test-diff">
                <option value="mixed" selected>Mixed levels</option>
                <option value="easy">Easy — Recall</option>
                <option value="medium">Medium — Application</option>
                <option value="hard">Hard — Analysis</option>
              </select>
            </div>
            <div class="form-group">
              <label>Question Types</label>
              <select id="test-types">
                <option value="mixed" selected>Both types</option>
                <option value="mcq">Multiple Choice only</option>
                <option value="short">Short Answer only</option>
              </select>
            </div>
          </div>
          <button id="gen-test-btn" class="btn-primary">Generate Adaptive Test</button>
        </div>
      </div>`;
  }

  async _generateTest() {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }

    const topic  = $("test-topic")?.value.trim() ?? "";
    const count  = $("test-count")?.value ?? "10";
    const diff   = $("test-diff")?.value  ?? "mixed";
    const types  = $("test-types")?.value ?? "mixed";

    $("panel-test").innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">🎯</div>
        <h3>Generating your adaptive test…</h3>
        <p class="muted">Crafting ${count} questions${topic ? ` on "${topic}"` : ""}</p>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;

    const docCtx    = this.store.getContext(topic || "all topics", 10000);
    const diffLabel = { mixed: "a mix of easy, medium, and hard", easy: "easy (recall)", medium: "medium (application)", hard: "hard (analysis)" }[diff];
    const typeLabel = { mixed: "a mix of multiple choice and short answer", mcq: "multiple choice only", short: "short answer only" }[types];

    const weakTopics  = Object.entries(this.masteryScores)
      .filter(([, v]) => v.pct < 0.6).map(([t]) => t).join(", ");
    const topicNames  = this.topicsData?.map(t => t.name).join(", ") ?? "";

    const userMsg = `Generate exactly ${count} questions about "${topic || "all major topics"}" at ${diffLabel} difficulty, as ${typeLabel}.
${weakTopics ? `\nFocus more questions on these weak areas: ${weakTopics}` : ""}
${topicNames ? `\nTag each question's "topic" field using ONLY these exact names: ${topicNames}` : ""}

Study material:
${docCtx}

Return only the JSON.`;

    try {
      const raw       = await generate({ messages: [{ role: "user", content: userMsg }], mode: "test" });
      const parsed    = parseJSON(raw);
      const questions = parsed.questions ?? (Array.isArray(parsed) ? parsed : null);
      if (!questions?.length) throw new Error("No questions returned.");
      this.testState = { questions, current: 0, answers: {}, score: 0, total: questions.length };
      this._renderQuestion();
    } catch (err) {
      $("panel-test").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:2.5rem">⚠️</div>
          <h3>Could not generate test</h3>
          <p class="muted">${err.message}</p>
          <button id="restart-test-btn" class="btn-secondary">Try Again</button>
        </div>`;
    }
  }

  _renderQuestion() {
    const { questions, current } = this.testState;
    const q    = questions[current];
    const isMCQ = q.type === "mcq";

    $("panel-test").innerHTML = `
      <div class="panel-inner">
        <div class="test-progress">
          <div class="test-progress-bar">
            <div class="test-progress-fill" style="width:${(current / this.testState.total) * 100}%"></div>
          </div>
          <span class="test-progress-label">Question ${current + 1} of ${this.testState.total}</span>
        </div>
        <div class="question-card">
          <div class="question-meta">
            <span class="badge badge-diff-${q.difficulty}">${q.difficulty}</span>
            <span class="badge badge-topic">${q.topic ?? "General"}</span>
            ${q.needs_memorization ? '<span class="badge badge-mem">📌 Memorisation required</span>' : ""}
          </div>
          <div class="question-text">${q.question}</div>
          ${isMCQ ? `
            <div class="mcq-options">
              ${(q.options ?? []).map(opt => `
                <button class="mcq-opt" data-letter="${opt[0]}" data-correct="${q.correct}">${opt}</button>
              `).join("")}
            </div>
            <div class="question-feedback hidden" id="q-feedback"></div>
          ` : `
            <div class="short-answer-area">
              <textarea id="short-input" placeholder="Write your answer here…" rows="5"></textarea>
              <button id="submit-short-btn" class="btn-primary">Submit Answer</button>
            </div>
            <div class="question-feedback hidden" id="q-feedback"></div>
          `}
        </div>
        <div class="test-nav hidden" id="test-nav">
          <button id="next-q-btn" class="btn-primary">
            ${current + 1 < this.testState.total ? "Next Question →" : "See Results"}
          </button>
        </div>
      </div>`;
  }

  _selectMCQ(btn) {
    if (btn.dataset.answered) return;
    const q      = this.testState.questions[this.testState.current];
    const chosen = btn.dataset.letter;
    const correct = q.correct;
    const isRight = chosen === correct;

    document.querySelectorAll(".mcq-opt").forEach(b => {
      b.dataset.answered = "1";
      if (b.dataset.letter === correct) b.classList.add("correct");
      else if (b === btn && !isRight)   b.classList.add("wrong");
    });

    this.testState.answers[this.testState.current] = { type: "mcq", chosen, correct, isRight };
    if (isRight) this.testState.score++;

    const fb = $("q-feedback");
    fb.classList.remove("hidden");
    fb.className = isRight ? "question-feedback feedback-correct" : "question-feedback feedback-wrong";
    fb.innerHTML = isRight
      ? `<strong>✅ Correct!</strong> ${q.brief_explanation ?? ""}`
      : `<strong>❌ Incorrect.</strong> The correct answer is <strong>${correct}</strong>.<br>${md(q.full_explanation ?? q.brief_explanation ?? "")}`;

    $("test-nav").classList.remove("hidden");
  }

  _submitShortAnswer() {
    const val = $("short-input")?.value.trim();
    if (!val) return;
    const q = this.testState.questions[this.testState.current];
    this.testState.answers[this.testState.current] = { type: "short", given: val };

    const fb = $("q-feedback");
    fb.classList.remove("hidden");
    fb.className = "question-feedback feedback-info";
    const keyPoints = (q.key_points ?? []).map(p => `<li>${p}</li>`).join("");
    fb.innerHTML = `
      <strong>📖 Model Answer</strong>
      <div class="model-answer">${md(q.model_answer ?? "")}</div>
      ${keyPoints ? `<strong>Key Points to Cover:</strong><ul>${keyPoints}</ul>` : ""}
      <div class="self-grade">
        <span>How did you do?</span>
        <button class="sg-btn sg-good" data-q="${this.testState.current}" data-val="1">✅ Got it</button>
        <button class="sg-btn sg-ok"   data-q="${this.testState.current}" data-val="0.5">🟡 Partially</button>
        <button class="sg-btn sg-bad"  data-q="${this.testState.current}" data-val="0">❌ Missed it</button>
      </div>`;

    fb.querySelectorAll(".sg-btn").forEach(b => {
      b.addEventListener("click", () => {
        const qIdx = parseInt(b.dataset.q);
        this.testState.answers[qIdx].selfScore = parseFloat(b.dataset.val);
        this.testState.score += parseFloat(b.dataset.val);
        fb.querySelectorAll(".sg-btn").forEach(x => x.disabled = true);
        b.classList.add("selected");
        $("test-nav").classList.remove("hidden");
      });
    });
  }

  _nextQuestion() {
    this.testState.current++;
    if (this.testState.current >= this.testState.total) this._renderResults();
    else this._renderQuestion();
  }

  _renderResults() {
    const { score, total, questions, answers } = this.testState;
    const pct   = Math.round((score / total) * 100);
    const emoji = pct >= 80 ? "🏆" : pct >= 60 ? "🎯" : "📚";
    const msg   = pct >= 80 ? "Excellent work!" : pct >= 60 ? "Good progress — keep going!" : "Keep at it — you'll get there!";

    // Update running mastery scores
    questions.forEach((q, i) => {
      const a     = answers[i] ?? {};
      const topic = q.topic ?? "General";
      if (!this.masteryScores[topic]) this.masteryScores[topic] = { score: 0, total: 0 };
      const pts = a.type === "mcq" ? (a.isRight ? 1 : 0) : (a.selfScore ?? 0);
      this.masteryScores[topic].score += pts;
      this.masteryScores[topic].total += 1;
      this.masteryScores[topic].pct =
        this.masteryScores[topic].score / this.masteryScores[topic].total;
    });
    this._saveMastery();
    if (this.topicsData) this._renderMastery();

    const breakdown = questions.map((q, i) => {
      const a    = answers[i] ?? {};
      const icon = a.type === "mcq"
        ? (a.isRight ? "✅" : "❌")
        : (a.selfScore >= 1 ? "✅" : a.selfScore > 0 ? "🟡" : "❌");
      return `
        <div class="result-item">
          <span class="result-icon">${icon}</span>
          <div>
            <div class="result-q">${q.question}</div>
            <div class="result-meta">${q.topic ?? "General"} · ${q.difficulty}</div>
          </div>
        </div>`;
    }).join("");

    $("panel-test").innerHTML = `
      <div class="panel-inner">
        <div class="results-header">
          <div class="results-emoji">${emoji}</div>
          <h2>${pct}% — ${msg}</h2>
          <p class="muted">Score: ${score}/${total} points</p>
          <div class="results-bar-wrap">
            <div class="results-bar"><div class="results-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
        <div class="results-breakdown"><h3>Question Breakdown</h3>${breakdown}</div>
        <div class="results-actions">
          <button id="restart-test-btn" class="btn-primary">Take Another Test</button>
          <button id="review-chat-btn" class="btn-secondary">Ask CampusBridge to Explain</button>
        </div>
      </div>`;

    $("review-chat-btn")?.addEventListener("click", () => {
      const missed = questions
        .filter((_, i) => {
          const a = answers[i] ?? {};
          return a.type === "mcq" ? !a.isRight : (a.selfScore ?? 0) < 1;
        })
        .map(q => q.topic ?? q.question).join(", ");
      this._switchMode("chat");
      $("chat-input").value = `I got these topics wrong on my test: ${missed}. Can you explain them with analogies and concrete examples?`;
    });
  }

  // ── Study Plan ────────────────────────────────────────────────────────────────

  _bindPlan() {
    $("panel-plan").addEventListener("click", e => {
      if (e.target.id === "gen-plan-btn")   this._generatePlan();
      if (e.target.id === "reset-plan-btn") this._renderPlanSetup();
    });
  }

  _renderPlanSetup() {
    const today = new Date().toISOString().split("T")[0];
    $("panel-plan").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>📅 Study Plan</h2>
          <p>Get a personalised, adaptive schedule. CampusBridge factors in your test performance to focus on weak areas.</p>
        </div>
        <div class="form-card">
          <div class="form-row">
            <div class="form-group">
              <label>Exam / Goal Date</label>
              <input id="plan-date" type="date" min="${today}">
            </div>
            <div class="form-group">
              <label>Daily Study Hours</label>
              <select id="plan-hours">
                <option value="1">1 hour / day</option>
                <option value="2" selected>2 hours / day</option>
                <option value="3">3 hours / day</option>
                <option value="4">4+ hours / day</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Additional notes (optional)</label>
            <textarea id="plan-focus" rows="3" placeholder="e.g. I struggle with topic X but understand Y well…"></textarea>
          </div>
          <button id="gen-plan-btn" class="btn-primary">Build My Study Plan</button>
        </div>
      </div>`;
  }

  async _generatePlan() {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }
    this._setGenerating(true);

    const dateVal = $("plan-date")?.value;
    const hours   = $("plan-hours")?.value ?? "2";
    const focus   = $("plan-focus")?.value.trim() ?? "";
    const today   = new Date();
    const target  = dateVal ? new Date(dateVal) : null;
    const days    = target ? Math.ceil((target - today) / 86400000) : null;

    const panel = $("panel-plan");
    panel.innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">📅</div>
        <h3>Building your personalised study plan…</h3>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;

    const topicContext = this.topicsData
      ? this.topicsData.map(t => {
          const subs = t.subtopics?.length ? ` (${t.subtopics.slice(0, 4).join(", ")})` : "";
          return `• ${t.name}${subs}`;
        }).join("\n")
      : this.store.getTopicNamesOverview();

    // Include mastery performance data
    const weakAreas = Object.entries(this.masteryScores)
      .filter(([, v]) => v.pct < 0.6)
      .map(([topic, v]) => `${topic} (${Math.round(v.pct * 100)}%)`)
      .join(", ");
    const strongAreas = Object.entries(this.masteryScores)
      .filter(([, v]) => v.pct >= 0.8)
      .map(([topic]) => topic)
      .join(", ");

    const userMsg = `Create a concise adaptive study plan in tabular format.

Student details:
- ${days ? `Days until exam: ${days} (target: ${dateVal})` : "No specific deadline"}
- Daily study time: ${hours} hour(s)
${focus ? `- Notes: ${focus}` : ""}
${weakAreas ? `- Weak areas needing more focus: ${weakAreas}` : ""}
${strongAreas ? `- Strong areas (less time needed): ${strongAreas}` : ""}

Topics to cover:
${topicContext}

Output:
1. A markdown table: Day | Topics | Activity | Duration — weight weak areas more heavily
2. A spaced repetition schedule table showing revisit days
3. 3-4 bullet tips
No prose paragraphs — tables and bullets only.`;

    try {
      const wrapper = document.createElement("div");
      wrapper.className = "panel-inner plan-output";
      wrapper.innerHTML = `<div id="plan-md"></div>
        <div class="plan-actions">
          <button id="reset-plan-btn" class="btn-secondary">Rebuild Plan</button>
        </div>`;
      panel.innerHTML = "";
      panel.appendChild(wrapper);

      let full = "";
      await streamChat(
        { messages: [{ role: "user", content: userMsg }], mode: "plan", temperature: 0.6 },
        delta => {
          full += delta;
          $("plan-md").innerHTML = md(full);
          scrollEnd(panel);
        }
      );
    } catch (err) {
      panel.innerHTML = `
        <div class="panel-inner center-content">
          <div>⚠️</div><h3>Error</h3>
          <p class="muted">${err.message}</p>
          <button id="reset-plan-btn" class="btn-secondary">Try Again</button>
        </div>`;
    } finally {
      this._setGenerating(false);
    }
  }

  // ── Mastery Tracking ──────────────────────────────────────────────────────────

  _renderMasteryEmpty() {
    $("panel-mastery").innerHTML = `
      <div class="panel-inner center-content">
        <div style="font-size:3rem">📊</div>
        <h3>${this.store.hasContent ? "Analysing materials…" : "No Materials Yet"}</h3>
        <p class="muted">${this.store.hasContent
          ? "Extracting your topic map. Takes about 10–20 seconds."
          : "Upload study materials to see your mastery breakdown."}</p>
      </div>`;
  }

  _docFingerprint() {
    return this.store.docs.map(d => `${d.name}:${d.size}`).sort().join("|");
  }

  async _extractMastery() {
    if (!this.store.hasContent) return;
    if (this._topicsLoading) return;

    // Return cached topics instantly if the same documents are loaded
    const fp   = this._docFingerprint();
    const cKey = `cb-topics-${this.userId}-${fp}`;
    try {
      const cached = localStorage.getItem(cKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.length) {
          this.topicsData = parsed;
          this._renderMastery();
          return;
        }
      }
    } catch {}

    this._topicsLoading = true;
    this._renderMasteryEmpty();

    const docCtx  = this.store.getStructuredOverview(3000);
    const userMsg = `Extract a topic map from these study materials.\n\nMaterials:\n${docCtx}\n\nReturn only JSON.`;

    try {
      const raw    = await generate({ messages: [{ role: "user", content: userMsg }], mode: "topics" });
      const parsed = parseJSON(raw);
      this.topicsData = parsed.topics ?? (Array.isArray(parsed) ? parsed : null);
      if (!this.topicsData?.length) throw new Error("No topics found — try uploading more content.");
      localStorage.setItem(cKey, JSON.stringify(this.topicsData));
      this._renderMastery();
    } catch (err) {
      this.topicsData = null;
      $("panel-mastery").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:2.5rem">⚠️</div>
          <h3>Could not extract topics</h3>
          <p class="muted">${err.message}</p>
          <button id="retry-mastery-btn" class="btn-secondary">Retry</button>
        </div>`;
      $("retry-mastery-btn")?.addEventListener("click", () => {
        this._topicsLoading = false;
        this._extractMastery();
      });
    }
    this._topicsLoading = false;
  }

  _renderMastery() {
    const impColor = { high: "var(--clr-error)", medium: "var(--clr-warning)", low: "var(--clr-success)" };

    const cards = this.topicsData.map((t, i) => {
      const ms  = this.masteryScores[t.name];
      const pct = ms ? Math.round(ms.pct * 100) : null;
      const masteryBar = pct !== null
        ? `<div class="mastery-bar-wrap">
            <div class="mastery-bar">
              <div class="mastery-fill" style="width:${pct}%;background:${pct >= 80 ? "var(--clr-success)" : pct >= 50 ? "var(--clr-warning)" : "var(--clr-error)"}"></div>
            </div>
            <span class="mastery-pct">${pct}% mastery</span>
           </div>`
        : "";

      const subtopics = (t.subtopics ?? []).map(s => {
        const sid = `st-${i}-${s.replace(/\W/g, "-")}`;
        return `
          <div class="subtopic">
            <input type="checkbox" id="${sid}" class="subtopic-check">
            <label for="${sid}">${s}</label>
          </div>`;
      }).join("");

      const prereqs = (t.prerequisites ?? []).length
        ? `<div class="topic-prereqs">📋 Prereqs: ${t.prerequisites.join(", ")}</div>` : "";

      return `
        <div class="topic-card">
          <div class="topic-header">
            <div class="topic-dot" style="background:${impColor[t.importance] ?? "var(--clr-primary)"}"></div>
            <h3 class="topic-name">${t.name}</h3>
            <span class="badge badge-diff-${t.importance}">${t.importance} priority</span>
            <button class="topic-study-btn" data-topic="${t.name}" title="Explain this topic">💬</button>
          </div>
          ${masteryBar}
          ${t.summary ? `<p class="topic-summary">${t.summary}</p>` : ""}
          ${prereqs}
          ${subtopics ? `<div class="subtopics">${subtopics}</div>` : ""}
        </div>`;
    }).join("");

    $("panel-mastery").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>📊 Mastery Tracker</h2>
          <p>${this.topicsData.length} topics found. Tick subtopics as you master them. Test scores update the mastery bars automatically.</p>
        </div>
        <div class="topics-grid">${cards}</div>
      </div>`;

    document.querySelectorAll(".topic-study-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._switchMode("chat");
        $("chat-input").value = `Explain "${btn.dataset.topic}" in detail with analogies and concrete examples from my study materials.`;
      });
    });
    document.querySelectorAll(".subtopic-check").forEach(cb => {
      const key = "cb-" + cb.id;
      cb.checked = localStorage.getItem(key) === "1";
      cb.addEventListener("change", () => localStorage.setItem(key, cb.checked ? "1" : "0"));
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  _toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className   = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3000);
  }
}

const app = new CampusBridgeApp();
window.app = app;
