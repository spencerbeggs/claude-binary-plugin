/**
 * Functions for extracting hook entries from plugin configurations.
 *
 * @remarks
 * Extracts pipeline hook entries and passthrough hook entries from
 * ClaudeBinaryPlugin configurations for use in code generation and
 * hooks.json manifest generation.
 *
 * @internal
 */
import type { PassthroughHookEntry } from "../plugin/config.js";
import type { ExtractableHook, ExtractedPassthroughHooks, HookEntry, HookEventTypeName } from "./builder.js";

/**
 * Check if a hook entry is a passthrough (raw hooks.json entry).
 * Passthrough entries have a `hooks` array and no `name` property.
 */
function isPassthroughHook(hook: unknown): hook is PassthroughHookEntry {
	return (
		typeof hook === "object" &&
		hook !== null &&
		"hooks" in hook &&
		Array.isArray((hook as PassthroughHookEntry).hooks) &&
		!("name" in hook && (hook as { name?: string }).name)
	);
}

/**
 * Extract hook entries from a ClaudeBinaryPlugin config for use with generatePipelinePluginEntrypoint.
 *
 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
 * @returns Array of hook entries ready for code generation
 */
export function extractPipelineHookEntries(config: {
	hooks: Partial<Record<HookEventTypeName, ExtractableHook[]>>;
}): HookEntry[] {
	const entries: HookEntry[] = [];

	for (const [hookType, hooks] of Object.entries(config.hooks)) {
		if (!Array.isArray(hooks)) continue;

		for (const hook of hooks) {
			// Skip passthrough entries - they go directly to hooks.json
			if (isPassthroughHook(hook)) continue;

			// At this point, hook must have a name (passthrough entries are skipped above)
			if (!hook.name) continue;

			entries.push({
				hookType: hookType as HookEventTypeName,
				name: hook.name,
				isPipeline: "handler" in hook && hook.handler !== undefined,
				tools: hook.tools,
				description: hook.description,
			});
		}
	}

	return entries;
}

/**
 * Extracts passthrough hook entries from a plugin configuration.
 * Passthrough entries are raw hooks.json entries that get included directly
 * without compilation into the binary.
 *
 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
 * @returns Object mapping hook types to their passthrough entries
 */
export function extractPassthroughHookEntries(config: {
	hooks: Partial<Record<HookEventTypeName, unknown[]>>;
}): ExtractedPassthroughHooks {
	const result: ExtractedPassthroughHooks = {};

	for (const [hookType, hooks] of Object.entries(config.hooks)) {
		if (!Array.isArray(hooks)) continue;

		const passthroughEntries: PassthroughHookEntry[] = [];
		for (const hook of hooks) {
			if (isPassthroughHook(hook)) {
				passthroughEntries.push({
					matcher: hook.matcher,
					hooks: hook.hooks,
				});
			}
		}

		if (passthroughEntries.length > 0) {
			result[hookType] = passthroughEntries;
		}
	}

	return result;
}
