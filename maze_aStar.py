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
        #cell is valid if it is not a wall
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
    Implements the A* search algorithm to find the shortest path from start to goal.

    Uses a priority queue to explore nodes with the lowest estimated total cost first. The algorithm maintains
    g_score and f_score dictionaries to track the cost of reaching each node and the estimated total cost to the goal.
    
    Returns the path from start to goal as a list of (row, col) tuples if a path exists; otherwise, returns an empty list.
    """
    def solve(self):
        
        start = self.start
        goal = self.goal

        open_set = []
        heapq.heappush(open_set, (0, start))  # (f_score, node)

        came_from = {}
        g_score = {start: 0}
        f_score = {start: self.heuristic(start, goal)}

        open_set_hash = {start}

        while open_set:
            _, current = heapq.heappop(open_set)
            open_set_hash.remove(current)

            if current == goal:
                return self.reconstruct_path(came_from, current)

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
        return []
