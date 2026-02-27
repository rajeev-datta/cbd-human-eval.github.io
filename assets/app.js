// assets/app.js

// === CONFIG ===
// If images are stored in the repo, keep IMAGE_BASE_URL = "".
// If images are on a remote server, set e.g. "https://your-server.example.com/" (must allow CORS).
const IMAGE_BASE_URL = ""; // or "https://.../"

// Descriptor JSON location and naming convention.
// species key in manifest is expected underscore+lowercase, and descriptor file matches that name.
const DESCRIPTOR_DIR = "descriptors"; // "./descriptors"
const DATA_DIR = "data";

const state = {
  items: [],              // from images_index.json
  classToSpecies: {},     // from class_to_species.json
  idx: 0,
  btnPage: 0,             // pages of 9 buttons
  cacheDescriptors: new Map(), // species -> array of strings
};

function el(id){ return document.getElementById(id); }

async function fetchJson(path){
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
  return await r.json();
}

function uniq(arr){
  return Array.from(new Set(arr));
}

function normalizeDescriptorList(obj){
  // Be permissive: support several common shapes.
  // 1) ["a","b"]
  // 2) {descriptors:[...]}
  // 3) {attributes:[...]} or {captions:[...]} etc.
  if (Array.isArray(obj)) return obj.map(String);

  for (const k of ["descriptors", "attributes", "captions", "descriptor_list"]) {
    if (Array.isArray(obj?.[k])) return obj[k].map(String);
  }

  // If it's a dict of id->string, take values
  if (obj && typeof obj === "object") {
    const vals = Object.values(obj);
    if (vals.every(v => typeof v === "string")) return vals;
  }

  return [];
}

async function loadDescriptorsForSpecies(species){
  if (state.cacheDescriptors.has(species)) return state.cacheDescriptors.get(species);

  const path = `${DESCRIPTOR_DIR}/${species}.json`;
  let data = [];
  try {
    const obj = await fetchJson(path);
    data = normalizeDescriptorList(obj);
  } catch (e) {
    console.warn(`Descriptor load failed for ${species}:`, e);
    data = [];
  }

  // de-dupe and keep stable order
  const out = uniq(data.map(s => s.trim()).filter(Boolean));
  state.cacheDescriptors.set(species, out);
  return out;
}

function findClassForSpecies(species){
  // class_to_species.json expected shape:
  // { "0": ["eurya_chinensis", ...], "1": [...], ... }
  for (const [cls, speciesList] of Object.entries(state.classToSpecies)) {
    if (Array.isArray(speciesList) && speciesList.includes(species)) return cls;
  }
  return null;
}

function setMetaText(item){
  const speciesPretty = item.species.replaceAll("_", " ");
  el("meta").textContent = `${state.idx + 1} / ${state.items.length} • ${speciesPretty}`;
}

function renderNumButtons(){
  const wrap = el("numstrip");
  wrap.innerHTML = "";

  const start = state.btnPage * 9;
  const end = Math.min(start + 9, state.items.length);

  for (let i = start; i < end; i++){
    const b = document.createElement("button");
    b.className = "nbtn" + (i === state.idx ? " active" : "");
    b.textContent = String((i - start) + 1); // 1..9
    b.title = `Jump to item ${i + 1}`;
    b.onclick = () => { state.idx = i; render(); };
    wrap.appendChild(b);
  }

  // Add "0" button to advance page (or wrap around)
  const adv = document.createElement("button");
  adv.className = "nbtn";
  adv.textContent = "0";
  adv.title = "Next button page";
  adv.onclick = () => {
    const maxPage = Math.floor((state.items.length - 1) / 9);
    state.btnPage = (state.btnPage + 1) > maxPage ? 0 : (state.btnPage + 1);
    renderNumButtons();
  };
  wrap.appendChild(adv);
}

function setImage(item){
  const img = el("mainImg");
  img.src = IMAGE_BASE_URL + item.image_path;
}

function renderList(listEl, items){
  listEl.innerHTML = "";
  for (const s of items){
    const li = document.createElement("li");
    li.textContent = s;
    listEl.appendChild(li);
  }
  if (items.length === 0){
    const li = document.createElement("li");
    li.innerHTML = `<span style="opacity:.8">No descriptors found.</span>`;
    listEl.appendChild(li);
  }
}

async function renderDescriptors(item){
  const species = item.species;
  const cls = item.class_name;
  const otherSpecies = (cls && state.classToSpecies[cls]) ? state.classToSpecies[cls].filter(s => s !== item.species) : [];

  const myDesc = await loadDescriptorsForSpecies(species);

  // Union descriptors from other species in class
  let classDesc = [];
  if (otherSpecies.length > 0){
    const all = await Promise.all(otherSpecies.map(loadDescriptorsForSpecies));
    classDesc = uniq(all.flat());
  }

  // Often you want “other class descriptors” to exclude descriptors already in this species list:
  const otherOnly = classDesc.filter(d => !new Set(myDesc).has(d));

  renderList(el("speciesList"), myDesc);
  renderList(el("classList"), otherOnly);
}

function clampIdx(){
  if (state.items.length === 0) state.idx = 0;
  if (state.idx < 0) state.idx = state.items.length - 1;
  if (state.idx >= state.items.length) state.idx = 0;
}

async function render(){
  clampIdx();
  const item = state.items[state.idx];
  if (!item) return;

  // keep button page aligned to current idx
  state.btnPage = Math.floor(state.idx / 9);

  setMetaText(item);
  setImage(item);
  renderNumButtons();
  await renderDescriptors(item);
}

function setupControls(){
  el("prevBtn").onclick = () => { state.idx--; render(); };
  el("nextBtn").onclick = () => { state.idx++; render(); };
  el("shuffleBtn").onclick = () => {
    // Fisher–Yates shuffle
    for (let i = state.items.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [state.items[i], state.items[j]] = [state.items[j], state.items[i]];
    }
    state.idx = 0;
    state.btnPage = 0;
    render();
  };

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { state.idx--; render(); }
    else if (e.key === "ArrowRight") { state.idx++; render(); }
    else if (e.key >= "1" && e.key <= "9") {
      const offset = parseInt(e.key, 10) - 1;
      const i = state.btnPage * 9 + offset;
      if (i < state.items.length) { state.idx = i; render(); }
    } else if (e.key === "0") {
      const maxPage = Math.floor((state.items.length - 1) / 9);
      state.btnPage = (state.btnPage + 1) > maxPage ? 0 : (state.btnPage + 1);
      renderNumButtons();
    }
  });
}

async function main(){
  setupControls();

  // Load core data
  state.items = await fetchJson(`${DATA_DIR}/images_index.json`);
  state.classToSpecies = await fetchJson(`${DATA_DIR}/class_to_species.json`);

  // Make sure each manifest item has species
  state.items = state.items.filter(x => x.image_path && x.species);

  await render();
}

main().catch(err => {
  console.error(err);
  el("meta").textContent = `Error: ${err.message}`;
});