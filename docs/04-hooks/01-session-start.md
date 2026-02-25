# SessionStart

The SessionStart hook fires when Claude Code begins or resumes a session. It is the first hook that runs and the only hook where the `setup()` function executes to compute persisted state.

## When It Fires

SessionStart fires in four situations, identified by the `source` field:

| Source | Meaning |
| --- | --- |
| `startup` | A brand new session is starting |
| `resume` | A previous session is being continued |
| `clear` | The user cleared the session and started fresh |
| `compact` | The context window was compacted and the session is restarting |

## Input Type

```typescript
interface SessionStartInput {
  session_id: string;
  source: "startup" | "resume" | "clear" | "compact";
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "SessionStart";
}
```

The `source` field tells your handler why the session is starting. Use this to vary behavior -- for example, skip expensive detection on `resume` if state is already persisted.

## Output Type

`SessionStartPipelineOutput` supports two actions:

| Action | Effect | Key Fields |
| --- | --- | --- |
| `context` | Injects text into Claude's context window | `claudeContext` (the text Claude sees) |
| `none` | Hook ran but took no action | -- |

The `claudeContext` field is the primary mechanism for teaching Claude about your project. Whatever you return here appears as additional context that Claude can reference throughout the session.

## The setup() Function

SessionStart is special because it is the only hook where `setup()` runs. The setup function computes derived state from your project directory and plugin options. That state is serialized, persisted to the session environment, and available to all subsequent hooks and commands.

```typescript
// In plugin.config.ts
const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    DEBUG: z.string().default("false").transform((v) => v === "true"),
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),
  setup: async ({ cwd }) => {
    const hasPackageJson = await Bun.file(`${cwd}/package.json`).exists();
    const hasTsConfig = await Bun.file(`${cwd}/tsconfig.json`).exists();
    return { hasPackageJson, hasTsConfig };
  },
  // ...
});
```

The object returned from `setup()` becomes the `state` parameter in every handler.

## Handler Example

This is the `context.hook.ts` handler from the scaffolded my-plugin project:

```typescript
// hooks/context.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionStart"] = ({ input, options, state }) => {
  const lines: string[] = ["# Project Context"];

  if (state.hasPackageJson) {
    lines.push("- This project uses Node.js/Bun with a package.json");
  }

  if (state.hasTsConfig) {
    lines.push("- TypeScript is configured in this project");
  }

  if (options.DEBUG) {
    lines.push(`- Debug mode is enabled (timeout: ${options.TIMEOUT_MS}ms)`);
  }

  if (lines.length <= 1) {
    return {
      status: "executed",
      action: "none",
      summary: "no project context to inject",
    };
  }

  return {
    status: "executed",
    action: "context",
    summary: `injected ${lines.length - 1} context lines`,
    claudeContext: lines.join("\n"),
  };
};

export default handler;
```

## Plugin Configuration

Register the SessionStart hook in `plugin.config.ts`:

```typescript
hooks: {
  SessionStart: [
    {
      name: "context",
      pipeline: "./hooks/context.hook.ts",
    },
  ],
},
```

## Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("SessionStart/context", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("injects context when project has package.json", async () => {
    const result = await ctx
      .withSessionStartInput({ source: "startup" })
      .runHook("SessionStart", "context");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("context");
    expect(result.context).toContain("package.json");
  });

  test("returns none when no project characteristics detected", async () => {
    ctx.withState({ hasPackageJson: false, hasTsConfig: false });

    const result = await ctx
      .withSessionStartInput({ source: "startup" })
      .runHook("SessionStart", "context");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("none");
  });
});
```

## Advanced Patterns

### Conditional Context Based on Source

Vary behavior depending on whether this is a fresh session or a resumed one:

```typescript
const handler: Pipeline["SessionStart"] = ({ input, state }) => {
  if (input.source === "resume") {
    return {
      status: "executed",
      action: "context",
      summary: "resumed session",
      claudeContext: "Session resumed. State from previous session is available.",
    };
  }

  if (input.source === "compact") {
    return {
      status: "executed",
      action: "context",
      summary: "compacted session",
      claudeContext: "Context was compacted. Key project facts: " +
        `Package manager: ${state.packageManager}. ` +
        `TypeScript: ${state.hasTsConfig ? "yes" : "no"}.`,
    };
  }

  // Full context injection for startup and clear
  return {
    status: "executed",
    action: "context",
    summary: "full context injected",
    claudeContext: buildFullContext(state),
  };
};
```

### Detecting Project Features in setup()

The `setup()` function is the right place for any detection logic that subsequent hooks need:

```typescript
setup: async ({ cwd }) => {
  const [hasPackageJson, hasTsConfig, hasDockerfile] = await Promise.all([
    Bun.file(`${cwd}/package.json`).exists(),
    Bun.file(`${cwd}/tsconfig.json`).exists(),
    Bun.file(`${cwd}/Dockerfile`).exists(),
  ]);

  let packageManager: "bun" | "npm" | "pnpm" | "yarn" = "npm";
  if (await Bun.file(`${cwd}/bun.lock`).exists()) packageManager = "bun";
  else if (await Bun.file(`${cwd}/pnpm-lock.yaml`).exists()) packageManager = "pnpm";
  else if (await Bun.file(`${cwd}/yarn.lock`).exists()) packageManager = "yarn";

  return { hasPackageJson, hasTsConfig, hasDockerfile, packageManager };
},
```

The returned state is automatically serialized, persisted, and deserialized for every subsequent hook and command invocation.
