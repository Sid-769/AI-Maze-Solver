import numpy as np
import time
import random

"""
Generic MDP solver for any 2D maze.
Expects a 2D grid: 0 → empty/free cell, 1 → wall, 2 → start, 3 → goal
"""
class MazeMDP:
    ACTIONS = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}

    def __init__(self, grid, start, goal, discount_factor=0.9, step_cost=-0.05, goal_reward=10.0):
        self.grid = np.array(grid)
        self.num_rows, self.num_cols = self.grid.shape
        self.start = tuple(start)
        self.goal = tuple(goal)
        self.discount_factor = discount_factor
        self.step_cost = step_cost
        self.goal_reward = goal_reward
        self.states = self._extract_states()

        # Stochastic action probabilities
        self.p_success = 0.8
        self.p_slip = 0.1

    # ------------------------- Utility functions -------------------------
    """
    Extracts all valid (non-wall) states in the maze.

    A state is considered valid if the cell is not a wall (grid value ≠ 1).
    Returns a list of all (row, col) coordinates that the agent can occupy.

    Returns:
        list[tuple]: all valid (row, col) state positions in the maze.
    """
    def _extract_states(self):
        return [(r, c) for r in range(self.num_rows) for c in range(self.num_cols) if self.grid[r][c] != 1]

    def is_valid(self, row, col):
        return 0 <= row < self.num_rows and 0 <= col < self.num_cols and self.grid[row][col] != 1


    """
    Performs a stochastic-free state transition for the MDP.

    Given a state and an intended action, this function attempts to move the
    agent in the specified direction. If the move leads into a wall or outside
    the grid, the agent stays in the same state.

    Rewards:
        - Goal cell → +goal_reward
        - Any other valid move → step_cost

    Args:
        state (tuple): current (row, col) position
        action (str): one of {"U", "D", "L", "R"}

    Returns:
        next_state (tuple): resulting (row, col) after attempting the action
        reward (float): immediate reward for entering the next state
    """
    def transition(self, state, action):
        if state == self.goal:
            return state, self.goal_reward
        dr, dc = self.ACTIONS[action]
        new_row, new_col = state[0] + dr, state[1] + dc
        if not self.is_valid(new_row, new_col):
            new_row, new_col = state
        reward = self.goal_reward if (new_row, new_col) == self.goal else self.step_cost
        return (new_row, new_col), reward

    """
    Returns the stochastic outcomes of taking an action in the maze.

    In this MDP, actions are noisy:
        - With probability p_success of 0.8, ie. the intended action.
        - With probability p_slip of 0.1, ie. the agent slips to the action on the left.
        - With probability p_slip of 0.1, ie. the agent slips to the action on the right.

    This function enumerates the possible outcomes, applies the transition
    model for each action, and returns the resulting next states and rewards.

    Args:
        state (tuple): (row, col) current position
        action (str): intended action ("U", "D", "L", "R")

    Returns:
        list of tuples:
            [
                (probability, next_state, reward),
                ...
            ]
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
    Performs Value Iteration to compute the optimal value function for the MDP.

    Value Iteration repeatedly applies the Bellman optimality update:

        V(s) ← max_a Σ_{s'} P(s'|s,a) · [ R(s,a,s') + γ · V(s') ]

    The loop continues until either:
        - the maximum update change (delta) falls below the tolerance `tol`, or
        - the maximum number of iterations is reached.

    Once state values converge, the function extracts the optimal deterministic
    policy by choosing, for each state, the action that maximizes the expected
    return.

    Args:
        max_iters (int): maximum number of value-iteration sweeps
        tol (float): convergence tolerance for stopping

    Returns:
        V (dict): mapping from state → estimated optimal value
        policy (dict): mapping from state → optimal action ("U","D","L","R")
    """
    # ------------------------- MDP solver -------------------------
    def value_iteration(self, max_iters=1000, tol=1e-6):
        V = {s: 0 for s in self.states}
        for _ in range(max_iters):
            delta = 0
            new_V = V.copy()
            for s in self.states:
                if s == self.goal:
                    new_V[s] = self.goal_reward
                    continue
                max_val = max(
                    sum(prob * (reward + self.discount_factor * V[next_state])
                        for prob, next_state, reward in self.get_action_outcomes(s, a))
                    for a in self.ACTIONS
                )
                delta = max(delta, abs(max_val - V[s]))
                new_V[s] = max_val
            V = new_V
            if delta < tol:
                break
        policy = self.extract_policy(V)
        return V, policy
    """
    Derives the optimal deterministic policy from a given value function.

    For each state, this function evaluates all possible actions and selects
    the one that maximizes the expected return:

        π*(s) = argmax_a Σ_{s'} P(s'|s,a) · [ R(s,a,s') + γ · V(s') ]

    The goal state has no actions, so it is assigned `None`.

    Args:
        V (dict): mapping of state → value, produced by value_iteration()

    Returns:
        dict: optimal policy mapping state → best action ("U", "D", "L", "R"),
            or None for the goal state
    """
    def extract_policy(self, V):
        policy = {}
        for s in self.states:
            if s == self.goal:
                policy[s] = None
                continue
            best_action, best_val = None, float("-inf")
            for a in self.ACTIONS:
                expected_value = sum(prob * (reward + self.discount_factor * V[next_state])
                                     for prob, next_state, reward in self.get_action_outcomes(s, a))
                if expected_value > best_val:
                    best_val, best_action = expected_value, a
            policy[s] = best_action
        return policy
    """
    Executes a (stochastic) policy in the maze environment and returns
    the resulting path along with slip and failure statistics.

    At each step, the agent attempts to follow the policy action, but due to
    environment stochasticity:

        - With probability p_success, the intended action is taken.
        - With probability p_slip, the agent slips left.
        - With probability p_slip, the agent slips right.

    If a chosen action results in hitting a wall (i.e., staying in place),
    the agent increments `failed_moves` and may optionally try to move to a
    random valid neighboring state.

    The process stops when:
        - the goal is reached,
        - the policy assigns None (for terminal states),
        - or the max_steps limit is reached.

    Args:
        policy (dict): mapping from state → action as produced by extract_policy()
        max_steps (int): safety limit to avoid infinite loops

    Returns:
        tuple:
            path (list): sequence of visited states while following the policy
            slips (int): number of sideways slips caused by stochastic transitions
            failed_moves (int): number of times the agent attempted an invalid move
    """
    def follow_policy(self, policy, max_steps=10000):
        path = [self.start]
        current_state = self.start
        slips = 0
        failed_moves = 0

        for _ in range(max_steps):
            if current_state == self.goal:
                break
            action = policy.get(current_state)
            if action is None:
                break

            r = random.random()
            if r < self.p_success:
                chosen_action = action
            elif r < self.p_success + self.p_slip:
                left_of = {"U": "L", "L": "D", "D": "R", "R": "U"}
                chosen_action = left_of[action]
                slips += 1
            else:
                right_of = {"U": "R", "R": "D", "D": "L", "L": "U"}
                chosen_action = right_of[action]
                slips += 1

            next_state, _ = self.transition(current_state, chosen_action)

            if next_state == current_state:
                failed_moves += 1
                # optional: try random neighbor
                neighbors = [s for s, _ in [self.transition(current_state, a) for a in self.ACTIONS] if s != current_state]
                if neighbors:
                    next_state = random.choice(neighbors)

            path.append(next_state)
            current_state = next_state

        return path, slips, failed_moves

    # ------------------------- Metrics -------------------------
    def compute_metrics(self, path, V, policy):
        metrics = {}
        metrics['Path Length'] = len(path) - 1
        metrics['Number of Turns'] = self._count_turns(path)
        rewards, slips, failed_moves, loop_preventions = [], 0, 0, 0
        current_state = path[0]

        for next_state in path[1:]:
            reward = self.goal_reward if next_state == self.goal else self.step_cost
            rewards.append(reward)
            delta = (next_state[0] - current_state[0], next_state[1] - current_state[1])
            if delta not in self.ACTIONS.values():
                slips += 1
            if next_state == current_state:
                failed_moves += 1
            current_state = next_state

        metrics['Total Reward Collected'] = sum(rewards)
        metrics['Average Step Cost'] = np.mean(rewards)
        metrics['Slips / Deviations'] = slips
        metrics['Failed Moves'] = failed_moves
        metrics['Loop Prevention Activations'] = loop_preventions

        values = np.array(list(V.values()))
        metrics['Max State Value'] = np.max(values)
        metrics['Min State Value'] = np.min(values)
        metrics['Average State Value'] = np.mean(values)

        metrics['Shortest Manhattan Path'] = self._manhattan_distance(self.start, self.goal)
        metrics['Path Optimality Ratio'] = metrics['Path Length'] / metrics['Shortest Manhattan Path']

        return metrics

    # ------------------------- Helper functions -------------------------
    def _count_turns(self, path):
        if len(path) < 3:
            return 0
        turns = 0
        for i in range(1, len(path)-1):
            dx1, dy1 = path[i][0]-path[i-1][0], path[i][1]-path[i-1][1]
            dx2, dy2 = path[i+1][0]-path[i][0], path[i+1][1]-path[i][1]
            if (dx1, dy1) != (dx2, dy2):
                turns += 1
        return turns

    def _manhattan_distance(self, start, goal):
        return abs(start[0]-goal[0]) + abs(start[1]-goal[1])

    # ------------------------- Solve MDP -------------------------
    def mdp_solver(self, max_iters=1000, tol=1e-6, max_steps=10000):
        start_time = time.time()
        V, policy = self.value_iteration(max_iters, tol)
        path, slips, failed_moves = self.follow_policy(policy, max_steps)
        end_time = time.time()

        metrics = self.compute_metrics(path, V, policy)
        metrics['Slips / Deviations'] = slips
        metrics['Failed Moves'] = failed_moves
        metrics['Computation Time'] = round((end_time - start_time) * 1000, 2)
        return path, metrics, V
