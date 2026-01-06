# Mermaid Diagram Types Reference

## Flowchart

Best for: Data flows, pipelines, decision trees, process flows.

**Reference:** <https://mermaid.js.org/syntax/flowchart.html>

```mermaid
flowchart TD
    A[Input] --> B{Validate}
    B -->|Valid| C[Process]
    B -->|Invalid| D[Error]
    C --> E[Output]
```

**Direction options:** `TB` (top-bottom), `TD`, `BT`, `LR`, `RL`

**Node shapes:**

* `[text]` - Rectangle
* `(text)` - Rounded rectangle
* `{text}` - Diamond (decision)
* `([text])` - Stadium
* `[[text]]` - Subroutine
* `[(text)]` - Cylinder (database)

**Link styles:**

* `-->` - Arrow
* `---` - Line
* `-.->` - Dotted arrow
* `==>` - Thick arrow
* `--text-->` - Arrow with label

## Sequence Diagram

Best for: Hook execution order, API call sequences, message flows.

**Reference:** <https://mermaid.js.org/syntax/sequenceDiagram.html>

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant P as Plugin
    participant S as Sidecar

    CC->>P: Hook event (stdin)
    P->>P: Validate input
    P->>S: Emit telemetry
    P-->>CC: Response (stdout)
```

**Arrow types:**

* `->` - Solid line without arrow
* `-->` - Dotted line without arrow
* `->>` - Solid line with arrow
* `-->>` - Dotted line with arrow
* `-x` - Solid line with cross
* `--x` - Dotted line with cross

**Features:**

* `participant` - Define participants
* `Note over A,B: text` - Notes spanning participants
* `loop` / `end` - Loop blocks
* `alt` / `else` / `end` - Conditional blocks
* `activate` / `deactivate` - Activation boxes

## Class Diagram

Best for: Type relationships, class hierarchies, interface contracts.

**Reference:** <https://mermaid.js.org/syntax/classDiagram.html>

```mermaid
classDiagram
    class HookEvent {
        +string session_id
        +string hook_type
        +end(response)
    }

    class PreToolUseEvent {
        +string tool_name
        +object tool_input
    }

    HookEvent <|-- PreToolUseEvent
```

**Relationships:**

* `<|--` - Inheritance
* `*--` - Composition
* `o--` - Aggregation
* `-->` - Association
* `..>` - Dependency
* `..|>` - Realization (interface)

**Visibility:**

* `+` - Public
* `-` - Private
* `#` - Protected
* `~` - Package/Internal

## Entity Relationship Diagram

Best for: Data models, database schemas, state relationships.

**Reference:** <https://mermaid.js.org/syntax/entityRelationshipDiagram.html>

```mermaid
erDiagram
    SESSION ||--o{ HOOK : triggers
    SESSION {
        string id PK
        string project_dir
        timestamp created_at
    }
    HOOK {
        string id PK
        string session_id FK
        string type
        string status
    }
```

**Cardinality:**

* `||` - Exactly one
* `o|` - Zero or one
* `}|` - One or more
* `}o` - Zero or more

## Block Diagram

Best for: System architecture, component layouts, layered views.

**Reference:** <https://mermaid.js.org/syntax/block.html>

```mermaid
block-beta
    columns 3
    A["Layer 1: Input"]:3
    B["Layer 2: Options"]:3
    C["Layer 3: State"]:3
    D["Handler"]:3
```

## ZenUML (Sequence Alternative)

Best for: Complex sequences with code-like syntax.

**Reference:** <https://mermaid.js.org/syntax/zenuml.html>

```mermaid
zenuml
    ClaudeCode->Plugin.handleHook(event) {
        Plugin->Plugin.validate()
        Plugin->Sidecar.emit(telemetry)
        return response
    }
```
