# Claude Plugin Marketplace

A monorepo for building Claude Code plugins, hooks, and extensions using the Bun runtime.

## Project Structure

```text
claude-tools/
├── pkgs/                    # Shared packages (Bun workspaces)
│   ├── bun-hooks/           # @savvy-web/bun-hooks - Plugin SDK & pipeline runtime
│   └── lint-utils/          # @savvy-web/lint-utils - Linting types & formatters
├── plugins/                 # Claude Code plugins
│   ├── workflow/            # Workflow automation plugin
│   └── bun-plugin-builder/  # Plugin development toolkit
├── .claude-plugin/          # Plugin marketplace manifest
│   └── marketplace.json     # Plugin registry configuration
└── types/                   # Global type declarations
```

## Plugins

| Plugin                                                      | Description                                              |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| [workflow](plugins/workflow/CLAUDE.md)                      | Workflow automation for linting, testing, and PR reviews |
| [bun-plugin-builder](plugins/bun-plugin-builder/CLAUDE.md)  | Development toolkit for building Claude Code plugins     |

### Validate Plugins

```bash
# Validate marketplace (from repo root)
claude plugin validate .claude-plugin/marketplace.json

# Validate individual plugin (from plugin directory)
claude plugin validate .claude-plugin/plugin.json
```

## Plugin Architecture

Claude Code plugins are compiled Bun binaries that handle hook events. The SDK provides
a **declarative pipeline system** for defining plugins.

### Three-Layer Plugin Model

```text
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Input (from Claude Code)                          │
│  ─────────────────────────────────────────────────────────  │
│  Hook events: SessionStart, PreToolUse, PostToolUse, etc.   │
│  Passed as JSON via stdin to the plugin binary              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Options (user-configurable)                        │
│  ─────────────────────────────────────────────────────────  │
│  Zod schema validates env vars with PLUGIN_PREFIX_*          │
│  Example: SAVVY_WORKFLOW_SKIP_PREFLIGHT=true                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Computed (detection/setup results)                 │
│  ─────────────────────────────────────────────────────────  │
│  setup() runs at SessionStart, detects environment           │
│  Results persisted to CLAUDE_ENV_FILE for all hooks          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Hook Handlers                                               │
│  ─────────────────────────────────────────────────────────  │
│  Pure functions: ({ input, options, env }) => output         │
│  Zod-validated outputs ensure type safety                    │
└─────────────────────────────────────────────────────────────┘
```

### Plugin Definition Pattern

```typescript
// plugin.ts - Declarative plugin definition
import { ClaudeBinaryPlugin } from "@savvy-web/bun-hooks/pipeline";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",  // Env var prefix: MY_PLUGIN_*

  // Layer 2: Options schema
  schema: z.object({
    DEBUG: z.string().default("false").transform(v => v === "true"),
    MODE: z.enum(["strict", "relaxed"]).default("strict"),
  }),

  // Layer 3: Computed values (runs at SessionStart)
  setup: async ({ env }) => {
    // env: { projectDir, pluginDir, pluginEnvFile } - sealed, read-only
    const detection = await runDetectionPipeline();
    return {
      // Return only state (env is merged automatically by runtime)
      detection,
      packageManager: detection.packageManager,
    };
  },

  // Hook definitions
  hooks: {
    SessionStart: [{
      name: "context",
      description: "Provides project context",
      pipeline: "./hooks/context.hook.ts",
    }],
    PreToolUse: [{
      name: "security",
      tools: ["Bash", "Write"],  // Only run for these tools
      pipeline: "./hooks/security.hook.ts",
    }],
  },

  // Build options
  bytecode: true,
  persistLocal: true,
});

// Export types for hook files
export type Pipeline = ClaudeBinaryPlugin.InferPipeline<typeof plugin>;
export default plugin;
```

### Hook Handler Pattern

```typescript
// hooks/security.hook.ts
import type { Pipeline } from "../plugin.js";
import type { PreToolUseOutput } from "@savvy-web/bun-hooks/pipeline";

const ALLOW: PreToolUseOutput = { permissionDecision: "allow" };

const handler: Pipeline["PreToolUse"] = ({ input, options, env }) => {
  // input: PreToolUseEvent (tool_name, tool_input, etc.)
  // options: { DEBUG: boolean, MODE: "strict" | "relaxed" }
  // env: BaseEnv & State { projectDir, pluginDir, pluginEnvFile, detection, ... }

  if (input.tool_name === "Bash" && env.detection.gitRepo) {
    // Check for dangerous commands
  }

  return ALLOW;
};

export default handler;
```

### Hook Event Types

| Event               | When                      | Can Do                                    |
| ------------------- | ------------------------- | ----------------------------------------- |
| `SessionStart`      | Session begins            | Add context                               |
| `SessionEnd`        | Session ends              | Cleanup only                              |
| `PreToolUse`        | Before tool executes      | Allow/deny/modify input                   |
| `PostToolUse`       | After tool completes      | Add context or block further work         |
| `Stop`              | Agent about to stop       | Block with reason (run tests, etc.)       |
| `SubagentStop`      | Subagent about to stop    | Block with reason                         |
| `UserPromptSubmit`  | User submits prompt       | Add context or block                      |
| `PermissionRequest` | Permission needed         | Auto-allow/deny                           |

## Environment Variables

### Claude Code Provided

- `CLAUDE_PLUGIN_ROOT` - Path to the plugin directory
- `CLAUDE_PROJECT_DIR` - Path to the user's project
- `CLAUDE_ENV_FILE` - Path to session env file (for computed vars)

### Plugin Conventions

Plugins use a prefix for their env vars:

- `SAVVY_WORKFLOW_*` - Workflow plugin options
- Custom plugins define their own prefix in `ClaudeBinaryPlugin.create({ prefix: "..." })`

## Code Quality

Uses Biome for linting and formatting:

- Tabs for indentation
- 120 character line width
- Import extensions required (.js)
- Type-only imports separated

## Bun Runtime

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun run test:ai` to run tests.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

### Testing Patterns

#### Fake Timers

```ts
import { test, expect, setSystemTime, beforeEach, afterEach } from "bun:test";

beforeEach(() => {
  setSystemTime(new Date("2024-01-15T10:00:00Z"));
});

afterEach(() => {
  setSystemTime(); // Reset to real time
});

test("time-dependent logic", () => {
  expect(new Date().toISOString()).toBe("2024-01-15T10:00:00.000Z");
});
```

#### Module Mocking

```ts
import { mock, test, expect } from "bun:test";

// Mock before importing the module that uses it
mock.module("shellcheck", () => ({
  shellcheck: mock(async () => ({
    exitCode: 0,
    stdout: Buffer.from("[]"),
    stderr: Buffer.from(""),
  })),
}));

import { runShellcheck } from "./my-module.js";
```

#### Shell Executor Dependency Injection

For functions that spawn subprocesses via `Bun.$`, use dependency injection:

```ts
// Implementation
export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ShellExecutor = (cmd: string) => Promise<ShellResult>;

export const defaultShellExecutor: ShellExecutor = async (cmd: string) => {
  const result = await $`${{ raw: cmd }}`.quiet().nothrow();
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
};

export async function detectVersion(
  shell: ShellExecutor = defaultShellExecutor
): Promise<string> {
  const result = await shell("node --version");
  return result.exitCode === 0 ? result.stdout : "unknown";
}
```

```ts
// Test
import { test, expect } from "bun:test";
import { detectVersion } from "./my-module.js";

test("detects version with mock", async () => {
  const mockShell = async () => ({ exitCode: 0, stdout: "v22.0.0", stderr: "" });
  const result = await detectVersion(mockShell);
  expect(result).toBe("v22.0.0");
});
```

#### Using @savvy-web/bun-hooks Mocks

```ts
import { afterEach, beforeEach, describe, test } from "bun:test";
import type { MockEnvContext } from "@savvy-web/bun-hooks/mocks";
import { mockEnv } from "@savvy-web/bun-hooks/mocks";

describe("MyTest", () => {
  let env: MockEnvContext;

  beforeEach(() => {
    env = mockEnv(
      { CLAUDE_PROJECT_DIR: "/tmp/test" },
      { clearPrefix: "SAVVY_WORKFLOW_" },
    );
  });

  afterEach(() => {
    env.restore();
  });

  test("uses mocked env", () => {
    expect(Bun.env.CLAUDE_PROJECT_DIR).toBe("/tmp/test");
  });
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`.

```ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => new Response(JSON.stringify({ id: req.params.id })),
    },
  },
  development: { hmr: true, console: true }
})
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
