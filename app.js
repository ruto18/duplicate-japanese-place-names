const DATA = window.PLACE_DATA || [];
const PREFECTURES = window.PREFECTURES || [];
const PREF_BY_NAME = new Map(PREFECTURES.map((pref) => [pref.name, pref]));
const PREF_BY_CODE = new Map(PREFECTURES.map((pref) => [pref.code, pref]));

const tileLayout = [
  ["北海道", 450, 20, 126, 64],
  ["青森県", 412, 112, 92, 42], ["秋田県", 360, 170, 74, 42], ["岩手県", 444, 170, 74, 42],
  ["山形県", 360, 224, 74, 42], ["宮城県", 444, 224, 74, 42], ["福島県", 414, 284, 90, 42],
  ["新潟県", 310, 320, 74, 42], ["富山県", 236, 362, 74, 42], ["石川県", 162, 382, 74, 42],
  ["福井県", 162, 436, 74, 42], ["長野県", 300, 388, 74, 42], ["山梨県", 344, 444, 74, 42],
  ["岐阜県", 238, 446, 74, 42], ["静岡県", 316, 506, 90, 42], ["愛知県", 238, 508, 74, 42],
  ["茨城県", 466, 360, 74, 42], ["栃木県", 392, 352, 74, 42], ["群馬県", 318, 352, 74, 42],
  ["埼玉県", 390, 410, 74, 42], ["千葉県", 474, 430, 74, 42], ["東京都", 394, 466, 74, 42],
  ["神奈川県", 394, 520, 90, 42],
  ["滋賀県", 176, 492, 62, 42], ["京都府", 108, 492, 62, 42], ["大阪府", 112, 548, 62, 42],
  ["兵庫県", 40, 514, 74, 42], ["奈良県", 178, 548, 62, 42], ["三重県", 244, 562, 62, 42],
  ["和歌山県", 148, 610, 86, 42],
  ["鳥取県", 88, 438, 74, 42], ["島根県", 14, 458, 74, 42], ["岡山県", 86, 492, 74, 42],
  ["広島県", 12, 522, 74, 42], ["山口県", 12, 580, 74, 42],
  ["香川県", 126, 626, 62, 40], ["徳島県", 194, 642, 62, 40], ["愛媛県", 58, 662, 74, 40],
  ["高知県", 130, 696, 86, 40],
  ["福岡県", 20, 650, 74, 42], ["佐賀県", 0, 706, 62, 42], ["長崎県", 0, 760, 62, 42],
  ["熊本県", 70, 724, 74, 42], ["大分県", 146, 696, 74, 42], ["宮崎県", 84, 780, 74, 42],
  ["鹿児島県", 24, 836, 92, 42], ["沖縄県", 210, 834, 74, 42],
];

const els = {
  selectedName: document.querySelector("#selectedName"),
  selectedReading: document.querySelector("#selectedReading"),
  prefCount: document.querySelector("#prefCount"),
  locationCount: document.querySelector("#locationCount"),
  geoChart: document.querySelector("#geoChart"),
  mapFallback: document.querySelector("#mapFallback"),
  prefChips: document.querySelector("#prefChips"),
  meaningText: document.querySelector("#meaningText"),
  locationList: document.querySelector("#locationList"),
  wordLink: document.querySelector("#wordLink"),
  literatureLink: document.querySelector("#literatureLink"),
  postalLink: document.querySelector("#postalLink"),
  searchInput: document.querySelector("#searchInput"),
  resultCount: document.querySelector("#resultCount"),
  totalCount: document.querySelector("#totalCount"),
  rangeSelect: document.querySelector("#rangeSelect"),
  placeList: document.querySelector("#placeList"),
};

let currentRecord = null;
let geoChart = null;
let geoReady = false;
let activeButton = null;
let currentRangeIndex = 0;
const RANGE_SIZE = 300;

function normalize(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function splitLocations(record) {
  if (!record?.locations) return [];
  return record.locations.split("、").filter(Boolean);
}

function selectedPrefCodes(record) {
  return new Set((record?.prefs || []).map((name) => PREF_BY_NAME.get(name)?.code).filter(Boolean));
}

function buildFallbackMap() {
  const groups = tileLayout
    .map(([name, x, y, width, height]) => {
      const code = PREF_BY_NAME.get(name)?.code || "";
      return `
        <g class="pref-tile" data-pref="${name}" data-code="${code}" transform="translate(${x} ${y})">
          <rect width="${width}" height="${height}" rx="3"></rect>
          <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle">${name.replace(/[都道府県]/g, "")}</text>
        </g>`;
    })
    .join("");

  els.mapFallback.innerHTML = `
    <svg viewBox="-12 0 620 900" role="img" aria-label="日本地図">
      <path d="M520 88 C508 106 486 111 454 104" fill="none" stroke="#bfd0df" stroke-width="5" stroke-linecap="round"></path>
      <path d="M438 154 C456 214 454 272 424 328 C386 400 328 462 256 516 C198 560 126 584 72 632 C30 668 28 738 62 814" fill="none" stroke="#bfd0df" stroke-width="5" stroke-linecap="round"></path>
      ${groups}
    </svg>`;
}

function updateFallbackMap(record) {
  const selected = new Set(record?.prefs || []);
  els.mapFallback.querySelectorAll(".pref-tile").forEach((tile) => {
    tile.classList.toggle("is-hit", selected.has(tile.dataset.pref));
  });
}

function drawGeoChart() {
  updateFallbackMap(currentRecord);
  if (!geoReady || !geoChart || !currentRecord) return;

  const selected = selectedPrefCodes(currentRecord);
  const rows = [
    ["都道府県", "該当", { role: "tooltip", type: "string" }],
    ...PREFECTURES.map((pref) => [
      pref.code,
      selected.has(pref.code) ? 1 : 0,
      `${pref.name}: ${selected.has(pref.code) ? currentRecord.name : ""}`,
    ]),
  ];
  const data = google.visualization.arrayToDataTable(rows);
  const options = {
    region: "JP",
    resolution: "provinces",
    displayMode: "regions",
    backgroundColor: "transparent",
    datalessRegionColor: "#edf2f7",
    defaultColor: "#edf2f7",
    colorAxis: { minValue: 0, maxValue: 1, colors: ["#e8edf2", "#d92335"] },
    legend: "none",
    keepAspectRatio: true,
    tooltip: { textStyle: { fontName: "system-ui", fontSize: 12 } },
  };
  try {
    els.geoChart.classList.add("is-visible");
    geoChart.draw(data, options);
    els.mapFallback.classList.remove("is-visible");
    window.setTimeout(() => {
      const pathCount = els.geoChart.querySelectorAll("svg path").length;
      if (pathCount < 20) {
        els.geoChart.classList.remove("is-visible");
        els.mapFallback.classList.add("is-visible");
      }
    }, 300);
  } catch (error) {
    els.geoChart.classList.remove("is-visible");
    els.mapFallback.classList.add("is-visible");
    console.warn("Google GeoChart failed; using local fallback map.", error);
  }
}

function initGeoChart() {
  buildFallbackMap();
  els.mapFallback.classList.add("is-visible");

  if (!window.google?.charts) return;

  google.charts.load("current", { packages: ["geochart"] });
  google.charts.setOnLoadCallback(() => {
    geoReady = true;
    geoChart = new google.visualization.GeoChart(els.geoChart);
    drawGeoChart();
  });
}

function setLink(anchor, href) {
  anchor.href = href || "#";
  anchor.toggleAttribute("aria-disabled", !href);
}

function renderDetails(record) {
  els.selectedName.textContent = record.name;
  els.selectedReading.textContent = record.reading || "";
  els.prefCount.textContent = formatNumber(record.prefCount || record.prefs.length);
  els.locationCount.textContent = formatNumber(record.locationCount);
  els.meaningText.textContent = record.meaning || "";

  els.prefChips.innerHTML = record.prefs
    .map((pref) => `<span class="pref-chip">${escapeHtml(pref)}</span>`)
    .join("");

  const locations = splitLocations(record);
  els.locationList.innerHTML = locations
    .map((location) => `<span class="location-pill">${escapeHtml(location)}</span>`)
    .join("");

  setLink(els.wordLink, record.urls?.word);
  setLink(els.literatureLink, record.urls?.literature);
  setLink(els.postalLink, record.urls?.postal);
}

function setActiveButton(id) {
  if (activeButton) activeButton.classList.remove("is-active");
  activeButton = els.placeList.querySelector(`[data-id="${id}"]`);
  if (activeButton) activeButton.classList.add("is-active");
}

function selectRecord(record, scrollIntoView = false) {
  currentRecord = record;
  renderDetails(record);
  setActiveButton(record.id);
  drawGeoChart();
  if (scrollIntoView && activeButton) {
    activeButton.scrollIntoView({ block: "nearest" });
  }
}

function placeItem(record) {
  return `
    <button class="place-item${currentRecord?.id === record.id ? " is-active" : ""}" type="button" data-id="${record.id}">
      <span>
        <span class="place-name">${escapeHtml(record.name)}</span>
        <span class="place-reading">${escapeHtml(record.reading)}</span>
      </span>
      <span class="place-count">${formatNumber(record.locationCount)}</span>
    </button>`;
}

function searchRank(record, query) {
  if (!query) return 0;
  const name = normalize(record.name);
  const reading = normalize(record.reading);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (reading === query) return 2;
  if (reading.startsWith(query)) return 3;
  return 4;
}

function renderRangeOptions(total) {
  const pageCount = Math.max(1, Math.ceil(total / RANGE_SIZE));
  if (currentRangeIndex >= pageCount) currentRangeIndex = 0;

  const options = Array.from({ length: pageCount }, (_, index) => {
    const start = index * RANGE_SIZE + 1;
    const end = Math.min((index + 1) * RANGE_SIZE, total);
    const label = total ? `${formatNumber(start)}-${formatNumber(end)}` : "0件";
    return `<option value="${index}">${label}</option>`;
  }).join("");

  els.rangeSelect.innerHTML = options;
  els.rangeSelect.value = String(currentRangeIndex);
  els.rangeSelect.disabled = pageCount <= 1;
}

function renderList() {
  const query = normalize(els.searchInput.value);
  const matches = query
    ? DATA.filter((record) => normalize(`${record.name} ${record.reading}`).includes(query))
    : DATA;
  const orderedMatches = query
    ? matches.slice().sort((a, b) => searchRank(a, query) - searchRank(b, query) || a.id - b.id)
    : matches;
  renderRangeOptions(orderedMatches.length);

  const start = currentRangeIndex * RANGE_SIZE;
  const visibleMatches = orderedMatches.slice(start, start + RANGE_SIZE);

  els.resultCount.textContent = `${formatNumber(orderedMatches.length)}件`;
  els.totalCount.textContent = `${formatNumber(DATA.length)}件中`;

  if (!orderedMatches.length) {
    els.placeList.innerHTML = `<p class="empty-state">該当なし</p>`;
    activeButton = null;
    return;
  }

  els.placeList.innerHTML = visibleMatches.map(placeItem).join("");
  setActiveButton(currentRecord?.id);
}

function bindEvents() {
  els.placeList.addEventListener("click", (event) => {
    const button = event.target.closest(".place-item");
    if (!button) return;
    const record = DATA[Number(button.dataset.id)];
    if (record) selectRecord(record);
  });

  els.searchInput.addEventListener("input", () => {
    currentRangeIndex = 0;
    els.placeList.scrollTop = 0;
    renderList();
  });

  els.rangeSelect.addEventListener("change", () => {
    currentRangeIndex = Number(els.rangeSelect.value) || 0;
    els.placeList.scrollTop = 0;
    renderList();
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(window.__mapResizeTimer);
    window.__mapResizeTimer = window.setTimeout(drawGeoChart, 120);
  });
}

function boot() {
  initGeoChart();
  bindEvents();
  renderList();
  if (DATA.length) selectRecord(DATA[0], true);
}

boot();
