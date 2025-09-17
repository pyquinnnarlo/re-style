// Live Style Editor with Save/Load/Share support
(function () {
  if (window.__liveStyleEditorInjected) return;
  window.__liveStyleEditorInjected = true;

  const STORAGE_KEY = "__lse_styles";

  // ---------------- Panel + Styles ----------------
  const STYLE_ID = "__live_style_editor_style";
  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    #__lse_panel { position: fixed; right: 12px; top: 12px; width: 360px; max-height: 80vh; z-index: 2147483647; background: rgba(255,255,255,0.98); box-shadow: 0 8px 30px rgba(0,0,0,0.25); border-radius: 8px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #111; overflow: hidden; display:flex; flex-direction:column; }
    #__lse_panel header { display:flex; align-items:center; gap:8px; padding:8px 10px; background: rgba(0,0,0,0.04); }
    #__lse_panel header h3 { margin:0; font-size:14px; font-weight:600; }
    #__lse_panel .controls { display:flex; gap:6px; margin-left:auto; }
    #__lse_panel .controls button { padding:6px 8px; font-size:12px; border-radius:6px; border:1px solid rgba(0,0,0,0.08); background:white; cursor:pointer; }
    #__lse_panel .body { padding:8px; display:flex; gap:8px; flex-direction:column; overflow:auto; }
    #__lse_panel label { font-size:12px; margin-bottom:4px; }
    #__lse_panel textarea { width:100%; min-height:80px; font-family: monospace; font-size:12px; border-radius:6px; padding:8px; border:1px solid rgba(0,0,0,0.08); }
    #__lse_panel .footer { padding:8px; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap; background: rgba(0,0,0,0.02); }
    #__lse_highlight { position: absolute; pointer-events: none; z-index:2147483646; border: 2px dashed #fca311; background: rgba(246, 195, 0, 0.06); border-radius:4px; }
  `;
  document.head.appendChild(styleEl);

  const panel = document.createElement("div");
  panel.id = "__lse_panel";
  panel.innerHTML = `
    <header>
      <h3>Live Style Editor</h3>
      <div class="controls">
        <button id="__lse_select">Select</button>
        <button id="__lse_toggle_html">HTML</button>
        <button id="__lse_close">Close</button>
      </div>
    </header>
    <div class="body">
      <div id="__lse_info"><small>Click "Select" then any element. Esc to cancel.</small></div>
      <div id="__lse_fields" style="display:none;">
        <label for="__lse_css">Inline CSS</label>
        <textarea id="__lse_css" placeholder="color: red; background: yellow;"></textarea>
        <label for="__lse_html">HTML</label>
        <textarea id="__lse_html"></textarea>
      </div>
    </div>
    <div class="footer">
      <button id="__lse_apply">Apply</button>
      <button id="__lse_reset">Reset</button>
      <button id="__lse_save_local">Save Styles</button>
      <button id="__lse_load_local">Load Styles</button>
      <button id="__lse_export">Export</button>
      <button id="__lse_import">Import</button>
    </div>
  `;
  document.body.appendChild(panel);

  const highlight = document.createElement("div");
  highlight.id = "__lse_highlight";
  document.body.appendChild(highlight);

  let selecting = false, hoveredEl = null, selectedEl = null;
  let originalStyle = null, originalHTML = null;

  // ---------------- Helpers ----------------
  function pageKey() {
    return location.hostname + location.pathname;
  }

  async function savePageStyles(el) {
    const key = pageKey();
    const entry = { selector: getUniqueSelector(el), css: el.getAttribute("style") || "" };
    const all = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
    all[key] = all[key] || [];
    // replace or push
    const idx = all[key].findIndex(e => e.selector === entry.selector);
    if (idx >= 0) all[key][idx] = entry;
    else all[key].push(entry);
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
    alert("Styles saved for this page.");
  }

  async function loadPageStyles() {
    const key = pageKey();
    const all = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
    if (!all[key]) return alert("No saved styles for this page.");
    all[key].forEach(({ selector, css }) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute("style", css);
    });
    alert("Styles applied from saved data.");
  }

  function getUniqueSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.className) return el.tagName.toLowerCase() + "." + el.className.trim().split(/\s+/).join(".");
    return el.tagName.toLowerCase();
  }

  // ---------------- Selection ----------------
  function updateHighlight(rect) {
    if (!rect) { highlight.style.display = "none"; return; }
    highlight.style.display = "block";
    highlight.style.left = rect.left + "px";
    highlight.style.top = rect.top + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
  }
  function onMouseMove(e) {
    if (!selecting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || panel.contains(el) || el === highlight) return;
    hoveredEl = el;
    updateHighlight(el.getBoundingClientRect());
  }
  function onClickSelect(e) {
    if (!selecting) return;
    e.preventDefault(); e.stopPropagation();
    finishSelection(hoveredEl || document.elementFromPoint(e.clientX, e.clientY));
  }
  function finishSelection(el) {
    selecting = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClickSelect, true);
    document.removeEventListener("keydown", onKeyDown, true);
    updateHighlight(null);
    if (!el) return;
    selectedEl = el;
    originalStyle = el.getAttribute("style") || "";
    originalHTML = el.innerHTML;
    panel.querySelector("#__lse_info").textContent = "Selected: " + getUniqueSelector(el);
    panel.querySelector("#__lse_css").value = originalStyle;
    panel.querySelector("#__lse_html").value = originalHTML;
    panel.querySelector("#__lse_fields").style.display = "block";
  }
  function onKeyDown(e) {
    if (e.key === "Escape") {
      selecting = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClickSelect, true);
      document.removeEventListener("keydown", onKeyDown, true);
      updateHighlight(null);
    }
  }

  // ---------------- Controls ----------------
  panel.querySelector("#__lse_select").onclick = () => {
    selecting = true;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClickSelect, true);
    document.addEventListener("keydown", onKeyDown, true);
  };
  panel.querySelector("#__lse_close").onclick = cleanup;
  panel.querySelector("#__lse_toggle_html").onclick = () => {
    const f = panel.querySelector("#__lse_fields");
    f.style.display = (f.style.display === "none" ? "block" : "none");
  };
  panel.querySelector("#__lse_apply").onclick = () => {
    if (!selectedEl) return alert("No element selected");
    selectedEl.setAttribute("style", panel.querySelector("#__lse_css").value);
    selectedEl.innerHTML = panel.querySelector("#__lse_html").value;
  };
  panel.querySelector("#__lse_reset").onclick = () => {
    if (!selectedEl) return;
    selectedEl.setAttribute("style", originalStyle);
    selectedEl.innerHTML = originalHTML;
  };
  panel.querySelector("#__lse_save_local").onclick = () => {
    if (!selectedEl) return alert("Select an element first");
    savePageStyles(selectedEl);
  };
  panel.querySelector("#__lse_load_local").onclick = () => loadPageStyles();
  panel.querySelector("#__lse_export").onclick = async () => {
    const all = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
    const data = JSON.stringify(all, null, 2);
    await navigator.clipboard.writeText(data);
    alert("All saved styles copied to clipboard. Share or backup this JSON.");
  };
  panel.querySelector("#__lse_import").onclick = async () => {
    const data = prompt("Paste previously exported JSON:");
    if (!data) return;
    try {
      const obj = JSON.parse(data);
      await chrome.storage.local.set({ [STORAGE_KEY]: obj });
      alert("Imported styles saved.");
    } catch (e) {
      alert("Invalid JSON");
    }
  };

  function cleanup() {
    panel.remove(); highlight.remove(); styleEl.remove();
    window.__liveStyleEditorInjected = false;
  }

  // ---------------- Auto-apply on page load ----------------
  (async () => {
    const key = pageKey();
    const all = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
    if (all[key]) {
      all[key].forEach(({ selector, css }) => {
        const el = document.querySelector(selector);
        if (el) el.setAttribute("style", css);
      });
    }
  })();

  // draggable
  (function makeDraggable(el) {
    const header = el.querySelector("header");
    let isDown = false, startX, startY, startLeft, startTop;
    header.style.cursor = "grab";
    header.onmousedown = e => {
      isDown = true; startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect(); startLeft = rect.left; startTop = rect.top;
      header.style.cursor = "grabbing"; e.preventDefault();
    };
    window.onmousemove = e => {
      if (!isDown) return;
      el.style.left = (startLeft + (e.clientX - startX)) + "px";
      el.style.top = (startTop + (e.clientY - startY)) + "px";
      el.style.right = "auto";
    };
    window.onmouseup = () => { isDown = false; header.style.cursor = "grab"; };
  })(panel);

})();
