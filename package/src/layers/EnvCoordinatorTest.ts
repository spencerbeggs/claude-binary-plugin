import type { Schema } from "effect";
import { Effect, Layer } from "effect";
import { EnvCoordinator } from "../services/EnvCoordinator.js";

export const makeEnvCoordinatorTest = (
	defaults: { options?: Record<string, unknown>; state?: Record<string, unknown> } = {},
) => {
	const layer = Layer.succeed(EnvCoordinator, {
		forSessionStart: <TOptions>(_schema: Schema.Schema<TOptions, any, never>) =>
			Effect.succeed((defaults.options ?? {}) as TOptions),

		forHook: <TOptions>(_schema: Schema.Schema<TOptions, any, never>) =>
			Effect.succeed((defaults.options ?? {}) as TOptions),

		forCommand: <TOptions, _TArgs>(_schema: Schema.Schema<TOptions, any, never>) =>
			Effect.succeed({
				options: (defaults.options ?? {}) as TOptions,
				remainingArgs: [] as string[],
			}),

		persistSessionEnv: () => Effect.succeed({ persisted: true, path: "/tmp/test-env.sh" }),
	});

	return { layer };
};
