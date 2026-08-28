import { ParseResult } from "effect";

/**
 * Validation issue type for error formatting.
 * Minimal interface for validation errors from any schema library.
 * @public
 */
export interface ValidationIssueMinimal {
	path: PropertyKey[];
	message: string;
	code: string;
	// Optional: expected values for enum/literal errors
	values?: unknown[];
	// Optional: expected type for type errors
	expected?: string;
	// Optional: received value/type for debugging
	received?: unknown;
}

/**
 * Validation error type for validation results.
 * Minimal interface for schema validation errors.
 * @public
 */
export interface ValidationErrorMinimal {
	issues: ValidationIssueMinimal[];
}

/**
 * Result of validation with context.
 * Either success with validated data, or failure with formatted error message.
 * @public
 */
export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; error: ValidationErrorMinimal; message: string };

/**
 * Format a received value for display in error messages.
 * Handles undefined, null, objects, and truncates long strings.
 */
function formatReceivedValue(received: unknown): string {
	if (received === undefined) return "undefined";
	if (received === null) return "null";
	if (typeof received === "string") {
		// Truncate long strings
		const maxLen = 50;
		if (received.length > maxLen) {
			return `"${received.slice(0, maxLen)}..." (${received.length} chars)`;
		}
		return `"${received}"`;
	}
	if (typeof received === "number" || typeof received === "boolean") {
		return String(received);
	}
	if (Array.isArray(received)) {
		return `Array(${received.length})`;
	}
	if (typeof received === "object") {
		return `Object(${Object.keys(received).length} keys)`;
	}
	return String(received);
}

/**
 * Format a validation error for LLM consumption.
 *
 * Accepts either a `ValidationErrorMinimal` (issue-based) or an Effect `ParseError`.
 * For `ParseError`, uses `TreeFormatter` for structured output.
 *
 * @param error - The validation error to format
 * @param maxErrors - Maximum number of errors to show (default 10)
 * @returns Formatted markdown string
 *
 * @example Output:
 * ```markdown
 * ## Validation Errors
 *
 * - **MY_VAR**: Invalid enum value. Expected 'true' | 'false', received: undefined
 * ```
 * @public
 */
export function formatValidationError(error: ValidationErrorMinimal | ParseResult.ParseError, maxErrors = 10): string {
	// Handle Effect ParseError
	if (ParseResult.isParseError(error)) {
		const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
		return `## Validation Errors\n\n${formatted}`;
	}

	// Handle issue-based errors (ValidationErrorMinimal)
	return formatValidationIssues(error, maxErrors);
}

/**
 * Format issue-based validation errors for LLM consumption.
 *
 * @param error - The validation error with issues array
 * @param maxErrors - Maximum number of errors to show
 * @returns Formatted markdown string
 * @internal
 */
function formatValidationIssues(error: ValidationErrorMinimal, maxErrors = 10): string {
	const issues = error.issues.slice(0, maxErrors);
	const lines = ["## Validation Errors", ""];

	for (const issue of issues) {
		// Convert PropertyKey[] to string (symbols are converted via String())
		const path = issue.path.map((p) => String(p)).join(".");
		let message = `**${path || "(root)"}**: ${issue.message}`;

		// Add expected values for enum/literal errors
		if (issue.code === "invalid_value" && issue.values && Array.isArray(issue.values) && issue.values.length > 0) {
			message += ` (expected: ${issue.values.join(", ")})`;
		}

		// Add expected type for type errors
		if (issue.code === "invalid_type" && issue.expected) {
			message += ` (expected: ${issue.expected})`;
		}

		// Add received value for debugging - this is the key improvement
		if ("received" in issue && issue.received !== undefined) {
			message += `, received: ${formatReceivedValue(issue.received)}`;
		}

		lines.push(`- ${message}`);
	}

	if (error.issues.length > maxErrors) {
		lines.push(`- ... and ${error.issues.length - maxErrors} more errors`);
	}

	return lines.join("\n");
}
