/**
 * Claude Binary Plugin SDK
 *
 * @remarks
 * The `claude-binary-plugin` package provides a TypeScript SDK for building
 * Claude Code plugins that compile to single-file Bun executables.
 *
 * **Key Features:**
 * - Declarative pipeline system for hook handlers
 * - Zod-validated inputs and outputs
 * - OpenTelemetry observability integration
 * - Type-safe environment management
 * - SQLite-based session state persistence
 *
 * **Core Exports:**
 * - {@link ClaudeBinaryPlugin} - Factory for creating plugin configurations
 * - {@link ClaudeBinaryPluginEnv} - Base class for environment management
 * - {@link buildPlugin} - Compile plugins to executables
 * - Hook event classes (`PreToolUseHookEvent`, `SessionStartHookEvent`, etc.)
 *
 * @example
 * ```typescript
 * import { ClaudeBinaryPlugin } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * const plugin = ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   schema: z.object({ DEBUG: z.string().default("false") }),
 *   setup: async ({ cwd }) => ({ detected: true }),
 *   hooks: {
 *     PreToolUse: [{ name: "security", pipeline: "./hooks/security.ts" }],
 *   },
 * });
 *
 * export default plugin;
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @packageDocumentation
 */

// =============================================================================
// CORE TYPES
// =============================================================================

import { DebugLogger } from "./utils/debug-logger.js";
export { DebugLogger };
export type {
	DebugLoggerOptions,
	FileSystem,
	LogLevel,
	Timer,
	TimingEntry,
	TimingTracker,
} from "./utils/debug-logger.js";

import {
	ClaudeBinaryPluginEnv,
	EnvFileLoadError,
	escapeForBashDoubleQuotes,
	formatZodError as formatZodErrorAsMarkdown,
} from "./env/plugin-env.js";
export { ClaudeBinaryPluginEnv, EnvFileLoadError, escapeForBashDoubleQuotes, formatZodErrorAsMarkdown };
export type { EnvCodecMetadata } from "./env/codecs.js";
// Environment codecs with registry metadata
export { EnvCodecs, createEnumCodec, createJsonArrayCodec, envCodecRegistry } from "./env/codecs.js";
export type {
	CommandConfig,
	CommandContextParams,
	CommandContextResult,
	EnvContext,
	HookContextParams,
	PersistResult,
	PluginEnvFileSystem,
	SessionStartContextParams,
	ValidationResult,
	ZodErrorMinimal,
	ZodIssueMinimal,
	ZodSchema,
} from "./env/plugin-env.js";
export type { SessionRecord, SessionRegistration } from "./env/session-registry.js";
// Session registry for persistent session lookups
export { SessionRegistry, closeDb } from "./env/session-registry.js";

// =============================================================================
// EVENTS MODULE
// =============================================================================

// Re-export all event types, classes, and utilities from the events module
export * from "./events/index.js";

// =============================================================================
// TYPED TOOL INPUTS
// =============================================================================

export * from "./core/tool-inputs.js";

// =============================================================================
// HOOK EVENT SCHEMAS
// =============================================================================

// Hook event schema types and registry
export type {
	HookEventParsed,
	HookEventSchemaMetadata,
	NotificationEventParsed,
	PermissionRequestEventParsed,
	PostToolUseEventParsed,
	PreCompactEventParsed,
	PreToolUseEventParsed,
	SessionEndEventParsed,
	SessionStartEventParsed,
	StopEventParsed,
	SubagentStopEventParsed,
	UserPromptSubmitEventParsed,
} from "./core/schemas.js";
// Hook event schemas with registry metadata
export {
	HookEventSchema,
	HookEventSchemas,
	NotificationEventSchema,
	PermissionRequestEventSchema,
	PostToolUseEventSchema,
	PreCompactEventSchema,
	PreToolUseEventSchema,
	SessionEndEventSchema,
	SessionStartEventSchema,
	StopEventSchema,
	SubagentStopEventSchema,
	UserPromptSubmitEventSchema,
	hookEventSchemaRegistry,
} from "./core/schemas.js";

// =============================================================================
// COMMAND TYPES
// =============================================================================

export type { EmptyArgs, RunCommandOptions } from "./commands/runtime.js";

export {
	CommandArgumentError,
	// Unified namespace (preferred)
	Commands,
	emptyArgsSchema,
	findSessionEnvDir,
	formatFatalError,
	parseCommandArgs,
	parseRawArgs,
	runCommand,
	validateCommandOutput,
} from "./commands/runtime.js";

// =============================================================================
// OTEL TELEMETRY
// =============================================================================

// Type exports
export type {
	// Configuration types
	ClaudeAccountInfoData,
	// Telemetry types
	ClientState,
	DecisionSource,
	EnvValidationErrorResult,
	// Protocol types
	EventData,
	EventMessage,
	FatalErrorResult,
	GitInfoData,
	GitProvider,
	HookExecutionDirectResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	MetricData,
	MetricMessage,
	MetricType,
	OTELConfigData,
	OTELConfigProtocol,
	PingMessage,
	PlatformType,
	PluginInfoData,
	SchemaValidationErrorResult,
	ScopeData,
	ShutdownMessage,
	SidecarMessageProtocol,
	SpanData,
	SpanEvent,
	SpanMessage,
	SpawnResult,
	SupportedPlatform,
} from "./otel/index.js";

// Class exports
export {
	// Constants
	CLAUDE_ATTRS,
	// Configuration classes
	ClaudeAccountInfo,
	GitInfo,
	METRIC_NAMES,
	OTELConfig,
	PLUGIN_ATTRS,
	// Platform utilities
	Platform,
	PluginInfo,
	SPAN_NAMES,
	SessionEnv,
	// Sidecar management
	SidecarClient,
	SidecarClientPool,
	SidecarLauncher,
	SidecarMessage,
	// Telemetry
	TelemetryEmitter,
	TelemetryMetrics,
	TelemetrySpan,
} from "./otel/index.js";
// Sidecar entry point (compiled separately by builder)
export { main as sidecarMain } from "./otel/sidecar/main.js";

// =============================================================================
// PIPELINE CONFIG
// =============================================================================

export type {
	BaseEnv,
	CommandContext,
	CommandDefinition,
	CommandHandler,
	CommandOutput,
	CommandsMap,
	ExtractSetupReturn,
	HookDefinition,
	HookDefinitionBase,
	HooksMap,
	NotificationHookDefinition,
	NotificationPipeline,
	NotificationRawHandler,
	PassthroughHookEntry,
	PermissionRequestHookDefinition,
	PermissionRequestPipeline,
	PermissionRequestRawHandler,
	PipelineContext,
	PipelineFileHookDefinition,
	PipelineHandler,
	PipelineHookDefinition,
	PluginBuildOptions,
	PluginConfig,
	PluginEnv,
	PostToolUseHookDefinition,
	PostToolUsePipeline,
	PostToolUseRawHandler,
	PreCompactHookDefinition,
	PreCompactPipeline,
	PreCompactRawHandler,
	PreToolUseHookDefinition,
	PreToolUsePipeline,
	PreToolUseRawHandler,
	RawFileHookDefinition,
	RawHandler,
	RawHookDefinition,
	SessionEndHookDefinition,
	SessionEndPipeline,
	SessionEndRawHandler,
	SessionStartHookDefinition,
	SessionStartPipeline,
	SessionStartRawHandler,
	SetupContext,
	SetupFunction,
	StopHookDefinition,
	StopPipeline,
	StopRawHandler,
	SubagentStopHookDefinition,
	SubagentStopPipeline,
	SubagentStopRawHandler,
	ToolFilter,
	UserPromptSubmitHookDefinition,
	UserPromptSubmitPipeline,
	UserPromptSubmitRawHandler,
} from "./pipeline/config.js";
// Re-export pipeline config (explicit to avoid conflicts)
export {
	ClaudeBinaryPlugin,
	getOutputSchema,
	isPipelineHook,
	isRawHook,
} from "./pipeline/config.js";
// Pipeline metrics - explicit exports to avoid conflict with events/response-types.ts::estimateTokenCount
export type { OtelAttributes, SessionTokenState, TokenBudget } from "./pipeline/metrics.js";
export {
	DEFAULT_TOKEN_BUDGET,
	checkTokenBudget,
	createSessionTokenState,
	detectContentType,
	estimateTokenCount as estimatePipelineTokenCount,
	extractAutoMetrics,
	extractTokenMetrics,
	extractToolTokenMetrics,
	getSessionTokenAttributes,
	updateSessionTokens,
} from "./pipeline/metrics.js";
// Unified Pipeline namespace (preferred)
export { Pipeline } from "./pipeline/namespace.js";

// Pipeline types - explicit exports to avoid conflicts with events/types.ts output interfaces
export type {
	AnyPipelineOutput,
	ContentType,
	ExecutionQuality,
	ExecutionStatus,
	HookAction,
	NotificationOutput as NotificationPipelineOutput,
	PassthroughOutput,
	PermissionRequestOutput as PermissionRequestPipelineOutput,
	PipelineMetrics,
	PipelineOutputBase,
	PostToolUseOutput as PostToolUsePipelineOutput,
	PreCompactOutput as PreCompactPipelineOutput,
	PreToolUseOutput as PreToolUsePipelineOutput,
	SessionEndOutput as SessionEndPipelineOutput,
	SessionStartOutput as SessionStartPipelineOutput,
	StopOutput as StopPipelineOutput,
	SubagentStopOutput as SubagentStopPipelineOutput,
	TokenMetrics,
	UserPromptSubmitOutput as UserPromptSubmitPipelineOutput,
	ValidationResult as PipelineValidationResult,
} from "./pipeline/types.js";
export {
	ExecutionQualitySchema,
	ExecutionStatusSchema,
	HookActionSchema,
	NotificationOutputSchema,
	OutputSchemas,
	PassthroughOutputSchema,
	PermissionRequestOutputSchema,
	PipelineMetricsSchema,
	PipelineOutputBaseSchema,
	PostToolUseOutputSchema,
	PreCompactOutputSchema,
	PreToolUseOutputSchema,
	SessionEndOutputSchema,
	SessionStartOutputSchema,
	StopOutputSchema,
	SubagentStopOutputSchema,
	UserPromptSubmitOutputSchema,
	ValidationResultSchema,
	isPipelineOutput,
} from "./pipeline/types.js";

// =============================================================================
// PIPELINE RUNTIME
// =============================================================================

export type {
	HookEventType,
	IODependencies,
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	RunPipelineOptions,
	RunRawHandlerOptions,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
} from "./pipeline/runtime.js";
export {
	handleUnknownHook,
	runPipeline,
	runRawHandler,
} from "./pipeline/runtime.js";

// =============================================================================
// BUILD SYSTEM
// =============================================================================

export type {
	BuildPluginOptions,
	CompileTarget,
	ExtractableCommand,
	ExtractableHook,
	ExtractedPassthroughHooks,
	GenerateHooksJsonOptions,
	GeneratePipelinePluginOptions,
	HooksJsonCommand,
	HooksJsonEntry,
	HooksJsonFile,
	MarketplaceManifest,
	PersistLocalConfig,
	PipelineCommandEntry,
	PipelineHookEntry,
	PipelineHookEventType,
	PluginBuildResult,
	PluginManifest,
	ShellExecutor,
	ShellResult,
} from "./build/builder.js";
export {
	// Unified namespace (preferred)
	PluginBuilder,
	buildPlugin,
	buildPluginFromConfig,
	defaultShellExecutor,
	extractPassthroughHookEntries,
	extractPipelineCommandEntries,
	extractPipelineHookEntries,
	generateHooksJson,
	generatePipelinePluginEntrypoint,
	getPluginCachePath,
	readMarketplaceManifest,
	readPluginManifest,
	syncPluginToCache,
} from "./build/builder.js";

// =============================================================================
// TESTING UTILITIES
// =============================================================================

// Test builder for fluent plugin testing API
export type {
	CommandTestResult,
	HookInputBase,
	HookTestResult,
	NotificationInput,
	PermissionRequestInput,
	PostToolUseInput,
	PreCompactInput,
	PreToolUseInput,
	SessionEndInput,
	SessionStartInput,
	StopInput,
	SubagentStopInput,
	UserPromptSubmitInput,
} from "./testing/builder.js";
export { PluginTestBuilder } from "./testing/builder.js";
export type {
	BufferShellExecutor,
	BufferShellExecutorOptions,
	BufferShellResult,
	CommandOutput as MockCommandOutput,
	FatalErrorResult as MockFatalErrorResult,
	MockCommandContext,
	MockEnvContext,
	MockIOResult,
} from "./testing/mocks.js";
export {
	MockEnv,
	MockExitError,
	Mocks,
	createMockBufferShellExecutor,
	createMockBufferShellResult,
	createMockShellExecutor,
	createMockShellResult,
	defaultBufferShellExecutor,
	envPresets,
	mockCommand,
	mockEnv,
	mockIO,
	mockLogger,
	resetMockIO,
	runMockedCommand,
	runMockedHook,
	testFatalErrorHandler,
} from "./testing/mocks.js";
