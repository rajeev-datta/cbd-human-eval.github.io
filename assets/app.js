// assets/app.js

// === CONFIG ===
// If images are stored in the repo, keep IMAGE_BASE_URL = "".
// If images are on a remote server, set e.g. "https://your-server.example.com/".
const IMAGE_BASE_URL = "";

// Descriptor JSON location and naming convention.
// species key in manifest is expected underscore+lowercase, and descriptor file matches that name.
const DESCRIPTOR_DIR = "site_descriptors";
const DATA_DIR = "data";

const state = {
  items: [],                 // from images_index.json
  classToSpecies: {},        // from class_to_species.json
  idx: 0,
  cacheDescriptors: new Map() // species -> array of strings
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
  if (Array.isArray(obj)) return obj.map(String);

  for (const k of ["descriptors", "attributes", "captions", "descriptor_list"]) {
    if (Array.isArray(obj?.[k])) return obj[k].map(String);
  }

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

  const out = uniq(data.map(s => String(s).trim()).filter(Boolean));
  state.cacheDescriptors.set(species, out);
  return out;
}

function clampIdx(){
  if (state.items.length === 0) state.idx = 0;
  if (state.idx < 0) state.idx = state.items.length - 1;
  if (state.idx >= state.items.length) state.idx = 0;
}

// Google Sheets style column labels: A..Z, AA..AZ, BA...
function toColLabel(n0){
  // n0 is 0-based
  let n = n0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function setBigTitle(item){
  const titleEl = el("bigTitle");
  const path = item.image_path || "";
  titleEl.textContent = `Image ${state.idx + 1} / ${state.items.length} — ${path}`;
}

function setMetaText(item){
  const speciesPretty = (item.species || "").replaceAll("_", " ");
  el("meta").textContent = speciesPretty ? `Species: ${speciesPretty}` : "";
}

function setImage(item){
  const img = el("mainImg");
  img.src = IMAGE_BASE_URL + item.image_path;
}

function renderNumButtons(){
  const wrap = el("numstrip");
  wrap.innerHTML = "";

  const total = state.items.length;

  for (let i = 0; i < total; i++){
    const b = document.createElement("button");
    b.className = "numBtn" + (i === state.idx ? " active" : "");
    b.textContent = String(i + 1);
    b.title = `Jump to image ${i + 1}`;
    b.onclick = () => { state.idx = i; render(); };
    wrap.appendChild(b);
  }

  const active = wrap.querySelector(".numBtn.active");
  if (active){
    active.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
  }
}

function renderDescriptorList(listEl, descs){
  listEl.innerHTML = "";

  if (!descs || descs.length === 0){
    const li = document.createElement("li");
    li.className = "descRow empty";
    li.textContent = "No descriptors found.";
    listEl.appendChild(li);
    return;
  }

  for (let i = 0; i < descs.length; i++){
    const li = document.createElement("li");
    li.className = "descRow";

    const badge = document.createElement("span");
    badge.className = "descBadge";
    badge.textContent = toColLabel(i);

    const txt = document.createElement("span");
    txt.className = "descText";
    txt.textContent = descs[i];

    li.appendChild(badge);
    li.appendChild(txt);
    listEl.appendChild(li);
  }
}

async function renderDescriptors(item){
  const species = item.species;
  const myDesc = await loadDescriptorsForSpecies(species);
  renderDescriptorList(el("speciesList"), myDesc);
}

async function render(){
  clampIdx();
  const item = state.items[state.idx];
  if (!item) return;

  setBigTitle(item);
  setMetaText(item);
  setImage(item);
  renderNumButtons();
  await renderDescriptors(item);
}

function setupControls(){
  el("prevBtn").onclick = () => { state.idx--; render(); };
  el("nextBtn").onclick = () => { state.idx++; render(); };

  // el("shuffleBtn").onclick = () => {
  //   for (let i = state.items.length - 1; i > 0; i--){
  //     const j = Math.floor(Math.random() * (i + 1));
  //     [state.items[i], state.items[j]] = [state.items[j], state.items[i]];
  //   }
  //   state.idx = 0;
  //   render();
  // };

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { state.idx--; render(); }
    else if (e.key === "ArrowRight") { state.idx++; render(); }
  });
}

async function main(){
  setupControls();

  state.items = await fetchJson(`${DATA_DIR}/images_index.json`);
  state.classToSpecies = await fetchJson(`${DATA_DIR}/class_to_species.json`);

  // keep only valid
  state.items = state.items.filter(x => x.image_path && x.species);

  await render();
}

main().catch(err => {
  console.error(err);
  el("meta").textContent = `Error: ${err.message}`;
});