import numpy as np
import random
import time


"""
Generic RL solver for any 2D maze. This only works with MazeGenerator 
Expects a 2D grid: 0 → empty/free cell, 1 → wall, 2 → start, 3 → goal
"""
class MazeRL:
    """
    These are the possible moves:
    "U" = Up → subtract 1 from row
    "D" = Down → add 1 to row
    "L" = Left → subtract 1 from column
    "R" = Right → add 1 to column
    Stored as (delta_row, delta_col) pairs.
    """
    ACTIONS = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}

    """Constructor of RL object to solve 2D maze grid"""
    def __init__(self, grid, start, goal, discount_factor=0.9, learning_rate = 0.1, step_cost=-0.05, goal_reward=10.0):
        self.grid = np.array(grid) # converting grid to numpy array - comes from maze_generator
        self.num_rows, self.num_cols = self.grid.shape # Number of rows and columns in the maze
        self.start = start # The tuple (row, column) of start - comes from maze_generator
        self.goal = goal # The tuple (row, column) of goal (end state) - comes from maze_generator

        self.discount_factor = discount_factor # factor for future rewards 
        self.learning_rate = learning_rate #how quickly the Q values are updated based on the information
        self.step_cost = step_cost # Each step costs -0.05
        self.goal_reward = goal_reward # Reward for reaching the goal (+10)
        self.states = self._extract_states()

        self.actions = ["U", "D", "L", "R"]
        self.QTable = np.zeros([self.num_rows, self.num_cols, len(self.actions)])
        # self.ACTIONS[0].value() = ...

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
    Selects an action for the agent using an ε-greedy policy.

    If a random value is less than the exploration rate ε, the agent explores
    by selecting a random action. Otherwise, it exploits by choosing the action
    with the highest Q-value in the current state.

    Returns:
    action_index (int): index of the chosen action in the Q-table
    action (str): the corresponding action label ("U", "D", "L", "R")
    """
    
    def choose_action(self, state, exploration_rate):

        row, col = state  # unpack the state

        # 1. Generate a random number in [0,1)
        if random.random() < exploration_rate:
            # EXPLORATION: choose random action
            action_index = random.randint(0, len(self.ACTIONS) - 1)
        else:
            # EXPLOITATION: choose best Q-value
            # self.QTable[row, col] pulls out a 1D array of length 4 (the Q-values for that cell).
            # Returns the index of the largest Q-value in that vector (0, 1, 2, or 3).
            action_index = np.argmax(self.QTable[row, col])

        # Map index → action string ("U","D","L","R")
        action_list = list(self.ACTIONS.keys())
        action = action_list[action_index]

        # action_index is the index into your Q-table’s 3rd dimension.
        # action returns a str ("U", "D", "L", "R")
        return action_index, action

    """
    Updates the Q-value for a given state–action pair using the
    Q-Learning update rule.

    Computes the temporal-difference (TD) target:
        TD Target = reward + γ * max_a' Q(next_state, a')

    Then adjusts the current Q-value toward this target using the
    learning rate α:

        Q(s, a) ← Q(s, a) + α * (TD Target − Q(s, a))

    Args:
        state (tuple): current (row, col) state
        action_index (int): index of the action taken in the Q-table
        reward (float): immediate reward received after the action
        next_state (tuple): resulting state after taking the action
    """

    def update_Q(self, state, action_index, reward, next_state):

        # Unpack current state
        row, col = state

        # Unpack next state
        next_row, next_col = next_state

        # Current Q-value Q(s,a)
        current_q = self.QTable[row, col, action_index]

        # Best future Q-value max_a' Q(s', a')
        max_future_q = np.max(self.QTable[next_row, next_col])

        # TD Target: r + γ * max_future_q
        td_target = reward + self.discount_factor * max_future_q

        # TD Error: target - current
        td_error = td_target - current_q

        # Q-update: Q(s,a) += α * TD Error
        self.QTable[row, col, action_index] += self.learning_rate * td_error
    
    
    """
    Runs a single Q-Learning training episode.

    Starting from the maze’s start state, the agent repeatedly:
        - selects an action using ε-greedy exploration
        - transitions to the next state and receives a reward
        - updates its Q-table using the Q-Learning update rule

    If `record_episode` is True, the function logs each step and
    records the full path taken during the episode. Otherwise,
    it trains silently and returns empty lists for path/log.

    The episode terminates when:
        - the agent reaches the goal, or
        - the maximum number of steps is exceeded, or
        - the agent becomes stuck (attempts invalid moves repeatedly)

    Args:
        max_steps (int): maximum steps allowed in a single episode
        exploration_rate (float): ε value controlling randomness in action selection
        record_episode (bool): whether to store the path and step-by-step log

    Returns:
        path (list): sequence of visited states (if recorded, else empty)
        log (list): per-step info dictionaries (if recorded, else empty)
        total_reward (float): cumulative reward collected during the episode
    """
    def run_episode(self, max_steps=1000, exploration_rate=0.2, record_episode=False):
        # If record_episode is false, it'll return empty lists
        path = [self.start] if record_episode else []
        log = [] if record_episode else []

        state = self.start
        total_reward = 0.0

        for step in range(max_steps):
            # Stop if goal state is reached
            if state == self.goal:
                break
            
            action_index, action = self.choose_action(state, exploration_rate)

            next_state, reward = self.transition(state, action)
            
            # Record the step details in the log if record_episode is true
            if record_episode:
                log.append({
                    "step": step,
                    "state": state,
                    "action": action,
                    "next_state": next_state,
                    "reward": reward
                })
                # Append the next state to the path and update current_state
                path.append(next_state)

            self.update_Q(state, action_index, reward, next_state)
            total_reward += reward

            # Stop if the agent is stuck in the same state
            # Do this after the update_Q and update reward so agent can learn bumping into walls is bad.
            if next_state == state:
                continue
            
            state = next_state

        return path, log, total_reward


    """
    Trains the Q-learning agent over multiple episodes.

    For each episode, the agent:
        - runs `run_episode()` with the current exploration rate ε
        - collects the total reward
        - optionally records the full path and step-by-step log for episodes
        listed in `record_episodes`
        - decays ε toward `min_exploration_rate` using the specified decay factor

    This function does NOT return a final policy; it only trains the Q-table
    and gathers training statistics that can be displayed or graphed.

    Args:
        num_episodes (int): number of training episodes to run
        max_steps (int): maximum steps allowed inside each episode
        exploration_rate (float): initial ε value (probability of random actions)
        exploration_rate_decay (float): multiplicative decay applied after each episode
        min_exploration_rate (float): lower bound on ε
        record_episodes (list[int] or None): episodes whose trajectories should be stored

    Returns:
        dict: {
            "rewards": list of total rewards from each episode,
            "recorded_episodes": { episode_number: { path, log, total_reward }, ... },
            "final_exploration_rate": final ε after decay
        }
    """    
    def train(self, num_episodes, max_steps=1000, exploration_rate=0.3, exploration_rate_decay=0.995, min_exploration_rate=0.01, record_episodes=None):

        if record_episodes is None:
            record_episodes = []

        rewards = []
        recorded_data = {}
        epsilon = exploration_rate

        for episode in range(num_episodes):

            record_flag = episode in record_episodes

            # Run the episode
            if record_flag:
                path, log, total_reward = self.run_episode(max_steps=max_steps, exploration_rate=epsilon,record_episode=True)
                recorded_data[episode] = {
                    "path": path,
                    "log": log,
                    "total_reward": total_reward
                }
            else:
                _, _, total_reward = self.run_episode(max_steps=max_steps, exploration_rate=epsilon, record_episode=False)

            rewards.append(total_reward)

            # Decay exploration
            epsilon = max(min_exploration_rate, epsilon * exploration_rate_decay)

        return {
            "rewards": rewards,
            "recorded_episodes": recorded_data,
            "final_exploration_rate": epsilon
        }
        
    
     """
    Selects the best action for the given state according to the
    current Q-table (pure exploitation).

    This function does NOT use ε-greedy exploration. It simply chooses the
    action with the highest Q-value, which is why it is used after training
    to extract the final greedy policy.

    Args:
        state (tuple): (row, col) position in the maze

    Returns:
        action_index (int): index of the best action in the Q-table
        action (str): action label ("U", "D", "L", "R")
    """
    def greedy_action(self, state):

        row, col = state  # unpack the state
        action_index = np.argmax(self.QTable[row, col])

        # Map index → action string ("U","D","L","R")
        action_list = list(self.ACTIONS.keys())
        action = action_list[action_index]

        # action_index is the index into your Q-table’s 3rd dimension.
        # action returns a str ("U", "D", "L", "R")
        return action_index, action

    """
    Generates a greedy path from the start to the goal using the
    agent’s learned Q-table.

    At each step, the agent selects the action with the highest
    Q-value (pure exploitation, no exploration). This produces
    the final deterministic policy that represents what the agent
    has learned after training.

    The function also logs each transition and accumulates the
    total reward collected along this greedy trajectory.

    Args:
        max_steps (int): safety limit to prevent infinite loops

    Returns:
        path (list): ordered list of visited states from start → goal
        log (list): per-step dictionaries containing state, action, reward, etc.
        total_reward (float): cumulative reward earned along this greedy path
    """
    def greedy_path(self, max_steps=1000):
        path = [self.start]
        log = []

        state = self.start
        total_reward = 0.0

        for step in range(max_steps):
            # Stop if goal state is reached
            if state == self.goal:
                break
            
            action_index, action = self.greedy_action(state)
            next_state, reward = self.transition(state, action)
            
            # Record the step details in the log
            log.append({
                "step": step,
                "state": state,
                "action": action,
                "next_state": next_state,
                "reward": reward
            })
            # Append the next state to the path and update current_state
            path.append(next_state)
            total_reward += reward

            # Stop if the agent is stuck in the same state
            if next_state == state:
                break
            
            state = next_state

        return path, log, total_reward
    
    def _manhattan_distance(self, start, goal):
        return abs(start[0]-goal[0]) + abs(start[1]-goal[1])   

    """
    Counts the number of direction changes (turns) in a path.

    A turn occurs whenever the movement direction between two consecutive
    steps differs from the movement direction of the previous step.
    Straight-line movement does not increase the turn count.

    Args:
        path (list of tuples): sequence of (row, col) states

    Returns:
        int: number of direction changes in the path
    """ 
    
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

    """
    Runs the complete Reinforcement Learning (Q-Learning) pipeline:
    training + extracting the final greedy path + computing metrics.

    This function:
        1. Trains the agent for a specified number of episodes
        using the `train()` method.
        2. Extracts the final greedy policy using `greedy_path()`.
        3. Computes summary metrics describing:
            - path quality (length, turns, optimality ratio)
            - reward statistics from training
            - exploration rate decay
            - total computation time
        4. Returns the final path, metrics dictionary, and
        training summary for visualization in the frontend.

    Args:
        num_episodes (int): number of training episodes to run
        max_steps (int): max steps allowed inside each episode
        exploration_rate (float): initial ε for ε-greedy exploration
        exploration_rate_decay (float): multiplicative decay for ε
        min_exploration_rate (float): lower limit for ε during training
        record_episodes (list[int] or None): episodes to store detailed logs for

    Returns:
        tuple:
            path (list): the greedy path extracted after training
            metrics (dict): summary statistics for the RL solution
            training_summary (dict): rewards, recorded episodes, final ε
    """
    def rl_solver(self, num_episodes=3000, max_steps=3000, exploration_rate=0.3, exploration_rate_decay=0.995, min_exploration_rate=0.05, record_episodes=None):
        

        if record_episodes is None:
            record_episodes = []

        start_time = time.time()

        train_stats = self.train(num_episodes=num_episodes, max_steps=max_steps, exploration_rate=exploration_rate, exploration_rate_decay=exploration_rate_decay, min_exploration_rate=min_exploration_rate, record_episodes=record_episodes)

        path, log, total_reward = self.greedy_path(max_steps=max_steps)

        end_time = time.time()

        # --- 3) BUILD METRICS (similar flavour to MDP / BFS) ---
        path_length = max(len(path) - 1, 0)
        num_turns = self._count_turns(path)

        avg_step_cost = (
            total_reward / path_length if path_length > 0 else 0.0
        )

        # Training-level stats
        rewards = train_stats.get("rewards", [])
        if rewards:
            avg_episode_reward = float(np.mean(rewards))
            best_episode_reward = float(np.max(rewards))
        else:
            avg_episode_reward = 0.0
            best_episode_reward = 0.0

        manhattan_path = self._manhattan_distance(self.start, self.goal)
        if manhattan_path > 0:
            optimality_ratio = round(path_length / manhattan_path, 2)
        else:
            optimality_ratio = 0.0

        metrics = {
            # Final greedy policy stats
            "Path Length": path_length,
            "Number of Turns": num_turns,
            "Total Reward Collected": total_reward,
            "Average Step Cost": avg_step_cost,

            # Training stats
            "Episodes Trained": num_episodes,
            "Average Episode Reward": avg_episode_reward,
            "Best Episode Reward": best_episode_reward,
            "Final Exploration Rate": train_stats.get("final_exploration_rate", exploration_rate),

            # Geometry / optimality
            "Shortest Manhattan Path": manhattan_path,
            "Path Optimality Ratio": optimality_ratio,

            # Timing
            "Computation Time": round((end_time - start_time) * 1000.0, 2),  # ms
        }

        # --- 4) Return everything the backend/frontend might want ---
        training_summary = {
            "rewards": rewards,
            "recorded_episodes": train_stats.get("recorded_episodes", {}),
            "final_exploration_rate": train_stats.get("final_exploration_rate", exploration_rate),
        }

        # Shape mirrors the “(path, metrics, extra)” idea from the MDP solver
        return path, metrics, training_summary