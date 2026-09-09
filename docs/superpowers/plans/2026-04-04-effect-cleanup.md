# Effect Cleanup & type-fest Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Effect migration by converting remaining imperative patterns and removing the type-fest dependency.

**Architecture:** Bottom-up approach — replace type-fest types first (zero runtime risk), fix leaf services, delete SessionRegistry facade, rewire consumers, fix PluginRuntimeServiceLive logging, fix OTEL sidecar. Each step keeps tests green.

**Tech Stack:** Effect, @effect/platform (FileSystem), bun:test, TypeScript

**Design spec:** `docs/superpowers/specs/2026-04-04-effect-cleanup-design.md`

---

## File Map

### Files to modify

| File | Change |
|------|--------|
| `src/types/json.ts` | Replace type-fest re-exports with own JSON types |
| `src/types/common.ts` | Replace type-fest re-exports with own ReadonlyDeep/PartialDeep |
| `src/plugin/handler.ts` | Update ReadonlyDeep import |
| `src/testing/builder.ts` | Update PartialDeep import |
| `src/layers/PluginRuntimeServiceLive.ts` | Update ReadonlyDeep import, console→Effect.log, try/catch→Effect.try |
| `src/services/SessionStore.ts` | Add SessionRegistration type (move from SessionRegistry) |
| `src/layers/SessionStoreLive.ts` | existsSync/mkdirSync → FileSystem, remove SessionRegistry import |
| `src/layers/EnvResolverLive.ts` | SessionRegistry → SessionStore service |
| `src/layers/CommandRunnerLive.ts` | Use EnvResolver + EnvBridge + FileSystem |
| `src/layers/ClaudeAccountInfoLive.ts` | readFileSync → FileSystem service |
| `src/layers/PlatformInfoLive.ts` | existsSync → FileSystem, Bun.spawnSync → ShellExecutor |
| `src/layers/SidecarConnectionLive.ts` | runSync → runFork in socket callbacks |
| `src/layers/SidecarTransportLive.ts` | process.env → OtelConfig, Bun.spawnSync → FileSystem.remove, runSync → runFork |
| `src/layers/PluginLive.ts` | Update layer composition for new dependencies |
| `src/index.ts` | Remove SessionRegistry exports, remove type-fest re-exports |
| `package.json` | Remove type-fest dependency |

### Files to delete

| File | Reason |
|------|--------|
| `src/layers/SessionRegistry.ts` | Replaced by SessionStore service |

---

### Task 1: Replace type-fest JSON types with own definitions

**Files:**
- Modify: `package/src/types/json.ts`

- [ ] **Step 1: Read current json.ts**

Read `package/src/types/json.ts` to see current type-fest re-exports.

- [ ] **Step 2: Replace with own type definitions**

```typescript
// src/types/json.ts

/**
 * Matches any valid JSON primitive value.
 * JSON primitives are: string, number, boolean, null.
 * @public
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Matches any valid JSON value.
 * @public
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Matches a JSON object.
 * A plain object with string keys and JsonValue values.
 * @public
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Matches a JSON array.
 * @public
 */
export type JsonArray = readonly JsonValue[];

/**
 * Values that can be safely passed to JSON.stringify.
 * Unlike JsonValue, includes types with toJSON() methods (like Date).
 * @public
 */
export type Jsonifiable = JsonPrimitive | JsonifiableObject | JsonifiableArray | { toJSON(): Jsonifiable };

interface JsonifiableObject {
	[key: string]: Jsonifiable;
}

interface JsonifiableArray extends ReadonlyArray<Jsonifiable> {}

/**
 * Transform a type to represent what it looks like after JSON.parse(JSON.stringify(value)).
 * - Date → string
 * - undefined → removed from objects, null in arrays
 * - Map/Set → {}
 * - Functions → removed
 * @public
 */
export type Jsonify<T> = T extends JsonPrimitive
	? T
	: T extends { toJSON(): infer R }
		? Jsonify<R>
		: T extends readonly (infer U)[]
			? Jsonify<U>[]
			: T extends Record<string, unknown>
				? { [K in keyof T as T[K] extends Function ? never : K]: Jsonify<T[K]> }
				: never;

/**
 * Type-safe JSON parsing with schema validation.
 * @public
 */
export type ParsedJson<T> = T extends object ? { [K in keyof T]: ParsedJson<T[K]> } : T;

/**
 * A JSON object with known keys but unknown value types.
 * @public
 */
export type JsonObjectWith<K extends string> = {
	[P in K]: JsonValue;
} & JsonObject;

/**
 * Attributes for OTEL telemetry (subset of JSON).
 * @public
 */
export type OtelAttributeValue = string | number | boolean;

/**
 * OTEL attribute map.
 * @public
 */
export type OtelAttributes = Record<string, OtelAttributeValue>;

/**
 * OTEL headers map (string values only).
 * @public
 */
export type OtelHeaders = Record<string, string>;
```

- [ ] **Step 3: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors (or errors only in files that import the old types from common.ts — fixed in next task)

- [ ] **Step 4: Commit**

```bash
git add package/src/types/json.ts
git commit -m "refactor: replace type-fest JSON types with own definitions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Replace type-fest utility types and remove dependency

**Files:**
- Modify: `package/src/types/common.ts`
- Modify: `package/src/plugin/handler.ts`
- Modify: `package/src/testing/builder.ts`
- Modify: `package/src/layers/PluginRuntimeServiceLive.ts` (ReadonlyDeep import only)
- Modify: `package/src/index.ts`
- Modify: `package/package.json`

- [ ] **Step 1: Replace common.ts with own utility types**

```typescript
// src/types/common.ts

// Re-export Jsonify from json.ts (was re-exported from type-fest before)
export type { Jsonify } from "./json.js";

/**
 * Make all properties in T readonly recursively.
 * Used by HandlerContext to make handler parameters immutable.
 * @public
 */
export type ReadonlyDeep<T> = T extends (...args: unknown[]) => unknown
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? ReadonlyMap<ReadonlyDeep<K>, ReadonlyDeep<V>>
		: T extends ReadonlySet<infer V>
			? ReadonlySet<ReadonlyDeep<V>>
			: T extends readonly (infer U)[]
				? readonly ReadonlyDeep<U>[]
				: T extends object
					? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
					: T;

/**
 * Make all properties in T optional recursively.
 * Used by PluginTester for partial test configurations.
 * @public
 */
export type PartialDeep<T> = T extends (...args: unknown[]) => unknown
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? ReadonlyMap<PartialDeep<K>, PartialDeep<V>>
		: T extends ReadonlySet<infer V>
			? ReadonlySet<PartialDeep<V>>
			: T extends readonly (infer U)[]
				? readonly PartialDeep<U>[]
				: T extends object
					? { [K in keyof T]?: PartialDeep<T[K]> }
					: T;
```

- [ ] **Step 2: Update imports in handler.ts**

Change `import type { ReadonlyDeep } from "type-fest"` to `import type { ReadonlyDeep } from "../types/common.js"`.

- [ ] **Step 3: Update imports in builder.ts**

Change `import type { PartialDeep } from "type-fest"` to `import type { PartialDeep } from "../types/common.js"`.

- [ ] **Step 4: Update imports in PluginRuntimeServiceLive.ts**

Change `import type { ReadonlyDeep } from "type-fest"` to `import type { ReadonlyDeep } from "../types/common.js"`.

- [ ] **Step 5: Update index.ts exports**

Remove the line:
```typescript
export type { PartialDeep, ReadonlyDeep, RequiredDeep, Tagged, WritableDeep } from "./types/common.js";
```

Replace with:
```typescript
export type { PartialDeep, ReadonlyDeep } from "./types/common.js";
```

(Drop RequiredDeep, Tagged, WritableDeep — unused internally, pre-1.0 clean break.)

- [ ] **Step 6: Remove type-fest from package.json**

Remove `"type-fest": "5.4.4"` from dependencies.

Run: `cd package && bun install`

- [ ] **Step 7: Run tests and typecheck**

Run: `cd package && bun test && bun run typecheck`
Expected: All tests pass, 0 type errors

- [ ] **Step 8: Commit**

```bash
git add package/src/types/common.ts package/src/plugin/handler.ts package/src/testing/builder.ts package/src/layers/PluginRuntimeServiceLive.ts package/src/index.ts package/package.json bun.lock
git commit -m "refactor: remove type-fest dependency, replace with own utility types

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Fix ClaudeAccountInfoLive — Use FileSystem service

**Files:**
- Modify: `package/src/layers/ClaudeAccountInfoLive.ts`
- Modify: `package/src/layers/PluginLive.ts`

- [ ] **Step 1: Read current ClaudeAccountInfoLive.ts**

Read `package/src/layers/ClaudeAccountInfoLive.ts` and `package/src/services/ClaudeAccountInfo.ts`.

- [ ] **Step 2: Rewrite to use FileSystem service**

```typescript
// src/layers/ClaudeAccountInfoLive.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Layer, Option, Ref } from "effect";
import type { ClaudeAccountInfoData } from "../services/ClaudeAccountInfo.js";
import { ClaudeAccountInfo } from "../services/ClaudeAccountInfo.js";

const emptyInfo: ClaudeAccountInfoData = {
	accountUuid: null,
	organizationUuid: null,
	emailAddress: null,
	displayName: null,
	organizationName: null,
	isValid: false,
};

const readAccountInfo = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const configPath = join(homedir(), ".claude.json");

	const content = yield* fs.readFileString(configPath);
	const config = yield* Effect.try({
		try: () =>
			JSON.parse(content) as {
				oauthAccount?: {
					accountUuid?: string;
					organizationUuid?: string;
					emailAddress?: string;
					displayName?: string;
					organizationName?: string;
				};
			},
		catch: () => new Error("Invalid JSON in .claude.json"),
	});

	if (config.oauthAccount) {
		const accountUuid = config.oauthAccount.accountUuid ?? null;
		const organizationUuid = config.oauthAccount.organizationUuid ?? null;
		return {
			accountUuid,
			organizationUuid,
			emailAddress: config.oauthAccount.emailAddress ?? null,
			displayName: config.oauthAccount.displayName ?? null,
			organizationName: config.oauthAccount.organizationName ?? null,
			isValid: !!(accountUuid || organizationUuid),
		} satisfies ClaudeAccountInfoData;
	}

	return emptyInfo;
}).pipe(Effect.catchAll(() => Effect.succeed(emptyInfo)));

export const ClaudeAccountInfoLive: Layer.Layer<ClaudeAccountInfo, never, FileSystem.FileSystem> = Layer.effect(
	ClaudeAccountInfo,
	Effect.gen(function* () {
		const cache = yield* Ref.make<Option.Option<ClaudeAccountInfoData>>(Option.none());

		return {
			detect: Effect.gen(function* () {
				const cached = yield* Ref.get(cache);
				if (Option.isSome(cached)) {
					return cached.value;
				}
				const info = yield* readAccountInfo;
				yield* Ref.set(cache, Option.some(info));
				return info;
			}),
		};
	}),
);
```

- [ ] **Step 3: Update PluginLive to provide FileSystem to ClaudeAccountInfoLive**

In `src/layers/PluginLive.ts`, change:
```typescript
ClaudeAccountInfoLive,
```
to:
```typescript
pipe(ClaudeAccountInfoLive, Layer.provide(BunFileSystem.layer)),
```

`BunFileSystem` is already imported at the top of PluginLive.ts.

- [ ] **Step 4: Run tests**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add package/src/layers/ClaudeAccountInfoLive.ts package/src/layers/PluginLive.ts
git commit -m "refactor: ClaudeAccountInfoLive uses FileSystem service instead of readFileSync

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Fix PlatformInfoLive — Use ShellExecutor and FileSystem

**Files:**
- Modify: `package/src/layers/PlatformInfoLive.ts`
- Modify: `package/src/layers/PluginLive.ts`

- [ ] **Step 1: Read current PlatformInfoLive.ts and ShellExecutor service**

Read `package/src/layers/PlatformInfoLive.ts` and `package/src/services/ShellExecutor.ts`.

- [ ] **Step 2: Replace Bun.spawnSync with ShellExecutor**

In `PlatformInfoLive.ts`, replace the `claudeVersion` effect (lines 55-77):

```typescript
// Replace the try/catch Bun.spawnSync block with:
const claudeVersion: Effect.Effect<string, never, ShellExecutor> = Effect.gen(function* () {
	const cached = yield* Ref.get(claudeVersionCache);
	if (Option.isSome(cached)) {
		return cached.value;
	}
	const shell = yield* ShellExecutor;
	const version = yield* shell
		.exec("claude --version")
		.pipe(
			Effect.map((output) => {
				const match = output.match(/\d+\.\d+\.\d+/);
				return match ? match[0] : "unknown";
			}),
			Effect.catchAll(() => Effect.succeed("unknown")),
		);
	yield* Ref.set(claudeVersionCache, Option.some(version));
	return version;
});
```

Also replace `existsSync` in `socketExists` with FileSystem:

```typescript
const socketExists = (path: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.exists(path);
	});
```

Add imports for `ShellExecutor` and `FileSystem`.

Update the layer type to declare dependencies:
```typescript
export const PlatformInfoLive: Layer.Layer<PlatformInfo, never, ShellExecutor | FileSystem.FileSystem> = ...
```

- [ ] **Step 3: Update PluginLive**

Change:
```typescript
pipe(GitInfoLive, Layer.provide(ShellExecutorLive)),
```

The PlatformInfoLive already has ShellExecutorLive provided. Check if it needs FileSystem too. Update:
```typescript
pipe(PlatformInfoLive, Layer.provide(Layer.mergeAll(ShellExecutorLive, BunFileSystem.layer))),
```

And GitInfoLive already depends on ShellExecutor:
```typescript
pipe(GitInfoLive, Layer.provide(ShellExecutorLive)),
```

- [ ] **Step 4: Run tests**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add package/src/layers/PlatformInfoLive.ts package/src/layers/PluginLive.ts
git commit -m "refactor: PlatformInfoLive uses ShellExecutor and FileSystem services

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: Fix SessionStoreLive + Delete SessionRegistry

**Files:**
- Modify: `package/src/services/SessionStore.ts`
- Modify: `package/src/layers/SessionStoreLive.ts`
- Modify: `package/src/layers/EnvResolverLive.ts`
- Modify: `package/src/layers/PluginLive.ts`
- Modify: `package/src/index.ts`
- Delete: `package/src/layers/SessionRegistry.ts`

- [ ] **Step 1: Move SessionRegistration to SessionStore service**

In `package/src/services/SessionStore.ts`, replace:
```typescript
import type { SessionRegistration } from "../layers/SessionRegistry.js";
```
with the inline interface:
```typescript
/**
 * Session registration parameters for storing session-to-env-dir mappings.
 * @public
 */
export interface SessionRegistration {
	sessionId: string;
	projectDir: string;
	sessionEnvDir: string;
}
```

Remove the `export type { SessionRegistration };` line.

- [ ] **Step 2: Fix SessionStoreLive to use FileSystem**

In `package/src/layers/SessionStoreLive.ts`:

Replace `import { existsSync, mkdirSync } from "node:fs"` with `import { FileSystem } from "@effect/platform"`.

Replace the import of SessionRegistration:
```typescript
import type { SessionRegistration } from "../services/SessionStore.js";
```

Replace the acquireRelease setup:
```typescript
const db = yield* Effect.acquireRelease(
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const dbPath = getDbPath();
		const dbDir = dirname(dbPath);
		const dirExists = yield* fs.exists(dbDir);
		if (!dirExists) {
			yield* fs.makeDirectory(dbDir, { recursive: true });
		}
		const database = new Database(dbPath);
		initDb(database);
		return database;
	}),
	(database) => Effect.sync(() => database.close()),
);
```

Update the layer type:
```typescript
export const SessionStoreLive: Layer.Layer<SessionStore, never, FileSystem.FileSystem> = Layer.scoped(...)
```

- [ ] **Step 3: Rewire EnvResolverLive to use SessionStore**

Replace `package/src/layers/EnvResolverLive.ts`:

```typescript
import { Effect, Layer } from "effect";
import { SessionLookupError } from "../errors/SessionLookupError.js";
import { EnvResolver } from "../services/EnvResolver.js";
import { SessionStore } from "../services/SessionStore.js";

export const EnvResolverLive: Layer.Layer<EnvResolver, never, SessionStore> = Layer.effect(
	EnvResolver,
	Effect.gen(function* () {
		const store = yield* SessionStore;

		return {
			getSessionEnvDir: (sessionId: string | undefined) => {
				if (!sessionId) return Effect.succeed(undefined as string | undefined);
				return store.lookup(sessionId).pipe(
					Effect.map((dir) => dir as string | undefined),
					Effect.catchTag("SessionLookupError", () => Effect.succeed(undefined as string | undefined)),
				);
			},

			getProjectSessionEnvDir: (projectDir: string) =>
				store.lookupByProject(projectDir).pipe(
					Effect.map((dir) => dir as string | undefined),
					Effect.catchTag("SessionLookupError", () => Effect.succeed(undefined as string | undefined)),
				),

			registerSession: (sessionId: string, projectDir: string, sessionEnvDir: string) =>
				store.register({ sessionId, projectDir, sessionEnvDir }),
		};
	}),
);
```

- [ ] **Step 4: Update PluginLive layer composition**

In `src/layers/PluginLive.ts`, EnvResolverLive now depends on SessionStore. Update:

```typescript
const EnvServices = pipe(
	EnvCoordinatorLive,
	Layer.provide(
		Layer.mergeAll(
			pipe(EnvLoaderLive, Layer.provide(EnvInfra)),
			pipe(EnvValidatorLive, Layer.provide(EnvBridgeLive)),
			pipe(EnvWriterLive, Layer.provide(EnvInfra)),
			pipe(EnvResolverLive, Layer.provide(SessionStoreLive)),  // Changed
			EnvBridgeLive,
		),
	),
);
```

SessionStoreLive now depends on FileSystem:
```typescript
const SessionStoreWithFs = pipe(SessionStoreLive, Layer.provide(BunFileSystem.layer));
```

Update references to use `SessionStoreWithFs` or provide BunFileSystem.layer where needed.

- [ ] **Step 5: Delete SessionRegistry.ts**

```bash
rm package/src/layers/SessionRegistry.ts
```

- [ ] **Step 6: Remove SessionRegistry exports from index.ts**

Remove:
```typescript
export type { SessionRegistration } from "./layers/SessionRegistry.js";
export { closeDb, getByProjectDir, getBySessionId, registerSession } from "./layers/SessionRegistry.js";
```

Add:
```typescript
export type { SessionRegistration } from "./services/SessionStore.js";
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd package && bun test && bun run typecheck`
Expected: Tests pass (some SessionRegistry-specific tests may need updates). Fix any import errors.

- [ ] **Step 8: Commit**

```bash
git add -u package/src/ && git add package/src/
git commit -m "refactor: delete SessionRegistry, rewire EnvResolverLive to SessionStore service

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 6: Fix CommandRunnerLive — Use EnvResolver + EnvBridge + FileSystem

**Files:**
- Modify: `package/src/layers/CommandRunnerLive.ts`
- Modify: `package/src/layers/PluginLive.ts` (if CommandRunner layer needs providing)

- [ ] **Step 1: Read current CommandRunnerLive.ts in full**

Read `package/src/layers/CommandRunnerLive.ts`, `package/src/services/CommandRunner.ts`, `package/src/services/EnvResolver.ts`, `package/src/services/EnvBridge.ts`.

- [ ] **Step 2: Rewrite findSessionEnvDir to use EnvResolver**

Replace the imperative `findSessionEnvDir()` function with an Effect that uses services:

```typescript
const findSessionEnvDir = Effect.gen(function* () {
	const envBridge = yield* EnvBridge;
	const resolver = yield* EnvResolver;
	const env = yield* envBridge.read;

	// Strategy 1: CLAUDE_SESSION_ID via registry
	const sessionId = env.CLAUDE_SESSION_ID;
	if (sessionId) {
		const dir = yield* resolver.getSessionEnvDir(sessionId);
		if (dir) return dir;
	}

	// Strategy 2: CLAUDE_ENV_FILE parent directory
	const envFile = env.CLAUDE_ENV_FILE;
	if (envFile) return dirname(envFile);

	// Strategy 3: Any *_PLUGIN_ENV_FILE env var
	for (const [key, value] of Object.entries(env)) {
		if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
			return dirname(value);
		}
	}

	// Strategy 4: Project directory via registry
	const projectDir = process.cwd();
	const dir = yield* resolver.getProjectSessionEnvDir(projectDir);
	if (dir) return dir;

	return undefined as string | undefined;
});
```

- [ ] **Step 3: Rewrite session file loading to use FileSystem + EnvBridge**

Replace the `Effect.tryPromise` block that reads shell scripts and mutates Bun.env:

```typescript
const loadSessionFiles = (sessionEnvDir: string, commandName: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const envBridge = yield* EnvBridge;
		const files = yield* fs.readDirectory(sessionEnvDir);
		const hookFiles = files.filter((f) => f.includes("hook") && f.endsWith(".sh"));

		for (const fileName of hookFiles) {
			const filePath = `${sessionEnvDir}/${fileName}`;
			const content = yield* fs.readFileString(filePath).pipe(
				Effect.catchAll(() => Effect.succeed("")),
			);
			const vars: Record<string, string> = {};
			for (const line of content.split("\n")) {
				const match = line.match(/^export\s+(\w+)=(.*)$/);
				if (match?.[1] && match[2] !== undefined) {
					const raw = match[2].trim();
					const value =
						(raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
							? raw.slice(1, -1)
							: raw;
					vars[match[1]] = value;
				}
			}
			if (Object.keys(vars).length > 0) {
				yield* envBridge.write(vars);
			}
		}
	}).pipe(
		Effect.catchAll((error) =>
			Effect.fail(new CommandParseError({ commandName, message: `Failed to load session files: ${error}` })),
		),
	);
```

- [ ] **Step 4: Rewrite createBaseState and extractPersistedState to use EnvBridge**

```typescript
const createBaseState = (prefix: string) =>
	Effect.gen(function* () {
		const envBridge = yield* EnvBridge;
		const env = yield* envBridge.read;
		return {
			projectDir: env[`${prefix}_PROJECT_DIR`] ?? env.CLAUDE_PROJECT_DIR ?? process.cwd(),
			pluginDir: env[`${prefix}_PLUGIN_DIR`] ?? env.CLAUDE_PLUGIN_ROOT ?? "",
			pluginEnvFile: env[`${prefix}_PLUGIN_ENV_FILE`] ?? env.CLAUDE_ENV_FILE ?? "",
		} satisfies BaseState;
	});

const extractPersistedState = (prefix: string) =>
	Effect.gen(function* () {
		if (!prefix) return {};
		const envBridge = yield* EnvBridge;
		const env = yield* envBridge.read;
		const stateJson = env[`${prefix}_PLUGIN_STATE`];
		if (!stateJson) return {};
		return yield* Effect.try({
			try: () => {
				const jsonStr = Buffer.from(stateJson, "base64").toString("utf8");
				const state = JSON.parse(jsonStr);
				return typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {};
			},
			catch: () => ({}) as Record<string, unknown>,
		});
	});
```

- [ ] **Step 5: Update CommandRunnerLive layer type**

The layer now needs EnvResolver, EnvBridge, and FileSystem as dependencies:

```typescript
export const CommandRunnerLive: Layer.Layer<
	CommandRunner,
	never,
	EnvResolver | EnvBridge | FileSystem.FileSystem
> = Layer.effect(
	CommandRunner,
	Effect.gen(function* () {
		// ... yield services and return the runner
	}),
);
```

- [ ] **Step 6: Update PluginLive to provide dependencies to CommandRunnerLive**

CommandRunnerLive is not currently in PluginLive (it's used separately in the entrypoint). Check where it's used and ensure its dependencies are provided. If it's composed in the entrypoint, that's where the layer providing happens.

Read the entrypoint generator to understand how CommandRunnerLive is consumed.

- [ ] **Step 7: Run tests**

Run: `cd package && bun test`
Expected: All tests pass. Fix any import or layer composition errors.

- [ ] **Step 8: Commit**

```bash
git add package/src/layers/CommandRunnerLive.ts package/src/layers/PluginLive.ts
git commit -m "refactor: CommandRunnerLive uses EnvResolver + EnvBridge + FileSystem services

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 7: Fix PluginRuntimeServiceLive — Effect logging + Effect.try

**Files:**
- Modify: `package/src/layers/PluginRuntimeServiceLive.ts`

- [ ] **Step 1: Read the console.error and try/catch locations**

Read `package/src/layers/PluginRuntimeServiceLive.ts` around lines 726-732 and 828-832.

- [ ] **Step 2: Replace console.error in extractPersistedState**

Replace (around line 726-729):
```typescript
const debugLog = (msg: string) => {
	if (isDebugEnabled()) {
		console.error(`[extractPersistedState] ${msg}`);
	}
};
```

With Effect logging inside the function that calls it. Where `debugLog(msg)` is called, replace with:
```typescript
yield* Effect.logDebug(`[extractPersistedState] ${msg}`);
```

If the function isn't already an Effect generator, convert it. The `extractPersistedState` function should become an Effect that yields logDebug calls and uses Effect.try instead of try/catch.

- [ ] **Step 3: Replace console.error in options validation**

Replace (around line 830):
```typescript
} catch (error) {
	console.error(`[${prefix}] Options validation failed:`, error);
}
```

With:
```typescript
yield* Effect.logError(`[${prefix}] Options validation failed: ${String(error)}`);
```

Or wrap the entire block in `Effect.try()` with an error handler that logs.

- [ ] **Step 4: Replace try/catch around JSON.parse**

Find the try/catch around JSON.parse (input parsing, around lines 277-310). Replace with `Effect.try()` pipeline.

- [ ] **Step 5: Run tests**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add package/src/layers/PluginRuntimeServiceLive.ts
git commit -m "refactor: PluginRuntimeServiceLive uses Effect.log and Effect.try

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: Fix SidecarConnectionLive — Remove Effect.runSync

**Files:**
- Modify: `package/src/layers/SidecarConnectionLive.ts`

- [ ] **Step 1: Read current SidecarConnectionLive.ts**

Read the file and find all `Effect.runSync` calls in socket callbacks.

- [ ] **Step 2: Replace Effect.runSync with Effect.runFork**

In the `doConnect` function, replace socket handlers:

```typescript
socket: {
	data: () => {
		// Ignore responses
	},
	error: () => {
		Effect.runFork(Ref.set(socketRef, null));
	},
	close: () => {
		Effect.runFork(Ref.set(socketRef, null));
	},
	open: () => {
		// Connection established
	},
},
```

Also replace the `Effect.runSync(Ref.set(socketRef, socket))` after connection:
```typescript
Effect.runFork(Ref.set(socketRef, socket));
```

- [ ] **Step 3: Replace try/catch in drainQueue**

Find the try/catch around `socket.write()` and replace with `Effect.try()`:

```typescript
const writeResult = yield* Effect.try({
	try: () => socket.write(serialize(msg.value)),
	catch: () => "write_failed" as const,
});
if (writeResult === "write_failed") {
	yield* Ref.set(socketRef, null);
	return false;
}
```

- [ ] **Step 4: Run tests**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add package/src/layers/SidecarConnectionLive.ts
git commit -m "refactor: SidecarConnectionLive uses Effect.runFork instead of Effect.runSync

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 9: Fix SidecarTransportLive — Use OtelConfig + FileSystem

**Files:**
- Modify: `package/src/layers/SidecarTransportLive.ts`

- [ ] **Step 1: Read current SidecarTransportLive.ts in full**

Read the file. Find: `process.env.OTEL_SIDECAR_SOCKET`, `Bun.spawnSync(["rm", "-f", ...])`, `Effect.runSync` in socket handlers.

- [ ] **Step 2: Replace process.env with OtelConfig service**

The `makeSidecarTransportLive` function already has access to OtelProviders. Read the OtelConfig service to see if it has a socket path field. If so, use it. If not, pass the socket path as a parameter.

Replace:
```typescript
const socketPath = process.env.OTEL_SIDECAR_SOCKET ?? DEFAULT_SOCKET_PATH;
```

With:
```typescript
const config = yield* OtelConfig;
const socketPath = config.sidecarSocket ?? DEFAULT_SOCKET_PATH;
```

Add `OtelConfig` to the layer dependencies if not already there.

- [ ] **Step 3: Replace Bun.spawnSync rm with FileSystem.remove**

Replace:
```typescript
yield* Effect.sync(() => {
	try {
		Bun.spawnSync(["rm", "-f", socketPath]);
	} catch {
		// Ignore
	}
});
```

With:
```typescript
const fs = yield* FileSystem.FileSystem;
yield* fs.remove(socketPath).pipe(Effect.catchAll(() => Effect.void));
```

Do the same for the finalizer cleanup.

- [ ] **Step 4: Replace Effect.runSync in socket handlers with Effect.runFork**

In the `socketHandler.open` and `socketHandler.data` handlers:
```typescript
// Change:
Ref.set(lastActivity, Date.now()).pipe(Effect.runSync);
// To:
Ref.set(lastActivity, Date.now()).pipe(Effect.runFork);
```

- [ ] **Step 5: Update layer type for FileSystem dependency**

```typescript
export const makeSidecarTransportLive = (
	lastActivity: Ref.Ref<number>,
): Layer.Layer<SidecarTransport, never, OtelProviders | MessageRouter | OtelConfig | FileSystem.FileSystem> => ...
```

- [ ] **Step 6: Run tests**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add package/src/layers/SidecarTransportLive.ts
git commit -m "refactor: SidecarTransportLive uses OtelConfig + FileSystem, removes runSync

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 10: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 3: Verify no remaining anti-patterns**

```bash
cd package && grep -rn "from \"type-fest\"" src/ --include="*.ts"
# Expected: no matches

cd package && grep -rn "Effect\.runSync" src/ --include="*.ts" | grep -v "Schema\.decodeUnknownSync\|Schema\.encodeSync"
# Expected: no matches (or only in intentional places like Schema decode)

cd package && grep -rn "console\.\(error\|warn\|log\)" src/ --include="*.ts" | grep -v "//.*console"
# Expected: no matches

cd package && grep -rn "readFileSync\|existsSync\|mkdirSync\|writeFileSync" src/ --include="*.ts"
# Expected: no matches

cd package && grep -rn "SessionRegistry" src/ --include="*.ts"
# Expected: no matches
```

- [ ] **Step 4: Run lint**

Run: `cd package && bun run lint:fix`
Expected: Clean

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A package/
git commit -m "chore: final Effect cleanup verification

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
