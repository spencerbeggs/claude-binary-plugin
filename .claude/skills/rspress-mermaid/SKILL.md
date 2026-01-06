---
name: rspress-mermaid
description: >-
  Create Mermaid diagrams for visual documentation. Use when illustrating
  data flows, sequences, class relationships, or system architecture in
  RSPress documentation.
allowed-tools: Read, Write, Edit, Glob
---

# Mermaid Diagrams for RSPress

Create diagrams using `rspress-plugin-mermaid`. Wrap syntax in fenced
code blocks with `mermaid` language identifier.

## Quick Start

````markdown
```mermaid
flowchart LR
    A[Start] --> B[Process] --> C[End]
```
````

## Diagram Types

| Type | Best For |
| ---- | -------- |
| Flowchart | Data flows, pipelines, decisions |
| Sequence | Hook execution, API calls, messages |
| Class | Type relationships, hierarchies |
| ER Diagram | Data models, database schemas |
| Block | System architecture, layers |
| ZenUML | Complex sequences (code-like) |

## References

For detailed syntax and examples, read these files:

* [references/diagram-types.md](references/diagram-types.md) - Complete
  syntax for each diagram type with examples
* [references/sdk-examples.md](references/sdk-examples.md) - Pre-built
  diagrams for SDK documentation (three-layer model, hook flow, etc.)

## Best Practices

* Keep diagrams focused - one concept per diagram
* Use consistent node naming across related diagrams
* Add labels to edges for clarity
* Use subgraphs to group related elements
* Prefer flowcharts for processes, sequences for interactions
