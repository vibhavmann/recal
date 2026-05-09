// app.js — Recal main controller
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

// Fetch top-5 DuckDuckGo results for a query
async function webSearch(query) {
  try {
    const res  = await fetch("/api/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query }),
    });
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

function formatWebResults(results) {
  if (!results.length) return "";
  const lines = results.map((r, i) =>
    `${i + 1}. **${r.title}**${r.url ? " — " + r.url : ""}\n   ${r.snippet}`
  );
  return `=== Web Search Results ===\n${lines.join("\n\n")}`;
}


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
  const res  = await fetch("/api/generate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages, mode, temperature }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.content;
}

// ─── Welcome HTML (reused by new-chat) ───────────────────────────────────────

const WELCOME_HTML = `
  <div class="welcome">
    <div class="welcome-logo">🎓</div>
    <h2>Welcome to Recal!</h2>
    <p>Upload your study materials, then ask me anything — or use a Quick Action in the sidebar.</p>
    <div class="feature-list">
      <div class="feature">🎯 Adaptive practice tests with detailed explanations</div>
      <div class="feature">🃏 Flashcard decks for active recall practice</div>
      <div class="feature">📊 Topic extraction &amp; mastery tracking</div>
      <div class="feature">📅 Personalised study plans with spaced repetition</div>
    </div>
  </div>`;

// ─── App ──────────────────────────────────────────────────────────────────────

class RecalApp {
  constructor() {
    this.store          = new DocumentStore();
    this.history        = [];
    this.mode           = "chat";
    this.generating     = false;   // chat / plan flag
    this._topicsLoading = false;   // separate flag — topics never blocks on chat
    this.testState      = null;
    this.topicsData     = null;
    this.fcState        = null;
    this._fcKeyHandler  = null;

    this._bindTheme();
    this._bindSidebarMobile();
    this._bindSidebar();
    this._bindChat();
    this._bindNewChat();
    this._bindModes();
    this._bindTest();
    this._bindPlan();
    this._bindFlashcards();
    this._renderTestSetup();
    this._renderPlanSetup();
    this._renderFlashcardSetup();
    this._renderTopicsEmpty();
  }

  // ── Theme (with localStorage persistence) ───────────────────────────────────

  _bindTheme() {
    // Sync button icon with whatever theme is currently active
    // (The <script> in <head> may have already applied the saved theme)
    const current = document.documentElement.getAttribute("data-theme") ?? "light";
    $("theme-btn").textContent = current === "dark" ? "☀️" : "🌙";

    $("theme-btn").addEventListener("click", () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const next = dark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      $("theme-btn").textContent = next === "dark" ? "☀️" : "🌙";
      localStorage.setItem("recal-theme", next);
    });
  }

  // ── New Chat ─────────────────────────────────────────────────────────────────

  _bindNewChat() {
    $("new-chat-btn").addEventListener("click", () => this._newChat());
  }

  _newChat() {
    this.history    = [];
    this.generating = false;
    $("chat-messages").innerHTML = WELCOME_HTML;
    $("chat-input").value = "";
    $("chat-input").style.height = "auto";
    this._switchMode("chat");
  }

  // ── Mobile sidebar drawer ─────────────────────────────────────────────────────

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

    // Close sidebar when a mode tab is clicked on mobile
    document.querySelectorAll(".mode-btn").forEach(btn =>
      btn.addEventListener("click", () => { if (window.innerWidth <= 700) close(); })
    );
    // Close sidebar when a quick action is clicked
    document.querySelectorAll(".qa-btn").forEach(btn =>
      btn.addEventListener("click", close)
    );
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────────

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
      if (this.mode === "topics") this._renderTopicsEmpty();
    } catch (err) {
      item.dataset.state = "error";
      item.querySelector(".doc-status").textContent = "❌ Failed";
      this._toast(`Failed: ${err.message}`, "error");
    }
  }

  _addDocItem(name) {
    const list  = $("doc-list");
    list.querySelector(".empty-docs")?.remove();
    const div = document.createElement("div");
    div.className    = "doc-item";
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
      if (this.mode === "topics") this._renderTopicsEmpty();
    });
  }

  _quickAction(action) {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }
    const prompts = {
      summarize:     "Please summarise all the uploaded study materials. Identify the main topics, key concepts, and most important details. Structure your summary with clear headings.",
      "key-concepts":"List and explain all the key concepts from my study materials. For each concept, provide a clear definition and a concrete real-world example.",
      "generate-test":"Generate a quick 5-question mixed practice test covering the main topics in my study materials.",
      "study-plan":  "Create a comprehensive study plan for these materials using spaced repetition principles. Organise topics by importance and provide a suggested study schedule.",
    };
    const text = prompts[action];
    if (!text) return;
    this._switchMode("chat");
    $("chat-input").value = text;
    this._sendMessage();
  }

  // ── Modes ─────────────────────────────────────────────────────────────────────

  _bindModes() {
    document.querySelectorAll(".mode-btn").forEach(btn =>
      btn.addEventListener("click", () => this._switchMode(btn.dataset.mode))
    );
  }

  _switchMode(mode) {
    this.mode = mode;
    // Remove flashcard keyboard handler when leaving flashcards
    if (mode !== "flashcards" && this._fcKeyHandler) {
      document.removeEventListener("keydown", this._fcKeyHandler);
      this._fcKeyHandler = null;
    }
    document.querySelectorAll(".mode-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.mode === mode)
    );
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === `panel-${mode}`)
    );
    // Topics uses its own loading flag — never blocked by chat/plan generation
    if (mode === "topics" && !this.topicsData && this.store.hasContent) {
      this._extractTopics();
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

    this.generating = true;
    input.value = "";
    input.style.height = "auto";
    $("send-btn").disabled = true;

    this._appendMsg("user", text);
    const aiEl = this._appendMsg("ai", "", true);
    const box  = aiEl.querySelector(".msg-content");

    // Show transient status while we fetch context
    const searchMode0 = document.querySelector('input[name="search-mode"]:checked')?.value ?? "docs";
    if (searchMode0 === "web") box.innerHTML = `<span class="status-msg">🌐 Searching the web…</span>`;

    // Read search mode from radio buttons
    const searchMode = document.querySelector('input[name="search-mode"]:checked')?.value ?? "docs";
    const useWeb     = searchMode === "web";

    // Build context: documents + optional web results (in parallel when web is on)
    const [docCtx, webResults] = await Promise.all([
      Promise.resolve(this.store.getContext(text, useWeb ? 8000 : 12000)),
      useWeb ? webSearch(text) : Promise.resolve([]),
    ]);

    const webCtx = formatWebResults(webResults);

    let userContent = text;
    if (docCtx || webCtx) {
      const parts = [];
      if (docCtx)  parts.push(`=== Study Materials ===\n${docCtx}`);
      if (webCtx)  parts.push(webCtx);
      userContent = `${parts.join("\n\n")}\n\n---\n\nMy question: ${text}`;
    }

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
    this.generating   = false;
    $("send-btn").disabled = false;
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

  // ── Flashcards ────────────────────────────────────────────────────────────────

  _bindFlashcards() {
    $("panel-flashcards").addEventListener("click", e => {
      const id = e.target.id;
      if (id === "gen-fc-btn")      this._generateFlashcards();
      if (id === "restart-fc-btn")  this._renderFlashcardSetup();
      if (id === "fc-prev-btn")     this._fcNav(-1);
      if (id === "fc-next-btn")     this._fcNav(1);
      if (id === "fc-shuffle-btn")  this._fcShuffle();
      if (id === "fc-review-btn")   this._fcRestart();
      if (e.target.closest("#fc-card")) this._fcFlip();
    });
  }

  _renderFlashcardSetup() {
    this.fcState = null;
    if (this._fcKeyHandler) {
      document.removeEventListener("keydown", this._fcKeyHandler);
      this._fcKeyHandler = null;
    }
    $("panel-flashcards").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>🃏 Flashcards</h2>
          <p>Generate a deck from your materials for active recall practice.</p>
        </div>
        <div class="form-card">
          <div class="form-row">
            <div class="form-group">
              <label>Topic / Focus Area</label>
              <input id="fc-topic" type="text" placeholder="e.g. Mitosis, Chapter 2 — or leave blank for all topics">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Number of Cards</label>
              <select id="fc-count">
                <option value="8">8 cards</option>
                <option value="12">12 cards</option>
                <option value="16" selected>16 cards</option>
                <option value="20">20 cards</option>
              </select>
            </div>
            <div class="form-group">
              <label>Card Style</label>
              <select id="fc-style">
                <option value="mixed" selected>Mixed (terms &amp; Q&amp;A)</option>
                <option value="concept">Concept → Explanation</option>
                <option value="qa">Question → Answer</option>
              </select>
            </div>
          </div>
          <button id="gen-fc-btn" class="btn-primary">Generate Flashcards</button>
        </div>
      </div>`;
  }

  async _generateFlashcards() {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }

    const topic = $("fc-topic")?.value.trim() ?? "";
    const count = $("fc-count")?.value ?? "16";
    const style = $("fc-style")?.value ?? "mixed";

    $("panel-flashcards").innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">🃏</div>
        <h3>Creating your flashcard deck…</h3>
        <p class="muted">Generating ${count} cards${topic ? ` on "${topic}"` : ""}</p>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;

    const docCtx = this.store.getContext(topic || "all topics", 10000);
    const styleDesc = {
      mixed:   "a mix of term/concept cards and question-and-answer cards",
      concept: "term or concept on the front, explanation with example on the back",
      qa:      "a question on the front, the answer on the back",
    }[style];

    const userMsg = `Generate exactly ${count} flashcards about "${topic || "all major topics"}" using ${styleDesc} style.

Study material:
${docCtx}

Return only the JSON.`;

    try {
      const raw    = await generate({ messages: [{ role: "user", content: userMsg }], mode: "flashcards" });
      const parsed = parseJSON(raw);
      const cards  = parsed.cards ?? (Array.isArray(parsed) ? parsed : null);
      if (!cards?.length) throw new Error("No cards returned.");

      this.fcState = { cards, current: 0, flipped: false };
      this._renderFlashcard();
    } catch (err) {
      $("panel-flashcards").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:2.5rem">⚠️</div>
          <h3>Could not generate flashcards</h3>
          <p class="muted">${err.message}</p>
          <button id="restart-fc-btn" class="btn-secondary">Try Again</button>
        </div>`;
    }
  }

  _renderFlashcard() {
    const { cards, current, flipped } = this.fcState;
    const card   = cards[current];
    const isLast = current === cards.length - 1;
    const pct    = Math.round(((current + 1) / cards.length) * 100);

    $("panel-flashcards").innerHTML = `
      <div class="panel-inner fc-layout">
        <div class="fc-header">
          <button id="restart-fc-btn" class="btn-secondary btn-sm-text">← New Deck</button>
          <div class="fc-meta">
            <span class="badge badge-topic">${card.topic ?? "General"}</span>
            <span class="badge badge-diff-${card.difficulty ?? "medium"}">${card.difficulty ?? "medium"}</span>
          </div>
          <span class="fc-counter">${current + 1} / ${cards.length}</span>
        </div>

        <div class="fc-progress-wrap">
          <div class="fc-progress-bar">
            <div class="fc-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>

        <div class="flashcard-viewport" id="fc-card" role="button" tabindex="0"
             title="Click or press Space to flip">
          <div class="fc-inner${flipped ? " is-flipped" : ""}">
            <div class="fc-face fc-front">
              <div class="fc-hint">TAP TO REVEAL</div>
              <div class="fc-term">${card.front}</div>
            </div>
            <div class="fc-face fc-back">
              <div class="fc-hint">ANSWER</div>
              <div class="fc-explanation">${md(card.back)}</div>
            </div>
          </div>
        </div>

        <div class="fc-controls">
          <button id="fc-prev-btn" class="btn-secondary" ${current === 0 ? "disabled" : ""}>← Prev</button>
          <button id="fc-shuffle-btn" class="btn-secondary">🔀 Shuffle</button>
          <button id="fc-next-btn" class="btn-primary">
            ${isLast ? "Complete 🎉" : "Next →"}
          </button>
        </div>
        <p class="fc-tip muted">← → to navigate · Space to flip</p>
      </div>`;

    // Keyboard shortcuts — attach fresh handler each render
    if (this._fcKeyHandler) document.removeEventListener("keydown", this._fcKeyHandler);
    this._fcKeyHandler = (e) => {
      if (e.key === "ArrowLeft")              this._fcNav(-1);
      if (e.key === "ArrowRight")             this._fcNav(1);
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); this._fcFlip(); }
    };
    document.addEventListener("keydown", this._fcKeyHandler);
  }

  _fcFlip() {
    if (!this.fcState) return;
    this.fcState.flipped = !this.fcState.flipped;
    document.querySelector(".fc-inner")?.classList.toggle("is-flipped", this.fcState.flipped);
  }

  _fcNav(dir) {
    if (!this.fcState) return;
    const next = this.fcState.current + dir;
    if (dir > 0 && next >= this.fcState.cards.length) { this._fcShowComplete(); return; }
    if (next < 0) return;
    this.fcState.current = next;
    this.fcState.flipped  = false;
    this._renderFlashcard();
  }

  _fcShuffle() {
    if (!this.fcState) return;
    const arr = this.fcState.cards;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    this.fcState.current = 0;
    this.fcState.flipped  = false;
    this._renderFlashcard();
    this._toast("Deck shuffled!", "success");
  }

  _fcShowComplete() {
    if (this._fcKeyHandler) {
      document.removeEventListener("keydown", this._fcKeyHandler);
      this._fcKeyHandler = null;
    }
    $("panel-flashcards").innerHTML = `
      <div class="panel-inner center-content fc-complete">
        <div class="fc-complete-emoji">🎉</div>
        <h2>Deck Complete!</h2>
        <p class="muted">You reviewed all ${this.fcState.cards.length} cards. Great work!</p>
        <div class="fc-complete-actions">
          <button id="fc-review-btn" class="btn-primary">Review Again</button>
          <button id="restart-fc-btn" class="btn-secondary">New Deck</button>
        </div>
      </div>`;
  }

  _fcRestart() {
    if (!this.fcState) return;
    this.fcState.current = 0;
    this.fcState.flipped  = false;
    this._renderFlashcard();
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
    $("panel-test").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>🎯 Practice Test Generator</h2>
          <p>Generate a custom quiz from your study materials.</p>
        </div>
        <div class="form-card">
          <div class="form-row">
            <div class="form-group">
              <label>Topic / Focus Area</label>
              <input id="test-topic" type="text" placeholder="e.g. Chapter 3, Photosynthesis — or leave blank for all topics">
            </div>
          </div>
          <div class="form-row three-col">
            <div class="form-group">
              <label>Number of Questions</label>
              <select id="test-count">
                <option value="5">5 questions</option>
                <option value="8">8 questions</option>
                <option value="10" selected>10 questions</option>
                <option value="15">15 questions</option>
                <option value="20">20 questions</option>
              </select>
            </div>
            <div class="form-group">
              <label>Difficulty</label>
              <select id="test-diff">
                <option value="mixed" selected>Mixed levels</option>
                <option value="easy">Easy — Recall</option>
                <option value="medium">Medium — Application</option>
                <option value="hard">Hard — Analysis &amp; Synthesis</option>
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
          <button id="gen-test-btn" class="btn-primary">Generate Test</button>
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
        <h3>Generating your practice test…</h3>
        <p class="muted">Crafting ${count} thoughtful questions</p>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;

    const docCtx     = this.store.getContext(topic || "all topics", 12000);
    const diffLabel  = { mixed: "a mix of easy, medium, and hard", easy: "easy (recall)", medium: "medium (application)", hard: "hard (analysis & synthesis)" }[diff];
    const typesLabel = { mixed: "a mix of multiple choice and short answer", mcq: "multiple choice only", short: "short answer only" }[types];

    const userMsg = `Generate exactly ${count} questions about "${topic || "all major topics"}" at ${diffLabel} difficulty, as ${typesLabel}.

Study material:
${docCtx}

Return only the JSON.`;

    try {
      const raw     = await generate({ messages: [{ role: "user", content: userMsg }], mode: "test" });
      const parsed  = parseJSON(raw);
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
    const q       = this.testState.questions[this.testState.current];
    const chosen  = btn.dataset.letter;
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
          <button id="review-chat-btn" class="btn-secondary">Ask Recal for Help</button>
        </div>
      </div>`;

    $("review-chat-btn")?.addEventListener("click", () => {
      const missed = questions
        .filter((_, i) => { const a = answers[i] ?? {}; return a.type === "mcq" ? !a.isRight : (a.selfScore ?? 0) < 1; })
        .map(q => q.topic ?? q.question).join(", ");
      this._switchMode("chat");
      $("chat-input").value = `I struggled with: ${missed}. Can you explain these topics with analogies and examples?`;
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
          <h2>📅 Study Plan Creator</h2>
          <p>Get a personalised schedule tailored to your timeline and goals.</p>
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
            <label>Weak areas or priorities (optional)</label>
            <textarea id="plan-focus" rows="3" placeholder="e.g. I understand topic X but struggle with Y and Z…"></textarea>
          </div>
          <button id="gen-plan-btn" class="btn-primary">Create My Study Plan</button>
        </div>
      </div>`;
  }

  async _generatePlan() {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }

    const dateVal = $("plan-date")?.value;
    const hours   = $("plan-hours")?.value ?? "2";
    const focus   = $("plan-focus")?.value.trim() ?? "";

    const today  = new Date();
    const target = dateVal ? new Date(dateVal) : null;
    const days   = target ? Math.ceil((target - today) / 86400000) : null;

    const panel = $("panel-plan");
    panel.innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">📅</div>
        <h3>Building your personalised study plan…</h3>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;

    const docCtx = this.store.getOverview(10000);
    const userMsg = `Create a detailed, practical study plan.

Details:
- ${days ? `Days until exam: ${days} (target: ${dateVal})` : "No specific deadline — general ongoing plan"}
- Daily study time: ${hours} hour(s)
${focus ? `- Student notes: ${focus}` : ""}

Study materials:
${docCtx}

Build a complete plan with spaced repetition, active recall techniques, daily tasks with checkboxes, and review sessions. Use markdown tables and headers.`;

    try {
      const wrapper = document.createElement("div");
      wrapper.className = "panel-inner plan-output";
      wrapper.innerHTML = `<div id="plan-md"></div>
        <div class="plan-actions">
          <button id="reset-plan-btn" class="btn-secondary">Create New Plan</button>
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
    }
  }

  // ── Topics ────────────────────────────────────────────────────────────────────

  _renderTopicsEmpty() {
    $("panel-topics").innerHTML = `
      <div class="panel-inner center-content">
        <div style="font-size:3rem">📊</div>
        <h3>${this.store.hasContent ? "Analysing materials…" : "No Materials Yet"}</h3>
        <p class="muted">${this.store.hasContent
          ? "Claude is extracting your topic map. This takes about 10–20 seconds."
          : "Upload study materials to see a topic breakdown."}</p>
      </div>`;
  }

  async _extractTopics() {
    if (!this.store.hasContent) return;
    if (this._topicsLoading) return;   // own flag — never blocked by chat/plan

    this._topicsLoading = true;
    this._renderTopicsEmpty();

    const docCtx = this.store.getOverview(10000);
    const userMsg = `Analyse these study materials and extract a complete topic map.

Materials:
${docCtx}

Be exhaustive — extract every significant topic and subtopic. Return only JSON.`;

    try {
      const raw    = await generate({ messages: [{ role: "user", content: userMsg }], mode: "topics" });
      const parsed = parseJSON(raw);
      this.topicsData = parsed.topics ?? (Array.isArray(parsed) ? parsed : null);
      if (!this.topicsData?.length) throw new Error("No topics extracted — try uploading more content.");
      this._renderTopics();
    } catch (err) {
      this.topicsData = null;  // allow retry on next tab visit
      $("panel-topics").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:2.5rem">⚠️</div>
          <h3>Could not extract topics</h3>
          <p class="muted">${err.message}</p>
          <button id="retry-topics-btn" class="btn-secondary">Retry</button>
        </div>`;
      $("retry-topics-btn")?.addEventListener("click", () => {
        this._topicsLoading = false;
        this._extractTopics();
      });
    }

    this._topicsLoading = false;
  }

  _renderTopics() {
    const impColor = { high: "var(--clr-error)", medium: "var(--clr-warning)", low: "var(--clr-success)" };

    const cards = this.topicsData.map((t, i) => {
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
          ${t.summary ? `<p class="topic-summary">${t.summary}</p>` : ""}
          ${prereqs}
          ${subtopics ? `<div class="subtopics">${subtopics}</div>` : ""}
        </div>`;
    }).join("");

    $("panel-topics").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>📊 Topic Map</h2>
          <p>${this.topicsData.length} topics found. Tick subtopics as you master them.</p>
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
      const key = "recal-cb-" + cb.id;
      cb.checked = localStorage.getItem(key) === "1";
      cb.addEventListener("change", () => localStorage.setItem(key, cb.checked ? "1" : "0"));
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  _toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className  = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3000);
  }
}

const app = new RecalApp();
window.app = app;
