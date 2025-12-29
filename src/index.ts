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
// BRANDED TYPES
// =============================================================================

export * from "./core/branded-types.js";

// =============================================================================
// COMMAND TYPES
// =============================================================================

export type { EmptyArgs, RunCommandOptions } from "./commands/runtime.js";

export {
	CommandArgumentError,
	emptyArgsSchema,
	parseCommandArgs,
	parseRawArgs,
	runCommand,
} from "./commands/runtime.js";

// =============================================================================
// OTEL TELEMETRY
// =============================================================================

export type {
	ClientState,
	DecisionSource,
	EnvValidationErrorResult,
	EventData,
	EventMessage,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	MetricData,
	MetricMessage,
	MetricType,
	OTELConfig,
	PingMessage,
	PluginInfo,
	SchemaValidationErrorResult,
	ScopeData,
	ShutdownMessage,
	SidecarMessage,
	SpanData,
	SpanEvent,
	SpanMessage,
} from "./otel/index.js";
export {
	// Constants
	CLAUDE_ATTRS,
	METRIC_NAMES,
	PLUGIN_ATTRS,
	SPAN_NAMES,
	// Client
	SidecarClient,
	// Events
	emitEnvValidationError,
	emitHookExecution,
	emitSchemaValidationError,
	getPluginInfo,
	getSessionEnvDir,
	getSidecarClient,
	instrumentHook,
	instrumentToolHook,
	// Config
	isOTELEnabled,
	parseOTELConfig,
	// Pre-connect
	preconnectTelemetry,
	recordCounter,
	recordGauge,
	recordHistogram,
	recordHookDecision,
	// Metrics
	recordHookExecution,
	// Plugin info
	setPluginInfo,
	withChildSpan,
	// Instrumentation
	withHookSpan,
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
	CompiledPlugin,
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
export {
	detectContentType,
	estimateTokenCount as estimatePipelineTokenCount,
	extractTokenMetrics,
	extractToolTokenMetrics,
} from "./pipeline/metrics.js";

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
	convertToPermissionRequestResponse,
	convertToPostToolUseResponse,
	convertToPreToolUseResponse,
	convertToResponse,
	convertToSessionStartResponse,
	convertToStopResponse,
	convertToUserPromptSubmitResponse,
	createBaseEnv,
	createEnvClass,
	extractStateFromEnv,
	getHookEventClasses,
	handleUnknownHook,
	isDebugEnabled,
	mapToOutcome,
	mapToPermissionDecision,
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
	PluginCommandConfig,
	PluginHookConfig,
	PluginManifest,
	ShellExecutor,
	ShellResult,
} from "./build/builder.js";
export {
	buildPlugin,
	defaultShellExecutor,
	extractPassthroughHookEntries,
	extractPipelineCommandEntries,
	extractPipelineHookEntries,
	generateHooksJson,
	generatePipelinePluginEntrypoint,
	generatePluginEntrypoint,
	getPluginCachePath,
	readMarketplaceManifest,
	readPluginManifest,
	syncPluginToCache,
} from "./build/builder.js";

// =============================================================================
// TESTING UTILITIES
// =============================================================================

export type {
	BufferShellExecutor,
	BufferShellExecutorOptions,
	BufferShellResult,
	CommandOutput as MockCommandOutput,
	FatalErrorResult,
	MockCommandContext,
	MockEnvContext,
	MockIOResult,
} from "./testing/mocks.js";
export {
	MockEnv,
	MockExitError,
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
