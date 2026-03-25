import { Effect, Layer } from "effect";
import { EnvLoadError } from "../errors/EnvLoadError.js";
import { EnvPersistError } from "../errors/EnvPersistError.js";
import type {
	CommandContextParams,
	CommandContextResult,
	HookContextParams,
	PersistResult,
	PluginEnvFileSystem,
	SessionStartContextParams,
} from "../services/PluginEnv.js";
import { PluginEnv } from "../services/PluginEnv.js";
import { PluginEnvService } from "../services/PluginEnvService.js";

export const PluginEnvLive = Layer.succeed(PluginEnvService, {
	forSessionStart: <T extends PluginEnv>(cls: new () => T, params: SessionStartContextParams) =>
		Effect.tryPromise({
			try: () => PluginEnv.forSessionStart.call(cls, params) as Promise<T>,
			catch: (cause) => new EnvLoadError({ file: "sessionStart", cause }),
		}),

	forHook: <T extends PluginEnv>(cls: new () => T, params: HookContextParams) =>
		Effect.tryPromise({
			try: () => PluginEnv.forHook.call(cls, params) as Promise<T>,
			catch: (cause) => new EnvLoadError({ file: "hook", cause }),
		}),

	forCommand: <T extends PluginEnv, TArgs = Record<string, unknown>>(cls: new () => T, params: CommandContextParams) =>
		Effect.tryPromise({
			try: () => PluginEnv.forCommand.call(cls, params) as Promise<CommandContextResult<T, TArgs>>,
			catch: (cause) => new EnvLoadError({ file: "command", cause }),
		}),

	persistVars: (sessionId: string, vars: Record<string, string>, fs?: PluginEnvFileSystem) =>
		Effect.tryPromise({
			try: () => PluginEnv.persistVars(sessionId, vars, fs),
			catch: (cause) => new EnvPersistError({ path: Bun.env.CLAUDE_ENV_FILE ?? "unknown", cause }),
		}),
});
