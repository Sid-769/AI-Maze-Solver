from mazelib import Maze
from mazelib.generate.Prims import Prims
import random

"""The class randomly generates a maze with a start, a goal(end), and random size"""
class MazeGenerator:
    def __init__(self, min_size=11, max_size=41):
        self.min_size = min_size
        self.max_size = max_size
        self.grid = None          # To store the maze in a 2D array (Grid)
        self.start = None         # Coordinates of start of maze
        self.goal = None          # Coordinates of end of maze

    def random_odd(self):
        """Return a random odd integer between min_size and max_size."""
        n = random.randint(self.min_size, self.max_size)
        return n if n % 2 == 1 else n + 1 # Make sure always odd

    def create_maze(self):
        """Generate a random maze and automatically places a start and goal.
        The Maze() object generates a grid where:
            0 = empty/free cell
            1 = wall
        This function then marks:
            2 = start cell
            3 = goal cell
        by automatically selecting the top-left free cell as start and the bottom-right free cell as goal.
        """
        # Generate maze with random odd dimensions
        width = self.random_odd()
        height = self.random_odd()
        m = Maze() 
        m.generator = Prims(width, height)  # Use Prim's algorithm (from library)
        m.generate()                        # Actually creates the maze here (call on library)
        self.grid = m.grid                  # Setting our object with the grid from the library

        # This just identifies the free cells such that the start and goal are always empty cells not wall
        free_cells = []
        for row in range(len(self.grid)):
            for col in range(len(self.grid[0])):
                if self.grid[row][col] == 0:
                    free_cells.append((row, col))

        # Settting the start and goal on the maze
        self.start = free_cells[0]      # top-left free cell as start
        self.goal = free_cells[-1]      # bottom-right free cell as goal
        self.grid[self.start[0]][self.start[1]] = 2
        self.grid[self.goal[0]][self.goal[1]] = 3

        # Return the grid of maze and coordinates
        return self.grid, self.start, self.goal
