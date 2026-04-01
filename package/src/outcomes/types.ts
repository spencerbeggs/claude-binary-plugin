import type { AddContext } from "./AddContext.js";
import type { Allow } from "./Allow.js";
import type { Ask } from "./Ask.js";
import type { Block } from "./Block.js";
import type { Continue } from "./Continue.js";
import type { Deny } from "./Deny.js";
import type { Modify } from "./Modify.js";
import type { NoAction } from "./NoAction.js";
import { Outcome } from "./Outcome.js";
import type { Skip } from "./Skip.js";

// ─── Per-hook-type outcome unions ────────────────────────────────────

/** Valid outcomes for PreToolUse hooks. @public */
export type PreToolUseOutcome = Allow | Deny | Ask | Modify | Skip;

/** Valid outcomes for PostToolUse hooks. @public */
export type PostToolUseOutcome = Block | Continue | AddContext | NoAction | Skip;

/** Valid outcomes for SessionStart hooks. @public */
export type SessionStartOutcome = AddContext | NoAction;

/** Valid outcomes for Stop and SubagentStop hooks. @public */
export type StopOutcome = Block | Continue | Skip;

/** Valid outcomes for UserPromptSubmit hooks. @public */
export type UserPromptSubmitOutcome = Block | Continue | AddContext | NoAction | Skip;

/** Valid outcomes for PermissionRequest hooks. @public */
export type PermissionRequestOutcome = Allow | Deny;

/** Valid outcomes for passthrough hooks (SessionEnd, PreCompact, Notification, etc.). @public */
export type PassthroughOutcome = NoAction;

/** All possible outcome types. @public */
export type AnyOutcome = Allow | Deny | Ask | Modify | Block | Continue | AddContext | NoAction | Skip;

// ─── Hook type → outcome mapping ────────────────────────────────────

/** Maps hook event type names to their valid outcome unions. @public */
export interface HookOutcomeMap {
	PreToolUse: PreToolUseOutcome;
	PostToolUse: PostToolUseOutcome;
	PostToolUseFailure: PostToolUseOutcome;
	SessionStart: SessionStartOutcome;
	SessionEnd: PassthroughOutcome;
	Stop: StopOutcome;
	StopFailure: PassthroughOutcome;
	SubagentStart: PassthroughOutcome;
	SubagentStop: StopOutcome;
	TaskCreated: StopOutcome;
	TaskCompleted: StopOutcome;
	TeammateIdle: StopOutcome;
	InstructionsLoaded: PassthroughOutcome;
	ConfigChange: StopOutcome;
	CwdChanged: PassthroughOutcome;
	FileChanged: PassthroughOutcome;
	WorktreeCreate: PassthroughOutcome;
	WorktreeRemove: PassthroughOutcome;
	UserPromptSubmit: UserPromptSubmitOutcome;
	PreCompact: PassthroughOutcome;
	PostCompact: PassthroughOutcome;
	Elicitation: PassthroughOutcome;
	ElicitationResult: PassthroughOutcome;
	Notification: PassthroughOutcome;
	PermissionRequest: PermissionRequestOutcome;
}

// ─── Allowed outcome tags per hook type ──────────────────────────────

const VALID_OUTCOME_TAGS: Record<string, Set<string>> = {
	PreToolUse: new Set(["Allow", "Deny", "Ask", "Modify", "Skip"]),
	PostToolUse: new Set(["Block", "Continue", "AddContext", "NoAction", "Skip"]),
	PostToolUseFailure: new Set(["Block", "Continue", "AddContext", "NoAction", "Skip"]),
	SessionStart: new Set(["AddContext", "NoAction"]),
	SessionEnd: new Set(["NoAction"]),
	Stop: new Set(["Block", "Continue", "Skip"]),
	StopFailure: new Set(["NoAction"]),
	SubagentStart: new Set(["NoAction"]),
	SubagentStop: new Set(["Block", "Continue", "Skip"]),
	TaskCreated: new Set(["Block", "Continue", "Skip"]),
	TaskCompleted: new Set(["Block", "Continue", "Skip"]),
	TeammateIdle: new Set(["Block", "Continue", "Skip"]),
	InstructionsLoaded: new Set(["NoAction"]),
	ConfigChange: new Set(["Block", "Continue", "Skip"]),
	CwdChanged: new Set(["NoAction"]),
	FileChanged: new Set(["NoAction"]),
	WorktreeCreate: new Set(["NoAction"]),
	WorktreeRemove: new Set(["NoAction"]),
	UserPromptSubmit: new Set(["Block", "Continue", "AddContext", "NoAction", "Skip"]),
	PreCompact: new Set(["NoAction"]),
	PostCompact: new Set(["NoAction"]),
	Elicitation: new Set(["NoAction"]),
	ElicitationResult: new Set(["NoAction"]),
	Notification: new Set(["NoAction"]),
	PermissionRequest: new Set(["Allow", "Deny"]),
};

/**
 * Runtime check: is this outcome valid for the given hook type?
 * Used by PipelineRuntime to validate handler returns.
 * @public
 */
export function isValidOutcomeForHook(hookType: string, outcome: unknown): boolean {
	if (!Outcome.isOutcome(outcome)) return false;
	const validTags = VALID_OUTCOME_TAGS[hookType];
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
