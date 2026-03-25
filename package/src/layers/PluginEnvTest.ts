import { Effect, Layer } from "effect";
import type { CommandContextParams, HookContextParams, SessionStartContextParams } from "../services/PluginEnv.js";
import { PluginEnv } from "../services/PluginEnv.js";
import { PluginEnvService } from "../services/PluginEnvService.js";

/**
 * Creates a test Layer for PluginEnvService with in-memory state tracking.
 *
 * @remarks
 * Wraps `PluginEnv.forSessionStart`, `forHook`, `forCommand`, and `persistVars`
 * but records calls and intercepts `persistVars` so no real file I/O occurs.
 *
 * @example
 * ```typescript
 * const { layer, persisted } = makePluginEnvTest();
 * await Effect.runPromise(myEffect.pipe(Effect.provide(layer)));
 * console.log(persisted); // [{ sessionId, vars }]
 * ```
 *
 * @public
 */
export const makePluginEnvTest = (envVars: Record<string, string> = {}) => {
	const persisted: Array<{ sessionId: string; vars: Record<string, string> }> = [];

	const layer = Layer.succeed(PluginEnvService, {
		forSessionStart: <T extends PluginEnv>(cls: new () => T, params: SessionStartContextParams) =>
			Effect.tryPromise({
				try: async () => {
					// Inject test env vars into Bun.env before constructing
					for (const [k, v] of Object.entries(envVars)) {
						Bun.env[k] = v;
					}
					// Omit projectRoot so no real .env files are loaded during tests
					const { projectRoot: _ignored, ...rest } = params;
					return PluginEnv.forSessionStart.call(cls, rest);
				},
				catch: (cause) => cause as Error,
			}) as Effect.Effect<T, never>,

		forHook: <T extends PluginEnv>(cls: new () => T, params: HookContextParams) =>
			Effect.tryPromise({
				try: async () => {
					for (const [k, v] of Object.entries(envVars)) {
						Bun.env[k] = v;
					}
					return PluginEnv.forHook.call(cls, params);
				},
				catch: (cause) => cause as Error,
			}) as Effect.Effect<T, never>,

		forCommand: <T extends PluginEnv, TArgs = Record<string, unknown>>(
			cls: new () => T,
			params: CommandContextParams,
		) =>
			Effect.tryPromise({
				try: async () => {
					for (const [k, v] of Object.entries(envVars)) {
						Bun.env[k] = v;
					}
					return PluginEnv.forCommand.call(cls, params);
				},
				catch: (cause) => cause as Error,
			}) as Effect.Effect<{ env: T; remainingArgs: string[]; args?: TArgs }, never>,

		persistVars: (sessionId: string, vars: Record<string, string>) =>
			Effect.sync(() => {
				persisted.push({ sessionId, vars });
				return { persisted: true, path: "/tmp/test-env-file.sh" };
			}),
	});

	return { layer, persisted };
};
