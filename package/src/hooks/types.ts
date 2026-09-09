/**
 * Composed hook types — aggregates all 26 per-hook modules into unified maps.
 *
 * @remarks
 * This file is the single source of truth for:
 * - `HooksMap` — maps hook event names to their definition arrays
 * - `InferHandlers` — maps hook event names to typed handler functions
 * - `HookOutcomeMap` — maps hook event names to their valid outcome unions
 * - `ALL_VALID_OUTCOME_TAGS` — runtime record of valid tags per hook
 * - `isValidOutcomeForHook` — runtime validation of handler returns
 *
 * @packageDocumentation
 */

import type { AddContext } from "../outcomes/AddContext.js";
import type { Allow } from "../outcomes/Allow.js";
import type { Ask } from "../outcomes/Ask.js";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { Deny } from "../outcomes/Deny.js";
import type { Modify } from "../outcomes/Modify.js";
import type { NoAction } from "../outcomes/NoAction.js";
import { Outcome } from "../outcomes/Outcome.js";
import type { Retry } from "../outcomes/Retry.js";
import type { Skip } from "../outcomes/Skip.js";
import type { WatchPaths } from "../outcomes/WatchPaths.js";
import type { InferPluginOptions, InferPluginState } from "../plugin/infer.js";
import type { ConfigChangeHandler, ConfigChangeHookDefinition, ConfigChangeOutcome } from "./ConfigChange.js";
import { VALID_OUTCOME_TAGS as ConfigChangeTags } from "./ConfigChange.js";
import type { CwdChangedHandler, CwdChangedHookDefinition, CwdChangedOutcome } from "./CwdChanged.js";
import { VALID_OUTCOME_TAGS as CwdChangedTags } from "./CwdChanged.js";
import type { ElicitationHandler, ElicitationHookDefinition, ElicitationOutcome } from "./Elicitation.js";
import { VALID_OUTCOME_TAGS as ElicitationTags } from "./Elicitation.js";
import type {
	ElicitationResultHandler,
	ElicitationResultHookDefinition,
	ElicitationResultOutcome,
} from "./ElicitationResult.js";
import { VALID_OUTCOME_TAGS as ElicitationResultTags } from "./ElicitationResult.js";
import type { FileChangedHandler, FileChangedHookDefinition, FileChangedOutcome } from "./FileChanged.js";
import { VALID_OUTCOME_TAGS as FileChangedTags } from "./FileChanged.js";
import type {
	InstructionsLoadedHandler,
	InstructionsLoadedHookDefinition,
	InstructionsLoadedOutcome,
} from "./InstructionsLoaded.js";
import { VALID_OUTCOME_TAGS as InstructionsLoadedTags } from "./InstructionsLoaded.js";
import type { NotificationHandler, NotificationHookDefinition, NotificationOutcome } from "./Notification.js";
import { VALID_OUTCOME_TAGS as NotificationTags } from "./Notification.js";
import type {
	PermissionDeniedHandler,
	PermissionDeniedHookDefinition,
	PermissionDeniedOutcome,
} from "./PermissionDenied.js";
import { VALID_OUTCOME_TAGS as PermissionDeniedTags } from "./PermissionDenied.js";
import type {
	PermissionRequestHandler,
	PermissionRequestHookDefinition,
	PermissionRequestOutcome,
} from "./PermissionRequest.js";
import { VALID_OUTCOME_TAGS as PermissionRequestTags } from "./PermissionRequest.js";
import type { PostCompactHandler, PostCompactHookDefinition, PostCompactOutcome } from "./PostCompact.js";
import { VALID_OUTCOME_TAGS as PostCompactTags } from "./PostCompact.js";
import type { PostToolUseHandler, PostToolUseHookDefinition, PostToolUseOutcome } from "./PostToolUse.js";
import { VALID_OUTCOME_TAGS as PostToolUseTags } from "./PostToolUse.js";
import type {
	PostToolUseFailureHandler,
	PostToolUseFailureHookDefinition,
	PostToolUseFailureOutcome,
} from "./PostToolUseFailure.js";
import { VALID_OUTCOME_TAGS as PostToolUseFailureTags } from "./PostToolUseFailure.js";
import type { PreCompactHandler, PreCompactHookDefinition, PreCompactOutcome } from "./PreCompact.js";
import { VALID_OUTCOME_TAGS as PreCompactTags } from "./PreCompact.js";
import type { PreToolUseHandler, PreToolUseHookDefinition, PreToolUseOutcome } from "./PreToolUse.js";
import { VALID_OUTCOME_TAGS as PreToolUseTags } from "./PreToolUse.js";
import type { SessionEndHandler, SessionEndHookDefinition, SessionEndOutcome } from "./SessionEnd.js";
import { VALID_OUTCOME_TAGS as SessionEndTags } from "./SessionEnd.js";
import type { SessionStartHandler, SessionStartHookDefinition, SessionStartOutcome } from "./SessionStart.js";
import { VALID_OUTCOME_TAGS as SessionStartTags } from "./SessionStart.js";
import type { StopHandler, StopHookDefinition, StopOutcome } from "./Stop.js";
import { VALID_OUTCOME_TAGS as StopTags } from "./Stop.js";
import type { StopFailureHandler, StopFailureHookDefinition, StopFailureOutcome } from "./StopFailure.js";
import { VALID_OUTCOME_TAGS as StopFailureTags } from "./StopFailure.js";
import type { SubagentStartHandler, SubagentStartHookDefinition, SubagentStartOutcome } from "./SubagentStart.js";
import { VALID_OUTCOME_TAGS as SubagentStartTags } from "./SubagentStart.js";
import type { SubagentStopHandler, SubagentStopHookDefinition, SubagentStopOutcome } from "./SubagentStop.js";
import { VALID_OUTCOME_TAGS as SubagentStopTags } from "./SubagentStop.js";
import type { TaskCompletedHandler, TaskCompletedHookDefinition, TaskCompletedOutcome } from "./TaskCompleted.js";
import { VALID_OUTCOME_TAGS as TaskCompletedTags } from "./TaskCompleted.js";
import type { TaskCreatedHandler, TaskCreatedHookDefinition, TaskCreatedOutcome } from "./TaskCreated.js";
import { VALID_OUTCOME_TAGS as TaskCreatedTags } from "./TaskCreated.js";
import type { TeammateIdleHandler, TeammateIdleHookDefinition, TeammateIdleOutcome } from "./TeammateIdle.js";
import { VALID_OUTCOME_TAGS as TeammateIdleTags } from "./TeammateIdle.js";
import type {
	UserPromptSubmitHandler,
	UserPromptSubmitHookDefinition,
	UserPromptSubmitOutcome,
} from "./UserPromptSubmit.js";
import { VALID_OUTCOME_TAGS as UserPromptSubmitTags } from "./UserPromptSubmit.js";
import type { WorktreeCreateHandler, WorktreeCreateHookDefinition, WorktreeCreateOutcome } from "./WorktreeCreate.js";
import { VALID_OUTCOME_TAGS as WorktreeCreateTags } from "./WorktreeCreate.js";
import type { WorktreeRemoveHandler, WorktreeRemoveHookDefinition, WorktreeRemoveOutcome } from "./WorktreeRemove.js";
import { VALID_OUTCOME_TAGS as WorktreeRemoveTags } from "./WorktreeRemove.js";

// Re-export per-hook outcome types for convenience
export type {
	ConfigChangeOutcome,
	CwdChangedOutcome,
	ElicitationOutcome,
	ElicitationResultOutcome,
	FileChangedOutcome,
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
};

// =============================================================================
// HOOK OUTCOME MAP
// =============================================================================

/**
 * Maps hook event type names to their valid outcome unions.
 * @public
 */
export interface HookOutcomeMap {
	PreToolUse: PreToolUseOutcome;
	PostToolUse: PostToolUseOutcome;
	PostToolUseFailure: PostToolUseFailureOutcome;
	SessionStart: SessionStartOutcome;
	SessionEnd: SessionEndOutcome;
	Stop: StopOutcome;
	StopFailure: StopFailureOutcome;
	SubagentStart: SubagentStartOutcome;
	SubagentStop: SubagentStopOutcome;
	TaskCreated: TaskCreatedOutcome;
	TaskCompleted: TaskCompletedOutcome;
	TeammateIdle: TeammateIdleOutcome;
	InstructionsLoaded: InstructionsLoadedOutcome;
	ConfigChange: ConfigChangeOutcome;
	CwdChanged: CwdChangedOutcome;
	FileChanged: FileChangedOutcome;
	WorktreeCreate: WorktreeCreateOutcome;
	WorktreeRemove: WorktreeRemoveOutcome;
	UserPromptSubmit: UserPromptSubmitOutcome;
	PreCompact: PreCompactOutcome;
	PostCompact: PostCompactOutcome;
	Elicitation: ElicitationOutcome;
	ElicitationResult: ElicitationResultOutcome;
	Notification: NotificationOutcome;
	PermissionRequest: PermissionRequestOutcome;
	PermissionDenied: PermissionDeniedOutcome;
}

// =============================================================================
// ANY OUTCOME UNION
// =============================================================================

/**
 * Union of all possible outcome types across all hooks.
 * @public
 */
export type AnyOutcome =
	| Allow
	| Deny
	| Ask
	| Modify
	| Block
	| Continue
	| AddContext
	| NoAction
	| Skip
	| WatchPaths
	| Retry;

// =============================================================================
// HOOKS MAP
// =============================================================================

/**
 * Map of hook event types to their handler definition arrays.
 * @public
 */
export interface HooksMap<TOptions, TState = Record<string, unknown>> {
	PreToolUse?: PreToolUseHookDefinition<TOptions, TState>[];
	PostToolUse?: PostToolUseHookDefinition<TOptions, TState>[];
	PostToolUseFailure?: PostToolUseFailureHookDefinition<TOptions, TState>[];
	SessionStart?: SessionStartHookDefinition<TOptions, TState>[];
	SessionEnd?: SessionEndHookDefinition<TOptions, TState>[];
	Stop?: StopHookDefinition<TOptions, TState>[];
	StopFailure?: StopFailureHookDefinition<TOptions, TState>[];
	SubagentStart?: SubagentStartHookDefinition<TOptions, TState>[];
	SubagentStop?: SubagentStopHookDefinition<TOptions, TState>[];
	TaskCreated?: TaskCreatedHookDefinition<TOptions, TState>[];
	TaskCompleted?: TaskCompletedHookDefinition<TOptions, TState>[];
	TeammateIdle?: TeammateIdleHookDefinition<TOptions, TState>[];
	InstructionsLoaded?: InstructionsLoadedHookDefinition<TOptions, TState>[];
	ConfigChange?: ConfigChangeHookDefinition<TOptions, TState>[];
	CwdChanged?: CwdChangedHookDefinition<TOptions, TState>[];
	FileChanged?: FileChangedHookDefinition<TOptions, TState>[];
	WorktreeCreate?: WorktreeCreateHookDefinition<TOptions, TState>[];
	WorktreeRemove?: WorktreeRemoveHookDefinition<TOptions, TState>[];
	UserPromptSubmit?: UserPromptSubmitHookDefinition<TOptions, TState>[];
	PreCompact?: PreCompactHookDefinition<TOptions, TState>[];
	PostCompact?: PostCompactHookDefinition<TOptions, TState>[];
	Elicitation?: ElicitationHookDefinition<TOptions, TState>[];
	ElicitationResult?: ElicitationResultHookDefinition<TOptions, TState>[];
	Notification?: NotificationHookDefinition<TOptions, TState>[];
	PermissionRequest?: PermissionRequestHookDefinition<TOptions, TState>[];
	PermissionDenied?: PermissionDeniedHookDefinition<TOptions, TState>[];
}

// =============================================================================
// INFER HANDLERS
// =============================================================================

/**
 * Infer all handler types from a plugin configuration class.
 *
 * @remarks
 * Returns an interface with typed handlers for all 26 hook event types.
 * This is the primary type for defining hook handlers in plugin projects.
 *
 * @example
 * ```ts
 * import { PluginConfig } from "claude-binary-plugin";
 * import type { InferHandlers } from "claude-binary-plugin";
 *
 * class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
 *   prefix: Schema.Literal("MY_PLUGIN"),
 * }) {
 *   static readonly options = Schema.Struct({ DEBUG: Schema.Boolean });
 * }
 * export type Handlers = InferHandlers<typeof MyConfig>;
 * ```
 * @public
 */
export interface InferHandlers<T> {
	/** Handler for session initialization. */
	SessionStart: SessionStartHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for session cleanup. */
	SessionEnd: SessionEndHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for tool pre-execution. */
	PreToolUse: PreToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for tool post-execution. */
	PostToolUse: PostToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for tool post-execution failures. */
	PostToolUseFailure: PostToolUseFailureHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for agent stop events. */
	Stop: StopHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for agent stop failure events. */
	StopFailure: StopFailureHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for subagent start events. */
	SubagentStart: SubagentStartHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for subagent stop events. */
	SubagentStop: SubagentStopHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for task creation events. */
	TaskCreated: TaskCreatedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for task completion events. */
	TaskCompleted: TaskCompletedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for teammate idle events. */
	TeammateIdle: TeammateIdleHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for instructions loaded events. */
	InstructionsLoaded: InstructionsLoadedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for config change events. */
	ConfigChange: ConfigChangeHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for working directory change events. */
	CwdChanged: CwdChangedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for file change events. */
	FileChanged: FileChangedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for worktree creation events. */
	WorktreeCreate: WorktreeCreateHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for worktree removal events. */
	WorktreeRemove: WorktreeRemoveHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for user prompt submission. */
	UserPromptSubmit: UserPromptSubmitHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for context compaction. */
	PreCompact: PreCompactHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for post-compaction events. */
	PostCompact: PostCompactHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for elicitation events. */
	Elicitation: ElicitationHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for elicitation result events. */
	ElicitationResult: ElicitationResultHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for notification events. */
	Notification: NotificationHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for permission requests. */
	PermissionRequest: PermissionRequestHandler<InferPluginOptions<T>, InferPluginState<T>>;
	/** Handler for permission denied events. */
	PermissionDenied: PermissionDeniedHandler<InferPluginOptions<T>, InferPluginState<T>>;
}

// =============================================================================
// RUNTIME VALIDATION
// =============================================================================

/**
 * Combined record of valid outcome tags for all hook types.
 * @internal
 */
export const ALL_VALID_OUTCOME_TAGS: Record<string, Set<string>> = {
	PreToolUse: PreToolUseTags,
	PostToolUse: PostToolUseTags,
	PostToolUseFailure: PostToolUseFailureTags,
	SessionStart: SessionStartTags,
	SessionEnd: SessionEndTags,
	Stop: StopTags,
	StopFailure: StopFailureTags,
	SubagentStart: SubagentStartTags,
	SubagentStop: SubagentStopTags,
	TaskCreated: TaskCreatedTags,
	TaskCompleted: TaskCompletedTags,
	TeammateIdle: TeammateIdleTags,
	InstructionsLoaded: InstructionsLoadedTags,
	ConfigChange: ConfigChangeTags,
	CwdChanged: CwdChangedTags,
	FileChanged: FileChangedTags,
	WorktreeCreate: WorktreeCreateTags,
	WorktreeRemove: WorktreeRemoveTags,
	UserPromptSubmit: UserPromptSubmitTags,
	PreCompact: PreCompactTags,
	PostCompact: PostCompactTags,
	Elicitation: ElicitationTags,
	ElicitationResult: ElicitationResultTags,
	Notification: NotificationTags,
	PermissionRequest: PermissionRequestTags,
	PermissionDenied: PermissionDeniedTags,
};

/**
 * Runtime check: is this outcome valid for the given hook type?
 * Used by PipelineRuntime to validate handler returns.
 * @public
 */
export function isValidOutcomeForHook(hookType: string, outcome: unknown): boolean {
	if (!Outcome.isOutcome(outcome)) return false;
	const validTags = ALL_VALID_OUTCOME_TAGS[hookType];
	if (!validTags) return false;
	const tag = (outcome.constructor as { _tag?: string })._tag;
	if (!tag) return false;
	// Direct match (handles both base and extended outcomes since
	// extended classes inherit _tag from the base via Schema.Class.extend)
	if (validTags.has(tag)) return true;
	// Walk prototype chain for cases where _tag is overridden
	let proto = Object.getPrototypeOf(outcome);
	while (proto && proto !== Outcome.prototype) {
		const protoTag = (proto.constructor as { _tag?: string })._tag;
		if (protoTag && validTags.has(protoTag)) return true;
		proto = Object.getPrototypeOf(proto);
	}
	return false;
}
