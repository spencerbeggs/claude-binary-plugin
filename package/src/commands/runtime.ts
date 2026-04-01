import type { Schema } from "effect";
import { ParseResult } from "effect";

// =============================================================================
// INTERNAL SCHEMA UTILITIES
// =============================================================================

const DescriptionAnnotationId = Symbol.for("effect/annotation/Description");

/**
 * Extract the fields from an Effect Schema.Struct for documentation.
 * @internal
 */
function extractSchemaFields(schema: Schema.Schema<unknown>): Record<string, Schema.Schema<unknown>> {
	const ast = schema.ast;
	if (ast && ast.constructor?.name === "TypeLiteral") {
		const typeLiteral = ast as {
			propertySignatures?: Array<{ name: PropertyKey; type: unknown; isOptional?: boolean }>;
		};
		if (typeLiteral.propertySignatures) {
			// Access the fields via the schema itself if it is a Struct
			if ("fields" in schema) {
				const fields = (schema as unknown as { fields: Record<string, Schema.Schema<unknown>> }).fields;
				return fields;
			}
		}
	}
	// Try direct fields access for Schema.Struct instances
	if ("fields" in schema) {
		const fields = (schema as unknown as { fields: Record<string, Schema.Schema<unknown>> }).fields;
		return fields;
	}
	return {};
}

/**
 * Extract description from an Effect Schema field.
 * @internal
 */
function extractDescription(fieldSchema: Schema.Schema<unknown>): string | undefined {
	const ast = fieldSchema.ast;
	if (!ast) return undefined;
	// Check direct annotations
	const desc = (ast.annotations as Record<symbol, unknown>)?.[DescriptionAnnotationId];
	if (typeof desc === "string") return desc;
	// Check nested for PropertySignatureDeclaration
	if (ast.constructor?.name === "PropertySignatureDeclaration") {
		const psd = ast as unknown as { type?: { annotations?: Record<symbol, unknown> } };
		const nestedDesc = psd.type?.annotations?.[DescriptionAnnotationId];
		if (typeof nestedDesc === "string") return nestedDesc;
	}
	return undefined;
}

/**
 * Check if an Effect Schema field is optional (optional or has a default).
 * @internal
 */
function isSchemaOptional(fieldSchema: Schema.Schema<unknown>): boolean {
	const ast = fieldSchema.ast;
	if (!ast) return false;
	const name = ast.constructor?.name;
	// PropertySignatureDeclaration with isOptional flag
	if (name === "PropertySignatureDeclaration") {
		return (ast as unknown as { isOptional?: boolean }).isOptional === true;
	}
	// PropertySignatureTransformation means it has a default (optionalWith)
	if (name === "PropertySignatureTransformation") {
		return true;
	}
	return false;
}

/**
 * Format an Effect ParseError as LLM-friendly markdown.
 * @internal
 */
function formatArgumentError(
	rawArgs: string[],
	// biome-ignore lint/suspicious/noExplicitAny: Accepts any Schema variant (Struct, Class, etc.)
	schema: Schema.Schema<any, any, never>,
	error: ParseResult.ParseError,
): string {
	const lines = [
		"# Argument Validation Error",
		"",
		"The command received invalid arguments.",
		"",
		"## Received Arguments",
		"",
		"```",
		rawArgs.length > 0 ? rawArgs.join(" ") : "(none)",
		"```",
		"",
		"## Validation Errors",
		"",
	];

	const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
	lines.push(formatted);

	// Generate usage from schema
	lines.push("", "## Expected Arguments", "");
	const fields = extractSchemaFields(schema);
	for (const [key, fieldSchema] of Object.entries(fields)) {
		if (key.startsWith("_")) continue; // Skip internal keys
		const desc = extractDescription(fieldSchema);
		const required = !isSchemaOptional(fieldSchema);
		const reqLabel = required ? " (required)" : "";
		const descLabel = desc ? `: ${desc}` : "";
		lines.push(`- \`--${key}\`${reqLabel}${descLabel}`);
	}

	lines.push("", "## Example Usage", "");
	lines.push("```");
	lines.push("workflow.plugin --cmd=<command> --arg1=value --arg2=value");
	lines.push("```");

	return lines.join("\n");
}

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Error thrown when command arguments fail validation.
 * Provides LLM-friendly markdown error message.
 * @error
 * @public
 */
export class CommandArgumentError extends Error {
	readonly exitCode = 2;

	// biome-ignore lint/suspicious/noExplicitAny: Accepts any Schema variant (Struct, Class, etc.)
	constructor(rawArgs: string[], schema: Schema.Schema<any, any, never>, error: ParseResult.ParseError) {
		super(formatArgumentError(rawArgs, schema, error));
		this.name = "CommandArgumentError";
	}
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Type for commands that accept no arguments.
 *
 * @remarks
 * Represents an empty object type. Use with an empty Schema.Struct
 * when defining commands that don't accept any arguments.
 *
 * @public
 */
// biome-ignore lint/complexity/noBannedTypes: Empty object type is intentional for commands with no args
export type EmptyArgs = {};
