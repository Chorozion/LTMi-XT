// Local LTMi-XT demo — vanilla JS. Talks to whatever origin the page is
// served from (i.e. the same `ltmi serve` process).

const $ = (sel) => document.querySelector(sel);

const SAMPLE = `# Cold Storage Operations Manual — internal draft

The Cold Storage line is the high-margin part of the business. We currently operate three trucks across the metro area. Each truck is staffed with one driver and one technician on long routes. Last quarter we lost two shipments to coolant mismatch which cost us roughly $4,800 in claims.

The standard workflow is: customer calls in, dispatch logs the pickup, driver collects, technician verifies temperature on arrival, we deliver, the customer signs for it.

For dry ice loads we always use the VIP panel inserts. They cost more up front but the failure rate is essentially zero. Gel pack loads are cheaper but only safe for transit times under 18 hours. Anything longer should be dry ice.

The newer Sophia Key 3M tool can model a lane and tell us in advance which configuration will hold.`;

const state = {
  bundle: null,        // { manifest, loci, breadcrumbTree, artifacts }
  selectedLocusId: null,
};

// ── Provider badge ─────────────────────────────────────────────────────
async function checkProvider() {
  const badge = $("#provider-badge");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.provider) {
      badge.textContent = `${data.provider.name} · ${data.provider.model}`;
      badge.classList.add("ok");
    } else {
      badge.textContent = "no provider — read-only";
      badge.classList.add("warn");
    }
  } catch {
    badge.textContent = "server unreachable";
    badge.classList.add("warn");
  }
}

// ── Sample loader ──────────────────────────────────────────────────────
$("#loadSample").addEventListener("click", () => {
  $("#text").value = SAMPLE;
  updateSizeHint();
});

const textArea = $("#text");
function updateSizeHint() {
  $("#sizeHint").textContent = `${textArea.value.length.toLocaleString()} chars`;
}
textArea.addEventListener("input", updateSizeHint);
textArea.value = SAMPLE;
updateSizeHint();

// ── Crystallize ────────────────────────────────────────────────────────
$("#crystallizeBtn").addEventListener("click", async () => {
  const btn = $("#crystallizeBtn");
  const errBox = $("#crystallizeError");
  errBox.classList.add("hidden");
  errBox.textContent = "";
  btn.disabled = true;
  btn.textContent = "Crystallizing…";

  try {
    const res = await fetch("/api/ltmi-xt/crystallize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textArea.value, label: "demo-input" }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    state.bundle = data;
    state.selectedLocusId = null;
    renderTree(data.breadcrumbTree, data.loci);
    $("#lociCount").textContent = `${data.manifest.loci} loci`;
    $("#downloads").classList.remove("hidden");
    $("#downloads").classList.remove("hidden-row");
    $("#resultSection").style.display = "";
    renderInspector(null);
  } catch (e) {
    errBox.textContent = e.message;
    errBox.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Crystallize →";
  }
});

// ── Tree renderer ──────────────────────────────────────────────────────
function renderTree(tree, loci) {
  const container = $("#tree");
  container.classList.remove("empty");
  container.innerHTML = "";
  const map = new Map(loci.map((l) => [l.id, l]));
  container.appendChild(buildTreeNode(tree, map, 0, true));
}

function buildTreeNode(node, lociById, depth, autoOpen) {
  const wrap = document.createElement("div");
  wrap.className = "tree-node";
  const isRoot = node.name === "ROOT";
  let openState = autoOpen || depth < 2;

  if (!isRoot) {
    const head = document.createElement("div");
    head.className = `tree-node-name lvl-${depth - 1}`;
    head.textContent = (openState ? "▾ " : "▸ ") + node.name;
    head.addEventListener("click", () => {
      openState = !openState;
      head.textContent = (openState ? "▾ " : "▸ ") + node.name;
      childWrap.style.display = openState ? "" : "none";
    });
    wrap.appendChild(head);
  }

  const childWrap = document.createElement("div");
  childWrap.className = "tree-children";
  childWrap.style.display = openState ? "" : "none";

  if (node.children) {
    for (const c of node.children) childWrap.appendChild(buildTreeNode(c, lociById, depth + 1, false));
  }
  if (node.loci) {
    for (const id of node.loci) {
      const locus = lociById.get(id);
      if (!locus) continue;
      const btn = document.createElement("button");
      btn.className = "tree-locus";
      btn.textContent = locus.statement;
      btn.dataset.id = id;
      btn.addEventListener("click", () => {
        state.selectedLocusId = id;
        document.querySelectorAll(".tree-locus.selected").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
        renderInspector(locus);
      });
      childWrap.appendChild(btn);
    }
  }

  wrap.appendChild(childWrap);
  return wrap;
}

// ── Locus inspector ────────────────────────────────────────────────────
function renderInspector(locus) {
  const box = $("#inspector");
  if (!locus) {
    box.classList.add("empty");
    box.textContent = "Click a locus in the tree to inspect.";
    return;
  }
  box.classList.remove("empty");
  box.innerHTML = "";

  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Locus  ·  ${locus.id}`;
  box.appendChild(eyebrow);

  const stmt = document.createElement("div");
  stmt.className = "inspector-statement";
  stmt.textContent = locus.statement;
  box.appendChild(stmt);

  const bc = document.createElement("div");
  bc.className = "bc-row";
  locus.breadcrumb.filter(Boolean).forEach((part, i) => {
    if (i > 0) {
      const arrow = document.createElement("span");
      arrow.className = "bc-arrow";
      arrow.textContent = "›";
      bc.appendChild(arrow);
    }
    const pill = document.createElement("span");
    pill.className = `bc-pill lvl-${i}`;
    pill.textContent = part;
    bc.appendChild(pill);
  });
  box.appendChild(bc);

  const grid = document.createElement("div");
  grid.className = "kv-grid";
  const horizonClass = locus.horizon === "long" ? "green" : "yellow";
  const fields = [
    { label: "kind", value: locus.kind, c: "cyan" },
    { label: "confidence", value: locus.confidence.toFixed(2), c: "cyan2" },
    { label: "horizon", value: locus.horizon, c: horizonClass },
    { label: "decay", value: locus.decay.toFixed(2), c: "cyan" },
    { label: "lattice", value: `[${locus.lattice.join(", ")}]`, c: "yellow" },
    { label: "src offset", value: `${locus.source.offset[0]}–${locus.source.offset[1]}`, c: "orange" },
  ];
  for (const f of fields) {
    const cell = document.createElement("div");
    cell.className = `kv ${f.c}`;
    cell.innerHTML = `<div class="kv-label">${f.label}</div><div class="kv-value">${escapeHtml(String(f.value))}</div>`;
    grid.appendChild(cell);
  }
  box.appendChild(grid);
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ── Downloads ──────────────────────────────────────────────────────────
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
$("#downloadLtmi").addEventListener("click", () => {
  if (state.bundle?.artifacts?.ltmi) downloadBlob(state.bundle.artifacts.ltmi, "corpus.ltmi", "application/x-ndjson");
});
$("#downloadTraining").addEventListener("click", () => {
  if (state.bundle?.artifacts?.trainingJsonl) downloadBlob(state.bundle.artifacts.trainingJsonl, "training.jsonl", "application/x-ndjson");
});
$("#copyLtmi").addEventListener("click", async () => {
  if (state.bundle?.artifacts?.ltmi) {
    try { await navigator.clipboard.writeText(state.bundle.artifacts.ltmi); }
    catch { /* ignore */ }
  }
});

// ── Retrieve ───────────────────────────────────────────────────────────
$("#retrieveForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.bundle?.loci) return;
  const errBox = $("#retrieveError");
  errBox.classList.add("hidden");
  errBox.textContent = "";

  const query = $("#query").value.trim();
  if (!query) return;

  try {
    const res = await fetch("/api/ltmi-xt/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        bundle: { manifest: state.bundle.manifest, loci: state.bundle.loci },
        k: 6,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    renderResults(data);
  } catch (e) {
    errBox.textContent = e.message;
    errBox.classList.remove("hidden");
  }
});

function renderResults(data) {
  const container = $("#results");
  container.innerHTML = "";

  if (data.queryBreadcrumb) {
    const head = document.createElement("div");
    head.className = "kv";
    const path = data.queryBreadcrumb.filter(Boolean).map(escapeHtml).join(' <span class="bc-arrow">›</span> ');
    head.innerHTML = `<div class="kv-label">query breadcrumb</div><div class="kv-value">${path}${data.queryCell ? `  <span style="color:#FFD93D">[${data.queryCell.join(",")}]</span>` : ""}</div>`;
    container.appendChild(head);
  }

  if (!data.results || data.results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "result";
    empty.textContent = "No loci matched within the default lattice radius.";
    container.appendChild(empty);
    return;
  }

  data.results.forEach((r, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "result";
    const path = r.breadcrumb.filter(Boolean).map(escapeHtml).join(' <span class="bc-arrow">›</span> ');
    card.innerHTML = `
      <div class="result-head">
        <span class="result-rank">#${i + 1}</span>
        <span class="result-meta"><span>score ${r.score.toFixed(2)}</span><span>d=${r.latticeDistance}</span><span>px=${r.prefixDepth}</span></span>
      </div>
      <div class="result-statement">${escapeHtml(r.statement)}</div>
      <div class="result-bc">${path}</div>
    `;
    card.addEventListener("click", () => {
      state.selectedLocusId = r.id;
      const locus = state.bundle.loci.find((l) => l.id === r.id);
      if (locus) renderInspector(locus);
      // mirror selection in tree
      document.querySelectorAll(".tree-locus.selected").forEach((el) => el.classList.remove("selected"));
      const t = document.querySelector(`.tree-locus[data-id="${r.id}"]`);
      if (t) { t.classList.add("selected"); t.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    });
    container.appendChild(card);
  });
}

// boot
checkProvider();
