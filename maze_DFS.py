from collections import deque
import numpy as np

"""
Depth-First Search (DFS) solver for any 2D maze.
Works exactly like MazeBFS but explores in a depth-first manner.

Grid encoding:
    0 → empty/free cell
    1 → wall
    2 → start
    3 → goal
"""

class MazeDFS:
    # Same 4-neighbor movement (Up, Down, Left, Right)
    ACTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def __init__(self, grid, start, goal):
        self.grid = np.array(grid)
        self.num_rows, self.num_cols = self.grid.shape
        self.start = tuple(start)
        self.goal = tuple(goal)

    """
    Cell is valid if:
    - inside the grid
    - not a wall
    """
    def is_valid(self, r, c):
        return (
            0 <= r < self.num_rows and
            0 <= c < self.num_cols and
            self.grid[r, c] != 1
        )

    """
    Reconstructs the path from goal → start via parent pointers.
    """
    def reconstruct_path(self, parent, current):
        path = [current]
        while current in parent:
            current = parent[current]
            path.append(current)
        path.reverse()
        return path

    """
    Internal DFS solver using an explicit stack.

    Metrics collected:
        - maxStackSize:   Largest size the DFS stack reached
        - nodesVisited:   Number of nodes explored
        - pathLength:     Length of final path
        - pathTurns:      Number of direction changes
        - manhattanPath:  Manhattan distance between start & goal
        - optimalityRatio: pathLength / manhattanPath
    """
    def _dfs(self, track_steps=False):
        start, goal = self.start, self.goal

        stack = [start]
        visited = set([start])
        parent = {}

        steps = []
        expanded_count = 0
        max_stack_depth = 1

        dead_ends = 0
        backtracks = 0

        while stack:
            current = stack.pop()
            expanded_count += 1

            if track_steps:
                steps.append(current)

            if current == goal:
                path = self.reconstruct_path(parent, current)
                break

            cr, cc = current
            pushed = 0

            # explore neighbors
            for dr, dc in self.ACTIONS:
                nr, nc = cr + dr, cc + dc
                neighbor = (nr, nc)
                if not self.is_valid(nr, nc) or neighbor in visited:
                    continue
                visited.add(neighbor)
                parent[neighbor] = current
                stack.append(neighbor)
                pushed += 1

            # deepest DFS ever went
            max_stack_depth = max(max_stack_depth, len(stack))

            # no neighbors → dead end
            if pushed == 0:
                dead_ends += 1
                # but only count as a *true* backtrack if stack is not empty
                if len(stack) > 0:
                    backtracks += 1
        else:
            path = []

        # Compute path metrics
        path_length = len(path)
        nodes_visited = len(steps)

        path_turns = 0
        for i in range(2, len(path)):
            r1, c1 = path[i-2]
            r2, c2 = path[i-1]
            r3, c3 = path[i]
            if (r2 - r1, c2 - c1) != (r3 - r2, c3 - c2):
                path_turns += 1

        manhattan_path = (
            abs(start[0] - goal[0]) + abs(start[1] - goal[1])
        )
        optimality_ratio = (
            path_length / manhattan_path if manhattan_path > 0 else "n/a"
        )

        metrics = {
            "maxStackDepth": max_stack_depth,
            "nodesVisited": nodes_visited,
            "pathLength": path_length,
            "pathTurns": path_turns,
            "deadEnds": dead_ends,
            "backtracks": backtracks,
            "manhattanPath": manhattan_path,
            "optimalityRatio": (
                round(optimality_ratio, 2)
                if optimality_ratio != "n/a" else "n/a"
            )
        }

        if track_steps:
            return path, steps, metrics
        return path, metrics

    """
    Public method: only returns final path + metrics.
    """
    def solve(self):
        return self._dfs(track_steps=False)

    """
    Public method: returns path + per-step exploration (for animation).
    """
    def solve_with_steps(self):
        return self._dfs(track_steps=True)
