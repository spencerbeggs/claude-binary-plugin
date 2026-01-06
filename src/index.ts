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
 * - {@link PluginEnv} - Base class for environment management
 * - {@link PluginBuilder} - Compile plugins to executables
 * - Hook event classes (`PreToolUseEvent`, `SessionStartEvent`, etc.)
 *
 * @example
 * ```typescript
 * import { ClaudeBinaryPlugin } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * const plugin = ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   options: z.object({ TIMEOUT_MS: z.number().default(30000) }),
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

export type { EnvCodecMetadata } from "./state/codecs.js";
export { EnvCodecs } from "./state/codecs.js";
export type {
	ClaudeBinaryPluginState,
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
} from "./state/plugin-state.js";
export { EnvFileLoadError, PluginEnv } from "./state/plugin-state.js";
export type { SessionRecord, SessionRegistration } from "./state/session-registry.js";
// Session registry for persistent session lookups
export { SessionRegistry, closeDb } from "./state/session-registry.js";
// Branded types for type-safe identifiers
export type { HookName, SessionId, ToolUseId, TranscriptPath } from "./types/branded.js";
// JSON type utilities (re-exported from type-fest with Zod schemas)
export type {
	JsonArray,
	JsonObject,
	JsonObjectWith,
	JsonPrimitive,
	JsonValue,
	Jsonifiable,
	Jsonify,
	OTELAttributeValue,
	OTELAttributes,
	OTELHeaders,
	ParsedJson,
} from "./types/json.js";
export { JsonArraySchema, JsonObjectSchema, JsonPrimitiveSchema, JsonValueSchema } from "./types/json.js";
// Type utilities re-exported from type-fest for user convenience
export type { PartialDeep, ReadonlyDeep, RequiredDeep, Tagged, WritableDeep } from "./types/utility.js";
export type {
	DebugLoggerOptions,
	FileSystem,
	LogLevel,
	TimerHandle,
	TimingEntry,
	TimingTracker,
} from "./utils/debug-logger.js";
export { DebugLogger } from "./utils/debug-logger.js";

// =============================================================================
// EVENTS MODULE
// =============================================================================

// Base HookEvent class
export { HookEvent } from "./events/base.js";
export type { HookPermissionsMode } from "./events/enums.js";
// Enums
export { HookType } from "./events/enums.js";
// Response builders
export {
	HookResponse,
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
} from "./events/response-builders.js";

// Response types
export type { BlockDecision, HookResponseData } from "./events/response-types.js";
export { estimateTokenCount } from "./events/response-types.js";
// HookEvent subclasses
export {
	NotificationEvent,
	PermissionRequestEvent,
	PostToolUseEvent,
	PreCompactEvent,
	PreToolUseEvent,
	SessionEndEvent,
	SessionStartEvent,
	StopEvent,
	SubagentStopEvent,
	UserPromptSubmitEvent,
} from "./events/subclasses.js";
// Event type definitions
export type {
	HookEventBase,
	HookEventOptions,
	IO,
	NotificationInput,
	NotificationType,
	PermissionRequestBehavior,
	PermissionRequestDecision,
	PermissionRequestInput,
	PermissionRequestOutput,
	PostToolUseInput,
	PostToolUseOutput,
	PreCompactInput,
	PreCompactTrigger,
	PreToolUseDecision,
	PreToolUseInput,
	PreToolUseOutput,
	SessionEndInput,
	SessionEndReason,
	SessionStartInput,
	SessionStartOutput,
	SessionStartSource,
	StopInput,
	SubagentStopInput,
	ToolInput,
	ToolName,
	ToolResponse,
	UserPromptSubmitInput,
	UserPromptSubmitOutput,
} from "./events/types.js";

// Schema validation
export type { FormattedValidationError } from "./events/validation.js";
export { SchemaValidator } from "./events/validation.js";

// =============================================================================
// TYPED TOOL INPUTS
// =============================================================================

export type {
	BashToolInput,
	EditToolInput,
	GlobToolInput,
	GrepToolInput,
	NotebookEditToolInput,
	ReadToolInput,
	TaskToolInput,
	TodoItem,
	TodoWriteToolInput,
	ToolInputMap,
	TypedToolName,
	WebFetchToolInput,
	WebSearchToolInput,
	WriteToolInput,
} from "./core/tool-inputs.js";
export { ToolInputGuard } from "./core/tool-inputs.js";

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
	// Main class (preferred)
	Commands,
	emptyArgsSchema,
} from "./commands/runtime.js";

// =============================================================================
// OTEL TELEMETRY
// =============================================================================

// Configuration classes
export type { ClaudeAccountInfoData } from "./otel/classes/ClaudeAccountInfo.js";
export { ClaudeAccountInfo } from "./otel/classes/ClaudeAccountInfo.js";
export type { GitInfoData, GitProvider } from "./otel/classes/GitInfo.js";
export { GitInfo } from "./otel/classes/GitInfo.js";
export type { OTELConfigData } from "./otel/classes/OTELConfig.js";
export { OTELConfig } from "./otel/classes/OTELConfig.js";

// Platform utilities
export type { PlatformType, SupportedPlatform } from "./otel/classes/Platform.js";
export { Platform } from "./otel/classes/Platform.js";
export type { PluginInfoData } from "./otel/classes/PluginInfo.js";
export { PluginInfo } from "./otel/classes/PluginInfo.js";
export { SessionEnv } from "./otel/classes/SessionEnv.js";
export { SidecarClientPool } from "./otel/classes/SidecarClientPool.js";
export type { SpawnResult } from "./otel/classes/SidecarLauncher.js";
export { SidecarLauncher } from "./otel/classes/SidecarLauncher.js";
export { SidecarMessage } from "./otel/classes/SidecarMessage.js";
// Telemetry emission
export type {
	DecisionSource,
	EnvValidationErrorResult,
	FatalErrorResult,
	HookExecutionDirectResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	SchemaValidationErrorResult,
} from "./otel/classes/TelemetryEmitter.js";
export { TelemetryEmitter } from "./otel/classes/TelemetryEmitter.js";
export { TelemetryMetrics } from "./otel/classes/TelemetryMetrics.js";
export { TelemetrySpan } from "./otel/classes/TelemetrySpan.js";
// Sidecar management
export type { ClientState } from "./otel/client.js";
export { SidecarClient } from "./otel/client.js";

// Protocol types (for advanced usage)
export type {
	EventData,
	EventMessage,
	MetricData,
	MetricMessage,
	MetricType,
	OTELProtocolConfig,
	PingMessage,
	ScopeData,
	ShutdownMessage,
	SidecarProtocolMessage,
	SpanData,
	SpanEvent,
	SpanMessage,
} from "./otel/protocol.js";

// Sidecar entry point (compiled separately by builder)
export { main as sidecarMain } from "./otel/sidecar/main.js";

// =============================================================================
// PIPELINE CONFIG
// =============================================================================

export type {
	BaseState,
	CmdContext,
	CommandDefinition,
	CommandHandler,
	CommandOutput,
	CommandsMap,
	ExtractSetupReturn,
	HandlerContext,
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
	PipelineFileHookDefinition,
	PipelineHandler,
	PipelineHookDefinition,
	PluginBuildOptions,
	PluginConfig,
	PluginState,
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
export { ClaudeBinaryPlugin } from "./pipeline/config.js";
// Pipeline metrics
export type { BudgetCheckResult, OtelAttributes, SessionTokenState, TokenBudget } from "./pipeline/metrics.js";
export { TokenMetrics } from "./pipeline/metrics.js";
// Unified Pipeline class (preferred)
export { Pipeline } from "./pipeline/pipeline.js";

// Pipeline types - distinct from events/types.ts output interfaces
export type {
	AnyPipelineOutput,
	ContentType,
	ExecutionQuality,
	ExecutionStatus,
	HookAction,
	NotificationPipelineOutput,
	PassthroughPipelineOutput,
	PermissionRequestPipelineOutput,
	PipelineMetrics,
	PipelineOutputBase,
	PostToolUsePipelineOutput,
	PreCompactPipelineOutput,
	PreToolUsePipelineOutput,
	SessionEndPipelineOutput,
	SessionStartPipelineOutput,
	StopPipelineOutput,
	SubagentStopPipelineOutput,
	TokenMetricsData,
	UserPromptSubmitPipelineOutput,
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
} from "./pipeline/types.js";

// =============================================================================
// PIPELINE RUNTIME
// =============================================================================

export type {
	HookEventType,
	IODependencies,
	PermissionRequestResponseData,
	PipelineConfig,
	PostToolUseResponseData,
	PreToolUseResponseData,
	RunRawHandlerOptions,
	SessionStartResponseData,
	StopResponseData,
	UserPromptSubmitResponseData,
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
export { PluginBuilder } from "./build/builder.js";

// =============================================================================
// TESTING UTILITIES
// =============================================================================

// Test builder for fluent plugin testing API
export type {
	CommandTestResult,
	HookInputBase,
	HookTestResult,
	NotificationTestInput,
	PermissionRequestTestInput,
	PostToolUseTestInput,
	PreCompactTestInput,
	PreToolUseTestInput,
	SessionEndTestInput,
	SessionStartTestInput,
	StopTestInput,
	SubagentStopTestInput,
	UserPromptSubmitTestInput,
} from "./testing/builder.js";
export { PluginTester } from "./testing/builder.js";
export type {
	BufferShellResult,
	InMemoryShellExecutor,
	InMemoryShellExecutorOptions,
	MockCommandContext,
	MockCommandOutput,
	MockEnvContext,
	MockFatalErrorResult,
	MockIOResult,
} from "./testing/mocks.js";
export { MockExitError, MockState, TestFixtures } from "./testing/mocks.js";
