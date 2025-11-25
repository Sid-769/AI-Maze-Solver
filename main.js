const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

let CURRENT_GRID = [];
let CURRENT_PATH = [];
let animationId = 0;

// Draw the maze
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
            ctx.fillStyle = (r === 0 || r === rows-1 || c === 0 || c === cols-1) ? "white" :
                            (val === 1) ? "#444" : (val === 2) ? "green" : (val === 3) ? "red" : "#222";
            ctx.fillRect(c*cellSize + wallMargin, r*cellSize + wallMargin, cellSize - 2*wallMargin, cellSize - 2*wallMargin);
        }
    }
}

// Animate path (used for MDP or final A* path)
async function animatePath(path, color="yellow", delay=30, myId) {
    if (!CURRENT_GRID.length) return;
    const rows = CURRENT_GRID.length;
    const cols = CURRENT_GRID[0].length;
    const maxCanvasSize = 1000;
    const cellSize = Math.floor(maxCanvasSize / Math.max(rows, cols));
    const pathMargin = Math.max(1, Math.floor(cellSize * 0.2));
    const pathSize = Math.max(1, cellSize - 2*pathMargin);

    for (const [r, c] of path) {
        if (myId !== animationId) return; // cancel if a new animation started
        ctx.fillStyle = color;
        ctx.fillRect(c*cellSize + pathMargin, r*cellSize + pathMargin, pathSize, pathSize);
        await new Promise(res => setTimeout(res, delay));
    }
}

// Generate maze
async function generateMaze() {
    animationId++; // cancel previous animations
    CURRENT_GRID = [];
    CURRENT_PATH = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const res = await fetch("/api/maze/generate");
    const data = await res.json();
    CURRENT_GRID = data.grid;
    drawMaze(CURRENT_GRID);
}

// Solve and animate A*
async function solveAndAnimateAStar() {
    if (!CURRENT_GRID.length) return;
    animationId++;
    const myId = animationId;

    const res = await fetch("/api/maze/solveWithAStar");
    const data = await res.json();
    const path = data.path;
    const steps = data.steps;

    // Clear canvas and draw base maze
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMaze(CURRENT_GRID);

    // Animate exploration steps (cyan)
    for (const [r, c] of steps) {
        if (myId !== animationId) return;
        ctx.fillStyle = "cyan";
        const rows = CURRENT_GRID.length;
        const cols = CURRENT_GRID[0].length;
        const maxCanvasSize = 1000;
        const cellSize = Math.floor(maxCanvasSize / Math.max(rows, cols));
        const pathMargin = Math.max(1, Math.floor(cellSize * 0.2));
        const pathSize = Math.max(1, cellSize - 2*pathMargin);
        ctx.fillRect(c*cellSize + pathMargin, r*cellSize + pathMargin, pathSize, pathSize);
        await new Promise(res => setTimeout(res, 20));
    }

    // Animate final path (blue)
    await animatePath(path, "blue", 50, myId);
}

// Solve and animate MDP (stochastic path)
async function solveAndAnimateMDP() {
    if (!CURRENT_GRID.length) return;
    animationId++;
    const myId = animationId;

    const res = await fetch("/api/maze/solveWithMdp");
    const data = await res.json();
    if (!data.path || !data.path.length) return;
    CURRENT_PATH = data.path;

    // Clear canvas and draw maze before animating
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMaze(CURRENT_GRID);

    // Animate only one stochastic path (yellow)
    await animatePath(CURRENT_PATH, "yellow", 30, myId);
}
