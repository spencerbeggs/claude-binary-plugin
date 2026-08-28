import type { Effect, Schema } from "effect";
import { Context } from "effect";
import type { EnvLoadError } from "../errors/EnvLoadError.js";
import type { EnvPersistError } from "../errors/EnvPersistError.js";
import type { SchemaValidationError } from "../errors/SchemaValidationError.js";
import type { PersistResult } from "./EnvWriter.js";

export interface SessionStartParams {
	projectRoot?: string;
	sessionId?: string;
	hookName?: string;
}

export interface HookParams {
	sessionId: string;
	sessionEnvDir?: string;
	hookName?: string;
}

export interface CommandParams {
	args: string[];
	commandName?: string;
}

export interface CommandResult<TOptions, TArgs = Record<string, unknown>> {
	options: TOptions;
	remainingArgs: string[];
	args?: TArgs | undefined;
}

export interface PersistParams {
	sessionId: string;
	prefix: string;
	vars: Record<string, string>;
	projectDir: string;
	claudeEnvFile: string;
}

export class EnvCoordinator extends Context.Tag("EnvCoordinator")<
	EnvCoordinator,
	{
		readonly forSessionStart: <TOptions>(
			schema: Schema.Schema<TOptions, any, never>,
			params: SessionStartParams,
		) => Effect.Effect<TOptions, EnvLoadError | SchemaValidationError>;

		readonly forHook: <TOptions>(
			schema: Schema.Schema<TOptions, any, never>,
			params: HookParams,
		) => Effect.Effect<TOptions, EnvLoadError | SchemaValidationError>;

		readonly forCommand: <TOptions, TArgs = Record<string, unknown>>(
			schema: Schema.Schema<TOptions, any, never>,
			params: CommandParams,
			argsSchema?: Schema.Schema<TArgs, any, never>,
		) => Effect.Effect<CommandResult<TOptions, TArgs>, EnvLoadError | SchemaValidationError>;

		readonly persistSessionEnv: (params: PersistParams) => Effect.Effect<PersistResult, EnvPersistError>;
	}
>() {}
