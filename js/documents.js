// documents.js — Client-side document processing (PDF.js + BM25 retrieval)
// Files are parsed locally; only the extracted text is sent to the API.

export class DocumentStore {
  constructor() {
    this._docs = new Map();  // id → { id, name, text, chunks, size }
    this._uid  = 1;
    this._pdfPromise = this._loadPDFJS();
  }

  _loadPDFJS() {
    return new Promise(resolve => {
      if (window.pdfjsLib) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  async addFile(file) {
    let text;
    if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
      await this._pdfPromise;
      text = await this._parsePDF(file);
    } else {
      text = await file.text();
    }
    const id     = this._uid++;
    const chunks = this._chunk(text, 600, 80);
    this._docs.set(id, { id, name: file.name, text, chunks, size: file.size });
    return id;
  }

  removeDoc(id) { this._docs.delete(id); }

  get docs()       { return [...this._docs.values()]; }
  get hasContent() { return this._docs.size > 0; }

  async _parsePDF(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(`[Page ${i}] ` + content.items.map(it => it.str).join(" "));
    }
    return pages.join("\n\n");
  }

  _chunk(text, size, overlap) {
    const words  = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += size - overlap) {
      const c = words.slice(i, i + size).join(" ");
      if (c.trim()) chunks.push(c);
    }
    return chunks;
  }

  _tok(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
  }

  // BM25 scoring over all document chunks
  _bm25(query, chunks, k = 8, k1 = 1.5, b = 0.75) {
    const qTerms = this._tok(query);
    const avgLen = chunks.reduce((s, c) => s + c.words, 0) / (chunks.length || 1);

    return chunks
      .map((chunk, idx) => {
        let score = 0;
        for (const term of qTerms) {
          const tf = chunk.freq[term] || 0;
          if (!tf) continue;
          const df  = chunks.filter(c => c.freq[term]).length;
          const idf = Math.log((chunks.length - df + 0.5) / (df + 0.5) + 1);
          const tfn = tf * (k1 + 1) / (tf + k1 * (1 - b + b * chunk.words / avgLen));
          score    += idf * tfn;
        }
        return { idx, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  _allChunks() {
    const out = [];
    for (const doc of this._docs.values()) {
      for (const text of doc.chunks) {
        const toks = this._tok(text);
        const freq = {};
        toks.forEach(t => (freq[t] = (freq[t] || 0) + 1));
        out.push({ text, docName: doc.name, words: toks.length, freq });
      }
    }
    return out;
  }

  // Retrieve the most relevant chunks for a query (up to maxWords).
  // Claude has a 200k context window, so we can be generous.
  getContext(query, maxWords = 12000) {
    if (!this.hasContent) return "";
    const chunks = this._allChunks();
    if (!chunks.length) return "";

    const ranked   = this._bm25(query, chunks);
    const selected = [];
    let total      = 0;

    for (const { idx } of ranked) {
      const c = chunks[idx];
      if (total + c.words > maxWords) break;
      selected.push(c);
      total += c.words;
    }
    return selected.map(c => `[Source: ${c.docName}]\n${c.text}`).join("\n\n---\n\n");
  }

  // Broad overview — first N words of each document (for study plan / topic extraction)
  getOverview(maxWords = 10000) {
    if (!this.hasContent) return "";
    const perDoc = Math.floor(maxWords / this._docs.size);
    const parts  = [];
    for (const doc of this._docs.values()) {
      const excerpt = doc.text.split(/\s+/).slice(0, perDoc).join(" ");
      parts.push(`[Document: ${doc.name}]\n${excerpt}`);
    }
    return parts.join("\n\n===\n\n");
  }

  // Returns only topic/heading names per document — used for study plan context
  getTopicNamesOverview() {
    if (!this.hasContent) return "";
    const parts = [];
    for (const doc of this._docs.values()) {
      const headings = [...doc.text.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => "• " + m[1].trim());
      if (headings.length >= 3) {
        parts.push(`[${doc.name}]\n${headings.slice(0, 40).join("\n")}`);
      } else {
        // No markdown headings — use first 300 words as rough overview
        const preview = doc.text.split(/\s+/).slice(0, 300).join(" ");
        parts.push(`[${doc.name}]\n${preview}`);
      }
    }
    return parts.join("\n\n");
  }
}
