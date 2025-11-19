import numpy as np

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

    """Constructor of MDP object to solve 2D maze grid"""
    def __init__(self, grid, start, goal, discount_factor=0.9, step_cost=-0.05, goal_reward=10.0):
        self.grid = np.array(grid) # converting grid to numpy array - comes from maze_generator
        self.num_rows, self.num_cols = self.grid.shape # Number of rows and columns in the maze
        self.start = start # The tuple (row, column) of start - comes from maze_generator
        self.goal = goal # The tuple (row, column) of goal (end state) - comes from maze_generator
        self.discount_factor = discount_factor # factor for future rewards 
        self.step_cost = step_cost # Each step costs -0.05
        self.goal_reward = goal_reward # Reward for reaching the goal (+10)
        self.states = self._extract_states()

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

        # Next tuple is the current state + the tuple from where the chosen action lands
        new_row = state[0] + delta_row
        new_col = state[1] + delta_col

        # Verify that the next position taking place is valid, stay if invalid move
        if not self.is_valid(new_row, new_col):
            new_row, new_col = state

        # Determine the reward for the new state
        if (new_row, new_col) == self.goal:
            reward = self.goal_reward
        else:
            reward = self.step_cost
        return (new_row, new_col), reward


    """
    Performs value iteration to compute the optimal state values and policy.
    Applies the Bellman optimality equation iteratively
    Returns:
        V (The value function): Optimal value of each state
        policy: Optimal action to take at each state
    """
    def value_iteration(self, max_iters=1000, tol=1e-6):
        # All states initialize at (V = 0) - V is the value function 
        V = {state: 0 for state in self.states}

        # The loop approximates the optimal value function
        for _ in range(max_iters):
            delta = 0 # delta is to track the change in the maximum's state value from one iteration to the next.
            new_V = V.copy() # stores the updated state values for this iteration.

            # Looping through each state to update V values
            for state in self.states:
                # Skipping goal state 
                if state == self.goal:
                    new_V[state] = self.goal_reward
                    continue

                # Bellman function update: V(s) = max_a [ R(s,a) + γ * V(s') ]
                max_value = float('-inf') # start lower than everything, so first action sets a real value
                for action in self.ACTIONS:
                    next_state, reward = self.transition(state, action)
                    value = reward + self.discount_factor * V[next_state]
                    if value > max_value:
                        max_value = value

                # Convergence check
                # From one iteration to the next, we want the value of every state to be barely changing.
                delta = max(delta, abs(max_value - V[state]))

                # Update value for this state
                new_V[state] = max_value

            # Update the value function for all states in the iteration
            V = new_V

            # Value of states converged, stop iterating.
            if delta < tol:
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
        policy = {}  # dictionary to store best action for each state

        # Loop through all valid states 
        for state in self.states:

            # If the state is the goal, no action taken
            if state == self.goal:
                policy[state] = None
                continue

            best_action = None
            best_value = float('-inf')  # start lower than any real value

            # Evaluate all possible actions for a state 
            for action in self.ACTIONS:
                next_state, reward = self.transition(state, action)  # deterministic transition
                value = reward + self.discount_factor * V[next_state]  # Bellman update

                # If this action gives a higher value, update best_action
                if value > best_value:
                    best_value = value
                    best_action = action

            # Store the optimal action for this state
            policy[state] = best_action

        return policy

    """
    Follow a given policy (from the extract_policy function) from the start state to the goal state.
    Tracks each move along with action taken, resulting state, and reward.
    max_steps is to avoid infinite loops.
    Returns:
        path (list of tuples): ordered sequence of states visited from start to goal
        log (list of dicts): detailed info for each step including step number, state, action, next_state, and reward
    """
    def follow_policy(self, policy, max_steps=1000):
        path = [self.start]         
        log = []                     
        current_state = self.start

        for step in range(max_steps):
            # Stop if goal state is reached
            if current_state == self.goal:
                break

            # Look up the action to take based on the policy for the current state
            action = policy[current_state]
            if action is None:  # No action defined (goal state)
                break

            # Perform the deterministic transition
            next_state, reward = self.transition(current_state, action)

            # Record the step details in the log
            log.append({
                "step": step,
                "state": current_state,
                "action": action,
                "next_state": next_state,
                "reward": reward
            })

            # Stop if the agent is stuck in the same state
            if next_state == current_state:
                break

            # Append the next state to the path and update current_state
            path.append(next_state)
            current_state = next_state

        return path, log
    
    """
    Function to use, it ruuns value iteration, extracts policy, and follows the policy from start to goal.
    """
    def mdp_solver(self, max_iters=1000, tol=1e-6, max_steps=1000):
        V, policy = self.value_iteration(max_iters=max_iters, tol=tol)
        path, log = self.follow_policy(policy, max_steps=max_steps)
        return V, policy, path, log
