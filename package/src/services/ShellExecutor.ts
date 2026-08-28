import type { Effect } from "effect";
import { Context, Schema } from "effect";
import type { ShellError } from "../errors/ShellError.js";

export class ShellResult extends Schema.Class<ShellResult>("ShellResult")({
	exitCode: Schema.Number,
	stdout: Schema.String,
	stderr: Schema.String,
}) {}

export class ShellExecutor extends Context.Tag("ShellExecutor")<
	ShellExecutor,
	{
		readonly exec: (cmd: string) => Effect.Effect<ShellResult, ShellError>;
	}
>() {}
