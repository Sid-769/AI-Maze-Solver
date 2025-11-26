
// ====================== DOM & CANVAS STATE ======================
const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

// Application state (global-ish so UI handlers and draw routines can access)
let GRID = [];                // current maze grid (2D array)
let PATH = [];                // current solution path (array of [r,c])
let START_POS = null;         // [r,c]
let GOAL_POS = null;          // [r,c]

// Visual / interaction state
let animId = 0;               // animation generation id (cancellation)
let isAnimating = false;
let heatmapMode = "f";        // 'f' | 'g' | 'h'
let explorationSteps = [];    // steps (for A* exploration timeline)
let explorationScores = [];   // scores (for heatmap: f,g,h)
let scoreMap = {};            // quick lookup { "r,c": {f,g,h} }
let lastHoverCell = null;

// ====================== CONSTANTS / UTILITIES ======================
const MAX_CANVAS_PIXELS = 1000;

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function toKey(r, c) { return `${r},${c}`; }
function fromKey(key) { return key.split(",").map(Number); }

function computeCellSize(rows, cols) {
    return Math.floor(MAX_CANVAS_PIXELS / Math.max(rows, cols));
}

// color helpers
function hexToRgb(hex) {
    hex = (hex||"").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
function lerpColor(a, b, t) {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

// small safe formatter
function safeFixed(v, digits=2) {
    return (typeof v === "number" && isFinite(v)) ? v.toFixed(digits) : "n/a";
}

// ====================== UI METRICS (reset/show/hide) ======================
// Shared metrics (common)
function resetSharedMetrics() {
    el("nodesVisited").innerText = 0;
    el("pathLength").innerText = 0;
    el("executionTime").innerText = 0;
}

// A* metrics
function resetAStarMetrics() {
    el("pathCost").innerText = 0;
    el("pathTurns").innerText = 0;
    el("manhattanPath").innerText = 0;
    el("nodesPruned").innerText = 0;
    el("optimalityRatio").innerText = 0;
    el("pathSmoothness").innerText = 0;
    el("maxOpenSetSize").innerText = 0;
    el("avgF").innerText = 0;
    el("avgG").innerText = 0;
    el("avgH").innerText = 0;
}
function showAStarMetrics() { resetAStarMetrics(); q("#astarMetrics").classList.remove("hidden"); updateHeatPreview(); }
function hideAStarMetrics() { q("#astarMetrics").classList.add("hidden"); updateHeatPreview(); }

// MDP metrics
function resetMDPMetrics() {
    el("mdpPathLength").innerText = 0;
    el("mdpPathTurns").innerText = 0;
    el("mdpTotalReward").innerText = 0;
    el("mdpAvgStepCost").innerText = 0;
    el("mdpSlips").innerText = 0;
    el("mdpFailedMoves").innerText = 0;
    el("mdpMaxValue").innerText = 0;
    el("mdpMinValue").innerText = 0;
    el("mdpAvgValue").innerText = 0;
    el("mdpCompTime").innerText = 0;
    el("mdpManhattan").innerText = 0;
    el("mdpOptimality").innerText = 0;
}
function showMDPMetrics() { resetMDPMetrics(); q("#mdpMetrics").classList.remove("hidden"); }
function hideMDPMetrics() { q("#mdpMetrics").classList.add("hidden"); }
function resetBFSMetrics() {
    el("bfsNodesVisited").innerText = 0;
    el("bfsPathLength").innerText = 0;
    el("bfsPathTurns").innerText = 0;
    el("bfsManhattan").innerText = 0;
    el("bfsOptimalityRatio").innerText = 0;
    el("bfsMaxQueueSize").innerText = 0;
}
function hideBFSMetrics() {q("#bfsMetrics").classList.add("hidden");}

// tiny DOM helpers
function q(sel) { return document.querySelector(sel); }
function el(id) { return document.getElementById(id); }

// ====================== HEATMAP (A* exploration) ======================
// update the little legend preview for chosen heatmap mode
function updateHeatPreview() {
    const preview = el("heatPreview");
    const lowBox = el("heatLow");
    const highBox = el("heatHigh");
    const lowLabel = el("heatLowLabel");
    if (!preview) return;

    if (heatmapMode === "f") {
        preview.style.background = "linear-gradient(90deg,#2b83ba 0%,#7fc97f 35%,#ffd92f 70%,#f03b20 100%)";
        lowBox.style.background = "#2b83ba";
        highBox.style.background = "#f03b20";
        lowLabel.innerText = "Low f (preferred)";
    } else if (heatmapMode === "g") {
        preview.style.background = "linear-gradient(90deg,#008080 0%,#ffa500 50%,#ff00ff 100%)";
        lowBox.style.background = "#008080";
        highBox.style.background = "#ff00ff";
        lowLabel.innerText = "Low g (near start)";
    } else {
        preview.style.background = "linear-gradient(90deg,#7a45a6 0%,#ff99cc 60%,#ffffff 100%)";
        lowBox.style.background = "#7a45a6";
        highBox.style.background = "#ffffff";
        lowLabel.innerText = "Low h (near goal)";
    }
}

// draw a single heatmap cell (used for both A* exploration and MDP value heatmap)
function drawHeatmapCell(r, c, valueNorm) {
    // keep start/goal colors fixed
    if (START_POS && r === START_POS[0] && c === START_POS[1]) {
        ctx.fillStyle = "blue"; // start
    } else if (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1]) {
        ctx.fillStyle = "red";  // goal
    } else {
        let color;
        if (heatmapMode === "f") {
            if (valueNorm < 0.33) color = lerpColor("#2b83ba", "#7fc97f", valueNorm / 0.33);
            else if (valueNorm < 0.66) color = lerpColor("#7fc97f", "#ffd92f", (valueNorm - 0.33) / 0.33);
            else color = lerpColor("#ffd92f", "#f03b20", (valueNorm - 0.66) / 0.34);
        } else if (heatmapMode === "g") {
            color = valueNorm <= 0.5
                ? lerpColor("#008080", "#ffa500", valueNorm / 0.5)
                : lerpColor("#ffa500", "#ff00ff", (valueNorm - 0.5) / 0.5);
        } else {
            color = valueNorm < 0.6
                ? lerpColor("#7a45a6", "#ff99cc", valueNorm / 0.6)
                : lerpColor("#ff99cc", "#ffffff", (valueNorm - 0.6) / 0.4);
        }
        ctx.fillStyle = color;
    }

    const rows = GRID.length;
    const cols = GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);
    ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);
}

// Draw MDP value heatmap (V(s) on grid). Doesn't change heatmapMode (but uses drawHeatmapCell color mapping).
// V is expected to be object mapping "r,c" -> numeric value
function drawMDPValueHeatmap(V) {
    if (!GRID.length) return;
    drawMaze(GRID);

    const values = Object.values(V);
    if (!values.length) return;
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // iterate keys in V
    Object.keys(V).forEach(k => {
        const [r, c] = fromKey(k);
        const v = V[k];
        const norm = (v - minVal) / (maxVal - minVal || 1);
        drawHeatmapCell(r, c, norm);
    });

    // overlay path (if present)
    if (PATH && PATH.length) animatePath(PATH, "yellow", 30);
}

// ====================== CANVAS DRAWING ======================
function drawMaze(grid) {
    if (!grid || !grid.length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    const rows = grid.length;
    const cols = grid[0].length;
    const cellSize = computeCellSize(rows, cols);
    canvas.width = cellSize * cols;
    canvas.height = cellSize * rows;
    const wallMargin = Math.max(1, Math.floor(cellSize * 0.05));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = grid[r][c];
            ctx.fillStyle = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) ? "white"
                : (val === 1) ? "#444"
                : (val === 2) ? "green"
                : (val === 3) ? "red"
                : "#222";
            ctx.fillRect(c * cellSize + wallMargin, r * cellSize + wallMargin, cellSize - 2 * wallMargin, cellSize - 2 * wallMargin);
        }
    }
}

// ====================== PATH ANIMATION ======================
async function animatePath(path, color = "yellow", delay = 30, localAnimId = 0) {
    if (!GRID.length || !path || !path.length) return;
    isAnimating = true;
    const rows = GRID.length;
    const cols = GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);

    for (const [r, c] of path) {
        if (localAnimId && localAnimId !== animId) break; // canceled
        // skip drawing on start/goal so colours remain distinct
        if ((START_POS && r === START_POS[0] && c === START_POS[1]) ||
            (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1])) continue;

        ctx.fillStyle = color;
        ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);
        await new Promise(res => setTimeout(res, delay));
    }
    isAnimating = false;
}

// ====================== SCORE MAP (A* hover) ======================
function buildScoreMap() {
    scoreMap = {};
    for (const s of explorationScores) {
        const key = toKey(s.pos[0], s.pos[1]);
        scoreMap[key] = { g: s.g, f: s.f, h: s.f - s.g };
    }
}

// ====================== MOUSE / HOVER INTERACTION ======================
function getCellUnderMouse(evt) {
    if (!GRID.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const rows = GRID.length;
    const cols = GRID[0].length;
    const cellSize = computeCellSize(rows, cols);

    // account for canvas CSS scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const c = Math.floor(x * scaleX / cellSize);
    const r = Math.floor(y * scaleY / cellSize);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    return { r, c };
}

canvas.addEventListener("mousemove", (e) => {
    if (!GRID.length) return;

    // Determine which hover div is active
    let hoverEl = null;
    let isBFS = false;
    if (!q("#astarMetrics").classList.contains("hidden")) hoverEl = el("astarHoverInfo");
    else if (!q("#bfsMetrics").classList.contains("hidden")) {
        hoverEl = el("bfsHoverInfo");
        isBFS = true;
    }
    if (!hoverEl) return; // nothing to update

    const cell = getCellUnderMouse(e);
    if (!cell) return;

    const key = toKey(cell.r, cell.c);
    if (lastHoverCell && lastHoverCell.key === key) return;
    lastHoverCell = { key, r: cell.r, c: cell.c };

    let info = `Hovered Cell: (${cell.r}, ${cell.c})\n`;
    const gridVal = GRID[cell.r][cell.c];

    if (gridVal === 1) { 
        info += "Wall / blocked"; 
        hoverEl.innerText = info; 
        return; 
    }
    if (gridVal === 2) info += "Start\n";
    if (gridVal === 3) info += "Goal\n";

    const s = scoreMap[key];
    if (s) {
        if (isBFS) info += `g = ${s.g}\nf = ${s.f}`;
        else info += `g = ${s.g}\nh = ${s.h}\nf = ${s.f}`;
    } else {
        info += isBFS ? "g = n/a\nf = n/a" : "g = n/a\nh = n/a\nf = n/a";
    }

    hoverEl.innerText = info;
});

canvas.addEventListener("mouseleave", () => {
    lastHoverCell = null;

    // Reset text in whichever hover div is active
    if (!q("#astarMetrics").classList.contains("hidden")) el("astarHoverInfo").innerText = "Hover a cell to see its g / h / f here.";
    if (!q("#bfsMetrics").classList.contains("hidden")) el("bfsHoverInfo").innerText = "Hover a cell to see its g/f here.";
});

// ====================== SERVER / API CALLS (fetch wrappers) ======================
async function apiFetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} - ${text || res.statusText}`);
    }
    return res.json();
}

// ====================== CONTROLS: GENERATE / SOLVE ======================
async function generateMaze() {
    animId++; // cancel running animations
    resetSharedMetrics();
    resetAStarMetrics();
    resetMDPMetrics();
    resetBFSMetrics();
    hideAStarMetrics();
    hideMDPMetrics();
    hideBFSMetrics();

    GRID = []; PATH = []; START_POS = null; GOAL_POS = null;
    explorationSteps = []; explorationScores = []; scoreMap = {};
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
        const data = await apiFetchJson("/api/maze/generate");
        if (!data || !data.grid) throw new Error("Invalid response from generate");
        GRID = data.grid;
        START_POS = data.start;
        GOAL_POS = data.goal;

        // reset heatmap radio to default (f)
        const r = document.querySelector("input[name=heatmap][value=f]");
        if (r) { r.checked = true; heatmapMode = 'f'; }
        updateHeatPreview();
        drawMaze(GRID);
    } catch (err) {
        alert("Maze generation failed: " + err.message);
    }
}

// ---- A* solving and visualization ----
async function solveAndAnimateAStar() {
    if (!GRID.length) return;
    showAStarMetrics();
    hideMDPMetrics();
    hideBFSMetrics();
    animId++; const localId = animId;

    explorationSteps = []; explorationScores = []; scoreMap = {}; PATH = [];

    const startTime = performance.now();
    let data;
    try {
        data = await apiFetchJson("/api/maze/solveWithAStar");
    } catch (err) {
        alert("A* call failed: " + err.message);
        return;
    }
    const endTime = performance.now();

    const path = data.path || [];
    const steps = data.steps || [];
    const scores = data.scores || [];
    const metrics = data.metrics || {};

    explorationSteps = steps;
    explorationScores = scores;
    PATH = path;
    buildScoreMap();

    // compute a few metrics locally
    const pathCost = path.length;
    let pathTurns = 0;
    for (let i = 2; i < path.length; i++) {
        const [x1, y1] = path[i - 2], [x2, y2] = path[i - 1], [x3, y3] = path[i];
        if (x2 - x1 !== x3 - x2 || y2 - y1 !== y3 - y2) pathTurns++;
    }
    const manhattan = (START_POS && GOAL_POS) ? Math.abs(START_POS[0] - GOAL_POS[0]) + Math.abs(START_POS[1] - GOAL_POS[1]) : 0;
    const nodesPruned = steps.length ? (((steps.length - path.length) / steps.length) * 100).toFixed(1) : 0;
    const optimalityRatio = manhattan > 0 ? (pathCost / manhattan).toFixed(2) : "n/a";
    const pathSmoothness = pathTurns > 0 ? (pathCost / pathTurns).toFixed(2) : pathCost;

    // shared metrics
    el("nodesVisited").innerText = steps.length;
    el("pathLength").innerText = path.length;
    el("executionTime").innerText = Math.round(endTime - startTime);

    // A* specific metrics
    el("pathCost").innerText = pathCost;
    el("pathTurns").innerText = pathTurns;
    el("manhattanPath").innerText = manhattan;
    el("nodesPruned").innerText = nodesPruned;
    el("optimalityRatio").innerText = optimalityRatio;
    el("pathSmoothness").innerText = pathSmoothness;
    el("maxOpenSetSize").innerText = metrics.maxOpenSetSize || 0;
    el("avgF").innerText = metrics.avgF != null ? metrics.avgF.toFixed(2) : 0;
    el("avgG").innerText = metrics.avgG != null ? metrics.avgG.toFixed(2) : 0;
    el("avgH").innerText = metrics.avgH != null ? metrics.avgH.toFixed(2) : 0;

    // animate exploration heatmap then final path
    drawMaze(GRID);
    if (explorationSteps.length && explorationScores.length) {
        const values = explorationScores.map(s => (heatmapMode === 'f' ? s.f : (heatmapMode === 'g' ? s.g : s.f - s.g)));
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const rows = GRID.length, cols = GRID[0].length;
        const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows * cols, 100))));

        for (let i = 0; i < explorationSteps.length; i++) {
            if (localId !== animId) return; // canceled
            const [r, c] = explorationSteps[i];
            const score = explorationScores[i];
            const raw = heatmapMode === 'f' ? score.f : (heatmapMode === 'g' ? score.g : score.f - score.g);
            const norm = (raw - minVal) / (maxVal - minVal || 1);
            drawHeatmapCell(r, c, norm);
            await new Promise(res => setTimeout(res, delay));
        }
    }

    await animatePath(PATH, "blue", 30, localId);
    updateHeatPreview();
    el("hoverInfo").innerText = "Hover a cell to see its g / h / f here.";
}

// ---- MDP solving and visualization ----
async function solveAndAnimateMDP() {
    hideAStarMetrics();
    hideBFSMetrics();
    showMDPMetrics();

    if (!GRID.length) return;
    animId++; const localId = animId;
    explorationSteps = []; explorationScores = []; scoreMap = {}; PATH = [];

    const startTime = performance.now();
    let data;
    try {
        data = await apiFetchJson("/api/maze/solveWithMdp");
    } catch (err) {
        alert("MDP call failed: " + err.message);
        return;
    }
    const endTime = performance.now();

    const path = data?.path || [];
    const metrics = data?.metrics || {};
    PATH = path;

    // shared metrics
    el("nodesVisited").innerText = path.length;
    el("pathLength").innerText = path.length;
    el("executionTime").innerText = Math.round(endTime - startTime);

    // mdp metrics display
    el("mdpPathLength").innerText = metrics["Path Length"] ?? 0;
    el("mdpPathTurns").innerText = metrics["Number of Turns"] ?? 0;
    el("mdpTotalReward").innerText = typeof metrics["Total Reward Collected"] === "number" ? metrics["Total Reward Collected"].toFixed(2) : 0;
    el("mdpAvgStepCost").innerText = typeof metrics["Average Step Cost"] === "number" ? metrics["Average Step Cost"].toFixed(3) : 0;
    el("mdpSlips").innerText = metrics["Slips / Deviations"] ?? 0;
    el("mdpFailedMoves").innerText = metrics["Failed Moves"] ?? 0;
    el("mdpMaxValue").innerText = typeof metrics["Max State Value"] === "number" ? metrics["Max State Value"].toFixed(2) : 0;
    el("mdpMinValue").innerText = typeof metrics["Min State Value"] === "number" ? metrics["Min State Value"].toFixed(2) : 0;
    el("mdpAvgValue").innerText = typeof metrics["Average State Value"] === "number" ? metrics["Average State Value"].toFixed(2) : 0;
    el("mdpCompTime").innerText = metrics["Computation Time"] ?? 0;
    el("mdpManhattan").innerText = metrics["Shortest Manhattan Path"] ?? 0;
    el("mdpOptimality").innerText = typeof metrics["Path Optimality Ratio"] === "number" ? metrics["Path Optimality Ratio"].toFixed(2) : metrics["Path Optimality Ratio"] ?? 0;

    // draw path (no exploration animation for mdp)
    drawMaze(GRID);
    await animatePath(PATH, "yellow", 30, localId);
}

async function solveAndAnimateBFS() {
    if (!GRID.length) return;

    // Reset metrics and show BFS panel
    resetSharedMetrics();
    hideAStarMetrics();
    hideMDPMetrics();
    q("#bfsMetrics").classList.remove("hidden");

    // Reset hover info for BFS
    const hoverEl = el("bfsHoverInfo");
    if (hoverEl) hoverEl.innerText = "Hover a cell to inspect BFS exploration steps.";

    animId++;
    const localId = animId;
    PATH = [];
    explorationSteps = [];
    explorationScores = []; // reset

    const startTime = performance.now();
    let data;
    try {
        data = await apiFetchJson("/api/maze/solveWithBFS");
    } catch (err) {
        alert("BFS call failed: " + err.message);
        return;
    }

    const path = data.path || [];
    const steps = data.steps || [];
    const metrics = data.metrics || {};

    PATH = path;
    explorationSteps = steps;

    // Populate explorationScores (f = g for BFS, h = n/a)
    explorationScores = explorationSteps.map((pos, idx) => ({ pos, g: idx, h: 'n/a', f: idx }));
    buildScoreMap();

    // Shared metrics
    el("nodesVisited").innerText = metrics.nodesVisited ?? steps.length;
    el("pathLength").innerText = metrics.pathLength ?? path.length;
    el("executionTime").innerText = Math.round(performance.now() - startTime);

    // BFS-specific metrics
    el("bfsNodesVisited").innerText = metrics.nodesVisited ?? steps.length;
    el("bfsPathLength").innerText = metrics.pathLength ?? path.length;
    el("bfsPathTurns").innerText = metrics.pathTurns ?? 0;
    el("bfsManhattan").innerText = metrics.manhattanPath ?? 0;
    el("bfsOptimalityRatio").innerText = metrics.optimalityRatio ?? "n/a";
    el("bfsMaxQueueSize").innerText = metrics.maxQueueSize ?? 0;

    // Draw maze background
    drawMaze(GRID);

    // Animate BFS exploration
    if (explorationSteps.length) {
        const rows = GRID.length;
        const cols = GRID[0].length;
        const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows * cols, 100))));
        const totalSteps = explorationSteps.length;

        for (let i = 0; i < totalSteps; i++) {
            if (localId !== animId) return; // canceled
            const [r, c] = explorationSteps[i];

            if ((START_POS && r === START_POS[0] && c === START_POS[1]) ||
                (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1])) continue;

            // Gradient: light sky blue → bright yellow
            const t = i / totalSteps;
            const startColor = [135, 206, 250];
            const endColor = [255, 255, 102];
            const color = startColor.map((v, idx) => Math.round(v + (endColor[idx]-v)*t));
            ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;

            const cellSize = computeCellSize(rows, cols);
            const margin = Math.max(1, Math.floor(cellSize * 0.2));
            const size = Math.max(1, cellSize - 2 * margin);
            ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);

            await new Promise(res => setTimeout(res, delay));
        }
    }

    // Animate final path
    if (PATH && PATH.length) {
        await animatePath(PATH, "blue", 30, localId);
    }

    // Reset BFS hover info
    if (hoverEl) hoverEl.innerText = "Hover a cell to see its g/f here.";
}

// ====================== INIT / BOOT ======================
(function init() {
    hideAStarMetrics();
    hideMDPMetrics();
    hideBFSMetrics();
    updateHeatPreview();
})();

// ====================== EXPORTS / EVENT HOOKS ======================
// (these are the functions your HTML expects to call)
window.generateMaze = generateMaze;
window.solveAndAnimateAStar = solveAndAnimateAStar;
window.solveAndAnimateMDP = solveAndAnimateMDP;
window.solveAndAnimateBFS = solveAndAnimateBFS;
window.setHeatmap = function (mode) {
    heatmapMode = mode;
    updateHeatPreview();
    // only re-render heatmap if we have A* exploration data
    if (explorationSteps.length && explorationScores.length) {
        animId++;
        const localId = animId;
        drawMaze(GRID);
        (async () => {
            const values = explorationScores.map(s => (heatmapMode === 'f' ? s.f : (heatmapMode === 'g' ? s.g : s.f - s.g)));
            const minVal = Math.min(...values);
            const maxVal = Math.max(...values);
            const rows = GRID.length, cols = GRID[0].length;
            const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows * cols, 100))));
            for (let i = 0; i < explorationSteps.length; i++) {
                if (localId !== animId) return;
                const [r, c] = explorationSteps[i];
                const score = explorationScores[i];
                const raw = heatmapMode === 'f' ? score.f : (heatmapMode === 'g' ? score.g : score.f - score.g);
                const norm = (raw - minVal) / (maxVal - minVal || 1);
                drawHeatmapCell(r, c, norm);
                await new Promise(res => setTimeout(res, delay));
            }
            if (PATH && PATH.length) await animatePath(PATH, "blue", 30, localId);
        })();
    }
};
