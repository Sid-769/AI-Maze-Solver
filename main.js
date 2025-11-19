const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

let CURRENT_GRID = [];
let CURRENT_PATH = [];

function drawMaze(grid, path) {
    const rows = grid.length;
    const cols = grid[0].length;

    const maxCanvasSize = 700;

    const cellSize = Math.floor(maxCanvasSize / Math.max(rows, cols));

    // Resize canvas exactly to fit the maze
    canvas.width = cellSize * cols;
    canvas.height = cellSize * rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw maze cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let val = grid[r][c];
            if (val === 1) ctx.fillStyle = "#444";       // wall
            else if (val === 2) ctx.fillStyle = "green"; // start
            else if (val === 3) ctx.fillStyle = "red";   // goal
            else ctx.fillStyle = "#222";                 // floor

            ctx.fillRect(
                c * cellSize,
                r * cellSize,
                cellSize,
                cellSize
            );
        }
    }

    ctx.fillStyle = "yellow";
    const padding = Math.max(1, Math.floor(cellSize * 0.2));
    const pathSize = Math.max(1, cellSize - 2 * padding);

    for (const [r, c] of path) {
        ctx.fillRect(
            c * cellSize + padding,
            r * cellSize + padding,
            pathSize,
            pathSize
        );
    }
}

async function generateMaze() {
    try {
        const res = await fetch("/api/maze/generate");
        const data = await res.json();
        CURRENT_GRID = data.grid;
        CURRENT_PATH = [];
        drawMaze(CURRENT_GRID, CURRENT_PATH);
    } catch (err) {
        console.error("Error generating maze:", err);
    }
}

async function solveMazeWithMdp() {
    try {
        if (!CURRENT_GRID.length) {
            alert("Please generate a maze first!");
            return;
        }
        const res = await fetch("/api/maze/solveWithMdp");
        const data = await res.json();
        CURRENT_PATH = data.path;
        drawMaze(CURRENT_GRID, CURRENT_PATH);
    } catch (err) {
        console.error("Error solving maze:", err);
    }
}
