/**
 * Claude Binary Plugin SDK
 *
 * @remarks
 * The `claude-binary-plugin` package provides a TypeScript SDK for building
 * Claude Code plugins that compile to single-file Bun executables.
 *
 * **Key Features:**
 * - Declarative pipeline system for hook handlers
 * - Effect Schema-validated inputs and outputs
 * - OpenTelemetry observability integration
 * - Type-safe environment management
 * - SQLite-based session state persistence
 *
 * **Core Exports:**
 * - {@link PluginConfig} - Schema.Class base for plugin configuration
 * - {@link ClaudePlugin} - Runtime orchestrator binding config to hooks
 * - {@link PluginEnv} - Base class for environment management
 * - {@link PluginBuilder} - Compile plugins to executables
 * - Effect Schema-validated hook event parsing
 *
 * @example
 * ```typescript
 * import { PluginConfig, ClaudePlugin } from "claude-binary-plugin";
 * import { Schema } from "effect";
 *
 * class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
 *   prefix: Schema.Literal("MY_PLUGIN"),
 * }) {
 *   static readonly options = Schema.Struct({ TIMEOUT_MS: Schema.Number });
 *   static readonly setup = async ({ cwd }) => ({ detected: true });
 * }
 *
 * export default new ClaudePlugin(MyConfig, {
 *   PreToolUse: [{ name: "security", handler: "./hooks/security.ts" }],
 * });
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @packageDocumentation
 */

// =============================================================================
// OUTCOMES
// =============================================================================

export { AddContext } from "./outcomes/AddContext.js";
export { Allow } from "./outcomes/Allow.js";
export { Ask } from "./outcomes/Ask.js";
export { Block } from "./outcomes/Block.js";
export { ContextBuilder, MarkdownContext, XmlContext } from "./outcomes/ContextBuilder.js";
export { Continue } from "./outcomes/Continue.js";
export { Deny } from "./outcomes/Deny.js";
export { Modify } from "./outcomes/Modify.js";
export { NoAction } from "./outcomes/NoAction.js";
export type { ContextValue, HookOutcomeLabel, OutcomeTelemetry } from "./outcomes/Outcome.js";
export { Outcome } from "./outcomes/Outcome.js";
export { Skip } from "./outcomes/Skip.js";
export type {
	AnyOutcome,
	HookOutcomeMap,
	PassthroughOutcome,
	PermissionRequestOutcome,
	PostToolUseOutcome,
	PreToolUseOutcome,
	SessionStartOutcome,
	StopOutcome,
	UserPromptSubmitOutcome,
} from "./outcomes/types.js";
export { isValidOutcomeForHook } from "./outcomes/types.js";

// =============================================================================
// ERRORS
// =============================================================================

export { CommandParseError } from "./errors/CommandParseError.js";
export { EnvLoadError } from "./errors/EnvLoadError.js";
export { EnvPersistError } from "./errors/EnvPersistError.js";
export { PipelineError } from "./errors/PipelineError.js";
export type { SchemaIssue } from "./errors/SchemaValidationError.js";
export { SchemaValidationError } from "./errors/SchemaValidationError.js";
export { SessionLookupError } from "./errors/SessionLookupError.js";
export { ShellError } from "./errors/ShellError.js";
export { StdinError } from "./errors/StdinError.js";

// =============================================================================
// SERVICES
// =============================================================================

export { EnvLoaderLive } from "./layers/EnvLoaderLive.js";
export { EnvLoaderTest } from "./layers/EnvLoaderTest.js";
export { EnvPersisterLive } from "./layers/EnvPersisterLive.js";
export { makeEnvPersisterTest } from "./layers/EnvPersisterTest.js";
export { PipelineLive } from "./layers/PipelineLive.js";
export { PipelineRuntimeServiceLive } from "./layers/PipelineRuntimeServiceLive.js";
export { SchemaValidatorLive } from "./layers/SchemaValidatorLive.js";
export { SessionStoreLive } from "./layers/SessionStoreLive.js";
export { makeSessionStoreTest } from "./layers/SessionStoreTest.js";
export { ShellExecutorLive } from "./layers/ShellExecutorLive.js";
export { makeShellExecutorTest } from "./layers/ShellExecutorTest.js";
export { StdinReaderLive } from "./layers/StdinReaderLive.js";
export { makeStdinReaderTest } from "./layers/StdinReaderTest.js";
export { TelemetryLive, withErrorTelemetry } from "./layers/TelemetryLive.js";
export { makeTelemetryTest } from "./layers/TelemetryTest.js";
export { EnvLoader } from "./services/EnvLoader.js";
export { EnvPersister } from "./services/EnvPersister.js";
export { type PipelineRunConfig, PipelineRuntimeService, type RunResult } from "./services/PipelineRuntimeService.js";
export { SchemaValidator as SchemaValidatorService } from "./services/SchemaValidator.js";
export { SessionStore } from "./services/SessionStore.js";
export { ShellExecutor as ShellExecutorService, ShellResult } from "./services/ShellExecutor.js";
export { StdinReader } from "./services/StdinReader.js";
export { FatalErrorData, HookExecutionData, Telemetry } from "./services/Telemetry.js";

// =============================================================================
// CORE TYPES
// =============================================================================

export { PluginEnvLive } from "./layers/PluginEnvLive.js";
// Effect Logger layers
export { makePluginLoggerLive, resolveLogLevel } from "./layers/PluginLoggerLive.js";
export type { SessionRegistration } from "./layers/SessionRegistry.js";
// Session registry for persistent session lookups
export { closeDb, getByProjectDir, getBySessionId, registerSession } from "./layers/SessionRegistry.js";
// I/O types (non-serializable, live in plugin/config)
export type { HookEventOptions, IO } from "./plugin/config.js";
// Branded types for type-safe identifiers
export type { SessionId, ToolUseId, TranscriptPath } from "./schemas/branded.js";
// Hook event types
export type { HookEventBase } from "./schemas/hook-inputs.js";
// Input Schema.Classes (each is both a type and a runtime schema)
export {
	ConfigChangeInput,
	CwdChangedInput,
	ElicitationInput,
	ElicitationResultInput,
	FileChangedInput,
	InstructionsLoadedInput,
	NotificationInput,
	PermissionRequestInput,
	PostCompactInput,
	PostToolUseFailureInput,
	PostToolUseInput,
	PreCompactInput,
	PreToolUseInput,
	SessionEndInput,
	SessionStartInput,
	StopFailureInput,
	StopInput,
	SubagentStartInput,
	SubagentStopInput,
	TaskCompletedInput,
	TaskCreatedInput,
	TeammateIdleInput,
	UserPromptSubmitInput,
	WorktreeCreateInput,
	WorktreeRemoveInput,
} from "./schemas/hook-inputs.js";
// Hook literal types and enum
export type {
	ConfigChangeSource,
	ElicitationAction,
	FileChangeEvent,
	HookPermissionsMode,
	HookTypeName,
	InstructionsLoadedReason,
	InstructionsMemoryType,
	NotificationType,
	PermissionRequestBehavior,
	PreCompactTrigger,
	PreToolUseDecision,
	SessionEndReason,
	SessionStartSource,
	StopFailureError,
	ToolName,
} from "./schemas/hook-literals.js";
export { HookType } from "./schemas/hook-literals.js";
export type {
	CommandConfig,
	CommandContextParams,
	CommandContextResult,
	EnvContext,
	HookContextParams,
	PersistResult,
	PluginEnvFileSystem,
	SessionStartContextParams,
	ValidationErrorMinimal,
	ValidationIssueMinimal,
	ValidationResult,
} from "./services/PluginEnv.js";
export { EnvFileLoadError, PluginEnv, formatValidationError } from "./services/PluginEnv.js";
export { PluginEnvService } from "./services/PluginEnvService.js";
export type { SessionRecord } from "./services/SessionStore.js";
// Type utilities re-exported from type-fest for user convenience
export type { PartialDeep, ReadonlyDeep, RequiredDeep, Tagged, WritableDeep } from "./types/common.js";
// JSON type utilities (re-exported from type-fest)
export type {
	JsonArray,
	JsonObject,
	JsonObjectWith,
	JsonPrimitive,
	JsonValue,
	Jsonifiable,
	Jsonify,
	OtelAttributeValue,
	OtelAttributes,
	OtelHeaders,
	ParsedJson,
} from "./types/json.js";

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
} from "./types/tool-inputs.js";
// ToolInputGuard removed - use typed tool input interfaces directly

// =============================================================================
// HOOK EVENT SCHEMAS
// =============================================================================

// Hook event schema types and registry
export type { HookEventParsed, HookEventSchemaMetadata } from "./schemas/hook-events.js";
// Hook event Schema.Class types and schemas with annotation metadata
export {
	ConfigChangeEvent,
	CwdChangedEvent,
	ElicitationEvent,
	ElicitationResultEvent,
	FileChangedEvent,
	HookEventSchema,
	HookEventSchemas,
	InstructionsLoadedEvent,
	// Schema.Class event classes (each is both a type and a schema)
	NotificationEvent,
	PermissionRequestEvent,
	PostCompactEvent,
	PostToolUseEvent,
	PostToolUseFailureEvent,
	PreCompactEvent,
	PreToolUseEvent,
	SessionEndEvent,
	SessionStartEvent,
	StopEvent,
	StopFailureEvent,
	SubagentStartEvent,
	SubagentStopEvent,
	TaskCompletedEvent,
	TaskCreatedEvent,
	TeammateIdleEvent,
	UserPromptSubmitEvent,
	WorktreeCreateEvent,
	WorktreeRemoveEvent,
	getSchemaMetadata,
} from "./schemas/hook-events.js";

// =============================================================================
// HOOK RESPONSE SCHEMAS
// =============================================================================

// Response Schema.Classes (each is both a type and a runtime schema)
export {
	PassthroughResponse,
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
	// toResponse conversion functions
	toPassthroughResponse,
	toPermissionRequestResponse,
	toPostToolUseResponse,
	toPreToolUseResponse,
	toSessionStartResponse,
	toStopResponse,
	toUserPromptSubmitResponse,
} from "./schemas/hook-responses.js";

// =============================================================================
// COMMAND TYPES
// =============================================================================

export type { EmptyArgs } from "./commands/runtime.js";

export { CommandArgumentError } from "./commands/runtime.js";
export { CommandRunnerLive } from "./layers/CommandRunnerLive.js";
export { makeCommandRunnerTest } from "./layers/CommandRunnerTest.js";
// CommandRunner Effect service
export type {
	CommandOutput as CommandRunnerOutput,
	RunCommandOptions as CommandRunnerOptions,
} from "./services/CommandRunner.js";
export { CommandRunner } from "./services/CommandRunner.js";

// =============================================================================
// OTEL TELEMETRY
// =============================================================================

export { OtelConfigError } from "./errors/OtelConfigError.js";
// New error types
export { SidecarError } from "./errors/SidecarError.js";
export { ClaudeAccountInfoLive } from "./layers/ClaudeAccountInfoLive.js";
export { makeClaudeAccountInfoTest } from "./layers/ClaudeAccountInfoTest.js";
export { GitInfoLive } from "./layers/GitInfoLive.js";
export { makeGitInfoTest } from "./layers/GitInfoTest.js";
export { MessageRouterLive } from "./layers/MessageRouterLive.js";
export { makeMessageRouterTest } from "./layers/MessageRouterTest.js";
export { OtelConfigLive } from "./layers/OtelConfigLive.js";
export { PlatformInfoLive } from "./layers/PlatformInfoLive.js";
export { makePlatformInfoTest } from "./layers/PlatformInfoTest.js";
export { PluginInfoServiceLive } from "./layers/PluginInfoServiceLive.js";
export { makePluginInfoServiceTest } from "./layers/PluginInfoServiceTest.js";
export type { PlatformContext } from "./otel/message-builders.js";
// Message builder constants (for advanced users)
export { OTEL_ATTRS, OTEL_EVENT_NAMES, OTEL_SCOPE } from "./otel/message-builders.js";
// Protocol types (for advanced usage)
export type { OtelProtocolConfig } from "./otel/protocol.js";
export {
	EventData,
	EventMessage,
	MetricData,
	MetricMessage,
	MetricType,
	PingMessage,
	ScopeData,
	ShutdownMessage,
	SidecarProtocolMessage,
	SpanData,
	SpanEvent,
	SpanMessage,
} from "./otel/protocol.js";
// Sidecar entry point (compiled separately by builder)
export { Sidecar } from "./otel/Sidecar.js";
// New OTEL Effect services
export type { ClaudeAccountInfoData } from "./services/ClaudeAccountInfo.js";
export { ClaudeAccountInfo } from "./services/ClaudeAccountInfo.js";
export type { GitInfoData, GitProvider } from "./services/GitInfo.js";
export {
	GitInfo,
	getGitInfoDisplayName,
	gitInfoToAttributes,
	isGitInfoValid,
	parseGitRemoteUrl,
} from "./services/GitInfo.js";
export { MessageRouter } from "./services/MessageRouter.js";
export { OtelConfig, OtelConfigData } from "./services/OtelConfig.js";
export type { PlatformType, SupportedPlatform } from "./services/PlatformInfo.js";
export { MAX_SOCKET_PATH_LENGTH, PlatformInfo } from "./services/PlatformInfo.js";
export type { PluginInfoData } from "./services/PluginInfoService.js";
export { PLUGIN_INFO_ATTRS, PluginInfoService } from "./services/PluginInfoService.js";

// =============================================================================
// PIPELINE CONFIG
// =============================================================================

// Pipeline runtime types
export type { HookEventType, IODependencies, PipelineConfig } from "./layers/PipelineRuntime.js";
export type {
	BaseState,
	CmdContext,
	CommandDefinition,
	CommandDefinitionBase,
	CommandHandler,
	CommandHandlerFn,
	CommandInlineDefinition,
	CommandOutput,
	CommandsMap,
	ExtractCommands,
	ExtractOptionsSchema,
	ExtractSetup,
	ExtractSetupReturn,
	ExtractStateSchema,
	HandlerContext,
	HandlerHookDefinition,
	HookDefinition,
	HookDefinitionBase,
	HooksMap,
	InferHandlers,
	InferPluginCommands,
	InferPluginOptions,
	InferPluginState,
	NotificationHandler,
	NotificationHookDefinition,
	PassthroughHookEntry,
	PermissionRequestHandler,
	PermissionRequestHookDefinition,
	PipelineHandler,
	PluginBuildOptions,
	PluginState,
	PostToolUseHandler,
	PostToolUseHookDefinition,
	PreCompactHandler,
	PreCompactHookDefinition,
	PreToolUseHandler,
	PreToolUseHookDefinition,
	SessionEndHandler,
	SessionEndHookDefinition,
	SessionStartHandler,
	SessionStartHookDefinition,
	SetupContext,
	SetupFunction,
	StopHandler,
	StopHookDefinition,
	SubagentStopHandler,
	SubagentStopHookDefinition,
	ToolFilter,
	UserPromptSubmitHandler,
	UserPromptSubmitHookDefinition,
} from "./plugin/config.js";
export { ClaudePlugin, PluginConfig } from "./plugin/config.js";
// Pipeline output schemas
export type {
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
	UserPromptSubmitPipelineOutput,
	ValidationResult as PipelineValidationResult,
} from "./schemas/pipeline-outputs.js";
export {
	ExecutionQualitySchema,
	ExecutionStatusSchema,
	HookActionSchema,
	NotificationOutputSchema,
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
} from "./schemas/pipeline-outputs.js";
export type {
	AnyPipelineOutput,
	BudgetCheckResult,
	ContentType,
	SessionTokenState,
	TokenBudget,
	TokenMetricsData,
} from "./types/pipeline.js";
// Pipeline utilities (type guards, metrics)
export { Pipeline, TokenMetrics, isPipelineOutput } from "./types/pipeline.js";

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
	ShellExecutor as BuildShellExecutor,
	ShellResult as BuildShellResult,
} from "./build/builder.js";
export { PluginBuilder } from "./build/builder.js";
export { extractPipelineCommandEntries } from "./build/CommandExtractor.js";
export { generatePipelinePluginEntrypoint } from "./build/EntrypointGenerator.js";
// Extracted build modules
export { extractPassthroughHookEntries, extractPipelineHookEntries } from "./build/HookExtractor.js";
export { generateHooksJson } from "./build/ManifestGenerator.js";
export type { GenerateProxyScriptOptions } from "./build/ProxyTemplate.js";
export { PluginBuilderLive } from "./layers/PluginBuilderLive.js";
export { makePluginBuilderTest } from "./layers/PluginBuilderTest.js";
// PluginBuilder Effect service
export { PluginBuilderService } from "./services/PluginBuilder.js";

// =============================================================================
// TESTING UTILITIES
// =============================================================================

// Test builder for fluent plugin testing API
export type {
	CommandTestResult,
	HookInputBase,
	HookTestResult,
	MockFn,
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
export { PluginTester, createMockFn } from "./testing/builder.js";
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
export { MockExitError } from "./testing/mocks.js";
