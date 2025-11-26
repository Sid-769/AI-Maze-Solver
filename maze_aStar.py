import heapq
import numpy as np

"""
Generic A* solver for any 2D maze. This only works with MazeGenerator 
Expects a 2D grid: 0 → empty/free cell, 1 → wall, 2 → start, 3 → goal
"""

class MazeAStar:
    # Same 4-neighbor moves as MazeMDP: U, D, L, R
    ACTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def __init__(self, grid, start, goal):
        # Ensure numpy array for easy indexing, just like MazeMDP
        self.grid = np.array(grid)
        self.num_rows, self.num_cols = self.grid.shape
        self.start = tuple(start)
        self.goal = tuple(goal)

    """
    Checks if a cell (r, c) is a valid position in the maze,
    a position is valid if it is within bounds and not a wall
    """
    def is_valid(self, r, c):
        in_bounds = 0 <= r < self.num_rows and 0 <= c < self.num_cols
        if not in_bounds:
            return False
        # Cell is valid if it is not a wall
        return self.grid[r, c] != 1

    """
    Computes the Manhattan distance between two grid cells.

    This heuristic estimates the minimal path cost for A* when movement is restricted
    to four directions (up, down, left, right), as is typical in grid-based mazes.
    Returns the sum of the absolute differences of row and column indices.
    """
    def heuristic(self, a, b):
        # Manhattan distance on a grid
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    """
    Reconstructs path from the start node to the goal node using parent pointers.

    Starts from the goal node and traces back to the start node, the function follows the
    parent pointers stored in the came_from dictionary. It appends each node to the path list
    and finally reverses the list to get the path from start to goal.
    Returns the reconstructed path as a list of (row, col) tuples.
    """
    def reconstruct_path(self, came_from, current):
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    """
    Internal A* method that performs the search.
    Can optionally track steps for animation.
    Returns:
        path: the final optimal path
        steps: the order in which nodes were explored (only if track_steps=True)
    """
    def _astar(self, track_steps=False, track_scores=False):
        start, goal = self.start, self.goal

        open_set = []
        heapq.heappush(open_set, (0, start))
        came_from = {}
        g_score = {start: 0}
        f_score = {start: self.heuristic(start, goal)}
        open_set_hash = {start}

        steps = []
        scores = []  # g/f per step

        max_open_set_size = 1
        f_sum = g_sum = h_sum = 0
        expanded_count = 0

        while open_set:
            _, current = heapq.heappop(open_set)
            open_set_hash.remove(current)
            expanded_count += 1

            if track_steps:
                steps.append(current)
                if track_scores:
                    scores.append({
                        "pos": current,
                        "g": g_score[current],
                        "f": f_score[current]
                    })

            g_val = g_score[current]
            f_val = f_score[current]
            h_val = f_val - g_val
            g_sum += g_val
            f_sum += f_val
            h_sum += h_val

            if current == goal:
                path = self.reconstruct_path(came_from, current)
                result = (path, steps, scores) if track_steps else path
                metrics = {
                    "maxOpenSetSize": max_open_set_size,
                    "avgF": f_sum / expanded_count if expanded_count else 0,
                    "avgG": g_sum / expanded_count if expanded_count else 0,
                    "avgH": h_sum / expanded_count if expanded_count else 0
                }
                if track_steps and track_scores:
                    return (*result, metrics)
                elif track_steps:
                    return (*result, metrics)
                return (path, metrics)

            cr, cc = current
            for dr, dc in self.ACTIONS:
                nr, nc = cr + dr, cc + dc
                neighbor = (nr, nc)
                if not self.is_valid(nr, nc):
                    continue

                tentative_g = g_score[current] + 1
                if neighbor not in g_score:
                    g_score[neighbor] = tentative_g

                if neighbor not in f_score or tentative_g + self.heuristic(neighbor, goal) < f_score.get(neighbor, float('inf')):
                    came_from[neighbor] = current
                    f_score[neighbor] = tentative_g + self.heuristic(neighbor, goal)
                    if neighbor not in open_set_hash:
                        heapq.heappush(open_set, (f_score[neighbor], neighbor))
                        open_set_hash.add(neighbor)

            max_open_set_size = max(max_open_set_size, len(open_set_hash))

        # No path found
        metrics = {
            "maxOpenSetSize": max_open_set_size,
            "avgF": f_sum / expanded_count if expanded_count else 0,
            "avgG": g_sum / expanded_count if expanded_count else 0,
            "avgH": h_sum / expanded_count if expanded_count else 0
        }
        if track_steps:
            return ([], steps, scores, metrics)
        return ([], metrics)

    """
    Public method to return just the optimal path (classic solve)
    """
    def solve(self):
        return self._astar(track_steps=False)

    """
    Public method to return both the path and exploration steps (with animation)
    """
    def solve_with_steps(self):
        return self._astar(track_steps=True)
