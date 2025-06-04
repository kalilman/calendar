# AI Study-Agent Spec

## Responsibilities
- Extract flashcards from notes using prompt templates
- Schedule reviews using the SM-2 algorithm
- Send motivational notifications (streaks, progress)

## Interfaces
- `/extract-cards` API accepts text and returns Markdown flashcards
- File watcher writes cards to a vault directory
