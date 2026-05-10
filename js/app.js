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


// ─── App ──────────────────────────────────────────────────────────────────────

class RecalApp {
  constructor() {
    this.store          = new DocumentStore();
    this.history        = [];
    this.mode           = "home";
    this.generating     = false;
    this._topicsLoading = false;
    this.topicsData     = null;
    this.testState      = null;
    this.masteryScores  = {};
    this.confidenceData = {};
    this.customTopics   = [];
    this.currentDocId      = null;
    this._notesKey         = null;
    this._chatScrollLocked = false;
    this._planHasContent   = false;
    this._masteryHasContent = false;

    this._initUser();
    this._bindTheme();
    this._bindSidebarMobile();
    this._bindSidebarResize();
    this._bindSidebar();
    this._bindNotes();
    this._bindChat();
    this._bindNewChat();
    this._bindModes();
    this._bindTest();
    this._bindPlan();
    this._renderHome();

    document.querySelector(".brand-sm")
      ?.addEventListener("click", () => this._switchMode("home"));
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
    try { const s = localStorage.getItem(`cb-mastery-${id}`);      if (s) this.masteryScores  = JSON.parse(s); } catch {}
    try { const s = localStorage.getItem(`cb-confidence-${id}`);   if (s) this.confidenceData = JSON.parse(s); } catch {}
    try { const s = localStorage.getItem(`cb-custom-topics-${id}`);if (s) this.customTopics   = JSON.parse(s); } catch {}
  }

  _saveMastery() {
    localStorage.setItem(`cb-mastery-${this.userId}`, JSON.stringify(this.masteryScores));
  }

  _saveConfidence() {
    localStorage.setItem(`cb-confidence-${this.userId}`,    JSON.stringify(this.confidenceData));
    localStorage.setItem(`cb-custom-topics-${this.userId}`, JSON.stringify(this.customTopics));
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
    this._chatScrollLocked = false;
    this._setGenerating(false);
    $("chat-messages").innerHTML = "";
    $("chat-input").value = "";
    $("chat-input").style.height = "auto";
    this._switchMode("home");
  }

  async _newDocumentChat(docId) {
    const doc = this.store.docs.find(d => d.id === docId);
    if (!doc) return;

    this.history = [];
    this._chatScrollLocked = false;
    this._setGenerating(false);
    $("chat-messages").innerHTML = "";
    $("chat-input").value = "";
    $("chat-input").style.height = "auto";

    this.currentDocId = docId;
    this._setNotesDoc(doc);

    const aiEl = this._appendMsg("ai", "", true);
    const box  = aiEl.querySelector(".msg-content");
    this._setGenerating(true);

    const excerpt = doc.text.split(/\s+/).slice(0, 1500).join(" ");
    const prompt  = `You are Recal, an adaptive learning assistant. A student just uploaded a document. Write a concise welcome message in markdown.

Document filename: ${doc.name}
Content excerpt:
${excerpt}

Your message must:
1. In 2-3 sentences, summarise what this document is about based on its actual content.
2. Give one specific, concrete suggestion for each tool (reference actual topics/content):
   - 💬 Chat
   - 🎯 Test
   - 📅 Study Plan
   - 📊 Mastery
3. End with a short invitation to get started.

Be specific to this content — no generic filler. Keep the whole message under 180 words.`;

    let full = "";
    try {
      await streamChat(
        { messages: [{ role: "user", content: prompt }], mode: "chat", temperature: 0.6 },
        delta => {
          full += delta;
          box.innerHTML = md(full);
          if (!this._chatScrollLocked) scrollEnd($("chat-messages"));
        }
      );
      this.history.push({ role: "assistant", content: full });
    } catch {
      box.innerHTML = md(`**${doc.name} is ready.**\n\nAsk me anything about this document, or use the tabs above to generate a test, build a study plan, or track your mastery.`);
    }

    aiEl.querySelector(".msg-spinner")?.remove();
    this._setGenerating(false);
    $("chat-input").focus();
  }

  // ── Notes pane ────────────────────────────────────────────────────────────────

  _bindNotes() {
    const ta     = $("viewer-notes-ta");
    const handle = $("notes-drag");
    const panel  = $("viewer-notes-panel");
    if (!ta || !handle || !panel) return;

    // Restore saved width
    const savedW = parseInt(localStorage.getItem("recal-notes-width") ?? "260", 10);
    panel.style.flex = `0 0 ${savedW}px`;

    // Auto-save textarea to current doc key
    ta.addEventListener("input", () => {
      if (this._notesKey) localStorage.setItem(this._notesKey, ta.value);
    });

    // Drag-to-resize
    let startX, startW;
    const onMove = e => {
      const newW = Math.max(140, Math.min(600, startW + (startX - e.clientX)));
      panel.style.flex = `0 0 ${newW}px`;
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      localStorage.setItem("recal-notes-width", panel.offsetWidth);
    };
    handle.addEventListener("mousedown", e => {
      startX = e.clientX;
      startW = panel.offsetWidth;
      handle.classList.add("dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  _bindSidebarResize() {
    const handle  = $("sidebar-drag");
    const sidebar = $("sidebar");
    if (!handle || !sidebar) return;

    const savedW = parseInt(localStorage.getItem("recal-sidebar-width") ?? "260", 10);
    document.documentElement.style.setProperty("--sidebar-w", savedW + "px");

    let startX, startW;
    const onMove = e => {
      if (sidebar.classList.contains("collapsed")) return;
      const newW = Math.max(160, Math.min(500, startW + (e.clientX - startX)));
      document.documentElement.style.setProperty("--sidebar-w", newW + "px");
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      localStorage.setItem("recal-sidebar-width", sidebar.offsetWidth);
    };
    handle.addEventListener("mousedown", e => {
      if (sidebar.classList.contains("collapsed")) return;
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      handle.classList.add("dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  _setNotesDoc(doc) {
    const ta = $("viewer-notes-ta");
    if (!ta) return;
    if (doc) {
      this._notesKey = `recal-notes-${doc.name}:${doc.size}`;
      ta.value = localStorage.getItem(this._notesKey) ?? "";
    } else {
      this._notesKey = null;
      ta.value = "";
    }
    ta.placeholder = doc ? `Notes for ${doc.name}…` : "Write your notes here…";
  }

  // ── Mobile sidebar ────────────────────────────────────────────────────────────

  _bindSidebarMobile() {
    const sidebar  = document.getElementById("sidebar");
    const overlay  = document.getElementById("sidebar-overlay");
    const openBtn  = $("sidebar-toggle");
    const closeBtn = $("sidebar-close");

    const isMobile = () => window.innerWidth <= 700;

    const open = () => {
      if (isMobile()) { sidebar.classList.add("open"); overlay.hidden = false; }
      else            { sidebar.classList.remove("collapsed"); localStorage.setItem("recal-sidebar", "open"); }
    };
    const close = () => {
      if (isMobile()) { sidebar.classList.remove("open"); overlay.hidden = true; }
      else            { sidebar.classList.add("collapsed"); localStorage.setItem("recal-sidebar", "collapsed"); }
    };
    const toggle = () => {
      if (isMobile()) sidebar.classList.contains("open") ? close() : open();
      else            sidebar.classList.contains("collapsed") ? open() : close();
    };

    openBtn?.addEventListener("click", toggle);
    closeBtn?.addEventListener("click", close);
    overlay?.addEventListener("click", close);

    document.querySelectorAll(".mode-btn").forEach(btn =>
      btn.addEventListener("click", () => { if (isMobile()) close(); })
    );
    document.querySelectorAll(".qa-btn").forEach(btn =>
      btn.addEventListener("click", () => { if (isMobile()) close(); })
    );

    // Start collapsed on desktop (unless user previously opened it)
    if (!isMobile() && localStorage.getItem("recal-sidebar") !== "open") {
      sidebar.classList.add("collapsed");
    }
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
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      this._toast(`Only PDF files are supported.`, "error"); return;
    }
    const item = this._addDocItem(file.name);
    try {
      const id = await this.store.addFile(file);
      this._finaliseDocItem(item, id, file.name, file.size);
      this._enrichDoc(id, item);
      this._toast(`Added: ${file.name}`, "success");
      this.topicsData         = null;
      this.testState          = null;
      this._planHasContent    = false;
      this._masteryHasContent = false;
      this._renderHome();
      this._switchMode("chat");
      this._newDocumentChat(id);
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
    item.dataset.state  = "ready";
    item.dataset.docid  = id;
    item.querySelector(".doc-status").textContent = fmtSize(size);
    const btn = item.querySelector(".doc-remove");
    btn.classList.remove("hidden");
    btn.addEventListener("click", e => { e.stopPropagation(); this._removeDoc(id, item); });
    item.classList.add("doc-item-clickable");
    item.addEventListener("click", () => {
      this.currentDocId = id;
      const doc = this.store.docs.find(d => d.id === id);
      if (doc) this._setNotesDoc(doc);
      this._switchMode("chat");
    });
  }

  _removeDoc(id, sidebarItem) {
    this.store.removeDoc(id);
    sidebarItem?.remove();
    if (!this.store.hasContent) {
      $("doc-list").innerHTML = `
        <div class="empty-docs">
          <span>📚</span><p>No materials yet</p>
          <p>Upload PDFs, text files, or notes</p>
        </div>`;
    }
    this.topicsData         = null;
    this.testState          = null;
    this._planHasContent    = false;
    this._masteryHasContent = false;
    if (this.currentDocId === id) { this.currentDocId = null; this._setNotesDoc(null); }
    if (!this.store.hasContent && this.mode !== "home") this._switchMode("home");
    else if (this.mode === "mastery") this._renderMasteryEmpty();
    this._renderHome();
  }

  async _enrichDoc(id, sidebarItem) {
    const doc = this.store.docs.find(d => d.id === id);
    if (!doc) return;

    const cacheKey = `recal-enrich-${doc.name}:${doc.size}`;
    const cached   = localStorage.getItem(cacheKey);
    if (cached) {
      try { doc.enrich = JSON.parse(cached); } catch {}
      return;
    }

    const excerpt = doc.text.split(/\s+/).slice(0, 2500).join(" ");
    try {
      const raw    = await generate({
        messages: [{ role: "user", content: `Document content:\n\n${excerpt}` }],
        mode: "enrich",
        temperature: 0.3,
      });
      const parsed = parseJSON(raw);
      if (parsed?.title && parsed?.summary) {
        doc.enrich = parsed;
        localStorage.setItem(cacheKey, JSON.stringify(parsed));
      }
    } catch {}

    const statusEl = sidebarItem?.querySelector(".doc-status");
    if (statusEl && statusEl.textContent === "Preparing…") statusEl.textContent = fmtSize(doc.size);
  }

  _renderHome() {
    const panel = $("panel-home");
    if (!panel) return;

    const hasDocs    = this.store.hasContent;
    const docs       = this.store.docs;
    const fmtW       = n => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
    const totalWords = docs.reduce((s, d) => s + (d.words ?? 0), 0);

    if (!hasDocs) {
      panel.innerHTML = `
        <div class="home-wrap">
          <div class="home-inner">
            <div class="home-hero">
              <div class="home-hero-logo">✦</div>
              <h1 class="home-hero-title">Your AI study<br>companion</h1>
              <p class="home-hero-sub">Upload study materials and let AI help you learn, test, and master them.</p>
            </div>
            <div class="home-upload-zone" id="home-drop-zone">
              <div class="home-upload-icon">📂</div>
              <p class="home-upload-label">Drop files here or <button class="upload-link" id="home-browse">browse</button></p>
              <p class="home-upload-hint">PDF files only</p>
            </div>
          </div>
        </div>`;

      const zone = $("home-drop-zone");
      if (zone) {
        zone.addEventListener("click",     () => $("file-input").click());
        zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
        zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
        zone.addEventListener("drop", async e => {
          e.preventDefault();
          zone.classList.remove("drag-over");
          for (const f of [...e.dataTransfer.files]) await this._addDocument(f);
        });
      }
      $("home-browse")?.addEventListener("click", e => { e.stopPropagation(); $("file-input").click(); });
      return;
    }

    const cards = docs.map(d => `
      <div class="nb-source-card" data-id="${d.id}">
        <div class="nb-source-icon">📄</div>
        <div class="nb-source-name">${d.name}</div>
        <div class="nb-source-meta">${fmtSize(d.size)}${d.words ? ` · ~${fmtW(d.words)}w` : ""}</div>
        <button class="nb-source-remove" data-id="${d.id}" title="Remove">✕</button>
      </div>`).join("");

    panel.innerHTML = `
      <div class="home-wrap">
        <div class="home-inner home-inner--wide">
          <div class="nb-sources-head">
            <span class="nb-sources-title">Sources</span>
            <button id="home-add-btn" class="btn-sm">+ Add</button>
          </div>
          <div class="nb-source-grid">${cards}</div>
          <p class="nb-doc-stat">${docs.length} source${docs.length !== 1 ? "s" : ""} · ~${fmtW(totalWords)} words</p>
          <div class="home-start-grid">
            <button class="home-start-btn primary" data-mode="chat">
              💬 Chat
              <span>Ask questions and get concept explanations</span>
            </button>
            <button class="home-start-btn" data-mode="test">
              🎯 Practice test
              <span>Adaptive questions from your materials</span>
            </button>
            <button class="home-start-btn" data-mode="mastery">
              📊 Mastery
              <span>See what you know and what needs work</span>
            </button>
            <button class="home-start-btn" data-mode="plan">
              📅 Study plan
              <span>Personalised schedule with spaced repetition</span>
            </button>
          </div>
        </div>
      </div>`;

    $("home-add-btn")?.addEventListener("click", () => $("file-input").click());

    panel.querySelectorAll(".nb-source-card").forEach(card =>
      card.addEventListener("click", e => {
        if (e.target.closest(".nb-source-remove")) return;
        const id  = parseInt(card.dataset.id);
        const doc = this.store.docs.find(d => d.id === id);
        if (doc) { this.currentDocId = id; this._setNotesDoc(doc); }
        this._switchMode("chat");
      })
    );

    panel.querySelectorAll(".nb-source-remove").forEach(btn =>
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id          = parseInt(btn.dataset.id);
        const sidebarItem = $("doc-list").querySelector(`[data-docid="${id}"]`);
        this._removeDoc(id, sidebarItem);
      })
    );

    panel.querySelectorAll(".home-start-btn[data-mode]").forEach(btn =>
      btn.addEventListener("click", () => this._switchMode(btn.dataset.mode))
    );
  }

  // ── Document Viewer ───────────────────────────────────────────────────────────

  _openViewer(docId) {
    const doc = this.store.docs.find(d => d.id === docId);
    if (!doc) return;
    this.currentDocId = docId;
    this._setNotesDoc(doc);
    this._switchMode("viewer");
  }

  _renderViewer(doc) {
    const pdfDoc = this.store.getPDFDoc(doc.id);

    const enrichHtml = doc.enrich
      ? `<div class="viewer-enrich">
           <h1 class="viewer-enrich-title">${doc.enrich.title}</h1>
           <div class="viewer-enrich-summary">
             <span class="viewer-enrich-label">Overview</span>
             <p>${doc.enrich.summary}</p>
           </div>
         </div>`
      : `<div class="viewer-enrich viewer-enrich-loading">
           <div class="viewer-enrich-preparing">✦ Preparing document overview…</div>
         </div>`;

    $("panel-viewer").innerHTML = `
      <div class="viewer-layout">
        <div class="viewer-doc">
          <div class="viewer-doc-header">
            <span>📄</span>
            <span class="viewer-doc-name">${doc.name}</span>
          </div>
          <div class="viewer-doc-canvas">
            <div class="viewer-page">
              ${enrichHtml}
              <div class="pdf-notice">
                <span class="pdf-notice-icon">ℹ</span>
                <span>Images, diagrams, mathematical formulas, and complex multi-column layouts cannot be fully replicated — they appear as linearised text below.</span>
              </div>
              <div id="vp-pdf-content"><p class="pdf-loading">Loading pages…</p></div>
            </div>
          </div>
        </div>
      </div>`;

    if (pdfDoc) this._renderStructuredPDF(doc.id, pdfDoc);
  }

  async _renderStructuredPDF(docId, pdfDoc) {
    const container = $("vp-pdf-content");
    if (!container) return;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      if (this.currentDocId !== docId || !container.isConnected) break;

      const page     = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const { items: raw } = await page.getTextContent();

      // Normalise raw items
      let items = raw
        .filter(it => typeof it.str === "string" && it.str.trim())
        .map(it => ({
          str:      it.str,
          x:        it.transform[4],
          y:        it.transform[5],
          fontSize: Math.abs(it.transform[3]),
          width:    it.width || 0,
          fontName: it.fontName || "",
        }));
      if (!items.length) continue;

      // 1. Deduplicate — same text within a 3 pt grid cell (handles shadow/outline fonts
      //    that store the same glyph multiple times at slightly offset positions)
      const seen = new Set();
      items = items.filter(it => {
        const key = `${Math.round(it.x / 3)}|${Math.round(it.y / 3)}|${it.str}`;
        return seen.has(key) ? false : (seen.add(key), true);
      });

      // 2. Median font size = body text reference for this page
      const sizes    = items.map(it => it.fontSize).filter(s => s > 1).sort((a,b) => a - b);
      const bodySize = sizes[Math.floor(sizes.length / 2)] || 12;

      // 3. Column detection — find largest x-gap in the middle 40 % of page width
      const pageWidth = viewport.width;
      const xSorted   = items.map(it => it.x).sort((a,b) => a - b);
      let splitX = null, maxGap = 0;
      const lb = pageWidth * 0.3, rb = pageWidth * 0.7;
      for (let i = 1; i < xSorted.length; i++) {
        const mid = (xSorted[i] + xSorted[i - 1]) / 2;
        const gap = xSorted[i] - xSorted[i - 1];
        if (mid >= lb && mid <= rb && gap > maxGap) { maxGap = gap; splitX = mid; }
      }
      // Require a substantial gap and content on both sides
      if (maxGap < 25 ||
          items.filter(it => it.x <  splitX).length < 5 ||
          items.filter(it => it.x >= splitX).length < 5) {
        splitX = null;
      }

      // 4. Partition into segments (one per column) and render each independently
      const segments = splitX
        ? [items.filter(it => it.x < splitX), items.filter(it => it.x >= splitX)]
        : [items];

      const pageHtml = segments.map(seg => this._pdfSegmentToHtml(seg, bodySize)).join("");

      if (this.currentDocId !== docId || !container.isConnected) break;

      const divider = document.createElement("div");
      divider.className = "viewer-page-divider" + (pageNum === 1 ? " viewer-page-divider--first" : "");
      divider.textContent = `Page ${pageNum}`;
      container.appendChild(divider);

      const pageEl = document.createElement("div");
      pageEl.className = "pdf-text-page";
      pageEl.innerHTML = pageHtml;
      container.appendChild(pageEl);

      container.querySelector(".pdf-loading")?.remove();
    }
  }

  _pdfSegmentToHtml(items, bodySize) {
    const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if (!items.length) return "";

    // Group into lines by y (3 pt rounding)
    const byY = new Map();
    for (const item of items) {
      const y = Math.round(item.y / 3) * 3;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(item);
    }

    // Sort lines top-to-bottom; items within each line left-to-right
    const lines = [...byY.entries()]
      .sort(([ya],[yb]) => yb - ya)
      .map(([y, its]) => ({
        y,
        items:       its.sort((a,b) => a.x - b.x),
        maxFontSize: Math.max(...its.map(i => i.fontSize)),
      }));

    // 40th-percentile inter-line gap = typical single-line spacing
    const gaps = lines.slice(1).map((l,i) => lines[i].y - l.y).filter(g => g > 0).sort((a,b) => a - b);
    const typicalGap = gaps[Math.floor(gaps.length * 0.4)] || 14;

    const html    = [];
    let paraLines = [];
    let lastY     = null;

    const flushPara = () => {
      if (!paraLines.length) return;
      const maxSize = Math.max(...paraLines.map(l => l.maxFontSize));
      const content = paraLines.map(l => this._joinPDFLine(l.items, esc)).join(" ").trim();
      if (!content) { paraLines = []; return; }
      if      (maxSize > bodySize * 1.9) html.push(`<h2 class="pdf-h2">${content}</h2>`);
      else if (maxSize > bodySize * 1.4) html.push(`<h3 class="pdf-h3">${content}</h3>`);
      else if (maxSize > bodySize * 1.2) html.push(`<h4 class="pdf-h4">${content}</h4>`);
      else                               html.push(`<p>${content}</p>`);
      paraLines = [];
    };

    for (const line of lines) {
      const gap = lastY !== null ? lastY - line.y : 0;
      const isNewBlock = paraLines.length && (
        gap > typicalGap * 1.6 ||
        (line.maxFontSize > bodySize * 1.2 && (paraLines.at(-1)?.maxFontSize ?? 0) <= bodySize * 1.05)
      );
      if (isNewBlock) flushPara();
      paraLines.push(line);
      lastY = line.y;
    }
    flushPara();

    return html.join("");
  }

  _joinPDFLine(items, esc) {
    // Join text items within a line using item.width to decide spacing.
    // If the gap to the next item is < 15 % of the font size (letter-spacing / tight
    // kerning), no space is inserted — this fixes spaced-letter rendering like
    // "m o r t a l i t y" that comes from PDFs with per-glyph transforms.
    let out = "";
    for (let i = 0; i < items.length; i++) {
      const cur    = items[i];
      const text   = esc(cur.str);
      const bold   = /bold|heavy|black/i.test(cur.fontName);
      const italic = /italic|oblique/i.test(cur.fontName);
      const styled = bold && italic ? `<strong><em>${text}</em></strong>`
                   : bold           ? `<strong>${text}</strong>`
                   : italic         ? `<em>${text}</em>`
                   : text;

      if (i === 0) { out += styled; continue; }

      const prev      = items[i - 1];
      const prevRight = prev.x + (prev.width > 0 ? prev.width : prev.str.length * prev.fontSize * 0.5);
      const gap       = cur.x - prevRight;

      out += (gap < cur.fontSize * 0.15 ? "" : " ") + styled;
    }
    return out;
  }

  _cleanText(raw) {
    return raw
      .replace(/(\w)-\n(\w)/g, "$1$2")              // rejoin PDF soft-hyphen breaks
      .replace(/([^.!?:;\n])\n([a-z("])/g, "$1 $2") // join continuation lines
      .replace(/\n{3,}/g, "\n\n")                    // collapse excess blank lines
      .split("\n").map(l => l.trimEnd()).join("\n")
      .trim();
  }

  _renderTextContent(raw) {
    const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const text = this._cleanText(raw);
    return text.split(/\n{2,}/).map(block => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      const lines = trimmed.split("\n");

      // Detect list blocks: every non-empty line starts with a bullet or number
      const listPat = /^\s*([-•*]|\d+[.)]) /;
      if (lines.length > 1 && lines.filter(l => l.trim()).every(l => listPat.test(l))) {
        const items = lines.filter(l => l.trim())
          .map(l => `<li>${esc(l.replace(/^\s*([-•*]|\d+[.)]+)\s*/, "").trim())}</li>`)
          .join("");
        return `<ul class="viewer-list">${items}</ul>`;
      }

      // Detect headings: single short line, no trailing sentence punctuation
      if (lines.length === 1 && trimmed.length > 3 && trimmed.length < 90 && !/[.?!;,]$/.test(trimmed)) {
        const words = trimmed.split(/\s+/).length;
        const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]{2}/.test(trimmed);
        if (isAllCaps && words <= 12) return `<h2 class="viewer-h2">${esc(trimmed)}</h2>`;
        if (/^[A-Z0-9]/.test(trimmed) && words <= 8) return `<h3 class="viewer-h3">${esc(trimmed)}</h3>`;
      }

      return `<p>${esc(lines.join(" "))}</p>`;
    }).filter(Boolean).join("");
  }

  _renderPDFPages(text) {
    const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const parts = text.split(/\[Page\s+\d+\]/);
    const nums  = [...text.matchAll(/\[Page\s+(\d+)\]/g)].map(m => m[1]);
    return parts.map((chunk, i) => {
      if (!chunk.trim()) return "";
      const cleaned = this._cleanText(chunk);
      const paras = cleaned.split(/\n{2,}/).filter(l => l.trim())
        .map(p => `<p>${esc(p.replace(/\n/g, " "))}</p>`).join("");
      const divider = nums[i] ? `<div class="viewer-page-divider">Page ${nums[i]}</div>` : "";
      return divider + paras;
    }).join("");
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
    if (mode === "home")    this._renderHome();
    if (mode === "viewer")  { const doc = this.store.docs.find(d => d.id === this.currentDocId); if (doc) this._renderViewer(doc); }
    if (mode === "test"    && !this.testState)           this._initTestPanel();
    if (mode === "mastery" && !this._masteryHasContent)  this._initMasteryPanel();
    if (mode === "plan"    && !this._planHasContent)     this._renderPlanSetup();
  }

  _initTestPanel() {
    if (!this.store.hasContent) {
      $("panel-test").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:2.5rem">🎯</div>
          <h3>No Materials Yet</h3>
          <p class="muted">Upload study materials to generate a practice test.</p>
        </div>`;
      return;
    }
    if (this.topicsData) { this._renderTestSetup(); return; }
    $("panel-test").innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">🎯</div>
        <h3>Extracting topics…</h3>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;
    this._extractMastery().then(() => { if (this.mode === "test") this._renderTestSetup(); });
  }

  _initMasteryPanel() {
    if (!this.store.hasContent) {
      $("panel-mastery").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:3rem">📊</div>
          <h3>No Materials Yet</h3>
          <p class="muted">Upload study materials to start tracking mastery.</p>
        </div>`;
      return;
    }
    if (this.topicsData) { this._renderMastery(); return; }
    $("panel-mastery").innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">📊</div>
        <h3>Extracting topics…</h3>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;
    this._extractMastery().then(() => { if (this.mode === "mastery" && this.topicsData) this._renderMastery(); });
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────

  _bindChat() {
    const input = $("chat-input");
    const btn   = $("send-btn");
    const msgs  = $("chat-messages");
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this._sendMessage(); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 160) + "px";
      btn.disabled = !input.value.trim() || this.generating;
    });
    btn.addEventListener("click", () => this._sendMessage());

    // Lock auto-scroll when user scrolls up; unlock when they return to bottom
    msgs?.addEventListener("scroll", () => {
      const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
      this._chatScrollLocked = !atBottom;
    });
  }

  async _sendMessage() {
    const input = $("chat-input");
    const text  = input.value.trim();
    if (!text || this.generating) return;

    this._chatScrollLocked = false;   // always follow new outgoing message
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
        if (!this._chatScrollLocked) scrollEnd($("chat-messages"));
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
    if (role === "user" || !this._chatScrollLocked) scrollEnd(container);
    return div;
  }

  // ── Practice Test ─────────────────────────────────────────────────────────────

  _bindTest() {
    $("panel-test").addEventListener("click", e => {
      if (e.target.id === "gen-test-btn")     this._generateTest();
      if (e.target.id === "restart-test-btn") { this.testState = null; this._renderTestSetup(); }
      if (e.target.id === "next-q-btn")       this._nextQuestion();
      if (e.target.id === "submit-short-btn") this._submitShortAnswer();
      if (e.target.id === "explain-test-btn") this._explainTestResults();
      if (e.target.classList.contains("mcq-opt")) this._selectMCQ(e.target);
    });
  }

  _renderTestSetup() {
    this.testState = null;
    const topics = this.topicsData ?? [];
    const topicOpts = topics.length
      ? [`<option value="">All topics</option>`,
         ...topics.map(t => `<option value="${t.name}">${t.name}</option>`),
         `<option value="__other__">Other (type manually)</option>`].join("")
      : `<option value="">All topics</option><option value="__other__">Other (type manually)</option>`;

    $("panel-test").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>🎯 Adaptive Practice Test</h2>
          <p>Select a topic and let Claude generate questions tailored to your materials.</p>
        </div>
        <div class="form-card">
          <div class="form-row">
            <div class="form-group">
              <label>Topic</label>
              <select id="test-topic-select">${topicOpts}</select>
            </div>
          </div>
          <div class="form-group hidden" id="test-topic-custom-wrap">
            <label>Custom topic</label>
            <input id="test-topic-custom" type="text" placeholder="e.g. Chapter 3, Photosynthesis…">
          </div>
          <div class="form-row three-col">
            <div class="form-group">
              <label>Questions</label>
              <select id="test-count">
                <option value="5">5 questions</option>
                <option value="8">8 questions</option>
                <option value="10" selected>10 questions</option>
              </select>
            </div>
            <div class="form-group">
              <label>Difficulty</label>
              <select id="test-diff">
                <option value="mixed" selected>Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div class="form-group">
              <label>Question type</label>
              <select id="test-types">
                <option value="mixed" selected>Both types</option>
                <option value="mcq">Multiple choice</option>
                <option value="short">Short answer</option>
              </select>
            </div>
          </div>
          <button id="gen-test-btn" class="btn-primary">Generate Test</button>
        </div>
      </div>`;

    $("test-topic-select")?.addEventListener("change", e =>
      $("test-topic-custom-wrap")?.classList.toggle("hidden", e.target.value !== "__other__")
    );
  }

  async _generateTest() {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }

    const selVal = $("test-topic-select")?.value ?? "";
    const topic  = selVal === "__other__"
      ? ($("test-topic-custom")?.value.trim() ?? "")
      : selVal;
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

    const wrongCount = questions.filter((_, i) => {
      const a = answers[i] ?? {};
      return a.type === "mcq" ? !a.isRight : (a.selfScore ?? 0) < 1;
    }).length;

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
        ${wrongCount > 0 ? `
        <div class="explain-prompt" id="explain-prompt">
          <div class="explain-prompt-text">
            <span class="explain-icon">💡</span>
            <div>
              <strong>Want to understand what went wrong?</strong>
              <p>${wrongCount} question${wrongCount !== 1 ? "s" : ""} missed — get detailed explanations and the concepts you need to solidify.</p>
            </div>
          </div>
          <button id="explain-test-btn" class="btn-primary">Explain Questions &amp; Answers</button>
        </div>
        <div id="test-explanation" class="test-explanation hidden"></div>` : ""}
        <div class="results-actions">
          <button id="restart-test-btn" class="btn-secondary">Take Another Test</button>
        </div>
      </div>`;
  }

  async _explainTestResults() {
    const { questions, answers } = this.testState;
    const wrong = questions.filter((_, i) => {
      const a = answers[i] ?? {};
      return a.type === "mcq" ? !a.isRight : (a.selfScore ?? 0) < 1;
    });
    if (!wrong.length) return;

    const btn = $("explain-test-btn");
    const box = $("test-explanation");
    if (!btn || !box) return;

    btn.disabled = true;
    btn.textContent = "Generating explanations…";
    box.classList.remove("hidden");
    box.innerHTML = `<div class="explain-generating"><div class="generating-anim" style="font-size:1.5rem">💡</div><p>Analysing your answers…</p></div>`;

    const lines = wrong.map((q, n) => {
      const idx = questions.indexOf(q);
      const a   = answers[idx] ?? {};
      if (q.type === "mcq") {
        return `Q${n+1}: ${q.question}\nYour answer: ${a.chosen} | Correct: ${q.correct}\nExplanation hint: ${q.full_explanation ?? q.brief_explanation ?? ""}`;
      } else {
        return `Q${n+1}: ${q.question}\nYour answer: ${a.given ?? "(none)"}\nModel answer: ${q.model_answer ?? ""}\nKey points: ${(q.key_points ?? []).join(", ")}`;
      }
    }).join("\n\n");

    const prompt = `A student just completed a practice test and got these questions wrong:\n\n${lines}\n\nFor each question:\n1. Clearly explain WHY the correct answer is right\n2. Identify the core concept being tested\n3. Give a memorable tip or analogy to remember it\n\nBe concise, educational, and encouraging. Use markdown headers for each question.`;

    this._setGenerating(true);
    let full = "";
    try {
      await streamChat(
        { messages: [{ role: "user", content: prompt }], mode: "chat" },
        delta => {
          full += delta;
          box.innerHTML = `<div class="explain-output">${md(full)}</div>`;
        }
      );
      $("explain-prompt")?.classList.add("hidden");
    } catch (err) {
      box.innerHTML = `<p class="err-msg">⚠️ ${err.message}</p>`;
    } finally {
      this._setGenerating(false);
      btn.disabled = false;
    }
  }

  // ── Study Plan ────────────────────────────────────────────────────────────────

  _bindPlan() {
    $("panel-plan").addEventListener("click", e => {
      if (e.target.id === "gen-plan-btn")       this._generatePlan();
      if (e.target.id === "reset-plan-btn")     this._renderPlanSetup();
      if (e.target.id === "check-all-topics")   document.querySelectorAll(".topic-check-item input").forEach(cb => cb.checked = true);
      if (e.target.id === "uncheck-all-topics") document.querySelectorAll(".topic-check-item input").forEach(cb => cb.checked = false);
    });
  }

  _renderPlanSetup() {
    this._planHasContent = false;
    if (!this.store.hasContent) {
      $("panel-plan").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:3rem">📅</div>
          <h3>No Materials Yet</h3>
          <p class="muted">Upload study materials to build a study plan.</p>
        </div>`;
      return;
    }

    const today   = new Date().toISOString().split("T")[0];
    const topics  = [...(this.topicsData ?? []).map(t => t.name), ...this.customTopics];
    const topicsSection = topics.length ? `
      <div class="form-group">
        <div class="checklist-header">
          <label>Topics to cover</label>
          <div class="checklist-controls">
            <button type="button" class="btn-link" id="check-all-topics">All</button>
            <span class="txt-3">·</span>
            <button type="button" class="btn-link" id="uncheck-all-topics">None</button>
          </div>
        </div>
        <div class="topic-checklist">
          ${topics.map(n => `
            <label class="topic-check-item">
              <input type="checkbox" value="${n}" checked>
              <span>${n}</span>
            </label>`).join("")}
        </div>
      </div>` : "";

    $("panel-plan").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>📅 Study Plan</h2>
          <p>Set your goal date, select topics, add context — Claude generates your personalised plan.</p>
        </div>
        <div class="form-card">
          <div class="form-row">
            <div class="form-group">
              <label>Target completion date</label>
              <input id="plan-date" type="date" min="${today}">
            </div>
            <div class="form-group">
              <label>Daily study time</label>
              <select id="plan-hours">
                <option value="1">1 hour / day</option>
                <option value="2" selected>2 hours / day</option>
                <option value="3">3 hours / day</option>
                <option value="4">4+ hours / day</option>
              </select>
            </div>
          </div>
          ${topicsSection}
          <div class="form-group">
            <label>Additional context <span class="form-hint">— optional</span></label>
            <textarea id="plan-focus" rows="3"
              placeholder="e.g. I study best in the morning · weakest on Topic X · exams on Mon / Wed…"></textarea>
          </div>
          <button id="gen-plan-btn" class="btn-primary">Generate Study Plan</button>
        </div>
      </div>`;
  }

  async _generatePlan() {
    if (!this.store.hasContent) { this._toast("Upload study materials first.", "info"); return; }
    this._planHasContent = true;
    this._setGenerating(true);

    const dateVal = $("plan-date")?.value;
    const hours   = $("plan-hours")?.value ?? "2";
    const focus   = $("plan-focus")?.value.trim() ?? "";
    const today   = new Date();
    const target  = dateVal ? new Date(dateVal) : null;
    const days    = target ? Math.ceil((target - today) / 86400000) : null;

    // Read selected topics from checklist (if available)
    const checked = [...document.querySelectorAll(".topic-check-item input:checked")];
    const selectedTopics = checked.length
      ? checked.map(cb => cb.value)
      : [...(this.topicsData ?? []).map(t => t.name), ...this.customTopics];

    const panel = $("panel-plan");
    panel.innerHTML = `
      <div class="panel-inner center-content">
        <div class="generating-anim">📅</div>
        <h3>Building your personalised study plan…</h3>
        <div class="spinner-bar"><div class="spinner-fill"></div></div>
      </div>`;

    const topicContext = selectedTopics.length
      ? selectedTopics.map(n => {
          const td   = this.topicsData?.find(t => t.name === n);
          const subs = td?.subtopics?.length ? ` (${td.subtopics.slice(0, 4).join(", ")})` : "";
          const conf = this.confidenceData[n];
          const confNote = conf && conf !== "none" ? ` [confidence: ${conf}]` : "";
          return `• ${n}${subs}${confNote}`;
        }).join("\n")
      : this.store.getTopicNamesOverview();

    const userMsg = `Create a concise adaptive study plan in tabular format.

Student details:
- ${days ? `Days until exam: ${days} (target: ${dateVal})` : "No specific deadline"}
- Daily study time: ${hours} hour(s)
${focus ? `- Notes: ${focus}` : ""}

Topics to cover (with confidence levels where known):
${topicContext}

Output:
1. A markdown table: Day | Topics | Activity | Duration — prioritise low-confidence topics
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
    if (!this.store.hasContent) {
      $("panel-mastery").innerHTML = `
        <div class="panel-inner center-content">
          <div style="font-size:3rem">📊</div>
          <h3>No Materials Yet</h3>
          <p class="muted">Upload study materials to start tracking mastery.</p>
        </div>`;
    }
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

    const docCtx  = this.store.getStructuredOverview(6000);
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
    if (!this.topicsData?.length) return;
    this._masteryHasContent = true;

    const extractedTopics = this.topicsData.map(t => t.name);
    const allTopics = [
      ...extractedTopics,
      ...this.customTopics.filter(n => !extractedTopics.includes(n)),
    ];

    const LEVELS = ["none", "low", "medium", "high"];
    const LABELS = { none: "Not started", low: "Low", medium: "Medium", high: "High" };

    const rows = allTopics.map(name => {
      const level   = this.confidenceData[name] ?? "none";
      const isCustom = this.customTopics.includes(name) && !extractedTopics.includes(name);
      const btns = LEVELS.map(l =>
        `<button class="conf-btn${level === l ? ` active-${l}` : ""}" data-topic="${name}" data-level="${l}">${LABELS[l]}</button>`
      ).join("");
      const suggestion = level === "low" ? `
        <div class="mastery-suggestion">
          💡 Confidence is low —
          <button class="ms-chat" data-topic="${name}">Ask Chat to explain</button> ·
          <button class="ms-test" data-topic="${name}">Take a practice test</button> ·
          <button class="ms-plan" data-topic="${name}">Create a study plan</button>
        </div>` : "";
      return `
        <div class="mastery-row">
          <div class="mastery-row-content">
            <div class="mastery-row-name">${name}${isCustom ? ' <span class="custom-badge">custom</span>' : ""}</div>
            <div class="confidence-selector">${btns}</div>
          </div>
          ${suggestion}
        </div>`;
    }).join("");

    $("panel-mastery").innerHTML = `
      <div class="panel-inner">
        <div class="panel-header">
          <h2>📊 Mastery</h2>
          <p>Rate your confidence per topic. Low confidence topics will prompt next steps.</p>
        </div>
        <div class="mastery-add-row">
          <input id="mastery-add-input" type="text" placeholder="Add a topic not in the list…">
          <button id="mastery-add-btn" class="btn-sm">+ Add</button>
        </div>
        <div class="mastery-list">${rows}</div>
      </div>`;

    $("panel-mastery").querySelectorAll(".conf-btn").forEach(btn =>
      btn.addEventListener("click", () => {
        this.confidenceData[btn.dataset.topic] = btn.dataset.level;
        this._saveConfidence();
        this._renderMastery();
      })
    );
    $("panel-mastery").querySelectorAll(".ms-chat").forEach(btn =>
      btn.addEventListener("click", () => {
        this._switchMode("chat");
        $("chat-input").value = `Explain "${btn.dataset.topic}" in detail with analogies and examples from my study materials.`;
      })
    );
    $("panel-mastery").querySelectorAll(".ms-test").forEach(btn =>
      btn.addEventListener("click", () => {
        this._switchMode("test");
        setTimeout(() => {
          const sel = $("test-topic-select");
          if (sel) {
            const opt = [...sel.options].find(o => o.value === btn.dataset.topic);
            if (opt) sel.value = opt.value;
          }
        }, 60);
      })
    );
    $("panel-mastery").querySelectorAll(".ms-plan").forEach(btn =>
      btn.addEventListener("click", () => this._switchMode("plan"))
    );
    $("mastery-add-btn")?.addEventListener("click", () => {
      const input = $("mastery-add-input");
      const name  = input?.value.trim();
      if (!name) return;
      if (!this.customTopics.includes(name)) {
        this.customTopics.push(name);
        this._saveConfidence();
      }
      input.value = "";
      this._renderMastery();
    });
    $("mastery-add-input")?.addEventListener("keydown", e => {
      if (e.key === "Enter") $("mastery-add-btn")?.click();
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

const app = new RecalApp();
window.app = app;
