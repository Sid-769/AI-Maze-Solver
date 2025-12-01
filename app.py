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
    path, metrics, train_info = solver.rl_solver()

    return {
        "path": [list(pos) for pos in path],
        "metrics": metrics,
        "rewards": train_info["rewards"],
        "recordedEpisodes": {
            str(ep): {
                "path": [list(pos) for pos in data["path"]],
                "totalReward": data["total_reward"],
            }
            for ep, data in train_info["recorded_episodes"].items()
        },
        "finalExplorationRate": train_info["final_exploration_rate"]
    }

app.mount("/", StaticFiles(directory=".", html=True), name="frontend")
