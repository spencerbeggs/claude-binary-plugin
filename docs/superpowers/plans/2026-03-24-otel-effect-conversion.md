# OTEL Effect Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 26-file imperative OTEL subsystem to idiomatic Effect
services with layers, typed errors, and `acquireRelease` lifecycle management.

**Architecture:** Keep the existing sidecar architecture (plugin binary -> Unix
socket IPC -> sidecar process -> OTLP exporters). Both client and sidecar
sides become Effect programs. Three client-side services (`OtelConfig`,
`SidecarConnection`, `Telemetry`) and two sidecar-side services
(`OtelProviders`, `SidecarTransport`) replace 26 imperative files.

**Tech Stack:** Effect (Context.Tag, Layer.scoped, Schema.Class,
Data.TaggedError, Queue.sliding, Ref, Schedule), `@opentelemetry/sdk-*`,
`@effect/platform` (PlatformLogger.toFile), `bun:test`

**Spec:** `docs/superpowers/specs/2026-03-24-otel-effect-conversion-design.md`

**Out of scope:** The spec mentions refactoring `LoggerLive` to use
`PlatformLogger.toFile`. This is a separate improvement tracked as a
future task — this plan only addresses the OTEL subsystem conversion.

---

## Task 1: Error Types

**Files:**

- Create: `src/errors/SidecarError.ts`
- Create: `src/errors/OtelConfigError.ts`
- Create: `__tests__/errors/SidecarError.test.ts`
- Create: `__tests__/errors/OtelConfigError.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/errors/SidecarError.test.ts
import { describe, expect, test } from "bun:test";
import { SidecarError } from "../../src/errors/SidecarError.js";

describe("SidecarError", () => {
  test("creates tagged error with stage", () => {
    const err = new SidecarError({
      stage: "connect",
      message: "socket not found",
    });
    expect(err._tag).toBe("SidecarError");
    expect(err.stage).toBe("connect");
    expect(err.message).toBe("socket not found");
  });

  test("accepts optional cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new SidecarError({
      stage: "spawn",
      message: "failed",
      cause,
    });
    expect(err.cause).toBe(cause);
  });
});
```

```typescript
// __tests__/errors/OtelConfigError.test.ts
import { describe, expect, test } from "bun:test";
import { OtelConfigError } from "../../src/errors/OtelConfigError.js";

describe("OtelConfigError", () => {
  test("creates tagged error with message", () => {
    const err = new OtelConfigError({
      message: "invalid protocol",
    });
    expect(err._tag).toBe("OtelConfigError");
    expect(err.message).toBe("invalid protocol");
  });

  test("accepts optional variable name", () => {
    const err = new OtelConfigError({
      message: "malformed",
      variable: "OTEL_EXPORTER_OTLP_HEADERS",
    });
    expect(err.variable).toBe("OTEL_EXPORTER_OTLP_HEADERS");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/errors/SidecarError.test.ts __tests__/errors/OtelConfigError.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement error types**

```typescript
// src/errors/SidecarError.ts
import { Data } from "effect";

export class SidecarError extends Data.TaggedError("SidecarError")<{
  readonly stage: "spawn" | "connect" | "send" | "flush" | "shutdown";
  readonly message: string;
  readonly cause?: unknown;
}>() {}
```

```typescript
// src/errors/OtelConfigError.ts
import { Data } from "effect";

export class OtelConfigError extends Data.TaggedError("OtelConfigError")<{
  readonly message: string;
  readonly variable?: string;
}>() {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/errors/SidecarError.test.ts __tests__/errors/OtelConfigError.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/errors/SidecarError.ts src/errors/OtelConfigError.ts \
  __tests__/errors/SidecarError.test.ts __tests__/errors/OtelConfigError.test.ts
git commit -m "feat: add SidecarError and OtelConfigError tagged errors"
```

---

## Task 2: OtelConfig Service Definition and Layer

**Files:**

- Create: `src/services/OtelConfig.ts`
- Create: `src/layers/OtelConfigLive.ts`
- Create: `src/layers/OtelConfigTest.ts`
- Create: `__tests__/layers/OtelConfig.test.ts`
- Reference: `src/otel/OtelConfig.ts` (current imperative class)
- Reference: `src/otel/Platform.ts` (platform detection)

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/layers/OtelConfig.test.ts
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { OtelConfig, OtelConfigData } from "../../src/services/OtelConfig.js";
import { OtelConfigLive } from "../../src/layers/OtelConfigLive.js";
import { makeOtelConfigTest } from "../../src/layers/OtelConfigTest.js";

describe("OtelConfigData", () => {
  test("is a Schema.Class", () => {
    const data = new OtelConfigData({
      enabled: true,
      endpoint: "http://localhost:4318",
    });
    expect(data.enabled).toBe(true);
    expect(data.endpoint).toBe("http://localhost:4318");
  });

  test("defaults optional fields to undefined", () => {
    const data = new OtelConfigData({ enabled: false });
    expect(data.protocol).toBeUndefined();
    expect(data.headers).toBeUndefined();
    expect(data.socketPath).toBeUndefined();
  });
});

describe("OtelConfigLive", () => {
  test("reads enabled from env", async () => {
    // Without CLAUDE_CODE_ENABLE_TELEMETRY, should be disabled
    const program = Effect.flatMap(OtelConfig, (config) =>
      Effect.succeed(config.enabled),
    );
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(OtelConfigLive)),
    );
    // In test env, telemetry is typically disabled
    expect(typeof result).toBe("boolean");
  });
});

describe("makeOtelConfigTest", () => {
  test("defaults to disabled", async () => {
    const { layer } = makeOtelConfigTest();
    const program = Effect.flatMap(OtelConfig, (config) =>
      Effect.succeed(config.enabled),
    );
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(layer)),
    );
    expect(result).toBe(false);
  });

  test("accepts overrides", async () => {
    const { layer } = makeOtelConfigTest({
      enabled: true,
      endpoint: "http://custom:4318",
    });
    const program = Effect.flatMap(OtelConfig, (config) =>
      Effect.succeed({ enabled: config.enabled, endpoint: config.endpoint }),
    );
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(layer)),
    );
    expect(result.enabled).toBe(true);
    expect(result.endpoint).toBe("http://custom:4318");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/OtelConfig.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement OtelConfig service**

Create `src/services/OtelConfig.ts`:

- Define `OtelConfigData` as `Schema.Class` with fields: `enabled` (Boolean),
  `endpoint` (optional String), `protocol` (optional Literal "http" | "grpc"),
  `serviceName` (optional String), `headers` (optional Record String String),
  `socketPath` (optional String)
- Define `OtelConfig` as `Context.Tag("OtelConfig")` providing `OtelConfigData`

- [ ] **Step 4: Implement OtelConfigLive**

Create `src/layers/OtelConfigLive.ts`:

- `Layer.effect(OtelConfig, Effect.sync(() => ...))` that reads env vars:
  - `CLAUDE_CODE_ENABLE_TELEMETRY` + `Platform.isSupported()` -> `enabled`
  - `OTEL_EXPORTER_OTLP_ENDPOINT` -> `endpoint`
  - `OTEL_EXPORTER_OTLP_PROTOCOL` -> `protocol`
  - `OTEL_EXPORTER_OTLP_HEADERS` -> `headers` (parse comma-separated k=v)
  - `OTEL_SIDECAR_SOCKET` -> `socketPath`
- Reuse header parsing logic from current `OtelConfig.parseHeaders()`
- Reuse platform check from current `OtelConfig.isEnabled()`

- [ ] **Step 5: Implement OtelConfigTest**

Create `src/layers/OtelConfigTest.ts`:

```typescript
import { Layer } from "effect";
import { OtelConfig, OtelConfigData } from "../services/OtelConfig.js";

export const makeOtelConfigTest = (
  overrides?: Partial<typeof OtelConfigData.Type>,
) => {
  const config = new OtelConfigData({
    enabled: false,
    ...overrides,
  });
  return {
    config,
    layer: Layer.succeed(OtelConfig, config),
  };
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test __tests__/layers/OtelConfig.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/services/OtelConfig.ts src/layers/OtelConfigLive.ts \
  src/layers/OtelConfigTest.ts __tests__/layers/OtelConfig.test.ts
git commit -m "feat: add OtelConfig service with Layer and test factory"
```

---

## Task 3: Protocol Schema Conversion

**Files:**

- Modify: `src/otel/protocol.ts`
- Create: `__tests__/otel/protocol-schema.test.ts`
- Reference: `src/otel/SidecarMessage.ts` (current serialization)

- [ ] **Step 1: Write failing tests for Schema encode/decode**

Test that `Schema.Class` definitions encode BigInt as string and decode back.
Test the message union discriminated on `type`. Test roundtrip for each
message type (`PingMessage`, `SpanMessage`, `EventMessage`, `MetricMessage`,
`ShutdownMessage`).

Key test cases:

- `EventData` with `timeNs` BigInt roundtrips through JSON
- `SpanData` with `startTimeNs` and `endTimeNs` BigInt roundtrips
- `MetricData` with discriminated `type.kind` union
- `SidecarProtocolMessage` union decodes correctly based on `type` field
- Invalid messages fail decode with `ParseError`

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/protocol-schema.test.ts`
Expected: FAIL — new Schema.Class types not defined

- [ ] **Step 3: Add Schema.Class definitions to protocol.ts**

Keep existing TypeScript interfaces for backward compat during migration.
Add new `Schema.Class` definitions alongside:

- `ScopeDataSchema` extends `Schema.Class`
- `SpanStatusSchema` extends `Schema.Class`
- `SpanEventSchema` extends `Schema.Class`
- `EventDataSchema` extends `Schema.Class` (with `Schema.BigInt` for timeNs)
- `SpanDataSchema` extends `Schema.Class` (with `Schema.BigInt` for timestamps)
- `MetricTypeSchema` as `Schema.Union` discriminated on `kind`
- `MetricDataSchema` extends `Schema.Class`
- `PingMessageSchema`, `SpanMessageSchema`, etc.
- `SidecarProtocolMessageSchema = Schema.Union(...)`

Use `Schema.BigInt` for all nanosecond timestamp fields (string on wire,
bigint at runtime).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/otel/protocol-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to ensure no regressions**

Run: `bun run test:ai`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/otel/protocol.ts __tests__/otel/protocol-schema.test.ts
git commit -m "feat: add Schema.Class definitions for OTEL IPC protocol"
```

---

## Task 4: SidecarConnection Service and Test Layer

**Files:**

- Create: `src/services/SidecarConnection.ts`
- Create: `src/layers/SidecarConnectionTest.ts`
- Create: `__tests__/layers/SidecarConnection.test.ts`
- Reference: `src/otel/SidecarClient.ts` (current client)
- Reference: `src/otel/SidecarLauncher.ts` (current launcher)

- [ ] **Step 1: Write failing tests**

Test the `SidecarConnection` service tag exists. Test the test factory
captures messages. Test emit, preconnect, and flush via the test layer.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/SidecarConnection.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement SidecarConnection service tag**

Create `src/services/SidecarConnection.ts`:

```typescript
import type { Effect } from "effect";
import { Context } from "effect";
import type { SidecarProtocolMessage } from "../otel/protocol.js";

export class SidecarConnection extends Context.Tag("SidecarConnection")<
  SidecarConnection,
  {
    readonly emit: (
      message: SidecarProtocolMessage,
    ) => Effect.Effect<void>;
    readonly preconnect: Effect.Effect<void>;
    readonly flush: (timeoutMs?: number) => Effect.Effect<boolean>;
  }
>() {}
```

- [ ] **Step 4: Implement SidecarConnectionTest**

Create `src/layers/SidecarConnectionTest.ts`:

```typescript
import { Effect, Layer } from "effect";
import type { SidecarProtocolMessage } from "../otel/protocol.js";
import { SidecarConnection } from "../services/SidecarConnection.js";

export const makeSidecarConnectionTest = () => {
  const messages: SidecarProtocolMessage[] = [];
  return {
    messages,
    layer: Layer.succeed(SidecarConnection, {
      emit: (msg) =>
        Effect.sync(() => {
          messages.push(msg);
        }),
      preconnect: Effect.void,
      flush: () => Effect.succeed(true),
    }),
  };
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test __tests__/layers/SidecarConnection.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/SidecarConnection.ts \
  src/layers/SidecarConnectionTest.ts \
  __tests__/layers/SidecarConnection.test.ts
git commit -m "feat: add SidecarConnection service tag and test factory"
```

---

## Task 5: SidecarConnectionLive (Scoped Layer)

**Files:**

- Create: `src/layers/SidecarConnectionLive.ts`
- Create: `__tests__/layers/SidecarConnectionLive.test.ts`
- Reference: `src/otel/SidecarClient.ts` (socket connection logic)
- Reference: `src/otel/SidecarLauncher.ts` (sidecar spawn logic)
- Reference: `src/otel/SidecarMessage.ts` (serialization)
- Reference: `src/otel/Platform.ts` (socket path resolution)
- Reference: `src/otel/SessionEnv.ts` (session env dir)

- [ ] **Step 1: Write failing tests**

Test that `SidecarConnectionLive` provides the `SidecarConnection` service.
Test emit queues messages when not connected. Test flush with timeout. Use
`OtelConfigTest` with `enabled: false` to verify no-spawn behavior.

Key test cases:

- Layer provides `SidecarConnection` service successfully
- With `enabled: false`, emit is a no-op (nothing crashes)
- Queue uses sliding semantics (test by filling beyond capacity)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/SidecarConnectionLive.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SidecarConnectionLive**

Create `src/layers/SidecarConnectionLive.ts` as `Layer.scoped`:

- **Acquire:** Read `OtelConfig`. If not enabled, return no-op
  implementation. If enabled, resolve socket path, create
  `Queue.sliding(1024)`, create `Ref<Socket | null>(null)`.
  Attempt connection, spawn sidecar if needed.
- **emit:** Check socket ref. If connected, serialize via
  `Schema.encode` and write. If not, offer to queue and attempt
  reconnect in background fiber.
- **flush:** Drain queue items, write each, with
  `Effect.timeout(Duration.millis(timeoutMs))`.
- **preconnect:** Attempt socket connection, return void.
- **Release (addFinalizer):** Disconnect socket, shutdown queue.

Port socket connection logic from `SidecarClient.doConnect()`.
Port sidecar spawn logic from `SidecarLauncher.spawn()`.
Port socket path resolution from `Platform.getSocketPathWithFallback()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/layers/SidecarConnectionLive.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/layers/SidecarConnectionLive.ts \
  __tests__/layers/SidecarConnectionLive.test.ts
git commit -m "feat: add SidecarConnectionLive scoped layer"
```

---

## Task 6: Enrich Telemetry Service and TelemetryLive

**Files:**

- Modify: `src/services/Telemetry.ts`
- Modify: `src/layers/TelemetryLive.ts`
- Modify: `src/layers/TelemetryTest.ts`
- Create: `src/otel/message-builders.ts` (pure functions)
- Modify: `__tests__/layers/TelemetryLive.test.ts` (new or enhance)
- Reference: `src/otel/TelemetryEmitter.ts` (attribute building logic)

- [ ] **Step 1: Write failing tests for enriched Telemetry**

Test the new methods: `emitFatalError`, `preconnect`, `flush`.
Test message-building pure functions produce correct OTEL attributes.
Test that disabled config produces no-ops for all methods.
Test `withErrorTelemetry` with corrected `R` type parameter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/TelemetryLive.test.ts`
Expected: FAIL — new methods not defined

- [ ] **Step 3: Update Telemetry service interface**

Add to `src/services/Telemetry.ts`:

- `emitFatalError: (data: FatalErrorData) => Effect<boolean>`
- `preconnect: Effect<void>`
- `flush: (timeoutMs?: number) => Effect<boolean>`

Keep `HookExecutionData` Schema.Class as-is.
Add `FatalErrorData` Schema.Class.

- [ ] **Step 4: Extract message-building pure functions**

Create `src/otel/message-builders.ts`:

Extract from `TelemetryEmitter.ts` the logic that builds
`SidecarProtocolMessage` payloads. These are pure functions that take
typed data and return protocol messages:

- `buildHookExecutionEvent(data, hookName, sessionId): EventMessage`
- `buildErrorEvent(error, sessionId): EventMessage`
- `buildFatalErrorEvent(data, sessionId): EventMessage`
- `buildSchemaValidationEvent(data, sessionId): EventMessage`

Keep `TelemetryEmitter.ATTRS`, `SCOPE`, and `EVENT_NAMES` as exported
constants (move to `message-builders.ts` or a constants file).

- [ ] **Step 5: Rewrite TelemetryLive**

Replace `src/layers/TelemetryLive.ts`:

- Remove `require()` hack
- Depend on `SidecarConnection` and `OtelConfig`
- Check `config.enabled` — no-ops when disabled
- When enabled, use message builders + `conn.emit()`
- `emitFatalError` calls `conn.emit()` then `conn.flush(500)`
- `preconnect` delegates to `conn.preconnect`
- `flush` delegates to `conn.flush`

Fix `withErrorTelemetry` signature to `<A, E, R>`:

```typescript
export const withErrorTelemetry = <A, E, R>(
  effect: Effect.Effect<A, E, R | Telemetry>,
) =>
  Effect.tapError(effect, (error) =>
    Effect.flatMap(Telemetry, (t) => t.emitError(error)),
  );
```

Add a test that verifies `withErrorTelemetry` works with effects that
have requirements beyond `Telemetry`:

```typescript
test("withErrorTelemetry preserves additional requirements", async () => {
  const { errors, layer } = makeTelemetryTest();
  // Effect that requires both Telemetry and ShellExecutor
  const failing = Effect.fail(new Error("oops")).pipe(
    Effect.flatMap(() => Effect.succeed("ok")),
  );
  const program = withErrorTelemetry(failing);
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(layer)),
  );
  expect(exit._tag).toBe("Failure");
  expect(errors).toHaveLength(1);
});
```

- [ ] **Step 6: Update TelemetryTest**

Update `src/layers/TelemetryTest.ts` to capture the new methods:

- Add `fatalErrors: FatalErrorData[]` to captured state
- Add `preconnectCalled: boolean` flag
- Add `flushCalled: boolean` flag

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test __tests__/layers/TelemetryLive.test.ts`
Expected: PASS

- [ ] **Step 8: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass (existing tests use `Telemetry` tag which still
works with enriched interface — new methods are additive)

- [ ] **Step 9: Commit**

```bash
git add src/services/Telemetry.ts src/layers/TelemetryLive.ts \
  src/layers/TelemetryTest.ts src/otel/message-builders.ts \
  __tests__/layers/TelemetryLive.test.ts
git commit -m "feat: enrich Telemetry service with SidecarConnection integration"
```

---

## Task 7: OtelClientLive Composition and PipelineLive Update

**Files:**

- Modify: `src/layers/PipelineLive.ts`
- Modify: `__tests__/layers/PipelineRuntime.test.ts` (verify integration)

- [ ] **Step 1: Write failing integration test**

Test that `PipelineLive` still provides `Telemetry` service. Test that
a pipeline run with the new `OtelClientLive` composition works end-to-end
using test layers.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/layers/PipelineRuntime.test.ts`
Expected: FAIL (if new composition is broken)

- [ ] **Step 3: Update PipelineLive**

In `src/layers/PipelineLive.ts`:

```typescript
import { OtelConfigLive } from "./OtelConfigLive.js";
import { SidecarConnectionLive } from "./SidecarConnectionLive.js";
// TelemetryLive import stays the same

const OtelClientLive = pipe(
  TelemetryLive,
  Layer.provide(SidecarConnectionLive),
  Layer.provide(OtelConfigLive),
);

export const PipelineLive = Layer.mergeAll(
  StdinReaderLive,
  SchemaValidatorLive,
  EnvLoaderLive,
  EnvPersisterLive,
  SessionStoreLive,
  OtelClientLive,
  ShellExecutorLive,
);
```

- [ ] **Step 4: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass — same `Telemetry` tag, transparent swap

- [ ] **Step 5: Commit**

```bash
git add src/layers/PipelineLive.ts __tests__/layers/PipelineRuntime.test.ts
git commit -m "feat: compose OtelClientLive into PipelineLive"
```

---

## Task 8: Pipeline Preconnect/Flush Integration

**Files:**

- Modify: `src/layers/PipelineRuntime.ts`
- Modify: `__tests__/layers/PipelineRuntime.test.ts`

- [ ] **Step 1: Write failing test**

Test that `PipelineRuntime.run()` calls `Telemetry.preconnect` at start
and `Telemetry.flush` before exit. Use the test layer to verify.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/layers/PipelineRuntime.test.ts`
Expected: FAIL — preconnect/flush not called yet

- [ ] **Step 3: Add preconnect/flush and Effect.withSpan to PipelineRuntime.run()**

In `src/layers/PipelineRuntime.ts`, modify the `run()` method:

- At the start: `yield* telemetry.preconnect.pipe(Effect.ignoreLogged)`
- Wrap the handler call in `Effect.withSpan("hook.execution", { attributes: { "hook.name": hookName, "hook.type": hookType } })`
- Before stdout write: `yield* telemetry.flush(500).pipe(Effect.ignoreLogged)`
- Replace direct `TelemetryEmitter.*()` calls with
  `telemetry.emitHookExecution()` using the enriched service
- Remove the `import { TelemetryEmitter }` and `import type { HookOutcome }`
  from `../otel/TelemetryEmitter.js`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/layers/PipelineRuntime.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/layers/PipelineRuntime.ts __tests__/layers/PipelineRuntime.test.ts
git commit -m "feat: add telemetry preconnect/flush to pipeline lifecycle"
```

---

## Task 9: OtelProviders Service (Sidecar Side)

**Files:**

- Create: `src/services/OtelProviders.ts`
- Create: `src/layers/OtelProvidersLive.ts`
- Create: `__tests__/layers/OtelProvidersLive.test.ts`
- Reference: `src/otel/SidecarProviders.ts` (current implementation)
- Reference: `src/otel/SidecarExporters.ts` (exporter factories)
- Reference: `src/otel/SidecarResource.ts` (resource creation)
- Reference: `src/otel/GitInfo.ts` (git detection)

- [ ] **Step 1: Write failing tests**

Test `OtelProviders` service tag definition. Test `OtelProvidersLive`
acquires and provides the service. Test `reinit` with config hash change
detection. Test `getTracer/getMeter/getLogger` return no-op instances
before first `reinit`. Test finalizer calls `forceFlush` and `shutdown`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/OtelProvidersLive.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OtelProviders service tag**

Create `src/services/OtelProviders.ts` with `Context.Tag("OtelProviders")`
defining `getTracer`, `getMeter`, `getLogger`, `reinit`.

- [ ] **Step 4: Implement OtelProvidersLive**

Create `src/layers/OtelProvidersLive.ts` as `Layer.scoped`:

- Port provider initialization from `SidecarProviders.init()`
- Port config hash logic from `SidecarProviders.computeConfigHash()`
- Use `Ref<Provider | null>` for deferred init
- Add `Effect.addFinalizer` for flush+shutdown
- Use `SidecarExporters` and `SidecarResource` pure functions directly

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test __tests__/layers/OtelProvidersLive.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/OtelProviders.ts src/layers/OtelProvidersLive.ts \
  __tests__/layers/OtelProvidersLive.test.ts
git commit -m "feat: add OtelProviders service with scoped lifecycle"
```

---

## Task 10: SidecarTransport Service (Sidecar Side)

**Files:**

- Create: `src/services/SidecarTransport.ts`
- Create: `src/layers/SidecarTransportLive.ts`
- Create: `__tests__/layers/SidecarTransportLive.test.ts`
- Modify: `src/otel/EventHandler.ts` (accept provider params)
- Modify: `src/otel/SpanHandler.ts` (accept provider params)
- Modify: `src/otel/MetricHandler.ts` (accept provider params)
- Reference: `src/otel/SidecarServer.ts` (current server)
- Reference: `src/otel/SidecarRouter.ts` (current routing)

- [ ] **Step 1: Write failing tests**

Test `SidecarTransport` service tag. Test `makeSidecarTransportLive`
accepts a `Ref<number>` for activity tracking. Test message routing:
ping triggers reinit, span/event/metric are fire-and-forget, shutdown
with no sessionId triggers interrupt. Test activity ref gets updated on
message receipt.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/SidecarTransportLive.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SidecarTransport service tag**

Create `src/services/SidecarTransport.ts`.

- [ ] **Step 4: Refactor EventHandler, SpanHandler, MetricHandler**

These handlers currently import `SidecarProviders` (static class). Refactor
them to be pure functions that accept provider instances as parameters:

- `EventHandler.handle(data, logger)` — accepts OTEL Logger instance
- `SpanHandler.handle(data, tracer)` — accepts OTEL Tracer instance
- `MetricHandler.handle(data, meter)` — accepts OTEL Meter instance

Remove their imports of `SidecarProviders`. They become pure functions
called by `SidecarTransportLive`'s message router, which passes provider
instances from the `OtelProviders` service.

- [ ] **Step 5: Implement SidecarTransportLive**

Create `src/layers/SidecarTransportLive.ts`:

- `makeSidecarTransportLive(lastActivity: Ref<number>)` returns `Layer.scoped`
- **Acquire:** Read socket path from env, remove stale socket, create
  `Bun.listen` server, wire message handler with activity tracking
- **Message routing:** Port from `SidecarRouter.handleMessage()` but
  inline as a pure function. Use Schema decode for incoming messages.
  Call refactored handlers with provider instances from `OtelProviders`.
- **Release:** Close clients, stop server, remove socket file

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test __tests__/layers/SidecarTransportLive.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/SidecarTransport.ts \
  src/layers/SidecarTransportLive.ts \
  __tests__/layers/SidecarTransportLive.test.ts \
  src/otel/EventHandler.ts src/otel/SpanHandler.ts src/otel/MetricHandler.ts
git commit -m "feat: add SidecarTransport service with socket server layer"
```

---

## Task 11: Sidecar Logger Layer

**Files:**

- Create: `src/layers/SidecarLoggerLive.ts`
- Create: `__tests__/layers/SidecarLoggerLive.test.ts`

- [ ] **Step 1: Write failing test**

Test that `SidecarLoggerLive` provides a logger that writes to a file.
Use a temp file path and verify `Effect.log("test")` writes NDJSON.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/layers/SidecarLoggerLive.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SidecarLoggerLive**

Create `src/layers/SidecarLoggerLive.ts`:

```typescript
import { PlatformLogger } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Layer, Logger } from "effect";

export const makeSidecarLoggerLive = (logPath: string) =>
  Logger.replaceScoped(
    Logger.defaultLogger,
    Logger.structuredLogger.pipe(
      Logger.map((entry) => JSON.stringify(entry)),
      PlatformLogger.toFile(logPath),
    ),
  ).pipe(Layer.provide(BunFileSystem.layer));
```

Add `resolveSidecarLogPath()` helper that reads from env or defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/layers/SidecarLoggerLive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/layers/SidecarLoggerLive.ts \
  __tests__/layers/SidecarLoggerLive.test.ts
git commit -m "feat: add SidecarLoggerLive with PlatformLogger.toFile"
```

---

## Task 12: Sidecar Entry Point

**Files:**

- Create: `src/otel/SidecarMain.ts`
- Modify: `src/otel/Sidecar.ts`
- Create: `__tests__/otel/SidecarMain.test.ts`

- [ ] **Step 1: Write failing tests**

Test that `SidecarMain` creates an idle timeout watcher. Test that
idle timeout triggers interruption. Test that the entry point composes
layers correctly. Use mock layers to avoid real socket/provider setup.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/SidecarMain.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SidecarMain**

Create `src/otel/SidecarMain.ts` with the idle timeout effect:

- Read idle timeout from env (default 300000ms)
- Create `Ref<number>` for last activity timestamp
- Run `Effect.repeat` with `Schedule.spaced(5 seconds)` checking idle
- `Effect.interrupt` when idle threshold exceeded
- **Signal handling:** Wire `SIGTERM` and `SIGINT` to interrupt the main
  fiber. Use `Effect.async` to bridge process signals to fiber
  interruption:

```typescript
const signalHandler = Effect.async<never, never, never>((resume) => {
  const handler = () => resume(Effect.interrupt);
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
  return Effect.sync(() => {
    process.off("SIGTERM", handler);
    process.off("SIGINT", handler);
  });
});
```

Race the idle checker against the signal handler so either triggers
scope unwinding.

- [ ] **Step 4: Update Sidecar.ts entry point**

Modify `src/otel/Sidecar.ts`:

Replace imperative `Sidecar.main()` with:

```typescript
static main(): void {
  const program = SidecarMain.pipe(
    Effect.provide(SidecarLive),
  );
  Effect.runFork(program);
}
```

Where `SidecarLive` composes `SidecarTransportLive`,
`OtelProvidersLive`, and `SidecarLoggerLive`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test __tests__/otel/SidecarMain.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/otel/SidecarMain.ts src/otel/Sidecar.ts \
  __tests__/otel/SidecarMain.test.ts
git commit -m "feat: convert sidecar entry point to Effect program"
```

---

## Task 13: SidecarSpan Tracer Bridge

**Files:**

- Create: `src/otel/SidecarSpan.ts`
- Modify: `src/layers/TelemetryLive.ts` (add tracer provision)
- Create: `__tests__/otel/SidecarSpan.test.ts`

- [ ] **Step 1: Write failing tests**

Test `SidecarSpan` implements Effect's span interface. Test that
`end()` produces a `SpanMessage`. Test that a `Tracer.make` using
`SidecarSpan` works with `Effect.withSpan`. Verify span parent-child
relationships.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/SidecarSpan.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SidecarSpan**

Create `src/otel/SidecarSpan.ts`:

- Implement Effect's `Tracer.Span` interface
- On construction: generate spanId, record traceId, parentSpanId, name,
  startTime
- On `end()`: build `SpanMessage` from recorded data and emit via
  `SidecarConnection`
- `attribute(key, value)`: accumulate attributes
- `event(name, attributes)`: accumulate events

- [ ] **Step 4: Wire tracer into TelemetryLive**

Update `src/layers/TelemetryLive.ts`:

- Create `sidecarTracer = Tracer.make({ span: ..., context: ... })`
  that produces `SidecarSpan` instances
- Merge `Layer.succeed(Tracer.Tracer, sidecarTracer)` into the
  `OtelClientLive` composition so `Effect.withSpan` works in handlers

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test __tests__/otel/SidecarSpan.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/otel/SidecarSpan.ts src/layers/TelemetryLive.ts \
  __tests__/otel/SidecarSpan.test.ts
git commit -m "feat: add SidecarSpan tracer bridge for Effect.withSpan"
```

---

## Task 14: Delete Replaced Files and Clean Up

**Files:**

- Delete: `src/otel/SidecarClientPool.ts`
- Delete: `src/otel/SidecarLifecycle.ts`
- Delete: `src/otel/SidecarRouter.ts`
- Delete: `src/otel/SidecarLog.ts`
- Delete: `src/otel/TelemetryEmitter.ts`
- Delete: `src/otel/TelemetryMetrics.ts`
- Delete: `src/otel/TelemetrySpan.ts`
- Delete: `src/otel/SidecarClient.ts`
- Delete: `src/otel/SidecarLauncher.ts`
- Delete: `src/otel/SidecarServer.ts`
- Delete: `src/otel/SidecarProviders.ts`
- Delete: `src/otel/SidecarMessage.ts`
- Delete: `src/otel/OtelConfig.ts` (replaced by service)
- Delete or update: corresponding test files in `__tests__/otel/`

- [ ] **Step 1: Search for remaining imports of deleted files**

Use Grep to search for imports of all files being deleted:

- `SidecarClientPool`, `SidecarLifecycle`, `SidecarRouter`, `SidecarLog`
- `TelemetryEmitter`, `TelemetryMetrics`, `TelemetrySpan`
- `SidecarClient`, `SidecarLauncher`, `SidecarServer`, `SidecarProviders`
- `SidecarMessage`, `OtelConfig` (the old class, not the new service)

Fix any remaining references before deleting. Check both `src/` and
`__tests__/` directories.

- [ ] **Step 2: Delete replaced source files**

Remove the 13 source files:

```bash
rm src/otel/SidecarClientPool.ts src/otel/SidecarLifecycle.ts \
   src/otel/SidecarRouter.ts src/otel/SidecarLog.ts \
   src/otel/TelemetryEmitter.ts src/otel/TelemetryMetrics.ts \
   src/otel/TelemetrySpan.ts src/otel/SidecarClient.ts \
   src/otel/SidecarLauncher.ts src/otel/SidecarServer.ts \
   src/otel/SidecarProviders.ts src/otel/SidecarMessage.ts \
   src/otel/OtelConfig.ts
```

- [ ] **Step 3: Delete corresponding test files**

Remove test files for deleted modules in `__tests__/otel/`:

```bash
rm __tests__/otel/SidecarClientPool.test.ts \
   __tests__/otel/SidecarLifecycle.test.ts \
   __tests__/otel/SidecarRouter.test.ts \
   __tests__/otel/SidecarLog.test.ts \
   __tests__/otel/TelemetryEmitter.test.ts \
   __tests__/otel/TelemetryMetrics.test.ts \
   __tests__/otel/TelemetrySpan.test.ts \
   __tests__/otel/SidecarClient.test.ts \
   __tests__/otel/SidecarLauncher.test.ts \
   __tests__/otel/SidecarServer.test.ts \
   __tests__/otel/SidecarProviders.test.ts \
   __tests__/otel/SidecarMessage.test.ts \
   __tests__/otel/OtelConfig.test.ts
```

Note: Some of these test files may not exist. Use `rm -f` to ignore
missing files. Keep any test files that were already rewritten to test
the new Effect layers (e.g., `__tests__/otel/protocol.test.ts` and
`__tests__/otel/protocol-schema.test.ts`).

- [ ] **Step 4: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass (some test count may decrease from removed
imperative tests, but all remaining tests should pass)

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: No errors — all import references resolved

- [ ] **Step 6: Run lint**

Run: `bun run lint:fix`
Expected: Clean

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: delete imperative OTEL files replaced by Effect services"
```

---

## Task 15: Public API and Export Updates

**Files:**

- Modify: `src/index.ts`
- Modify: `src/testing.ts`
- Modify: `__tests__/services/index.test.ts`

- [ ] **Step 1: Update src/index.ts exports**

**Remove** exports for deleted/replaced modules:

- `TelemetryEmitter` and all its types (`HookOutcome`, `DecisionSource`,
  `HookMetrics`, `HookExecutionResult`, `SchemaValidationErrorResult`,
  `EnvValidationErrorResult`, `FatalErrorResult`,
  `HookExecutionDirectResult`)
- `TelemetryMetrics`, `TelemetrySpan`
- `SidecarClient`, `getSidecarClient`, `removeSidecarClient`,
  `clearSidecarClients`, `ClientState`
- `SidecarClientPool`
- `SidecarLauncher`, `SpawnResult`
- `SidecarMessage`
- Old `OtelConfig`, `OtelConfigData` (from `src/otel/OtelConfig.ts`)

**Add** new public exports:

- `OtelConfig` service tag and `OtelConfigData` schema (from new
  `src/services/OtelConfig.ts`)
- `SidecarError` from `src/errors/SidecarError.ts`
- `OtelConfigError` from `src/errors/OtelConfigError.ts`
- `OtelConfigLive` from `src/layers/OtelConfigLive.ts`
- `Sidecar` (updated entry point)

**Keep** existing exports that are still valid:

- `Telemetry`, `HookExecutionData` (enriched, same tag)
- Protocol types from `src/otel/protocol.ts`
- `Sidecar` from `src/otel/Sidecar.ts` (rewritten)

- [ ] **Step 2: Update src/testing.ts exports**

Add:

- `makeOtelConfigTest` from `./layers/OtelConfigTest.js`
- `makeSidecarConnectionTest` from `./layers/SidecarConnectionTest.js`

- [ ] **Step 3: Update service index tests**

Update `__tests__/services/index.test.ts` to include new service tags
and verify new exports exist.

- [ ] **Step 4: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass

- [ ] **Step 5: Run typecheck and lint**

Run: `bun run typecheck && bun run lint:fix`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/testing.ts __tests__/services/index.test.ts
git commit -m "feat: update public API exports for OTEL Effect conversion"
```

---

## Task 16: Update Design Docs

**Files:**

- Modify: `.claude/design/otel.md`
- Modify: `.claude/design/services.md`
- Modify: `.claude/design/architecture.md`

- [ ] **Step 1: Update otel.md**

Rewrite to reflect the new Effect-based architecture:

- New service/layer structure
- Client-side: `OtelConfig`, `SidecarConnection`, `Telemetry`
- Sidecar-side: `OtelProviders`, `SidecarTransport`, `SidecarMain`
- File list (deleted, converted, unchanged, new)

- [ ] **Step 2: Update services.md**

Add entries for new services:

- `OtelConfig` — client config with enabled flag
- `SidecarConnection` — internal, socket lifecycle
- `OtelProviders` — sidecar-side OTEL SDK lifecycle
- `SidecarTransport` — sidecar-side socket server

Update `Telemetry` entry with enriched interface.

- [ ] **Step 3: Update architecture.md**

Update directory structure and file counts. Note OTEL subsystem is now
Effect-based. Update service count.

- [ ] **Step 4: Commit**

```bash
git add .claude/design/otel.md .claude/design/services.md \
  .claude/design/architecture.md
git commit -m "docs: update design docs for OTEL Effect conversion"
```

---

## Task 17: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun run test:ai`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `bun run lint:fix && bun run lint:md:fix`
Expected: Clean

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds — both plugin binary and sidecar compile

- [ ] **Step 5: Verify sidecar mode works**

Manual test: build a test plugin, run with `--sidecar` flag, verify
it starts and accepts socket connections.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final cleanup for OTEL Effect conversion"
```
