import numpy as np
import random

"""
Generic MDP solver for any 2D maze. This only works with MazeGenerator 
Expects a 2D grid: 0 → empty/free cell, 1 → wall, 2 → start, 3 → goal
"""
class MazeMDP:
    """
    These are the possible moves:
    "U" = Up → subtract 1 from row
    "D" = Down → add 1 to row
    "L" = Left → subtract 1 from column
    "R" = Right → add 1 to column
    Stored as (delta_row, delta_col) pairs.
    """
    ACTIONS = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}

    def __init__(self, grid, start, goal, discount_factor=0.9, step_cost=-0.05, goal_reward=10.0):
        """
        Initialize the MDP with the maze grid and parameters.
        """
        self.grid = np.array(grid)                 # Convert grid to numpy array
        self.num_rows, self.num_cols = self.grid.shape
        self.start = tuple(start)                  # Start cell (row, col)
        self.goal = tuple(goal)                    # Goal cell (row, col)
        self.discount_factor = discount_factor     # Discount factor γ for future rewards
        self.step_cost = step_cost                 # Penalty for each step
        self.goal_reward = goal_reward             # Reward for reaching goal
        self.states = self._extract_states()       # List of all valid states (non-wall)

        # Stochastic action probabilities
        self.p_success = 0.8                       # Probability the intended action succeeds
        self.p_slip = 0.1                          # Probability of slipping left or right

    """
    This function identifies all valid states in maze that isn't a wall,
    and returns the tuples of those free cells
    """
    def _extract_states(self):
        valid_states = []
        for row in range(self.num_rows):
            for col in range(self.num_cols):
                if self.grid[row][col] != 1:  # If cell is not a wall
                    valid_states.append((row, col))

        # Return the list that stores all valid position
        return valid_states

    """
    Checks if a cell (row, col) is a valid position in the maze, 
    and returns true if valid, false if not
    """
    def is_valid(self, row, col):
        row_in_bounds = 0 <= row < self.num_rows
        col_in_bounds = 0 <= col < self.num_cols
        not_a_wall = self.grid[row][col] != 1

        # Only valid if all three conditions are true
        return row_in_bounds and col_in_bounds and not_a_wall

    """
    Performs a deterministic move from the current state using the given action.
    Returns a tuple: (next_state, reward) where next_state is the resulting state after the action,
    and reward is the immediate reward for taking that action in the current state.
    Essentially, this implements the MDP’s transition and reward logic for a single step.
    """
    def transition(self, state, action):
        # The current state is the goal
        if state == self.goal:
            return state, self.goal_reward

        # Get the row and column change for the chosen action
        delta_row, delta_col = self.ACTIONS[action]
        new_row, new_col = state[0] + delta_row, state[1] + delta_col

        # Stay in place if move is invalid
        if not self.is_valid(new_row, new_col):
            new_row, new_col = state

        # Assign reward
        reward = self.goal_reward if (new_row, new_col) == self.goal else self.step_cost
        return (new_row, new_col), reward

    """
    Return a list of possible outcomes for an action from a state.
    Each outcome is a tuple: (probability, next_state, reward)
    Models stochasticity: success, slip-left, slip-right.
    """
    def get_action_outcomes(self, state, action):
        left_of = {"U": "L", "L": "D", "D": "R", "R": "U"}
        right_of = {"U": "R", "R": "D", "D": "L", "L": "U"}

        outcomes = []
        for prob, act in [(self.p_success, action), (self.p_slip, left_of[action]), (self.p_slip, right_of[action])]:
            next_state, reward = self.transition(state, act)
            outcomes.append((prob, next_state, reward))
        return outcomes

    """
    Perform value iteration to compute optimal value function and policy.
    Returns:
        V: dict mapping state -> value
        policy: dict mapping state -> optimal action
    """
    def value_iteration(self, max_iters=1000, tol=1e-6):

        V = {s: 0 for s in self.states}

        for _ in range(max_iters):
            delta = 0 # delta is to track the change in the maximum's state value from one iteration to the next.
            new_V = V.copy() # stores the updated state values for this iteration.

            for s in self.states:
                # Skipping goal state
                if s == self.goal:
                    new_V[s] = self.goal_reward
                    continue

                max_val = float("-inf")
                # Bellman function update: V(s) = max_a [ R(s,a) + γ * V(s') ]
                for a in self.ACTIONS:
                    expected_value = sum(prob * (reward + self.discount_factor * V[next_state])
                                         for prob, next_state, reward in self.get_action_outcomes(s, a))
                    if expected_value > max_val:
                        max_val = expected_value

                # Convergence check
                # From one iteration to the next, we want the value of every state to be barely changing.
                delta = max(delta, abs(max_val - V[s]))
                new_V[s] = max_val

            V = new_V
            if delta < tol:  # Stop if value function has converged
                break

        # Extracting the optimal policy from the value function
        policy = self.extract_policy(V)
        return V, policy

    """
    The function is given a value function V for all states and it extracts the optimal policy.
    The policy well give the best action to perform from each state to the next:
    It applies the following formula:
        π*(s) = argmax_a [ R(s,a) + γ * V(s') ]
    """
    def extract_policy(self, V):
        policy = {}
        for s in self.states:
            if s == self.goal:
                policy[s] = None
                continue

            best_action = None
            best_val = float("-inf")
            for a in self.ACTIONS:
                expected_value = sum(prob * (reward + self.discount_factor * V[next_state])
                                     for prob, next_state, reward in self.get_action_outcomes(s, a))
                if expected_value > best_val:
                    best_val = expected_value
                    best_action = a
            policy[s] = best_action
        return policy
    
    """
    Follow a given policy from start to goal.
    Implements stochastic action outcomes based on p_success and p_slip.
    Includes loop prevention by random moves if stuck.
    Returns:
        path: list of states
    """
    def follow_policy(self, policy, max_steps=10000):
        path = [self.start]
        current_state = self.start

        for _ in range(max_steps):
            if current_state == self.goal:
                break

            action = policy.get(current_state)
            if action is None:
                break

            # Apply stochastic transition
            r = random.random()
            if r < self.p_success:
                chosen_action = action
            elif r < self.p_success + self.p_slip:
                left_of = {"U": "L", "L": "D", "D": "R", "R": "U"}
                chosen_action = left_of[action]
            else:
                right_of = {"U": "R", "R": "D", "D": "L", "L": "U"}
                chosen_action = right_of[action]

            next_state, _ = self.transition(current_state, chosen_action)

            # If stuck, pick a random valid neighbor to escape
            if next_state == current_state:
                neighbors = [s for s, _ in [self.transition(current_state, a) for a in self.ACTIONS] if s != current_state]
                if neighbors:
                    next_state = random.choice(neighbors)

            path.append(next_state)
            current_state = next_state

        return path

    """
    Solve the MDP: compute value function, extract policy, and follow policy.
    Returns:
        V: value function
        policy: optimal policy
        path: trajectory from start to goal
    """
    def mdp_solver(self, max_iters=1000, tol=1e-6, max_steps=10000):
        V, policy = self.value_iteration(max_iters, tol)
        path = self.follow_policy(policy, max_steps)
        return V, policy, path
