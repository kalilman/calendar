# Scheduling Algorithm Spec

## Inputs
- List of events with durations and constraints
- User preferences (working hours, travel buffers)

## Outputs
- Optimized schedule with start/end times

## Approach
A greedy heuristic assigns events to the earliest feasible slots while respecting locks and travel time. The system scores schedules by minimizing conflicts and gaps.
