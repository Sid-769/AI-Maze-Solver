// main.js - cleaned & optimized vanilla JS

const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

// ---------------- STATE ----------------
let CURRENT_GRID = [];
let CURRENT_PATH = [];
let START_POS = null;
let GOAL_POS = null;

let animationId = 0;
let heatmapMode = 'f';
let LAST_STEPS = [];
let LAST_SCORES = [];
let SCORE_MAP = {};
let isAnimating = false;
let lastHover = null;

// ---------------- UTILS ----------------
function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(a, b, t) {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

function computeCellSize(rows, cols) {
    const maxCanvasSize = 1000;
    return Math.floor(maxCanvasSize / Math.max(rows, cols));
}

// ---------------- UI METRICS ----------------
function resetSharedMetrics() {
    document.getElementById("nodesVisited").innerText = 0;
    document.getElementById("pathLength").innerText = 0;
    document.getElementById("executionTime").innerText = 0;
}
function resetAStarMetrics() {
    document.getElementById("pathCost").innerText = 0;
    document.getElementById("pathTurns").innerText = 0;
    document.getElementById("manhattanPath").innerText = 0;
    document.getElementById("nodesPruned").innerText = 0;
}
function showAStarMetrics() { document.getElementById("astarMetrics").classList.remove("hidden"); updateHeatPreview(); }
function hideAStarMetrics() { document.getElementById("astarMetrics").classList.add("hidden"); updateHeatPreview(); }

// ---------------- HEATMAP ----------------
function updateHeatPreview() {
    const preview = document.getElementById("heatPreview");
    const lowBox = document.getElementById("heatLow");
    const highBox = document.getElementById("heatHigh");
    const lowLabel = document.getElementById("heatLowLabel");
    if (!preview) return;

    if (heatmapMode === 'f') {
        preview.style.background = "linear-gradient(90deg,#2b83ba 0%,#7fc97f 35%,#ffd92f 70%,#f03b20 100%)";
        lowBox.style.background = "#2b83ba"; highBox.style.background = "#f03b20";
        lowLabel.innerText = "Low f (preferred)";
    } else if (heatmapMode === 'g') {
        preview.style.background = "linear-gradient(90deg, #008080 0%, #ffa500 50%, #ff00ff 100%)";
        lowBox.style.background = "#008080"; highBox.style.background = "#ff00ff";
        lowLabel.innerText = "Low g (near start)";
    } else {
        preview.style.background = "linear-gradient(90deg,#7a45a6 0%,#ff99cc 60%,#ffffff 100%)";
        lowBox.style.background = "#7a45a6"; highBox.style.background = "#ffffff";
        lowLabel.innerText = "Low h (near goal)";
    }
}

function drawHeatmapCell(r, c, valueNorm) {
    // keep start/goal colors fixed
    if ((START_POS && r === START_POS[0] && c === START_POS[1])) {
        ctx.fillStyle = "blue";  // start
    } else if ((GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1])) {
        ctx.fillStyle = "red";   // goal
    } else {
        let color;
        if (heatmapMode === 'f') {
            if (valueNorm < 0.33) color = lerpColor("#2b83ba", "#7fc97f", valueNorm / 0.33);
            else if (valueNorm < 0.66) color = lerpColor("#7fc97f", "#ffd92f", (valueNorm - 0.33) / 0.33);
            else color = lerpColor("#ffd92f", "#f03b20", (valueNorm - 0.66) / 0.34);
        } else if (heatmapMode === 'g') {
            color = valueNorm <= 0.5
                ? lerpColor("#008080", "#ffa500", valueNorm / 0.5)
                : lerpColor("#ffa500", "#ff00ff", (valueNorm - 0.5) / 0.5);
        } else {
            color = valueNorm < 0.6 ? lerpColor("#7a45a6", "#ff99cc", valueNorm / 0.6) : lerpColor("#ff99cc", "#ffffff", (valueNorm - 0.6) / 0.4);
        }
        ctx.fillStyle = color;
    }

    const rows = CURRENT_GRID.length;
    const cols = CURRENT_GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);
    ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);
}

// ---------------- MAZE DRAW ----------------
function drawMaze(grid) {
    if (!grid || !grid.length) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    const rows = grid.length;
    const cols = grid[0].length;
    const cellSize = computeCellSize(rows, cols);
    canvas.width = cellSize * cols;
    canvas.height = cellSize * rows;
    const wallMargin = Math.max(1, Math.floor(cellSize * 0.05));

    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
            const val = grid[r][c];
            ctx.fillStyle = (r===0||r===rows-1||c===0||c===cols-1) ? "white" :
                            (val===1) ? "#444" :
                            (val===2) ? "green" :
                            (val===3) ? "red" : "#222";
            ctx.fillRect(c*cellSize + wallMargin, r*cellSize + wallMargin, cellSize - 2*wallMargin, cellSize - 2*wallMargin);
        }
    }
}

// ---------------- PATH ANIMATION ----------------
async function animatePath(path, color="yellow", delay=30, myId=0) {
    if (!CURRENT_GRID.length || !path || !path.length) return;
    isAnimating = true;
    const rows = CURRENT_GRID.length;
    const cols = CURRENT_GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const margin = Math.max(1, Math.floor(cellSize * 0.2));
    const size = Math.max(1, cellSize - 2 * margin);

    for (const [r, c] of path) {
        if (myId !== animationId) break;

        // skip start/goal
        if ((START_POS && r === START_POS[0] && c === START_POS[1]) ||
            (GOAL_POS && r === GOAL_POS[0] && c === GOAL_POS[1])) continue;

        ctx.fillStyle = color;
        ctx.fillRect(c * cellSize + margin, r * cellSize + margin, size, size);
        await new Promise(res => setTimeout(res, delay));
    }
    isAnimating = false;
}

// ---------------- HEATMAP TOGGLE ----------------
function setHeatmap(mode) {
    heatmapMode = mode;
    updateHeatPreview();

    if (!LAST_STEPS.length || !LAST_SCORES.length) return;

    // Cancel any ongoing animation
    animationId++;
    const myId = animationId;
    isAnimating = true;

    drawMaze(CURRENT_GRID); // clear canvas + draw walls

    const values = LAST_SCORES.map(s => (heatmapMode === 'f' ? s.f : (heatmapMode === 'g' ? s.g : s.f - s.g)));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const rows = CURRENT_GRID.length;
    const cols = CURRENT_GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const pathMargin = Math.max(1, Math.floor(cellSize * 0.2));
    const pathSize = Math.max(1, cellSize - 2 * pathMargin);

    // adaptive delay based on grid size
    const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows * cols, 100))));

    (async function animateHeatmap() {
        for (let i = 0; i < LAST_STEPS.length; i++) {
            if (myId !== animationId) break;
            const [r, c] = LAST_STEPS[i];
            const score = LAST_SCORES[i];
            const raw = (heatmapMode === 'f' ? score.f : (heatmapMode === 'g' ? score.g : score.f - score.g));
            const norm = (raw - minVal) / (maxVal - minVal || 1);
            drawHeatmapCell(r, c, norm);
            await new Promise(res => setTimeout(res, delay));
        }

        // animate final path on top
        if (CURRENT_PATH && CURRENT_PATH.length) {
            await animatePath(CURRENT_PATH, "blue", 30, myId);
        }
        isAnimating = false;
    })();
}


// ---------------- SCORE MAP ----------------
function buildScoreMap() {
    SCORE_MAP = {};
    for (const s of LAST_SCORES) {
        const key = `${s.pos[0]},${s.pos[1]}`;
        SCORE_MAP[key] = { g: s.g, f: s.f, h: s.f - s.g };
    }
}

// ---------------- HOVER ----------------
function getCellUnderMouse(evt) {
    if (!CURRENT_GRID.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const rows = CURRENT_GRID.length;
    const cols = CURRENT_GRID[0].length;
    const cellSize = computeCellSize(rows, cols);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const c = Math.floor(x*scaleX/cellSize);
    const r = Math.floor(y*scaleY/cellSize);
    if (r<0||c<0||r>=rows||c>=cols) return null;
    return {r,c};
}


// updated mousemove
canvas.addEventListener("mousemove", (e) => {
    const cell = getCellUnderMouse(e);
    if (!cell) return;
    const key = `${cell.r},${cell.c}`;
    if (lastHover && lastHover.key === key) return;
    lastHover = { key, r: cell.r, c: cell.c };

    // --- Update hover info panel ---
    let info = `Hovered Cell: (${cell.r}, ${cell.c})\n`;
    const gridVal = CURRENT_GRID[cell.r][cell.c];
    if (gridVal === 1) { info += "Wall / blocked"; document.getElementById("hoverInfo").innerText = info; return; }
    if (gridVal === 2) info += "Start\n";
    if (gridVal === 3) info += "Goal\n";

    const s = SCORE_MAP[key];
    if (s) info += `g = ${s.g}\nh = ${s.h}\nf = ${s.f}`;
    else info += "g = n/a\nh = n/a\nf = n/a";
    document.getElementById("hoverInfo").innerText = info;
});

// on leave, we do need to redraw the current solution so hover outline is removed
canvas.addEventListener("mouseleave", () => {
    lastHover = null;
    document.getElementById("hoverInfo").innerText = "Hover a cell to see its g / h / f here.";
});

// ---------------- GENERATE MAZE ----------------
async function generateMaze() {
    animationId++;
    resetSharedMetrics(); resetAStarMetrics();
    hideAStarMetrics();
    CURRENT_GRID=[]; CURRENT_PATH=[]; START_POS=null; GOAL_POS=null;
    LAST_STEPS=[]; LAST_SCORES=[]; SCORE_MAP={};
    ctx.clearRect(0,0,canvas.width,canvas.height);

    try {
        const res = await fetch("/api/maze/generate");
        const data = await res.json();
        if(!data||!data.grid) throw new Error("Invalid response");
        CURRENT_GRID = data.grid;
        START_POS = data.start;
        GOAL_POS = data.goal;
        const r = document.querySelector("input[name=heatmap][value=f]");
        if(r){ r.checked=true; heatmapMode='f'; }
        updateHeatPreview();
        drawMaze(CURRENT_GRID);
    } catch(err){
        alert("Maze generation failed: "+err.message);
    }
}

// ---------------- SOLVE A* ----------------
async function solveAndAnimateAStar() {
    if(!CURRENT_GRID.length) return;
    showAStarMetrics();
    animationId++; const myId=animationId;

    LAST_STEPS=[]; LAST_SCORES=[]; SCORE_MAP={}; CURRENT_PATH=[];

    const startTime = performance.now();
    let data;
    try {
        const res = await fetch("/api/maze/solveWithAStar");
        data = await res.json();
        if(!data || data.error) throw new Error(data?.error || "invalid response");
    } catch(err){ alert("A* call failed: "+err.message); return; }

    const path = data.path||[];
    const steps = data.steps||[];
    const scores = data.scores||[];
    const endTime = performance.now();

    LAST_STEPS = steps; LAST_SCORES = scores; CURRENT_PATH = path;
    buildScoreMap();

    // metrics
    const pathCost = path.length;
    const metrics = data.metrics || {};
    let pathTurns = 0;
    for(let i=2;i<path.length;i++){
        const [x1,y1]=path[i-2], [x2,y2]=path[i-1], [x3,y3]=path[i];
        if(x2-x1 !== x3-x2 || y2-y1 !== y3-y2) pathTurns++;
    }
    const manhattanPath = START_POS && GOAL_POS ? Math.abs(START_POS[0]-GOAL_POS[0]) + Math.abs(START_POS[1]-GOAL_POS[1]) : 0;
    const nodesPruned = steps.length ? (((steps.length - path.length)/steps.length)*100).toFixed(1) : 0;
    const optimalityRatio = manhattanPath > 0 ? (pathCost / manhattanPath).toFixed(2) : "n/a";
    const pathSmoothness = pathTurns > 0 ? (pathCost / pathTurns).toFixed(2) : pathCost;


    document.getElementById("nodesVisited").innerText = steps.length;
    document.getElementById("pathLength").innerText = path.length;
    document.getElementById("executionTime").innerText = Math.round(endTime-startTime);
    document.getElementById("pathCost").innerText = pathCost;
    document.getElementById("pathTurns").innerText = pathTurns;
    document.getElementById("manhattanPath").innerText = manhattanPath;
    document.getElementById("nodesPruned").innerText = nodesPruned;
    document.getElementById("optimalityRatio").innerText = optimalityRatio;
    document.getElementById("pathSmoothness").innerText = pathSmoothness;
    document.getElementById("maxOpenSetSize").innerText = metrics.maxOpenSetSize || 0;
    document.getElementById("avgF").innerText = metrics.avgF?.toFixed(2) || 0;
    document.getElementById("avgG").innerText = metrics.avgG?.toFixed(2) || 0;
    document.getElementById("avgH").innerText = metrics.avgH?.toFixed(2) || 0;


    // animate exploration
    drawMaze(CURRENT_GRID);
    const values = LAST_SCORES.map(s => heatmapMode==='f'?s.f:(heatmapMode==='g'?s.g:s.f-s.g));
    const minVal = Math.min(...values); const maxVal=Math.max(...values);
    const rows = CURRENT_GRID.length; const cols=CURRENT_GRID[0].length;
    const delay = Math.max(4, Math.min(40, Math.floor(10000 / Math.max(rows*cols,100))));

    for(let i=0;i<LAST_STEPS.length;i++){
        if(myId!==animationId) return;
        const [r,c] = LAST_STEPS[i];
        const score = LAST_SCORES[i];
        const raw = heatmapMode==='f'?score.f:(heatmapMode==='g'?score.g:score.f-score.g);
        const norm = (raw-minVal)/(maxVal-minVal||1);
        drawHeatmapCell(r,c,norm);
        await new Promise(res=>setTimeout(res, delay));
    }

    await animatePath(CURRENT_PATH,"blue",30,myId);
    updateHeatPreview();
    document.getElementById("hoverInfo").innerText = "Hover a cell to see its g / h / f here.";
}

// ---------------- SOLVE MDP ----------------
async function solveAndAnimateMDP() {
    hideAStarMetrics();
    if(!CURRENT_GRID.length) return;
    animationId++; const myId=animationId;
    LAST_STEPS=[]; LAST_SCORES=[]; SCORE_MAP={}; CURRENT_PATH=[];

    const startTime = performance.now();
    let data;
    try {
        const res = await fetch("/api/maze/solveWithMdp");
        data = await res.json();
    } catch(err){ alert("MDP call failed: "+err.message); return; }

    const path = data?.path||[];
    CURRENT_PATH = path;

    document.getElementById("nodesVisited").innerText = path.length;
    document.getElementById("pathLength").innerText = path.length;
    document.getElementById("executionTime").innerText = Math.round(performance.now()-startTime);

    drawMaze(CURRENT_GRID);
    await animatePath(CURRENT_PATH,"yellow",30,myId);
}

// ---------------- INIT ----------------
(function init(){
    hideAStarMetrics();
    updateHeatPreview();
})();
