/**
 * Test utilities for claude-binary-plugin.
 *
 * @remarks
 * Import from `claude-binary-plugin/testing` to access test layer factories.
 * These factories create in-memory implementations of each service for use in tests.
 *
 * @example
 * ```typescript
 * import { makeStdinReaderTest, makeSessionStoreTest } from "claude-binary-plugin/testing";
 *
 * const stdinLayer = makeStdinReaderTest('{"tool_name": "Bash"}');
 * const sessionLayer = makeSessionStoreTest();
 * ```
 *
 * @packageDocumentation
 */

// New OTEL service test factories
export { makeClaudeAccountInfoTest } from "./layers/ClaudeAccountInfoTest.js";
export { makeCommandRunnerTest } from "./layers/CommandRunnerTest.js";
export { makeEnvBridgeTest } from "./layers/EnvBridgeTest.js";
export { makeEnvCoordinatorTest } from "./layers/EnvCoordinatorTest.js";
export { EnvLoaderTest } from "./layers/EnvLoaderTest.js";
export { makeEnvResolverTest } from "./layers/EnvResolverTest.js";
export { makeEnvWriterTest } from "./layers/EnvWriterTest.js";
export { makeGitInfoTest } from "./layers/GitInfoTest.js";
export { makeMessageRouterTest } from "./layers/MessageRouterTest.js";
export { makeOtelConfigTest } from "./layers/OtelConfigTest.js";
export { makePlatformInfoTest } from "./layers/PlatformInfoTest.js";
export { makePluginInfoServiceTest } from "./layers/PluginInfoServiceTest.js";
export { makePluginLoggerTest } from "./layers/PluginLoggerTest.js";
export { makeSessionStoreTest } from "./layers/SessionStoreTest.js";
export { makeShellExecutorTest } from "./layers/ShellExecutorTest.js";
export { makeSidecarConnectionTest } from "./layers/SidecarConnectionTest.js";
// Test layer factories
export { makeStdinReaderTest } from "./layers/StdinReaderTest.js";
export { makeTelemetryTest } from "./layers/TelemetryTest.js";
