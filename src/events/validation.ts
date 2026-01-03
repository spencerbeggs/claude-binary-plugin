/**
 * Schema validation with OTEL error capture.
 * @module
 */

import { z } from "zod";

/**
 * Formatted validation error for OTEL telemetry.
 * @public
 */
export interface FormattedValidationError {
	/** Human-readable error message with all issues */
	message: string;
	/** Path to the first error (e.g., "tool_input.command") */
	path: string;
	/** Number of validation issues */
	issueCount: number;
}

/**
 * Schema validator with OTEL error capture.
 *
 * Provides two-stage validation that extracts session_id early for OTEL
 * initialization, then performs full schema validation with telemetry
 * on failure.
 *
 * @example
 * ```typescript
 * const event = await SchemaValidator.parse(
 *   rawJson,
 *   HookEventSchemas.PreToolUse,
 *   "pre-bash"
 * );
 * ```
 *
 * @public
 */
export class SchemaValidator {
	/**
	 * Parse and validate JSON with OTEL error capture.
	 *
	 * Two-stage validation process:
	 * 1. Extract session_id from raw JSON for early OTEL initialization
	 * 2. Full schema validation with OTEL error emission on failure
	 *
	 * @param rawJson - The raw JSON string from stdin
	 * @param schema - The Zod schema to validate against
	 * @param hookName - The hook name for OTEL attribution
	 * @returns The validated and typed event data
	 * @throws ZodError if validation fails (after emitting to OTEL)
	 */
	static async parse<T>(rawJson: string, schema: z.ZodType<T>, hookName: string): Promise<T> {
		// DEBUG: Log raw input to understand what Claude Code is sending
		if (Bun.env.CLAUDE_DEBUG === "1") {
			const truncated = rawJson.length > 2000 ? `${rawJson.slice(0, 2000)}... (${rawJson.length} chars)` : rawJson;
			console.error(`[${hookName}] DEBUG raw input: ${truncated}`);
		}

		// Stage 1: Extract session_id for early OTEL init
		const sessionId = SchemaValidator.extractSessionId(rawJson);

		// Initialize OTEL if we have a session ID
		if (sessionId) {
			try {
				const { TelemetryEmitter } = await import("../otel/index.js");
				await TelemetryEmitter.preconnect(sessionId);
			} catch {
				// Silently ignore telemetry errors - don't block hook initialization
			}
		}

		// Stage 2: Full schema validation
		let data: unknown;
		try {
			data = JSON.parse(rawJson);
		} catch (e) {
			// JSON parse error - create a synthetic ZodError for OTEL
			const parseError = new z.ZodError([
				{
					code: "custom",
					path: [],
					message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
				},
			]);
			// Emit and flush before throwing
			await SchemaValidator.emitValidationError(sessionId, hookName, parseError);
			throw parseError;
		}

		const result = schema.safeParse(data);

		if (!result.success) {
			// Log the raw input that failed validation
			const truncated = rawJson.length > 500 ? `${rawJson.slice(0, 500)}... (${rawJson.length} chars)` : rawJson;
			console.error(`[${hookName}] Validation failed. Raw input: ${truncated}`);

			// Emit and flush validation error to OTEL before throwing
			await SchemaValidator.emitValidationError(sessionId, hookName, result.error);
			throw result.error;
		}

		return result.data;
	}

	/**
	 * Extract session_id from raw JSON data for early OTEL initialization.
	 *
	 * @param rawJson - The raw JSON string
	 * @returns The session_id if found, null otherwise
	 * @internal
	 */
	private static extractSessionId(rawJson: string): string | null {
		try {
			const data = JSON.parse(rawJson) as unknown;
			if (typeof data === "object" && data !== null && "session_id" in data) {
				const sessionId = (data as { session_id: unknown }).session_id;
				if (typeof sessionId === "string" && sessionId.length > 0) {
					return sessionId;
				}
			}
		} catch {
			// JSON parse failed - will be caught by schema validation
		}
		return null;
	}

	/**
	 * Format ZodError issues into a structured object for OTEL telemetry.
	 *
	 * @param error - The ZodError to format
	 * @returns Formatted error with message, path, and issue count
	 * @internal
	 */
	private static formatError(error: z.ZodError): FormattedValidationError {
		const issues = error.issues;
		const firstIssue = issues[0];
		const path = firstIssue?.path.join(".") || "root";
		const message = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
		return { message, path, issueCount: issues.length };
	}

	/**
	 * Emit schema validation error to OTEL and flush before returning.
	 * Safe to call even if OTEL is not initialized.
	 *
	 * @param sessionId - The session ID (may be null if extraction failed)
	 * @param hookName - The hook name for attribution
	 * @param error - The ZodError to emit
	 * @internal
	 */
	private static async emitValidationError(
		sessionId: string | null,
		hookName: string,
		error: z.ZodError,
	): Promise<void> {
		if (!sessionId) return;

		try {
			const { isOTELEnabled } = require("../otel/config.js") as { isOTELEnabled: () => boolean };
			if (!isOTELEnabled()) return;

			const { TelemetryEmitter } = require("../otel/classes/TelemetryEmitter.js") as {
				TelemetryEmitter: typeof import("../otel/classes/TelemetryEmitter.js").TelemetryEmitter;
			};
			const { getSidecarClient } = require("../otel/client.js") as {
				getSidecarClient: typeof import("../otel/client.js").getSidecarClient;
			};

			const formatted = SchemaValidator.formatError(error);
			TelemetryEmitter.emitSchemaValidationError(sessionId, hookName, {
				hookName,
				issueCount: formatted.issueCount,
				validationPath: formatted.path,
				errorMessage: formatted.message,
			});

			// Flush to ensure telemetry is sent before process exits
			const client = getSidecarClient(sessionId);
			await client.flush(500);
		} catch {
			// Silently ignore OTEL errors - don't block hook execution
		}
	}
}
