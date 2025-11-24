const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

let CURRENT_GRID = [];
let CURRENT_PATH = [];

function drawMaze(grid, path) {
    const rows = grid.length;
    const cols = grid[0].length;

    const maxCanvasSize = 1000;
    const cellSize = Math.floor(maxCanvasSize / Math.max(rows, cols));

    // Resize canvas exactly to fit the maze
    canvas.width = cellSize * cols;
    canvas.height = cellSize * rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Determine wall & path thickness based on maze size
    const wallMargin = Math.max(1, Math.floor(cellSize * 0.05));
    const pathMargin = Math.max(1, Math.floor(cellSize * 0.2));
    const pathSize = Math.max(1, cellSize - 2 * pathMargin);

    // Draw maze cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let val = grid[r][c];

            // Force outer border to be black
            if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
                ctx.fillStyle = "white"; // outside border 
            } else if (val === 1) ctx.fillStyle = "#444";       // wall
            else if (val === 2) ctx.fillStyle = "green";       // start
            else if (val === 3) ctx.fillStyle = "red";         // goal
            else ctx.fillStyle = "#222";                       // floor

            ctx.fillRect(
                c * cellSize + wallMargin,
                r * cellSize + wallMargin,
                cellSize - 2 * wallMargin,
                cellSize - 2 * wallMargin
            );
        }
    }

    ctx.fillStyle = "yellow";
    for (const [r, c] of path) {
        ctx.fillRect(
            c * cellSize + pathMargin,
            r * cellSize + pathMargin,
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
