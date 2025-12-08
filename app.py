from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from maze_generator import MazeGenerator
from maze_mdp import MazeMDP
from maze_aStar import MazeAStar
from maze_BFS import MazeBFS
from maze_DFS import MazeDFS
from maze_rl import MazeRL
import numpy as np

app = FastAPI()

CURRENT_MAZE = {"grid": None, "start": None, "goal": None}

@app.get("/api/maze/generate")
def generate_maze():
    gen = MazeGenerator()
    grid, start, goal = gen.create_maze()
    CURRENT_MAZE.update({"grid": grid, "start": start, "goal": goal})
    grid_list = grid.tolist() if isinstance(grid, np.ndarray) else grid
    return {"grid": grid_list, "start": list(start), "goal": list(goal)}

@app.get("/api/maze/solveWithAStar")
def solve_maze_a_star():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}
    solver = MazeAStar(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    path, steps, scores, metrics = solver._astar(track_steps=True, track_scores=True)
    return {
        "path": [list(pos) for pos in path],
        "steps": [list(pos) for pos in steps],
        "scores": [{"pos": list(s["pos"]), "g": s["g"], "f": s["f"]} for s in scores],
        "metrics": metrics
    }

@app.get("/api/maze/solveWithMDP")
def solve_maze_mdp():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}

    mdp = MazeMDP(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    
    # Solve the MDP and get both path and metrics
    path, metrics, V = mdp.mdp_solver()

    return {
        "path": path,
        "metrics": metrics,
        "values": {f"{r},{c}": v for (r,c), v in V.items()}
    }
    

@app.get("/api/maze/solveWithBFS")
def solve_maze_bfs():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}

    solver = MazeBFS(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    path, steps, metrics = solver.solve_with_steps()

    return {
        "path": [list(pos) for pos in path],
        "steps": [list(pos) for pos in steps],
        "metrics": metrics
    }

@app.get("/api/maze/solveWithDFS")
def solve_maze_dfs():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}

    solver = MazeDFS(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])
    path, steps, metrics = solver.solve_with_steps()

    return {
        "path": [list(pos) for pos in path],
        "steps": [list(pos) for pos in steps],
        "metrics": metrics
    }

@app.get("/api/maze/solveWithRL")
def solve_maze_rl():
    if CURRENT_MAZE["grid"] is None:
        return {"error": "No maze generated yet."}
    solver = MazeRL(CURRENT_MAZE["grid"], CURRENT_MAZE["start"], CURRENT_MAZE["goal"])

    # Train / evaluate with requested parameters and record specific episodes
    # NOTE: reduced episode count for a quick test; increase back to 3000 for full runs
    path, metrics, training_summary = solver.rl_solver(
        num_episodes=3000,
        max_steps=3000,
        exploration_rate=0.3,
        exploration_rate_decay=0.995,
        min_exploration_rate=0.05,
        record_episodes=[0, 1498, 2998]  # 0-based indexes for episodes 1,1499,3000 (quick test)
    )

    grid = CURRENT_MAZE["grid"]
    grid_list = grid.tolist() if isinstance(grid, np.ndarray) else grid

    # Helper to safely extract recorded episode path and ensure list-of-lists
    recorded = training_summary.get("recorded_episodes", {}) if training_summary else {}
    def episode_path(idx):
        ep = recorded.get(idx)
        if not ep:
            return []
        p = ep.get("path", [])
        return [list(pos) for pos in p]

    episodes = {
        "1": episode_path(0),
        "1499": episode_path(1498),
        "2999": episode_path(2998)
    }

    return {
        "grid": grid_list,
        "start": list(CURRENT_MAZE["start"]),
        "goal": list(CURRENT_MAZE["goal"]),
        "path": [list(pos) for pos in path],
        "metrics": metrics,
        "episodes": episodes
    }

app.mount("/", StaticFiles(directory=".", html=True), name="frontend")
