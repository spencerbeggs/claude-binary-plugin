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

export type {
	AnyOutcome,
	ConfigChangeOutcome,
	CwdChangedOutcome,
	ElicitationOutcome,
	ElicitationResultOutcome,
	FileChangedOutcome,
	HookOutcomeMap,
	InstructionsLoadedOutcome,
	NotificationOutcome,
	PermissionDeniedOutcome,
	PermissionRequestOutcome,
	PostCompactOutcome,
	PostToolUseFailureOutcome,
	PostToolUseOutcome,
	PreCompactOutcome,
	PreToolUseOutcome,
	SessionEndOutcome,
	SessionStartOutcome,
	StopFailureOutcome,
	StopOutcome,
	SubagentStartOutcome,
	SubagentStopOutcome,
	TaskCompletedOutcome,
	TaskCreatedOutcome,
	TeammateIdleOutcome,
	UserPromptSubmitOutcome,
	WorktreeCreateOutcome,
	WorktreeRemoveOutcome,
} from "./hooks/types.js";
export { isValidOutcomeForHook } from "./hooks/types.js";
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
export { Retry } from "./outcomes/Retry.js";
export { Skip } from "./outcomes/Skip.js";
export { WatchPaths } from "./outcomes/WatchPaths.js";

// =============================================================================
// ERRORS
// =============================================================================

export { CommandParseError } from "./errors/CommandParseError.js";
export { EnvLoadError } from "./errors/EnvLoadError.js";
export { EnvPersistError } from "./errors/EnvPersistError.js";
export { PluginRuntimeError } from "./errors/PluginRuntimeError.js";
export type { SchemaIssue } from "./errors/SchemaValidationError.js";
export { SchemaValidationError } from "./errors/SchemaValidationError.js";
export { SessionLookupError } from "./errors/SessionLookupError.js";
export { ShellError } from "./errors/ShellError.js";
export { StdinError } from "./errors/StdinError.js";

// =============================================================================
// SERVICES
// =============================================================================

export { EnvBridgeLive } from "./layers/EnvBridgeLive.js";
export { EnvCoordinatorLive } from "./layers/EnvCoordinatorLive.js";
export { EnvFileParserLive } from "./layers/EnvFileParserLive.js";
export { EnvLoaderLive } from "./layers/EnvLoaderLive.js";
export { EnvLoaderTest } from "./layers/EnvLoaderTest.js";
export { EnvResolverLive } from "./layers/EnvResolverLive.js";
export { EnvValidatorLive } from "./layers/EnvValidatorLive.js";
export { EnvWriterLive } from "./layers/EnvWriterLive.js";
export { PluginLive } from "./layers/PluginLive.js";
export { PluginRuntimeServiceLive } from "./layers/PluginRuntimeServiceLive.js";
export { SchemaValidatorLive } from "./layers/SchemaValidatorLive.js";
export { SessionStoreLive } from "./layers/SessionStoreLive.js";
export { makeSessionStoreTest } from "./layers/SessionStoreTest.js";
export { ShellExecutorLive } from "./layers/ShellExecutorLive.js";
export { makeShellExecutorTest } from "./layers/ShellExecutorTest.js";
export { StdinReaderLive } from "./layers/StdinReaderLive.js";
export { makeStdinReaderTest } from "./layers/StdinReaderTest.js";
export { TelemetryLive, withErrorTelemetry } from "./layers/TelemetryLive.js";
export { makeTelemetryTest } from "./layers/TelemetryTest.js";
export { EnvBridge } from "./services/EnvBridge.js";
export type {
	CommandParams,
	CommandResult,
	HookParams,
	PersistParams,
	SessionStartParams,
} from "./services/EnvCoordinator.js";
export { EnvCoordinator } from "./services/EnvCoordinator.js";
export { EnvFileParser } from "./services/EnvFileParser.js";
export { EnvLoader } from "./services/EnvLoader.js";
export { EnvResolver } from "./services/EnvResolver.js";
export { EnvValidator } from "./services/EnvValidator.js";
export { EnvWriter, type PersistResult } from "./services/EnvWriter.js";
export { type PluginRunConfig, PluginRuntimeService, type RunResult } from "./services/PluginRuntimeService.js";
export { SchemaValidator as SchemaValidatorService } from "./services/SchemaValidator.js";
export { SessionStore } from "./services/SessionStore.js";
export { ShellExecutor as ShellExecutorService, ShellResult } from "./services/ShellExecutor.js";
export { StdinReader } from "./services/StdinReader.js";
export { FatalErrorData, HookExecutionData, Telemetry } from "./services/Telemetry.js";

// =============================================================================
// CORE TYPES
// =============================================================================

// Input Schema.Classes (each is both a type and a runtime schema)
export { ConfigChangeInput } from "./hooks/ConfigChange.js";
export { CwdChangedInput } from "./hooks/CwdChanged.js";
export { ElicitationInput } from "./hooks/Elicitation.js";
export { ElicitationResultInput } from "./hooks/ElicitationResult.js";
export { FileChangedInput } from "./hooks/FileChanged.js";
export { InstructionsLoadedInput } from "./hooks/InstructionsLoaded.js";
export { NotificationInput } from "./hooks/Notification.js";
export { PermissionDeniedInput } from "./hooks/PermissionDenied.js";
export { PermissionRequestInput } from "./hooks/PermissionRequest.js";
export { PostCompactInput } from "./hooks/PostCompact.js";
export { PostToolUseInput } from "./hooks/PostToolUse.js";
export { PostToolUseFailureInput } from "./hooks/PostToolUseFailure.js";
export { PreCompactInput } from "./hooks/PreCompact.js";
export { PreToolUseInput } from "./hooks/PreToolUse.js";
export { SessionEndInput } from "./hooks/SessionEnd.js";
export { SessionStartInput } from "./hooks/SessionStart.js";
export { StopInput } from "./hooks/Stop.js";
export { StopFailureInput } from "./hooks/StopFailure.js";
export { SubagentStartInput } from "./hooks/SubagentStart.js";
export { SubagentStopInput } from "./hooks/SubagentStop.js";
// Hook event base type
export type { HookEventBase } from "./hooks/shared.js";
export { TaskCompletedInput } from "./hooks/TaskCompleted.js";
export { TaskCreatedInput } from "./hooks/TaskCreated.js";
export { TeammateIdleInput } from "./hooks/TeammateIdle.js";
export { UserPromptSubmitInput } from "./hooks/UserPromptSubmit.js";
export { WorktreeCreateInput } from "./hooks/WorktreeCreate.js";
export { WorktreeRemoveInput } from "./hooks/WorktreeRemove.js";
// Effect Logger layers
export { makePluginLoggerLive, resolveLogLevel } from "./layers/PluginLoggerLive.js";
// I/O types (non-serializable, live in plugin/config)
export type { HookEventOptions, IO } from "./plugin/config.js";
// Branded types for type-safe identifiers
export type { NormalizedPath, SessionId, ToolUseId, TranscriptPath } from "./schemas/branded.js";
export { NormalizedPathSchema, normalizePath } from "./schemas/branded.js";
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
export type { SessionRecord, SessionRegistration } from "./services/SessionStore.js";
// Type utilities
export type { PartialDeep, ReadonlyDeep } from "./types/common.js";
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

// Hook event Schema.Class types (each is both a type and a runtime schema)
export { ConfigChangeEvent } from "./hooks/ConfigChange.js";
export { CwdChangedEvent } from "./hooks/CwdChanged.js";
export { ElicitationEvent } from "./hooks/Elicitation.js";
export { ElicitationResultEvent } from "./hooks/ElicitationResult.js";
export { FileChangedEvent } from "./hooks/FileChanged.js";
export { InstructionsLoadedEvent } from "./hooks/InstructionsLoaded.js";
export { NotificationEvent } from "./hooks/Notification.js";
export { PermissionDeniedEvent } from "./hooks/PermissionDenied.js";
export { PermissionRequestEvent } from "./hooks/PermissionRequest.js";
export { PostCompactEvent } from "./hooks/PostCompact.js";
export { PostToolUseEvent } from "./hooks/PostToolUse.js";
export { PostToolUseFailureEvent } from "./hooks/PostToolUseFailure.js";
export { PreCompactEvent } from "./hooks/PreCompact.js";
export { PreToolUseEvent } from "./hooks/PreToolUse.js";
export { SessionEndEvent } from "./hooks/SessionEnd.js";
export { SessionStartEvent } from "./hooks/SessionStart.js";
export { StopEvent } from "./hooks/Stop.js";
export { StopFailureEvent } from "./hooks/StopFailure.js";
export { SubagentStartEvent } from "./hooks/SubagentStart.js";
export { SubagentStopEvent } from "./hooks/SubagentStop.js";
// Hook event schema metadata type and helper
export type { HookEventSchemaMetadata } from "./hooks/shared.js";
export { getSchemaMetadata } from "./hooks/shared.js";
export { TaskCompletedEvent } from "./hooks/TaskCompleted.js";
export { TaskCreatedEvent } from "./hooks/TaskCreated.js";
export { TeammateIdleEvent } from "./hooks/TeammateIdle.js";
export { UserPromptSubmitEvent } from "./hooks/UserPromptSubmit.js";
export { WorktreeCreateEvent } from "./hooks/WorktreeCreate.js";
export { WorktreeRemoveEvent } from "./hooks/WorktreeRemove.js";
// Hook event union schema and registry (still in schemas/hook-events.ts)
export type { HookEventParsed } from "./schemas/hook-events.js";
export { HookEventSchema, HookEventSchemas } from "./schemas/hook-events.js";

// =============================================================================
// HOOK RESPONSE SCHEMAS
// =============================================================================

export { PermissionRequestResponse, toPermissionRequestResponse } from "./hooks/PermissionRequest.js";
export { PostToolUseResponse, toPostToolUseResponse } from "./hooks/PostToolUse.js";
export { PreToolUseResponse, toPreToolUseResponse } from "./hooks/PreToolUse.js";
export { SessionStartResponse, toSessionStartResponse } from "./hooks/SessionStart.js";
export { StopResponse, toStopResponse } from "./hooks/Stop.js";
// Response Schema.Classes and conversion functions
export { PassthroughResponse, toPassthroughResponse } from "./hooks/shared.js";
export { UserPromptSubmitResponse, toUserPromptSubmitResponse } from "./hooks/UserPromptSubmit.js";

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
// PLUGIN CONFIG
// =============================================================================

// Hook output schemas — per-hook
export type { NotificationOutput } from "./hooks/Notification.js";
export { NotificationOutputSchema } from "./hooks/Notification.js";
export type { PermissionRequestOutput } from "./hooks/PermissionRequest.js";
export { PermissionRequestOutputSchema } from "./hooks/PermissionRequest.js";
export type { PostToolUseOutput } from "./hooks/PostToolUse.js";
export { PostToolUseOutputSchema } from "./hooks/PostToolUse.js";
export type { PreCompactOutput } from "./hooks/PreCompact.js";
export { PreCompactOutputSchema } from "./hooks/PreCompact.js";
export type { PreToolUseOutput } from "./hooks/PreToolUse.js";
export { PreToolUseOutputSchema } from "./hooks/PreToolUse.js";
export type { SessionEndOutput } from "./hooks/SessionEnd.js";
export { SessionEndOutputSchema } from "./hooks/SessionEnd.js";
export type { SessionStartOutput } from "./hooks/SessionStart.js";
export { SessionStartOutputSchema } from "./hooks/SessionStart.js";
export type { StopOutput } from "./hooks/Stop.js";
export { StopOutputSchema } from "./hooks/Stop.js";
export type { SubagentStopOutput } from "./hooks/SubagentStop.js";
export { SubagentStopOutputSchema } from "./hooks/SubagentStop.js";
// Hook output schemas — shared infrastructure
export type {
	ExecutionQuality,
	ExecutionStatus,
	HookAction,
	HookMetrics,
	HookOutputBase,
	PassthroughOutput,
	ValidationResult as HookValidationResult,
} from "./hooks/shared.js";
export {
	ExecutionQualitySchema,
	ExecutionStatusSchema,
	HookActionSchema,
	HookMetricsSchema,
	HookOutputBaseSchema,
	PassthroughOutputSchema,
	ValidationResultSchema,
} from "./hooks/shared.js";
export type { UserPromptSubmitOutput } from "./hooks/UserPromptSubmit.js";
export { UserPromptSubmitOutputSchema } from "./hooks/UserPromptSubmit.js";
// Plugin runtime types
export type { HookEventType, IODependencies } from "./layers/PluginRuntime.js";
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
	ConfigChangeHandler,
	ConfigChangeHookDefinition,
	CwdChangedHandler,
	CwdChangedHookDefinition,
	ElicitationHandler,
	ElicitationHookDefinition,
	ElicitationResultHandler,
	ElicitationResultHookDefinition,
	ExtractCommands,
	ExtractOptionsSchema,
	ExtractSetup,
	ExtractSetupReturn,
	ExtractStateSchema,
	FileChangedHandler,
	FileChangedHookDefinition,
	HandlerContext,
	HandlerHookDefinition,
	HookDefinition,
	HookDefinitionBase,
	HooksMap,
	InferHandlers,
	InferPluginCommands,
	InferPluginOptions,
	InferPluginState,
	InstructionsLoadedHandler,
	InstructionsLoadedHookDefinition,
	NotificationHandler,
	NotificationHookDefinition,
	PassthroughHookEntry,
	PermissionDeniedHandler,
	PermissionDeniedHookDefinition,
	PermissionRequestHandler,
	PermissionRequestHookDefinition,
	PluginBuildOptions,
	PluginHandler,
	PluginState,
	PostCompactHandler,
	PostCompactHookDefinition,
	PostToolUseFailureHandler,
	PostToolUseFailureHookDefinition,
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
	StopFailureHandler,
	StopFailureHookDefinition,
	StopHandler,
	StopHookDefinition,
	SubagentStartHandler,
	SubagentStartHookDefinition,
	SubagentStopHandler,
	SubagentStopHookDefinition,
	TaskCompletedHandler,
	TaskCompletedHookDefinition,
	TaskCreatedHandler,
	TaskCreatedHookDefinition,
	TeammateIdleHandler,
	TeammateIdleHookDefinition,
	ToolFilter,
	UserPromptSubmitHandler,
	UserPromptSubmitHookDefinition,
	WorktreeCreateHandler,
	WorktreeCreateHookDefinition,
	WorktreeRemoveHandler,
	WorktreeRemoveHookDefinition,
} from "./plugin/config.js";
export { ClaudePlugin, PluginConfig } from "./plugin/config.js";
export type {
	AnyHookOutput,
	BudgetCheckResult,
	ContentType,
	SessionTokenState,
	TokenBudget,
	TokenMetricsData,
} from "./types/pipeline.js";
// Pipeline utilities (type guards, metrics)
export { Pipeline, TokenMetrics, isHookOutput } from "./types/pipeline.js";

// =============================================================================
// BUILD SYSTEM
// =============================================================================

export type {
	BuildPluginOptions,
	CommandEntry,
	CompileTarget,
	ExtractableCommand,
	ExtractableHook,
	ExtractedPassthroughHooks,
	GenerateHooksJsonOptions,
	GeneratePluginEntrypointOptions,
	HookEntry,
	HookEventTypeName,
	HooksJsonCommand,
	HooksJsonEntry,
	HooksJsonFile,
	MarketplaceManifest,
	PersistLocalConfig,
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
