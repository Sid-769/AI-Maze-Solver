import numpy as np
from cs3346_groupproject.mdp_maze import MazeMDP
from maze_generator import MazeGenerator

def print_maze_with_path(grid, path, start, goal):
    for r in range(len(grid)):
        row = []
        for c in range(len(grid[0])):
            if grid[r][c] == 1:
                row.append("█")
            elif (r, c) == start:
                row.append("S")
            elif (r, c) == goal:
                row.append("G")
            elif (r, c) in path and (r, c) != start and (r, c) != goal:
                row.append("*")
            else:
                row.append(" ")
        print(" ".join(row))

# ROOT OF APPLICATION START
if __name__ == "__main__":
    # Generate maze
    mg = MazeGenerator()
    grid, start, goal = mg.create_maze()

    # Solve the maze using MDP and get value function, policy, path, and detailed log
    mdp = MazeMDP(grid, start, goal)
    V, policy, mdp_path, log = mdp.mdp_solver()
    print_maze_with_path(grid, mdp_path, start, goal)
    print("\nPath sequence:", mdp_path)
    print("\nStep-by-step log:")
    for step_info in log:
        print(f"Step {step_info['step']}: State {step_info['state']} -> Action {step_info['action']} -> "
            f"Next State {step_info['next_state']} -> Reward {step_info['reward']}")