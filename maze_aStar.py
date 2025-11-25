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
    def _astar(self, track_steps=False):
        start, goal = self.start, self.goal

        open_set = []
        heapq.heappush(open_set, (0, start))
        came_from = {}
        g_score = {start: 0}
        f_score = {start: self.heuristic(start, goal)}
        open_set_hash = {start}

        steps = []

        while open_set:
            _, current = heapq.heappop(open_set)
            open_set_hash.remove(current)

            if track_steps:
                steps.append(current)  # track exploration for animation

            if current == goal:
                path = self.reconstruct_path(came_from, current)
                return (path, steps) if track_steps else path

            cr, cc = current
            for dr, dc in self.ACTIONS:
                nr, nc = cr + dr, cc + dc
                neighbor = (nr, nc)
                if not self.is_valid(nr, nc):
                    continue

                tentative_g = g_score[current] + 1  # uniform cost per move
                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score[neighbor] = tentative_g + self.heuristic(neighbor, goal)
                    if neighbor not in open_set_hash:
                        heapq.heappush(open_set, (f_score[neighbor], neighbor))
                        open_set_hash.add(neighbor)

        # No path found
        return ([], steps) if track_steps else []

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
