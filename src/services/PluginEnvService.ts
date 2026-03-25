import type { Effect } from "effect";
import { Context } from "effect";
import type { EnvLoadError } from "../errors/EnvLoadError.js";
import type { EnvPersistError } from "../errors/EnvPersistError.js";
import type {
	CommandContextParams,
	CommandContextResult,
	HookContextParams,
	PersistResult,
	PluginEnv,
	PluginEnvFileSystem,
	SessionStartContextParams,
} from "./PluginEnv.js";

/**
 * Effect service tag for PluginEnv operations.
 *
 * @remarks
 * Provides an Effect-friendly interface over the PluginEnv abstract class.
 * Use `PluginEnvLive` in production and `makePluginEnvTest` in tests.
 *
 * @public
 */
export class PluginEnvService extends Context.Tag("PluginEnvService")<
	PluginEnvService,
	{
		readonly forSessionStart: <T extends PluginEnv>(
			cls: new () => T,
			params: SessionStartContextParams,
		) => Effect.Effect<T, EnvLoadError>;

		readonly forHook: <T extends PluginEnv>(
			cls: new () => T,
			params: HookContextParams,
		) => Effect.Effect<T, EnvLoadError>;

		readonly forCommand: <T extends PluginEnv, TArgs = Record<string, unknown>>(
			cls: new () => T,
			params: CommandContextParams,
		) => Effect.Effect<CommandContextResult<T, TArgs>, EnvLoadError>;

		readonly persistVars: (
			sessionId: string,
			vars: Record<string, string>,
			fs?: PluginEnvFileSystem,
		) => Effect.Effect<PersistResult, EnvPersistError>;
	}
>() {}
