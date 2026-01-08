/**
 * Decision type for hooks that can block operations.
 * @public
 */
export type BlockDecision = "block" | undefined;

/**
 * Base hook response output structure.
 * All hook responses can include these optional fields.
 * @public
 */
export interface HookResponseData {
	/** Whether Claude should continue after the hook. Defaults to true. */
	continue?: boolean;
	/** Message shown when continue is false */
	stopReason?: string;
	/** Hide stdout from the transcript */
	suppressOutput?: boolean;
	/** Optional warning message to show to the user */
	systemMessage?: string;
	/** Hook-specific output data */
	hookSpecificOutput?: Record<string, unknown>;
	/** Decision to block the operation (for applicable hooks) */
	decision?: BlockDecision;
	/** Reason for blocking (required when decision is "block") */
	reason?: string;
}
