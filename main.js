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
// Stored RL episode paths (populated after running RL)
let RL_EPISODE_PATHS = {
    "1": [],
    "1499": [],
    "2999": [],
    "greedy": []
};

// Normalize a path to an array of [r, c] numeric pairs
function normalizePath(p) {
    if (!p || !Array.isArray(p)) return [];
    const out = [];
    for (const item of p) {
        if (!item) continue;
        // item might already be [r,c]
        if (Array.isArray(item) && item.length >= 2) {
            const r = Number(item[0]);
            const c = Number(item[1]);
            if (!Number.isNaN(r) && !Number.isNaN(c)) out.push([r, c]);
            continue;
        }
        // fallback: try to extract numeric properties
        const r = Number(item.r ?? item[0]);
        const c = Number(item.c ?? item[1]);
        if (!Number.isNaN(r) && !Number.isNaN(c)) out.push([r, c]);
    }
    return out;
}

// ====================== CONSTANTS / UTILITIES ======================
const MAX_CANVAS_PIXELS = 1000;

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function toKey(r, c) { return `${r},${c}`; }
function fromKey(key) { return key.split(",").map(Number); }

function computeCellSize(rows, cols) {
    return Math.floor(MAX_CANVAS_PIXELS / Math.max(rows, cols));
}

async function apiFetchJson(url, options = {}) {
    const resp = await fetch(url, options);
    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
    return await resp.json();
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

// BFS metrics  
function resetBFSMetrics() {
    el("bfsNodesVisited").innerText = 0;
    el("bfsPathLength").innerText = 0;
    el("bfsPathTurns").innerText = 0;
    el("bfsManhattan").innerText = 0;
    el("bfsOptimalityRatio").innerText = 0;
    el("bfsMaxQueueSize").innerText = 0;
}
function hideBFSMetrics() {q("#bfsMetrics").classList.add("hidden");}
function showBFSMetrics() { resetBFSMetrics(); q("#bfsMetrics").classList.remove("hidden");}

// DFS metrics
function resetDFSMetrics() {
    el("dfsNodesVisited").innerText = 0;
    el("dfsPathLength").innerText = 0;
    el("dfsPathTurns").innerText = 0;
    el("dfsMaxDepth").innerText = 0;
    el("dfsDeadEnds").innerText = 0;
    el("dfsBacktracks").innerText = 0;
}

function hideDFSMetrics() {q("#dfsMetrics").classList.add("hidden");}
function showDFSMetrics() {resetDFSMetrics();q("#dfsMetrics").classList.remove("hidden");}

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

// RL metrics
function resetRLMetrics() {
    el("rlPathLength").innerText = 0;
    el("rlNumTurns").innerText = 0;
    el("rlTotalReward").innerText = 0;
    el("rlAvgCost").innerText = 0;

    el("rlEpisodes").innerText = 0;
    el("rlAvgEpReward").innerText = 0;
    el("rlBestEpReward").innerText = 0;
    el("rlFinalEps").innerText = 0;

    el("rlManhattan").innerText = 0;
    el("rlOptimality").innerText = 0;
    el("rlCompTime").innerText = 0;
}
function showRLMetrics() {
    resetRLMetrics();
    q("#rlMetrics").classList.remove("hidden");
}
function hideRLMetrics() {
    q("#rlMetrics").classList.add("hidden");
}

// tiny DOM helpers
function q(sel) { return document.querySelector(sel); }
function el(id) { return document.getElementById(id); }

// ====================== HEATMAP (A* exploration) ======================
function updateHeatPreview() {
    const preview = el("heatPreview");
    const lowBox = el("heatLow");
    const highBox = el("heatHigh");
    const lowLabel = el("heatLowLabel");
    if (!preview) return;

    if (heatmapMode === "f") {
        // f = g + h  (Preferred → risky)
        preview.style.background =
            "linear-gradient(90deg,#2b83ba 0%,#7fc97f 35%,#ffd92f 70%,#f03b20 100%)";

        lowBox.style.background = "#2b83ba";   // Low f
        highBox.style.background = "#f03b20";  // High f
        lowLabel.innerText = "Low f (preferred)";
    }

    else if (heatmapMode === "g") {
        preview.style.background =
            "linear-gradient(90deg,#008080 0%,#ffa500 50%,#ff00ff 100%)";

        lowBox.style.background = "#008080";
        highBox.style.background = "#ff00ff";
        lowLabel.innerText = "Low g (near start)";
    }

    else {
        preview.style.background =
            "linear-gradient(90deg,#7a45a6 0%,#ff99cc 60%,#ffffff 100%)";

        lowBox.style.background = "#7a45a6";
        highBox.style.background = "#ffffff";
        lowLabel.innerText = "Low h (near goal)";
    }
}

// draw a single heatmap cell (used for both A* exploration and MDP value heatmap)
function drawHeatmapCell(r, c, valueNorm) {
    // keep start/goal colors fixed
    if (START_POS && r === START_POS[0] && c === START_POS[1]) {
        ctx.fillStyle = "blue";
    }
    else if (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1]) {
        ctx.fillStyle = "red";
    }
    else {
        let color;

        // ---------- F mode (f = g + h) ----------
        if (heatmapMode === "f") {

            if (valueNorm <= 0.35) {
                // 0 → 0.35  (blue → green)
                const t = valueNorm / 0.35;
                color = lerpColor("#2b83ba", "#7fc97f", t);
            }

            else if (valueNorm <= 0.7) {
                // 0.35 → 0.7 (green → yellow)
                const t = (valueNorm - 0.35) / 0.35;
                color = lerpColor("#7fc97f", "#ffd92f", t);
            }

            else {
                // 0.7 → 1.0 (yellow → red)
                const t = (valueNorm - 0.7) / 0.3;
                color = lerpColor("#ffd92f", "#f03b20", t);
            }
        }

        // ---------- G mode ----------
        else if (heatmapMode === "g") {
            color = valueNorm <= 0.5
                ? lerpColor("#008080", "#ffa500", valueNorm / 0.5)
                : lerpColor("#ffa500", "#ff00ff", (valueNorm - 0.5) / 0.5);
        }

        // ---------- H mode ----------
        else {
            color = valueNorm < 0.6
                ? lerpColor("#7a45a6", "#ff99cc", valueNorm / 0.6)
                : lerpColor("#ff99cc", "#ffffff", (valueNorm - 0.6) / 0.4);
        }

        ctx.fillStyle = color;
    }

    // Draw cell
    const rows = GRID.length;
    const cols = GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);

    ctx.fillRect(
        c * cellSize + margin,
        r * cellSize + margin,
        size,
        size
    );
}

function renderAStarHeatmap(mode) {
    if (!explorationSteps.length || !explorationScores.length) return;

    heatmapMode = mode;
    updateHeatPreview();

    animId++;
    const localId = animId;
    drawMaze(GRID);

    (async () => {
        const values = explorationScores.map(s =>
            mode === 'f' ? s.f
            : mode === 'g' ? s.g
            : s.h
        );
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const rows = GRID.length, cols = GRID[0].length;
        const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows * cols, 100))));

        for (let i = 0; i < explorationSteps.length; i++) {
            if (localId !== animId) return;

            const [r, c] = explorationSteps[i];
            const raw = mode === 'f' ? explorationScores[i].f
                      : mode === 'g' ? explorationScores[i].g
                      : explorationScores[i].h;
            const norm = (raw - minVal) / (maxVal - minVal || 1);
            drawHeatmapCell(r, c, norm);
            await new Promise(res => setTimeout(res, delay));
        }

        if (PATH && PATH.length) await animatePath(PATH, "blue", 30, localId);
    })();
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

// Loader helpers
function showLoader(text = "Loading...") {
    const o = document.getElementById('loadingOverlay');
    const t = document.getElementById('loaderText');
    if (t) t.innerText = text;
    if (o) o.classList.remove('hidden');
}

function hideLoader() {
    const o = document.getElementById('loadingOverlay');
    if (o) o.classList.add('hidden');
}

// Draw a path immediately (no animation) — used to show greedy path by default
function drawPathStatic(path, color = "yellow") {
    if (!GRID.length || !path || !path.length) return;
    drawMaze(GRID);
    const rows = GRID.length;
    const cols = GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);
    for (const [r, c] of path) {
        if ((START_POS && r === START_POS[0] && c === START_POS[1]) ||
            (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1])) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);
    }
}

// ====================== SCORE MAP (A* hover) ======================
function buildScoreMap() {
    scoreMap = {};
    for (const s of explorationScores) {
        const key = toKey(s.pos[0], s.pos[1]);
        scoreMap[key] = { g: s.g ?? 0, f: s.f ?? 0, h: (s.f ?? 0) - (s.g ?? 0) };
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

    // Determine which hover div is active (support A*, BFS, and DFS)
    let hoverEl = null;
    let isBFS = false;
    let isDFS = false;
    if (!q("#astarMetrics").classList.contains("hidden")) hoverEl = el("astarHoverInfo");
    else if (!q("#bfsMetrics").classList.contains("hidden")) {
        hoverEl = el("bfsHoverInfo");
        isBFS = true;
    }
    else if (!q("#dfsMetrics").classList.contains("hidden")) {
        hoverEl = el("dfsHoverInfo");
        isDFS = true;
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

    if (isDFS) {
        let depth = null;
        for (const es of explorationScores) {
            if (!es || !es.pos) continue;
            if (es.pos[0] === cell.r && es.pos[1] === cell.c) { depth = es.depth ?? null; break; }
        }
        info += `Depth: ${depth != null ? depth : 'n/a'}`;
        hoverEl.innerText = info;
        return;
    }

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
    if (!q("#dfsMetrics").classList.contains("hidden")) el("dfsHoverInfo").innerText = "Hover a cell to see DFS depth here.";
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
    resetDFSMetrics();
    resetRLMetrics();
    hideAStarMetrics();
    hideMDPMetrics();
    hideBFSMetrics();
    hideDFSMetrics();
    hideRLMetrics();

    GRID = []; PATH = []; START_POS = null; GOAL_POS = null;
    explorationSteps = []; explorationScores = []; scoreMap = {};
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
        const data = await apiFetchJson("/api/maze/generate");
        if (!data || !data.grid) throw new Error("Invalid response from generate");
        GRID = data.grid;
        START_POS = data.start;
        GOAL_POS = data.goal;

        // expose for console debugging
        window.GRID = GRID;
        window.START_POS = START_POS;
        window.GOAL_POS = GOAL_POS;
        console.debug('generateMaze: exported GRID/START/GOAL to window', {rows: GRID && GRID.length, start: START_POS, goal: GOAL_POS});

        // reset heatmap radio to default (f)
        const r = document.querySelector("input[name=heatmap][value=f]");
        if (r) { r.checked = true; heatmapMode = 'f'; }
        updateHeatPreview();
        drawMaze(GRID);
    } catch (err) {
        alert("Maze generation failed: " + err.message);
    }
}

// ---------------- Shared solver/animation helper ----------------
async function solveAndAnimateSolver({
    apiEndpoint,
    solverName,       // "DFS", "BFS", "AStar", "MDP", "RL"
    showMetricsFn,    // function to show solver-specific metrics panel
    hideMetricsFns = [], // array of functions to hide other panels
    pathColor = "blue",
    heatStartColor = [0, 255, 255], // RGB array
    heatEndColor = [255, 153, 0],
    skipStartGoal = true,
    animateExploration = true,
    hoverElId,
    processScoresFn = null, // optional: modify explorationScores after fetch
}) {
    if (!GRID.length) return;

    // Reset UI
    resetSharedMetrics();
    hideMetricsFns.forEach(fn => fn());
    showMetricsFn();

    const hoverEl = hoverElId ? el(hoverElId) : null;
    if (hoverEl) hoverEl.innerText = `Hover a cell to inspect ${solverName} exploration.`;

    animId++;
    const localId = animId;

    PATH = [];
    explorationSteps = [];
    explorationScores = [];
    scoreMap = {};

    const startTime = performance.now();
    let data;
    try {
        if (solverName === "RL") showLoader('Training RL...');
        data = await apiFetchJson(apiEndpoint);
    } catch (err) {
        alert(`${solverName} call failed: ${err.message}`);
        if (solverName === "RL") hideLoader();
        return;
    }
    const endTime = performance.now();

    const path = data.path || [];
    const steps = data.steps || [];
    const scores = data.scores || [];
    const metrics = data.metrics || {};

    // If the server returned a fresh grid/start/goal (RL endpoint does), adopt it
    if (data.grid && Array.isArray(data.grid) && data.start && data.goal) {
        GRID = data.grid;
        START_POS = data.start;
        GOAL_POS = data.goal;
        // reflect into window for developer console access
        window.GRID = GRID;
        window.START_POS = START_POS;
        window.GOAL_POS = GOAL_POS;
        console.debug('solveAndAnimateSolver: adopted server grid and exported to window', {rows: GRID && GRID.length, start: START_POS, goal: GOAL_POS, solver: solverName});
    }

    PATH = path;
    explorationSteps = steps.map(s => Array.isArray(s[0]) ? [s[0][0], s[0][1]] : [s[0], s[1]]);
    explorationScores = processScoresFn
        ? processScoresFn(steps, scores)
        : steps.map((s) => ({ pos: [s[0], s[1]], depth: s[2] || 0 }));

    buildScoreMap();

    // If RL, capture recorded episodes and final greedy path for playback
    if (solverName === "RL") {
        if (data.episodes) {
            RL_EPISODE_PATHS["1"] = normalizePath(data.episodes["1"] || []);
            RL_EPISODE_PATHS["1499"] = normalizePath(data.episodes["1499"] || []);
            RL_EPISODE_PATHS["2999"] = normalizePath(data.episodes["2999"] || []);
        } else {
            RL_EPISODE_PATHS["1"] = [];
            RL_EPISODE_PATHS["1499"] = [];
            RL_EPISODE_PATHS["2999"] = [];
        }
        RL_EPISODE_PATHS["greedy"] = normalizePath(path || []);
        // also expose RL episode paths to window for debugging/console
        window.RL_EPISODE_PATHS = RL_EPISODE_PATHS;
        console.debug('solveAndAnimateSolver: stored RL_EPISODE_PATHS on window', {
            one: RL_EPISODE_PATHS['1'] && RL_EPISODE_PATHS['1'].length,
            mid: RL_EPISODE_PATHS['1499'] && RL_EPISODE_PATHS['1499'].length,
            three: RL_EPISODE_PATHS['2999'] && RL_EPISODE_PATHS['2999'].length,
            greedy: RL_EPISODE_PATHS['greedy'] && RL_EPISODE_PATHS['greedy'].length
        });

        // Animate the final greedy path automatically (fast)
        try {
            if (RL_EPISODE_PATHS['greedy'] && RL_EPISODE_PATHS['greedy'].length) {
                showLoader('Rendering greedy path...');
                await animatePath(RL_EPISODE_PATHS['greedy'], 'blue', 10, localId);
                hideLoader();
            } else {
                if (solverName === 'RL') hideLoader();
            }
        } catch (e) {
            console.warn('Failed to animate greedy path', e);
            hideLoader();
        }
    }

    // Shared metrics
    el("nodesVisited").innerText = steps.length;
    el("pathLength").innerText = path.length;
    el("executionTime").innerText = Math.round(endTime - startTime);

    // Solver-specific metrics
    if (solverName === "DFS") {
        el("dfsNodesVisited").innerText = steps.length;
        el("dfsPathLength").innerText = path.length;
        el("dfsMaxDepth").innerText = metrics.maxStackDepth ?? 0;
        el("dfsDeadEnds").innerText = metrics.deadEnds ?? 0;
        el("dfsBacktracks").innerText = metrics.backtracks ?? 0;

        // Count turns
        let turns = 0;
        for (let i = 2; i < path.length; i++) {
            const [x1, y1] = path[i - 2], [x2, y2] = path[i - 1], [x3, y3] = path[i];
            if (x2 - x1 !== x3 - x2 || y2 - y1 !== y3 - y2) turns++;
        }
        el("dfsPathTurns").innerText = turns;
    }
    else if (solverName === "BFS") {
        el("bfsNodesVisited").innerText = metrics.nodesVisited ?? steps.length;
        el("bfsPathLength").innerText = metrics.pathLength ?? path.length;
        el("bfsPathTurns").innerText = metrics.pathTurns ?? 0;
        el("bfsManhattan").innerText = metrics.manhattanPath ?? 0;
        el("bfsOptimalityRatio").innerText = metrics.optimalityRatio ?? "n/a";
        el("bfsMaxQueueSize").innerText = metrics.maxQueueSize ?? 0;
    }
    else if (solverName === "AStar") {
        const pathCost = scores.length ? scores[scores.length - 1].g : path.length;
        let pathTurns = 0;
        for (let i = 2; i < path.length; i++) {
            const [x1, y1] = path[i - 2], [x2, y2] = path[i - 1], [x3, y3] = path[i];
            if (x2 - x1 !== x3 - x2 || y2 - y1 !== y3 - y2) pathTurns++;
        }
        const manhattan = (START_POS && GOAL_POS)
            ? Math.abs(START_POS[0] - GOAL_POS[0]) + Math.abs(START_POS[1] - GOAL_POS[1])
            : 0;
        const nodesPruned = explorationSteps.length
            ? (((explorationSteps.length - path.length) / explorationSteps.length) * 100).toFixed(1)
            : 0;
        const optimalityRatio = manhattan > 0 ? (pathCost / manhattan).toFixed(2) : "n/a";
        const pathSmoothness = pathTurns > 0 ? (pathCost / pathTurns).toFixed(2) : pathCost;

        // Fill DOM elements
        el("pathCost").innerText = pathCost;
        el("pathTurns").innerText = pathTurns;
        el("manhattanPath").innerText = manhattan;
        el("nodesPruned").innerText = nodesPruned;
        el("optimalityRatio").innerText = optimalityRatio;
        el("pathSmoothness").innerText = pathSmoothness;

        el("maxOpenSetSize").innerText = metrics.maxOpenSetSize ?? 0;
        el("avgF").innerText = metrics.avgF != null ? metrics.avgF.toFixed(2) : 0;
        el("avgG").innerText = metrics.avgG != null ? metrics.avgG.toFixed(2) : 0;
        el("avgH").innerText = metrics.avgH != null ? metrics.avgH.toFixed(2) : 0;
    }
    else if (solverName === "MDP") {
        el("nodesVisited").innerText = path.length;
        el("mdpPathLength").innerText = metrics["Path Length"] ?? path.length;
        el("mdpPathTurns").innerText = metrics["Number of Turns"] ?? 0;
        el("mdpTotalReward").innerText =
            typeof metrics["Total Reward Collected"] === "number"
                ? metrics["Total Reward Collected"].toFixed(2)
                : 0;
        el("mdpAvgStepCost").innerText =
            typeof metrics["Average Step Cost"] === "number"
                ? metrics["Average Step Cost"].toFixed(3)
                : 0;
        el("mdpSlips").innerText = metrics["Slips / Deviations"] ?? 0;
        el("mdpFailedMoves").innerText = metrics["Failed Moves"] ?? 0;
        el("mdpMaxValue").innerText =
            typeof metrics["Max State Value"] === "number"
                ? metrics["Max State Value"].toFixed(2)
                : 0;
        el("mdpMinValue").innerText =
            typeof metrics["Min State Value"] === "number"
                ? metrics["Min State Value"].toFixed(2)
                : 0;
        el("mdpAvgValue").innerText =
            typeof metrics["Average State Value"] === "number"
                ? metrics["Average State Value"].toFixed(2)
                : 0;
        el("mdpCompTime").innerText = metrics["Computation Time"] ?? 0;
        el("mdpManhattan").innerText = metrics["Shortest Manhattan Path"] ?? 0;
        el("mdpOptimality").innerText =
            typeof metrics["Path Optimality Ratio"] === "number"
                ? metrics["Path Optimality Ratio"].toFixed(2)
                : metrics["Path Optimality Ratio"] ?? 0;
    }
    else if (solverName === "RL") {
        el("rlPathLength").innerText = metrics["Path Length"] ?? 0;
        el("rlNumTurns").innerText = metrics["Number of Turns"] ?? 0;
        el("rlTotalReward").innerText =
            typeof metrics["Total Reward Collected"] === "number"
                ? metrics["Total Reward Collected"].toFixed(2)
                : 0;
        el("rlAvgCost").innerText =
            typeof metrics["Average Step Cost"] === "number"
                ? metrics["Average Step Cost"].toFixed(3)
                : 0;

        el("rlEpisodes").innerText = metrics["Episodes Trained"] ?? 0;
        el("rlAvgEpReward").innerText =
            typeof metrics["Average Episode Reward"] === "number"
                ? metrics["Average Episode Reward"].toFixed(2)
                : 0;
        el("rlBestEpReward").innerText =
            typeof metrics["Best Episode Reward"] === "number"
                ? metrics["Best Episode Reward"].toFixed(2)
                : 0;
        el("rlFinalEps").innerText =
            typeof metrics["Final Exploration Rate"] === "number"
                ? metrics["Final Exploration Rate"].toFixed(2)
                : 0;

        el("rlManhattan").innerText = metrics["Shortest Manhattan Path"] ?? 0;
        el("rlOptimality").innerText = metrics["Path Optimality Ratio"] ?? 0;

        el("rlCompTime").innerText = metrics["Computation Time"] ?? 0;
    }

    drawMaze(GRID);

    if (animateExploration && explorationSteps.length) {
        const rows = GRID.length, cols = GRID[0].length;
        const totalSteps = explorationSteps.length;
        const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows * cols, 100))));

        // Compute normalized scores for heatmap
        const values = explorationScores.map(s => {
            if (solverName === "AStar") {
                if (heatmapMode === "f") return s.f ?? s.g ?? 0;
                if (heatmapMode === "g") return s.g ?? 0;
                if (heatmapMode === "h") return s.h ?? (s.f != null && s.g != null ? s.f - s.g : 0);
            } else if (solverName === "BFS") {
                return s.g ?? s.depth ?? 0; // fallback to depth if g missing
            } else if (solverName === "DFS" || solverName === "MDP") {
                return s.depth ?? 0;
            }
            return 0; // fallback default (RL: no exploration heatmap)
        });

        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);

        for (let i = 0; i < totalSteps; i++) {
            if (localId !== animId) return;
            const [r, c] = explorationSteps[i];

            if (skipStartGoal &&
                ((START_POS && r === START_POS[0] && c === START_POS[1]) ||
                (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1]))) continue;

            // Normalize score for gradient
            const raw = values[i];
            const norm = (raw - minVal) / (maxVal - minVal || 1);

            // Interpolate between start and end color
            const color = heatStartColor.map((v, idx) => Math.round(v + (heatEndColor[idx] - v) * norm));
            ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;

            const cellSize = computeCellSize(rows, cols);
            const margin = Math.max(1, Math.floor(cellSize * 0.2));
            const size = Math.max(1, cellSize - 2 * margin);
            ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);

            await new Promise(res => setTimeout(res, delay));
        }
    }

    if (solverName !== "RL") {
        if (PATH.length) await animatePath(PATH, pathColor, 30, localId);
    }

    // NOTE: initialHeatmapMode is left as-is if you had it globally elsewhere
    if (solverName === "AStar" && typeof initialHeatmapMode !== "undefined" && initialHeatmapMode) {
        renderAStarHeatmap(initialHeatmapMode);
    }

    if (hoverEl) hoverEl.innerText = `Hover a cell to see ${solverName} details here.`;
}

// ----------------- Solver wrappers -----------------
function solveAndAnimateDFS() {
    return solveAndAnimateSolver({
        apiEndpoint: "/api/maze/solveWithDFS",
        solverName: "DFS",
        showMetricsFn: showDFSMetrics,
        hideMetricsFns: [hideAStarMetrics, hideBFSMetrics, hideMDPMetrics, hideRLMetrics],
        pathColor: "blue",
        heatStartColor: [0, 255, 255],
        heatEndColor: [255, 153, 0],
        hoverElId: "dfsHoverInfo",
        processScoresFn: (steps) =>
            steps.map((s, idx) => ({
                pos: Array.isArray(s[0]) ? [s[0][0], s[0][1]] : [s[0], s[1]],
                depth: idx,
            }))
    });
}

function solveAndAnimateBFS() {
    return solveAndAnimateSolver({
        apiEndpoint: "/api/maze/solveWithBFS",
        solverName: "BFS",
        showMetricsFn: showBFSMetrics,
        hideMetricsFns: [hideAStarMetrics, hideDFSMetrics, hideMDPMetrics, hideRLMetrics],
        pathColor: "blue",
        heatStartColor: [135, 206, 250],
        heatEndColor: [255, 165, 0],
        hoverElId: "bfsHoverInfo",
        processScoresFn: (steps) => steps.map((pos, idx) => ({ pos, g: idx, h: "n/a", f: idx }))
    });
}

function solveAndAnimateAStar() {
    return solveAndAnimateSolver({
        apiEndpoint: "/api/maze/solveWithAStar",
        solverName: "AStar",
        showMetricsFn: showAStarMetrics,
        hideMetricsFns: [hideBFSMetrics, hideDFSMetrics, hideMDPMetrics, hideRLMetrics],
        pathColor: "blue",
        // Use cyan -> light-red to match the legend preview for f-values
        heatStartColor: [43, 131, 186], // #2b83ba
        heatEndColor: [240, 59, 32],    // #f03b20
        hoverElId: "astarHoverInfo",
        initialHeatmapMode: heatmapMode,
        processScoresFn: (steps, scores) => {
            return steps.map((s, i) => {
                const pos = Array.isArray(s[0]) ? [s[0][0], s[0][1]] : [s[0], s[1]];
                const score = scores[i] || {};
                const g = score.g ?? 0;
                const f = score.f ?? g;
                const h = f - g;
                return { pos, g, f, h, depth: s[2] ?? 0 };
            });
        }
    });
}

function solveAndAnimateMDP() {
    return solveAndAnimateSolver({
        apiEndpoint: "/api/maze/solveWithMDP",
        solverName: "MDP",
        showMetricsFn: showMDPMetrics,
        hideMetricsFns: [hideAStarMetrics, hideBFSMetrics, hideDFSMetrics, hideRLMetrics],
        pathColor: "blue",
        heatStartColor: [255, 255, 0],
        heatEndColor: [0, 0, 255],
        hoverElId: "mdpHoverInfo",
    });
}

function solveAndAnimateRL() {
    return solveAndAnimateSolver({
        apiEndpoint: "/api/maze/solveWithRL",
        solverName: "RL",
        showMetricsFn: showRLMetrics,
        hideMetricsFns: [hideAStarMetrics, hideBFSMetrics, hideDFSMetrics, hideMDPMetrics],
        pathColor: "blue",
        heatStartColor: [0, 255, 255],
        heatEndColor: [255, 153, 0],
        hoverElId: "rlHoverInfo",
        processScoresFn: () => [] // RL: no exploration heatmap
    });
}

// ====================== INIT / BOOT ======================
(function init() {
    hideAStarMetrics();
    hideMDPMetrics();
    hideBFSMetrics();
    hideDFSMetrics();
    hideRLMetrics();
    updateHeatPreview();

    // RL episode playback buttons
    const btnEp1    = document.getElementById("btnRLEp1");
    const btnEp1499 = document.getElementById("btnRLEp1499");
    const btnEp2999 = document.getElementById("btnRLEp2999");
    const btnGreedy = document.getElementById("btnRLGreedy");

    async function playRLPath(which, color) {
        const rawPath = RL_EPISODE_PATHS[which];
        const path = normalizePath(rawPath);
        if (!GRID.length || !path || !path.length) {
            console.warn("No RL path available for", which);
            return;
        }
        animId++;
        const localId = animId;
        drawMaze(GRID);
        // choose playback speed per episode but allow manual override by slider
        const delayMap = {"1": 3, "1499": 16, "2999": 16, "greedy": 30};
        // slider override
        const slider = document.getElementById('rlSpeedSlider');
        const sliderVal = slider ? Number(slider.value) : null;
        const delay = (sliderVal && !Number.isNaN(sliderVal)) ? sliderVal : (delayMap[which] ?? 20);

        // Optionally draw revisit heatmap overlay (static) if enabled
        const showHeat = document.getElementById('rlHeatmapToggle') && document.getElementById('rlHeatmapToggle').checked;
        if (showHeat) drawRevisitHeatmap(path);

        try {
            showLoader('Playing ' + which + '...');
            await animatePath(path, color, delay, localId);
        } finally {
            hideLoader();
        }
    }

// Draw a revisit-count heatmap for a path (more visits → stronger color)
function drawRevisitHeatmap(path) {
    if (!GRID.length || !path || !path.length) return;
    // compute counts
    const counts = {};
    let maxCount = 0;
    for (const [r, c] of path) {
        const key = toKey(r, c);
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > maxCount) maxCount = counts[key];
    }

    // draw semi-transparent overlay
    const rows = GRID.length;
    const cols = GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const key = toKey(r, c);
            const v = counts[key] || 0;
            if (!v) continue;
            const t = v / (maxCount || 1); // 0..1
            // use orange-red gradient for revisit intensity
            const color = `rgba(${Math.round(255 * t)}, ${Math.round(120 * (1 - t))}, 40, ${0.25 + 0.5 * t})`;
            ctx.fillStyle = color;
            ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);
        }
    }
}

    if (btnEp1)    btnEp1.addEventListener("click", () => playRLPath("1", "orange"));
    if (btnEp1499) btnEp1499.addEventListener("click", () => playRLPath("1499", "magenta"));
    if (btnEp2999) btnEp2999.addEventListener("click", () => playRLPath("2999", "cyan"));
    if (btnGreedy) btnGreedy.addEventListener("click", () => playRLPath("greedy", "blue"));
})();

// ====================== EXPORTS / EVENT HOOKS ======================
window.generateMaze = generateMaze;
window.solveAndAnimateAStar = solveAndAnimateAStar;
window.solveAndAnimateMDP = solveAndAnimateMDP;
window.solveAndAnimateBFS = solveAndAnimateBFS;
window.solveAndAnimateDFS = solveAndAnimateDFS;
window.solveAndAnimateRL = solveAndAnimateRL;

// Expose internals to window for easy console debugging (kept in sync elsewhere)
window.RL_EPISODE_PATHS = RL_EPISODE_PATHS;
window.GRID = GRID;
window.PATH = PATH;
window.START_POS = START_POS;
window.GOAL_POS = GOAL_POS;
