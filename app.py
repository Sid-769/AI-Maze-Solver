import random
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from maze_generator import MazeGenerator
from maze_mdp import MazeMDP
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

    # Store maze in memory
    CURRENT_MAZE["grid"] = grid
    CURRENT_MAZE["start"] = start
    CURRENT_MAZE["goal"] = goal

    # Convert grid to nested list for JSON
    grid_list = grid.tolist() if isinstance(grid, np.ndarray) else grid

    return {
        "grid": grid_list,
        "start": list(start),
        "goal": list(goal)
    }

@app.get("/api/maze/solveWithMdp")
def solve_maze():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}

    mdp = MazeMDP(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    V, policy, path, log = mdp.mdp_solver()

    path_list = [list(pos) for pos in path]

    return {
        "path": path_list
    }

app.mount("/", StaticFiles(directory=".", html=True), name="frontend")
