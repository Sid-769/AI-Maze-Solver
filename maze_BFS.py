from collections import deque
import numpy as np

"""
Generic BFS solver for any 2D maze. Works with MazeGenerator.
Expects a 2D grid:
    0 → empty/free cell
    1 → wall
    2 → start
    3 → goal
"""

class MazeBFS:
    # 4-neighbor moves (Up, Down, Left, Right)
    ACTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def __init__(self, grid, start, goal):
        # Ensure numpy array for easy indexing
        self.grid = np.array(grid)
        self.num_rows, self.num_cols = self.grid.shape
        self.start = tuple(start)
        self.goal = tuple(goal)

    """
    Checks if a cell (r, c) is valid:
    - within grid bounds
    - not a wall
    """
    def is_valid(self, r, c):
        return 0 <= r < self.num_rows and 0 <= c < self.num_cols and self.grid[r, c] != 1

    """
    Reconstructs path from start to goal using parent pointers.
    Returns a list of (row, col) tuples.
    """
    def reconstruct_path(self, parent, current):
        path = [current]
        while current in parent:
            current = parent[current]
            path.append(current)
        path.reverse()
        return path

    """
    Internal BFS solver.
    Can track exploration steps for animation.
    Returns:
        path: final path from start to goal
        steps: cells visited in order
        metrics: BFS-related metrics
    """
    def _bfs(self, track_steps=False):
        start, goal = self.start, self.goal

        queue = deque([start])
        visited = set([start])
        parent = {}

        steps = []
        max_queue_size = 1  # Similar to maxOpenSetSize in A*
        expanded_count = 0

        while queue:
            current = queue.popleft()
            expanded_count += 1

            if track_steps:
                steps.append(current)

            if current == goal:
                # Path found
                path = self.reconstruct_path(parent, current)
                break

            cr, cc = current
            for dr, dc in self.ACTIONS:
                nr, nc = cr + dr, cc + dc
                neighbor = (nr, nc)
                if not self.is_valid(nr, nc) or neighbor in visited:
                    continue
                visited.add(neighbor)
                parent[neighbor] = current
                queue.append(neighbor)

            max_queue_size = max(max_queue_size, len(queue))
        else:
            # No path found
            path = []

        # Metrics
        path_length = len(path)
        nodes_visited = len(steps)
        path_turns = 0
        for i in range(2, len(path)):
            r1,c1 = path[i-2]
            r2,c2 = path[i-1]
            r3,c3 = path[i]
            if (r2-r1, c2-c1) != (r3-r2, c3-c2):
                path_turns += 1
        manhattan_path = abs(start[0]-goal[0]) + abs(start[1]-goal[1])
        optimality_ratio = (path_length/manhattan_path) if manhattan_path>0 else "n/a"

        metrics = {
            "maxQueueSize": max_queue_size,
            "nodesVisited": nodes_visited,
            "pathLength": path_length,
            "pathTurns": path_turns,
            "manhattanPath": manhattan_path,
            "optimalityRatio": round(optimality_ratio, 2) if optimality_ratio != "n/a" else "n/a"
        }

        if track_steps:
            return path, steps, metrics
        return path, metrics

    """
    Public method: just the path
    """
    def solve(self):
        return self._bfs(track_steps=False)

    """
    Public method: path + steps (for animation)
    """
    def solve_with_steps(self):
        return self._bfs(track_steps=True)
