/* ==================================================
   L'Oréal Smart Routine & Product Advisor
   ================================================== */

/* === Config === */
const WORKER_URL = "https://loreal-chatbot.austinch20.workers.dev/";
const STORAGE_KEY = "loreal_selected_products_v1";
const ROUTINES_STORAGE_KEY = "loreal_routines_v1";
const MAX_SAVED_ROUTINES = 10;

const SYSTEM_PROMPT = `You are the user's personal Beauty and Care Specialist for L'Oréal's family of brands (L'Oréal Paris, Maybelline, Garnier, Lancôme, Kérastase, YSL Beauty, CeraVe, La Roche-Posay, Vichy, and more). You are warm, joyful, encouraging, and genuinely excited to help. You write like a kind, knowledgeable friend who happens to be a beauty expert.

HARD LENGTH LIMIT: Every single reply must fit in ~280 output tokens. Stay compact. No long intros, no filler.

This conversation runs in THREE modes. Pay attention to which mode each turn is in:

MODE 1. CLARIFY (first turn, when the user shares their selected products):
Reply with ONE short friendly line (for example: "Great picks! Before we build your routine, a few quick questions:") then a bulleted list of 2 to 3 targeted clarifying questions chosen from what's most relevant to their selection:
- Skin or scalp type and sensitivities (sensitive, reactive, eczema, allergies, pregnancy-safe needs).
- Hair type or concerns if haircare is involved (fine, thick, color-treated, oily scalp, curl pattern).
- Primary goals (hydration, anti-aging, acne, brightening, frizz control, long-wear makeup).
- Accessibility and dexterity needs (grip, vision, one-handed use, trouble with pumps, droppers, or twist tubes, fragrance sensitivity).
- Time available and whether they want a minimal or full routine.
End with a short line inviting them to skip any that don't apply. Do NOT mention buttons, links, or UI elements. Do NOT use bracketed placeholder text. Keep this whole reply under ~90 words. Do NOT start building the routine yet.

MODE 2. BUILD ONE SECTION (when the user or system says "Build the [Section Name] section"):
Produce ONLY that section. The sections you may be asked to build are: "AM Skincare", "PM Skincare", "Haircare", "Makeup", "Grooming", "Fragrance".
Format for a section:
- Start with the section title as a bold heading (for example: **AM Skincare**).
- Numbered steps in logical order for that domain.
- Under each step, ONE bullet per product. Each bullet = product name in **bold**, then one short sentence of guidance.
- Group multiple products under the same step if they serve the same purpose (for example two serums under "Treat").
- End with up to 2 brief Notes bullets (adaptations for sensitivities, allergies, dexterity, or pairings to avoid) only if genuinely needed. Otherwise skip Notes.
Strict rules for MODE 2:
- Use ONLY the user's selected products that fit this section. Skip products that don't fit, silently.
- Mention product NAMES exactly as given.
- Do NOT preview or mention any other section. Do NOT say "next up" or "let's move on to X". Just the section, then stop.
- Do NOT repeat the user's personal info back at them. Apply it silently.
- No long prose. No marketing language.
Logical ordering per section:
- Skincare: cleanse, treat, moisturize, protect.
- Haircare: shampoo, condition, mask or treatment, style.
- Makeup: prime, base (foundation/concealer), color (eyes, cheeks, lips), set/finish.
- Grooming: cleanse, treat or shave-adjacent, moisturize, finish.
- Fragrance: application tips, layering guidance.

MODE 3. ANSWER A QUESTION:
If the user asks a question (not a "build section" request), answer briefly. 2 to 4 short sentences or a short bulleted list. Stay on beauty, routines, and L'Oréal family products. If off-topic, politely redirect.

Formatting rules (all modes):
- **Bold** for section titles, step names, and product names.
- Bullets for lists. No long prose.
- Call out AM, PM, daily, or weekly when it matters.
- Never use em dashes. Use commas, periods, or parentheses instead.
- If citations are available, list them under "Sources:" at the end.`;

/* === DOM === */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCountEl = document.getElementById("selectedCount");
const clearAllBtn = document.getElementById("clearAll");
const generateBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");
/* Modal */
const modal = document.getElementById("descriptionModal");
const modalImage = document.getElementById("modalImage");
const modalBrand = document.getElementById("modalBrand");
const modalName = document.getElementById("modalName");
const modalCategory = document.getElementById("modalCategory");
const modalDescription = document.getElementById("modalDescription");
const modalToggleSelect = document.getElementById("modalToggleSelect");

/* === State === */
let allProducts = [];
let selectedIds = new Set(loadSelectedIds());
let activeModalProductId = null;
let routineQueue = [];
let routineActive = false;
let displayLog = [];
let savedRoutines = loadSavedRoutines();
let activeRoutineId = null;
let isLoading = false;

/* === Persistence === */
function loadSelectedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSelectedIds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedIds]));
}

function loadSavedRoutines() {
  try {
    const raw = localStorage.getItem(ROUTINES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedRoutines() {
  localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(savedRoutines));
}

/* === Product loading === */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* === Filtering === */
function getFilteredProducts() {
  const category = categoryFilter.value;
  const query = productSearch.value.trim().toLowerCase();

  return allProducts.filter((p) => {
    const matchesCategory =
      !category || category === "all" || p.category === category;
    const matchesQuery =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });
}

/* === Rendering === */
function renderProducts() {
  const category = categoryFilter.value;
  const query = productSearch.value.trim();

  if (!category && !query) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
        <p>Choose a category or search for a product to get started.</p>
      </div>
    `;
    return;
  }

  const products = getFilteredProducts();

  if (!products.length) {
    productsContainer.innerHTML = `
      <div class="empty-message">
        <i class="fa-regular fa-face-frown" aria-hidden="true"></i>
        <p>No products match your search. Try a different keyword or category.</p>
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedIds.has(product.id);
      return `
        <article class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}" aria-pressed="${isSelected}">
          <span class="selected-badge" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
          <div class="image-wrap">
            <img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy">
          </div>
          <div class="product-info">
            <span class="brand">${escapeHtml(product.brand)}</span>
            <h3>${escapeHtml(product.name)}</h3>
            <span class="category-tag">${escapeHtml(product.category)}</span>
          </div>
          <div class="card-actions">
            <button class="info-btn" type="button" data-action="info" data-id="${product.id}">
              <i class="fa-solid fa-circle-info"></i> Details
            </button>
            <button class="select-btn" type="button" data-action="toggle" data-id="${product.id}">
              <i class="fa-solid ${isSelected ? "fa-check" : "fa-plus"}"></i>
              ${isSelected ? "Added" : "Add"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSelected() {
  const selected = allProducts.filter((p) => selectedIds.has(p.id));
  selectedCountEl.textContent = selected.length;

  selectedProductsList.innerHTML = selected
    .map(
      (p) => `
      <div class="selected-chip" data-id="${p.id}">
        <img src="${p.image}" alt="">
        <div>
          <div class="chip-brand">${escapeHtml(p.brand)}</div>
          <div class="chip-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
        </div>
        <button type="button" data-action="remove" data-id="${p.id}" aria-label="Remove ${escapeHtml(p.name)}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `,
    )
    .join("");

  generateBtn.disabled = selected.length === 0;
  clearAllBtn.style.visibility = selected.length ? "visible" : "hidden";
}

/* === Selection logic === */
function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  persistSelectedIds();
  renderProducts();
  renderSelected();
  if (activeModalProductId === id) updateModalSelectState();
}

function clearAllSelections() {
  if (!selectedIds.size) return;
  selectedIds.clear();
  persistSelectedIds();
  renderProducts();
  renderSelected();
  if (activeModalProductId !== null) updateModalSelectState();
}

/* === Modal === */
function openModal(id) {
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;
  activeModalProductId = id;
  modalImage.src = product.image;
  modalImage.alt = product.name;
  modalBrand.textContent = product.brand;
  modalName.textContent = product.name;
  modalCategory.textContent = product.category;
  modalDescription.textContent =
    product.description || "No description available.";
  updateModalSelectState();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  activeModalProductId = null;
}

function updateModalSelectState() {
  if (activeModalProductId === null) return;
  const isSelected = selectedIds.has(activeModalProductId);
  modalToggleSelect.innerHTML = isSelected
    ? `<i class="fa-solid fa-check"></i> Added to selection`
    : `<i class="fa-solid fa-plus"></i> Add to selection`;
  modalToggleSelect.classList.toggle("is-selected", isSelected);
}

/* === Markdown === */
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );

  html = html.replace(
    /(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g,
    (_, pre, url) =>
      `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>`,
  );

  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, "<strong>$1</strong>")
    .replace(/^# (.+)$/gm, "<strong>$1</strong>")
    .replace(/^[-•]\s+(.+)$/gm, "&bull; $1")
    .replace(/^\d+\.\s+(.+)$/gm, "&bull; $1")
    .replace(/\n/g, "<br>");

  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* === Chat rendering === */
function clearChatPlaceholder() {
  const ph = chatWindow.querySelector(".chat-placeholder");
  if (ph) ph.remove();
}

function addMessage(text, sender, options = {}) {
  clearChatPlaceholder();
  const bubble = document.createElement("div");
  bubble.classList.add("msg", sender);
  if (options.routine) bubble.classList.add("routine");

  if (options.html) {
    bubble.innerHTML = text;
  } else {
    bubble.innerHTML = renderMarkdown(text);
  }

  if (sender === "ai" && options.citations && options.citations.length) {
    const cites = document.createElement("div");
    cites.className = "citations";
    cites.innerHTML =
      `<strong>Sources:</strong>` +
      options.citations
        .map(
          (c) =>
            `<a href="${c.url}" target="_blank" rel="noopener">${escapeHtml(c.title || c.url)}</a>`,
        )
        .join("");
    bubble.appendChild(cites);
  }

  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  if (!options.skipLog) {
    displayLog.push({
      role: sender,
      text,
      options: {
        routine: !!options.routine,
        citations: options.citations || [],
      },
    });
  }

  return bubble;
}

function addLoadingBubble() {
  const bubble = document.createElement("div");
  bubble.className = "msg ai loading";
  bubble.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

function showChatPlaceholder() {
  chatWindow.innerHTML = `
    <div class="chat-placeholder">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <p>Pick a few products and tap <strong>Generate Routine</strong>. Your specialist will ask you a few quick questions, then put together a routine that works for you.</p>
    </div>
  `;
}

/* === Conversation === */
const conversationHistory = [{ role: "system", content: SYSTEM_PROMPT }];

function setLoading(state) {
  isLoading = state;
  sendBtn.disabled = state;
  if (state) {
    generateBtn.disabled = true;
  } else {
    generateBtn.disabled = selectedIds.size === 0;
  }
  document
    .querySelectorAll(".next-section-btn")
    .forEach((btn) => (btn.disabled = state));
}

async function callAdvisor(messages) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Worker responded with ${response.status}`);
  }

  const data = await response.json();

  const choice = data.choices && data.choices[0];
  const content =
    (choice && choice.message && choice.message.content) ||
    data.output_text ||
    "";

  const citations = extractCitations(choice && choice.message);
  return { content, citations };
}

function extractCitations(message) {
  if (!message) return [];
  const annotations = message.annotations || [];
  return annotations
    .filter((a) => a.type === "url_citation" && a.url_citation)
    .map((a) => ({
      url: a.url_citation.url,
      title: a.url_citation.title || a.url_citation.url,
    }));
}

/* === Section queue === */
function buildSectionQueue(selected) {
  const cats = new Set(selected.map((p) => p.category));
  const any = (...list) => list.some((c) => cats.has(c));
  const queue = [];
  if (any("cleanser", "moisturizer", "skincare", "suncare")) {
    queue.push({ id: "skincare-am", label: "AM Skincare" });
    queue.push({ id: "skincare-pm", label: "PM Skincare" });
  }
  if (any("haircare", "hair color", "hair styling")) {
    queue.push({ id: "haircare", label: "Haircare" });
  }
  if (any("makeup")) {
    queue.push({ id: "makeup", label: "Makeup" });
  }
  if (any("men's grooming")) {
    queue.push({ id: "grooming", label: "Grooming" });
  }
  if (any("fragrance")) {
    queue.push({ id: "fragrance", label: "Fragrance" });
  }
  return queue;
}

function attachNextSectionButton(bubble) {
  if (!routineActive || !routineQueue.length || !bubble) return;
  const next = routineQueue[0];
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "next-section-btn";
  btn.innerHTML = `<i class="fa-solid fa-arrow-right"></i> Continue to ${next.label}`;
  btn.addEventListener("click", () => requestNextSection(btn));
  bubble.appendChild(btn);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function requestNextSection(triggerBtn) {
  if (isLoading) return;
  if (!routineQueue.length) return;
  const section = routineQueue.shift();
  if (triggerBtn) triggerBtn.remove();
  document
    .querySelectorAll(".next-section-btn")
    .forEach((b) => b.remove());

  const userMessage = `Build the **${section.label}** section now. Use only my selected products that fit this section, per the MODE 2 format. Do not preview or mention any other section.`;
  addMessage(`Continue to ${section.label}.`, "user");
  conversationHistory.push({ role: "user", content: userMessage });

  const loader = addLoadingBubble();
  setLoading(true);
  try {
    const { content, citations } = await callAdvisor(conversationHistory);
    loader.remove();
    const bubble = addMessage(content, "ai", { routine: true, citations });
    conversationHistory.push({ role: "assistant", content });
    if (routineQueue.length) {
      attachNextSectionButton(bubble);
    } else {
      routineActive = false;
    }
    touchActiveRoutine();
  } catch (err) {
    loader.remove();
    addMessage(
      "Sorry, something went wrong. Please try again in a moment.",
      "ai",
    );
  } finally {
    setLoading(false);
  }
}

/* === Routine history === */
function hasActiveRoutine() {
  return conversationHistory.length > 1 || displayLog.length > 0;
}

function deriveRoutineTitle(productIds) {
  const products = productIds
    .map((id) => allProducts.find((p) => p.id === id))
    .filter(Boolean);
  const groupMap = {
    cleanser: "Skincare",
    moisturizer: "Skincare",
    skincare: "Skincare",
    suncare: "Skincare",
    haircare: "Haircare",
    "hair color": "Haircare",
    "hair styling": "Haircare",
    makeup: "Makeup",
    "men's grooming": "Grooming",
    fragrance: "Fragrance",
  };
  const groups = [
    ...new Set(products.map((p) => groupMap[p.category] || "Other")),
  ];
  const productWord = products.length === 1 ? "product" : "products";
  return `${products.length} ${productWord} · ${groups.join(", ") || "Mixed"}`;
}

function formatRoutineTimestamp(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function snapshotActiveRoutine() {
  if (!hasActiveRoutine()) return null;
  const productIds = [...selectedIds];
  const now = Date.now();
  return {
    id: activeRoutineId || `r_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    title: deriveRoutineTitle(productIds),
    productIds,
    messages: conversationHistory.map((m) => ({ ...m })),
    displayLog: displayLog.map((d) => ({
      role: d.role,
      text: d.text,
      options: { ...(d.options || {}) },
    })),
    queue: routineQueue.map((q) => ({ ...q })),
    active: routineActive,
  };
}

function saveActiveRoutine() {
  const snap = snapshotActiveRoutine();
  if (!snap) return;
  const existingIndex = savedRoutines.findIndex((r) => r.id === snap.id);
  if (existingIndex >= 0) {
    const existing = savedRoutines[existingIndex];
    savedRoutines[existingIndex] = {
      ...snap,
      createdAt: existing.createdAt,
      title: existing.customTitle ? existing.title : snap.title,
      customTitle: !!existing.customTitle,
    };
  } else {
    savedRoutines.unshift({ ...snap, customTitle: false });
    if (savedRoutines.length > MAX_SAVED_ROUTINES) {
      savedRoutines = savedRoutines.slice(0, MAX_SAVED_ROUTINES);
    }
  }
  activeRoutineId = snap.id;
  persistSavedRoutines();
  renderPastRoutines();
  updateSaveRoutineButton();
}

function deleteSavedRoutine(id) {
  savedRoutines = savedRoutines.filter((r) => r.id !== id);
  persistSavedRoutines();
  renderPastRoutines();
  if (activeRoutineId === id) activeRoutineId = null;
  updateSaveRoutineButton();
}

function clearAllSavedRoutines() {
  if (!savedRoutines.length) return;
  savedRoutines = [];
  persistSavedRoutines();
  renderPastRoutines();
  if (activeRoutineId && !savedRoutines.find((r) => r.id === activeRoutineId)) {
    activeRoutineId = null;
  }
  updateSaveRoutineButton();
}

function loadSavedRoutine(id) {
  const routine = savedRoutines.find((r) => r.id === id);
  if (!routine) return;

  conversationHistory.length = 0;
  routine.messages.forEach((m) => conversationHistory.push({ ...m }));
  routineQueue = (routine.queue || []).map((q) => ({ ...q }));
  routineActive = !!routine.active && routineQueue.length > 0;
  displayLog = [];
  activeRoutineId = routine.id;

  selectedIds = new Set(routine.productIds);
  persistSelectedIds();
  renderProducts();
  renderSelected();

  chatWindow.innerHTML = "";
  let lastAiBubble = null;
  (routine.displayLog || []).forEach((entry) => {
    const bubble = addMessage(entry.text, entry.role, entry.options || {});
    if (entry.role === "ai") lastAiBubble = bubble;
  });
  if (!displayLog.length) showChatPlaceholder();
  if (lastAiBubble && routineActive && routineQueue.length) {
    attachNextSectionButton(lastAiBubble);
  }
  updateSaveRoutineButton();
  renderPastRoutines();
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* === Confirm dialog === */
function openConfirmDialog({ title, message, showSave = true }) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMessage").textContent = message;
    const saveBtn = document.getElementById("confirmSave");
    const discardBtn = document.getElementById("confirmDiscard");
    const cancelBtn = document.getElementById("confirmCancel");
    saveBtn.hidden = !showSave;

    const close = (result) => {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      saveBtn.removeEventListener("click", onSave);
      discardBtn.removeEventListener("click", onDiscard);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onSave = () => close("save");
    const onDiscard = () => close("discard");
    const onCancel = () => close("cancel");
    const onBackdrop = (e) => {
      if (e.target.matches("[data-close-confirm]")) close("cancel");
    };
    const onKey = (e) => {
      if (e.key === "Escape") close("cancel");
    };

    saveBtn.addEventListener("click", onSave);
    discardBtn.addEventListener("click", onDiscard);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  });
}

/* === Past routines rendering === */
const pastRoutinesSection = document.getElementById("pastRoutinesSection");
const pastRoutinesList = document.getElementById("pastRoutinesList");
const pastRoutinesCount = document.getElementById("pastRoutinesCount");
const clearAllRoutinesBtn = document.getElementById("clearAllRoutines");
const saveCurrentRoutineBtn = document.getElementById("saveCurrentRoutine");

function renderPastRoutines() {
  pastRoutinesCount.textContent = savedRoutines.length;
  if (!savedRoutines.length) {
    pastRoutinesSection.hidden = true;
    pastRoutinesList.innerHTML = "";
    return;
  }
  pastRoutinesSection.hidden = false;
  pastRoutinesList.innerHTML = savedRoutines
    .map(
      (r) => `
        <article class="past-routine ${r.id === activeRoutineId ? "is-active" : ""}" data-id="${r.id}" data-action="load" tabindex="0" role="button" aria-label="Load ${escapeHtml(r.title)}">
          <div class="past-routine-body">
            <div class="past-routine-title-row">
              <span class="past-routine-title" data-action="rename" data-id="${r.id}" title="Click to rename">${escapeHtml(r.title)}</span>
              <i class="fa-solid fa-pen past-routine-pen" data-action="rename" data-id="${r.id}" aria-hidden="true"></i>
            </div>
            <div class="past-routine-meta">
              <span><i class="fa-regular fa-clock"></i> ${formatRoutineTimestamp(r.updatedAt)}</span>
              ${r.id === activeRoutineId ? '<span class="active-pill">Active</span>' : ""}
            </div>
          </div>
          <button class="past-routine-delete" type="button" data-action="delete" data-id="${r.id}" aria-label="Delete routine">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </article>
      `,
    )
    .join("");
}

function startRenameRoutine(id) {
  const routine = savedRoutines.find((r) => r.id === id);
  if (!routine) return;
  const titleEl = pastRoutinesList.querySelector(
    `.past-routine-title[data-id="${id}"]`,
  );
  if (!titleEl) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "past-routine-title-input";
  input.value = routine.title;
  input.maxLength = 60;
  input.setAttribute("aria-label", "Routine name");
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    const next = input.value.trim();
    if (next && next !== routine.title) {
      renameSavedRoutine(id, next);
    } else {
      renderPastRoutines();
    }
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    renderPastRoutines();
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
  input.addEventListener("click", (e) => e.stopPropagation());
}

function renameSavedRoutine(id, newTitle) {
  const routine = savedRoutines.find((r) => r.id === id);
  if (!routine) return;
  routine.title = newTitle;
  routine.customTitle = true;
  routine.updatedAt = Date.now();
  persistSavedRoutines();
  renderPastRoutines();
}

function updateSaveRoutineButton() {
  if (!saveCurrentRoutineBtn) return;
  const active = hasActiveRoutine();
  saveCurrentRoutineBtn.hidden = !active;
  const existing = savedRoutines.find((r) => r.id === activeRoutineId);
  if (existing) {
    saveCurrentRoutineBtn.innerHTML = `<i class="fa-solid fa-check"></i> Saved`;
    saveCurrentRoutineBtn.classList.add("is-saved");
  } else {
    saveCurrentRoutineBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> Save Routine`;
    saveCurrentRoutineBtn.classList.remove("is-saved");
  }
}

/* === Generate routine === */
function resetConversation() {
  conversationHistory.length = 0;
  conversationHistory.push({ role: "system", content: SYSTEM_PROMPT });
  routineQueue = [];
  routineActive = false;
  displayLog = [];
  activeRoutineId = null;
  showChatPlaceholder();
  updateSaveRoutineButton();
  renderPastRoutines();
}

async function generateRoutine() {
  if (isLoading) return;
  const selected = allProducts.filter((p) => selectedIds.has(p.id));
  if (!selected.length) return;

  if (hasActiveRoutine()) {
    const alreadySaved = savedRoutines.some((r) => r.id === activeRoutineId);
    if (!alreadySaved) {
      const choice = await openConfirmDialog({
        title: "Save current routine?",
        message:
          "You have an unsaved routine. Save it to history before starting a new one?",
        showSave: true,
      });
      if (choice === "cancel") return;
      if (choice === "save") saveActiveRoutine();
    }
  }

  resetConversation();

  routineQueue = buildSectionQueue(selected);
  routineActive = routineQueue.length > 0;

  const payload = selected.map((p) => ({
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
  }));

  const sectionLabels = routineQueue.map((s) => s.label).join(", ");
  const userMessage = `Here are my selected products. We will build the routine one section at a time, in this order: ${sectionLabels || "(none detected)"}.\n\nYou are in MODE 1 (CLARIFY). Ask me 2 to 3 short clarifying questions now. Do NOT build any sections yet. Do NOT mention the section list, buttons, or UI. After I answer, the system will send you a separate message asking you to build the first section.\n\nSelected products (JSON):\n${JSON.stringify(payload, null, 2)}`;

  const productWord = selected.length === 1 ? "product" : "products";
  addMessage(
    `Sharing my ${selected.length} selected ${productWord} with my beauty and care specialist.`,
    "user",
  );
  conversationHistory.push({ role: "user", content: userMessage });

  const loader = addLoadingBubble();
  setLoading(true);

  try {
    const { content, citations } = await callAdvisor(conversationHistory);
    loader.remove();
    const bubble = addMessage(content, "ai", { citations });
    conversationHistory.push({ role: "assistant", content });
    attachNextSectionButton(bubble);
    touchActiveRoutine();
  } catch (err) {
    loader.remove();
    addMessage(
      "Sorry, I couldn't reach the advisor right now. Please try again in a moment.",
      "ai",
    );
    routineActive = false;
  } finally {
    setLoading(false);
  }
}

function touchActiveRoutine() {
  updateSaveRoutineButton();
  if (activeRoutineId && savedRoutines.find((r) => r.id === activeRoutineId)) {
    saveActiveRoutine();
  }
}

/* === Follow-up chat === */
async function handleFollowUp(text) {
  if (isLoading) return;
  addMessage(text, "user");
  conversationHistory.push({ role: "user", content: text });

  document
    .querySelectorAll(".next-section-btn")
    .forEach((b) => b.remove());

  const loader = addLoadingBubble();
  setLoading(true);
  try {
    const { content, citations } = await callAdvisor(conversationHistory);
    loader.remove();
    const bubble = addMessage(content, "ai", { citations });
    conversationHistory.push({ role: "assistant", content });
    if (routineActive && routineQueue.length) {
      attachNextSectionButton(bubble);
    }
    touchActiveRoutine();
  } catch (err) {
    loader.remove();
    addMessage(
      "Sorry, something went wrong. Please try again in a moment.",
      "ai",
    );
  } finally {
    setLoading(false);
  }
}

/* === Event wiring === */
categoryFilter.addEventListener("change", renderProducts);
productSearch.addEventListener("input", renderProducts);

productsContainer.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    const id = Number(actionBtn.dataset.id);
    if (actionBtn.dataset.action === "info") {
      e.stopPropagation();
      openModal(id);
      return;
    }
    if (actionBtn.dataset.action === "toggle") {
      e.stopPropagation();
      toggleSelection(id);
      return;
    }
  }
  const card = e.target.closest(".product-card");
  if (card) {
    toggleSelection(Number(card.dataset.id));
  }
});

selectedProductsList.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="remove"]');
  if (!btn) return;
  toggleSelection(Number(btn.dataset.id));
});

clearAllBtn.addEventListener("click", clearAllSelections);

generateBtn.addEventListener("click", generateRoutine);

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  handleFollowUp(text);
});

modal.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
});

modalToggleSelect.addEventListener("click", () => {
  if (activeModalProductId !== null) toggleSelection(activeModalProductId);
});

async function handleLoadRoutine(id) {
  if (id === activeRoutineId) return;
  if (hasActiveRoutine()) {
    const alreadySaved = savedRoutines.some((r) => r.id === activeRoutineId);
    if (!alreadySaved) {
      const choice = await openConfirmDialog({
        title: "Save current routine?",
        message:
          "You have an unsaved routine. Save it to history before switching?",
        showSave: true,
      });
      if (choice === "cancel") return;
      if (choice === "save") saveActiveRoutine();
    }
  }
  loadSavedRoutine(id);
}

pastRoutinesList.addEventListener("click", async (e) => {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const id = actionEl.dataset.id;
  const action = actionEl.dataset.action;

  if (action === "rename") {
    e.stopPropagation();
    startRenameRoutine(id);
    return;
  }
  if (action === "delete") {
    e.stopPropagation();
    deleteSavedRoutine(id);
    return;
  }
  if (action === "load") {
    await handleLoadRoutine(id);
  }
});

pastRoutinesList.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest('.past-routine[data-action="load"]');
  if (!card || card !== e.target) return;
  e.preventDefault();
  handleLoadRoutine(card.dataset.id);
});

clearAllRoutinesBtn.addEventListener("click", async () => {
  if (!savedRoutines.length) return;
  const choice = await openConfirmDialog({
    title: "Clear routine history?",
    message:
      "This removes every saved routine. Your active routine stays in the chat.",
    showSave: false,
  });
  if (choice === "discard") clearAllSavedRoutines();
});

saveCurrentRoutineBtn.addEventListener("click", () => {
  if (!hasActiveRoutine()) return;
  saveActiveRoutine();
});

/* === Boot === */
(async function init() {
  showChatPlaceholder();
  try {
    allProducts = await loadProducts();
  } catch (err) {
    productsContainer.innerHTML = `
      <div class="empty-message">
        <p>We couldn't load the product catalog. Please refresh the page.</p>
      </div>
    `;
    return;
  }
  renderProducts();
  renderSelected();
  renderPastRoutines();
  updateSaveRoutineButton();
})();
