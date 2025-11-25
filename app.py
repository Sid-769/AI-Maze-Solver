from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from maze_generator import MazeGenerator
from maze_mdp import MazeMDP
from maze_AStar import MazeAStar
import numpy as np

app = FastAPI()

CURRENT_MAZE = {
    "grid": None,
    "start": None,
    "goal": None
}

@app.get("/api/maze/generate")
def generate_maze():
    gen = MazeGenerator()
    grid, start, goal = gen.create_maze()
    CURRENT_MAZE["grid"] = grid
    CURRENT_MAZE["start"] = start
    CURRENT_MAZE["goal"] = goal
    grid_list = grid.tolist() if isinstance(grid, np.ndarray) else grid
    return {
        "grid": grid_list,
        "start": list(start),
        "goal": list(goal)
    }

# --- Solve with A* (stepwise) ---
@app.get("/api/maze/solveWithAStar")
def solve_maze_a_star():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}

    solver = MazeAStar(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    # Use step-tracking solve
    path, steps = solver.solve_with_steps()
    return {"path": [list(pos) for pos in path], "steps": [list(pos) for pos in steps]}

# --- Solve with MDP (stepwise following policy) ---
@app.get("/api/maze/solveWithMdp")
def solve_maze_mdp():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}
    
    mdp = MazeMDP(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    V, policy, path, log = mdp.mdp_solver()
    steps = [entry['state'] for entry in log]  # states visited
    return {"path": [list(pos) for pos in path], "steps": [list(pos) for pos in steps]}

# Serve static files (JS/HTML)
app.mount("/", StaticFiles(directory=".", html=True), name="frontend")