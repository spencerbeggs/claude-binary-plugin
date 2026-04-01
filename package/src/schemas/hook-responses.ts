import { Schema } from "effect";
import type {
	PassthroughOutput,
	PermissionRequestOutput,
	PostToolUseOutput,
	PreToolUseOutput,
	SessionStartOutput,
	StopOutput,
	UserPromptSubmitOutput,
} from "./hook-outputs.js";
import { JsonObjectSchema } from "./json.js";

// =============================================================================
// RESPONSE SCHEMA CLASSES
// =============================================================================

/**
 * Response schema for PreToolUse hooks.
 *
 * @remarks
 * Maps the pipeline output `action` field to Claude Code's `permissionDecision` wire format.
 * - `action: "allow"` maps to `permissionDecision: "allow"`
 * - `action: "deny"` maps to `permissionDecision: "deny"`
 * - `action: "ask"` maps to `permissionDecision: "ask"`
 *
 * @public
 */
export class PreToolUseResponse extends Schema.Class<PreToolUseResponse>("PreToolUseResponse")({
	permissionDecision: Schema.Literal("allow", "deny", "ask"),
	reason: Schema.optional(Schema.String),
	updatedInput: Schema.optional(JsonObjectSchema),
}) {}

/**
 * Response schema for PostToolUse hooks.
 *
 * @remarks
 * Maps to Claude Code's PostToolUse response wire format.
 * Either provides `additionalContext` for Claude, or `decision: "block"` with a reason.
 *
 * @public
 */
export class PostToolUseResponse extends Schema.Class<PostToolUseResponse>("PostToolUseResponse")({
	additionalContext: Schema.optional(Schema.String),
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Response schema for SessionStart hooks.
 *
 * @remarks
 * Optionally provides `additionalContext` for Claude at session startup.
 *
 * @public
 */
export class SessionStartResponse extends Schema.Class<SessionStartResponse>("SessionStartResponse")({
	additionalContext: Schema.optional(Schema.String),
}) {}

/**
 * Response schema for Stop and SubagentStop hooks.
 *
 * @remarks
 * Optionally blocks the agent from stopping with `decision: "block"` and a reason.
 *
 * @public
 */
export class StopResponse extends Schema.Class<StopResponse>("StopResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Response schema for UserPromptSubmit hooks.
 *
 * @remarks
 * Either blocks the prompt with `decision: "block"` and a reason,
 * or provides `additionalContext` for Claude.
 *
 * @public
 */
export class UserPromptSubmitResponse extends Schema.Class<UserPromptSubmitResponse>("UserPromptSubmitResponse")({
	additionalContext: Schema.optional(Schema.String),
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Response schema for PermissionRequest hooks.
 *
 * @remarks
 * Maps the pipeline output `action` field to Claude Code's `behavior` wire format.
 * - `action: "deny"` maps to `behavior: "deny"`
 * - any other action maps to `behavior: "allow"`
 *
 * @public
 */
export class PermissionRequestResponse extends Schema.Class<PermissionRequestResponse>("PermissionRequestResponse")({
	behavior: Schema.Literal("allow", "deny"),
	message: Schema.optional(Schema.String),
	interrupt: Schema.optional(Schema.Boolean),
	updatedInput: Schema.optional(JsonObjectSchema),
}) {}

/**
 * Response schema for passthrough hooks (SessionEnd, PreCompact, Notification).
 *
 * @remarks
 * These hooks produce no response data. The empty object `{}` is written to stdout.
 *
 * @public
 */
export class PassthroughResponse extends Schema.Class<PassthroughResponse>("PassthroughResponse")({}) {}

// =============================================================================
// toResponse FUNCTIONS
// =============================================================================

/**
 * Convert a PreToolUse pipeline output to a PreToolUseResponse.
 *
 * @remarks
 * Maps `action` to `permissionDecision`:
 * - `"deny"` maps to `"deny"`
 * - `"ask"` maps to `"ask"`
 * - anything else maps to `"allow"`
 *
 * @param output - The PreToolUse pipeline output (discriminated union)
 * @returns A validated PreToolUseResponse instance
 * @public
 */
export function toPreToolUseResponse(output: PreToolUseOutput): PreToolUseResponse {
	const action = "action" in output ? output.action : undefined;
	let permissionDecision: "allow" | "deny" | "ask" = "allow";
	if (action === "deny") permissionDecision = "deny";
	else if (action === "ask") permissionDecision = "ask";
	return new PreToolUseResponse({
		permissionDecision,
		reason: "reason" in output ? output.reason : undefined,
		updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
	});
}

/**
 * Convert a PostToolUse pipeline output to a PostToolUseResponse.
 *
 * @remarks
 * - `action: "block"` with reason maps to `{ decision: "block", reason }`
 * - `action: "context"` with claudeContext maps to `{ additionalContext }`
 * - otherwise maps to `{}`
 *
 * @param output - The PostToolUse pipeline output (discriminated union)
 * @returns A validated PostToolUseResponse instance
 * @public
 */
export function toPostToolUseResponse(output: PostToolUseOutput): PostToolUseResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new PostToolUseResponse({ decision: "block", reason: output.reason });
	}
	if (action === "context" && "claudeContext" in output && output.claudeContext) {
		return new PostToolUseResponse({ additionalContext: output.claudeContext });
	}
	return new PostToolUseResponse({});
}

/**
 * Convert a SessionStart pipeline output to a SessionStartResponse.
 *
 * @remarks
 * If the output has `claudeContext`, maps it to `additionalContext`.
 *
 * @param output - The SessionStart pipeline output (discriminated union)
 * @returns A validated SessionStartResponse instance
 * @public
 */
export function toSessionStartResponse(output: SessionStartOutput): SessionStartResponse {
	if ("claudeContext" in output && output.claudeContext) {
		return new SessionStartResponse({ additionalContext: output.claudeContext });
	}
	return new SessionStartResponse({});
}

/**
 * Convert a Stop pipeline output to a StopResponse.
 *
 * @remarks
 * - `action: "block"` with reason maps to `{ decision: "block", reason }`
 * - otherwise maps to `{}`
 *
 * @param output - The Stop pipeline output (discriminated union)
 * @returns A validated StopResponse instance
 * @public
 */
export function toStopResponse(output: StopOutput): StopResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new StopResponse({ decision: "block", reason: output.reason });
	}
	return new StopResponse({});
}

/**
 * Convert a UserPromptSubmit pipeline output to a UserPromptSubmitResponse.
 *
 * @remarks
 * - `action: "block"` with reason maps to `{ decision: "block", reason }`
 * - `action: "context"` with claudeContext maps to `{ additionalContext }`
 * - otherwise maps to `{}`
 *
 * @param output - The UserPromptSubmit pipeline output (discriminated union)
 * @returns A validated UserPromptSubmitResponse instance
 * @public
 */
export function toUserPromptSubmitResponse(output: UserPromptSubmitOutput): UserPromptSubmitResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new UserPromptSubmitResponse({ decision: "block", reason: output.reason });
	}
	if (action === "context" && "claudeContext" in output && output.claudeContext) {
		return new UserPromptSubmitResponse({ additionalContext: output.claudeContext });
	}
	return new UserPromptSubmitResponse({});
}

/**
 * Convert a PermissionRequest pipeline output to a PermissionRequestResponse.
 *
 * @remarks
 * Maps `action` to `behavior`:
 * - `"deny"` maps to `"deny"`
 * - anything else maps to `"allow"`
 *
 * @param output - The PermissionRequest pipeline output (discriminated union)
 * @returns A validated PermissionRequestResponse instance
 * @public
 */
export function toPermissionRequestResponse(output: PermissionRequestOutput): PermissionRequestResponse {
	const action = "action" in output ? output.action : undefined;
	return new PermissionRequestResponse({
		behavior: action === "deny" ? "deny" : "allow",
		message: "reason" in output ? output.reason : undefined,
		interrupt: "interrupt" in output ? output.interrupt : undefined,
		updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
	});
}

/**
 * Convert a passthrough pipeline output to a PassthroughResponse.
 *
 * @remarks
 * Passthrough hooks (SessionEnd, PreCompact, Notification) always produce `{}`.
 *
 * @param _output - The passthrough pipeline output (ignored)
 * @returns A PassthroughResponse instance (empty object)
 * @public
 */
export function toPassthroughResponse(_output: PassthroughOutput): PassthroughResponse {
	return new PassthroughResponse({});
}
