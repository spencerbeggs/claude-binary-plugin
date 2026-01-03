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

export type { EnvCodecMetadata } from "./env/codecs.js";
export { EnvCodecs } from "./env/codecs.js";
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
export { ClaudeBinaryPluginEnv, EnvFileLoadError } from "./env/plugin-env.js";
export type { SessionRecord, SessionRegistration } from "./env/session-registry.js";
// Session registry for persistent session lookups
export { SessionRegistry, closeDb } from "./env/session-registry.js";
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
export { HookEventName } from "./events/enums.js";
// Response builders
export {
	HookResponseBuilder,
	PermissionRequestResponseBuilder,
	PostToolUseResponseBuilder,
	PreToolUseResponseBuilder,
	SessionStartResponseBuilder,
	StopResponseBuilder,
	UserPromptSubmitResponseBuilder,
} from "./events/response-builders.js";

// Response types
export type { BlockDecision, HookResponse } from "./events/response-types.js";
export { estimateTokenCount } from "./events/response-types.js";
// HookEvent subclasses
export {
	NotificationHookEvent,
	PermissionRequestHookEvent,
	PostToolUseHookEvent,
	PreCompactHookEvent,
	PreToolUseHookEvent,
	SessionEndHookEvent,
	SessionStartHookEvent,
	StopHookEvent,
	SubagentStopHookEvent,
	UserPromptSubmitHookEvent,
} from "./events/subclasses.js";
// Event type definitions
export type {
	HookEventBase,
	HookEventOptions,
	IO,
	NotificationEvent,
	NotificationType,
	PermissionRequestBehavior,
	PermissionRequestDecision,
	PermissionRequestEvent,
	PermissionRequestOutput,
	PostToolUseEvent,
	PostToolUseOutput,
	PreCompactEvent,
	PreCompactTrigger,
	PreToolUseDecision,
	PreToolUseEvent,
	PreToolUseOutput,
	SessionEndEvent,
	SessionEndReason,
	SessionStartEvent,
	SessionStartOutput,
	SessionStartSource,
	StopEvent,
	SubagentStopEvent,
	ToolInput,
	ToolName,
	ToolResponse,
	UserPromptSubmitEvent,
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

// Constants
export { CLAUDE_ATTRS, METRIC_NAMES, PLUGIN_ATTRS, SPAN_NAMES } from "./otel/constants.js";

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
export { ClaudeBinaryPlugin } from "./pipeline/config.js";
// Pipeline metrics
export type { BudgetCheckResult, OtelAttributes, SessionTokenState, TokenBudget } from "./pipeline/metrics.js";
export { DEFAULT_TOKEN_BUDGET, TokenMetrics } from "./pipeline/metrics.js";
// Unified Pipeline class (preferred)
export { Pipeline } from "./pipeline/namespace.js";

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
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	RunPipelineOptions,
	RunRawHandlerOptions,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
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
	MockCommandContext,
	MockCommandOutput,
	MockEnvContext,
	MockFatalErrorResult,
	MockIOResult,
} from "./testing/mocks.js";
export { MockEnv, MockExitError, Mocks } from "./testing/mocks.js";
