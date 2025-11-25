const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

let CURRENT_GRID = [];
let CURRENT_PATH = [];
let CURRENT_STEPS = [];

function drawMaze(grid) {
    const rows = grid.length;
    const cols = grid[0].length;

    const maxCanvasSize = 1000;
    const cellSize = Math.floor(maxCanvasSize / Math.max(rows, cols));
    canvas.width = cellSize * cols;
    canvas.height = cellSize * rows;

    const wallMargin = Math.max(1, Math.floor(cellSize * 0.05));
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let val = grid[r][c];
            if (r === 0 || r === rows-1 || c === 0 || c === cols-1) ctx.fillStyle = "white";
            else if (val === 1) ctx.fillStyle = "#444";      // wall
            else if (val === 2) ctx.fillStyle = "green";    // start
            else if (val === 3) ctx.fillStyle = "red";      // goal
            else ctx.fillStyle = "#222";                    // floor

            ctx.fillRect(c*cellSize + wallMargin, r*cellSize + wallMargin, cellSize - 2*wallMargin, cellSize - 2*wallMargin);
        }
    }
}

// Animate cells being explored
async function animateSteps(steps, color, delay=30) {
    const rows = CURRENT_GRID.length;
    const cols = CURRENT_GRID[0].length;
    const maxCanvasSize = 1000;
    const cellSize = Math.floor(maxCanvasSize / Math.max(rows, cols));
    const pathMargin = Math.max(1, Math.floor(cellSize * 0.2));
    const pathSize = Math.max(1, cellSize - 2*pathMargin);

    for (const [r, c] of steps) {
        ctx.fillStyle = color;
        ctx.fillRect(c*cellSize + pathMargin, r*cellSize + pathMargin, pathSize, pathSize);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

// Animate final path
async function animatePath(path, color="blue", delay=50) {
    await animateSteps(path, color, delay);
}

// --- API Calls ---
async function generateMaze() {
    const res = await fetch("/api/maze/generate");
    const data = await res.json();
    CURRENT_GRID = data.grid;
    CURRENT_PATH = [];
    drawMaze(CURRENT_GRID);
}

async function solveAndAnimateAStar() {
    const res = await fetch("/api/maze/solveWithAStar");
    const data = await res.json();
    CURRENT_PATH = data.path;
    const steps = data.steps;

    drawMaze(CURRENT_GRID);
    await animateSteps(steps, "cyan", 20);
    await animatePath(CURRENT_PATH, "blue", 50);
}

async function solveAndAnimateMDP() {
    const res = await fetch("/api/maze/solveWithMdp");
    const data = await res.json();
    CURRENT_PATH = data.path;
    const steps = data.steps;

    drawMaze(CURRENT_GRID);
    await animateSteps(steps, "orange", 50);
    await animatePath(CURRENT_PATH, "yellow", 50);
}
