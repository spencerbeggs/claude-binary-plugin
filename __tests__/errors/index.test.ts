import { describe, expect, test } from "bun:test";
import { CommandParseError } from "../../src/errors/CommandParseError.js";
import { EnvLoadError } from "../../src/errors/EnvLoadError.js";
import { EnvPersistError } from "../../src/errors/EnvPersistError.js";
import { PipelineError } from "../../src/errors/PipelineError.js";
import { SchemaValidationError } from "../../src/errors/SchemaValidationError.js";
import { SessionLookupError } from "../../src/errors/SessionLookupError.js";
import { ShellError } from "../../src/errors/ShellError.js";
import { StdinError } from "../../src/errors/StdinError.js";

describe("Error Types", () => {
	test("SchemaValidationError has _tag and fields", () => {
		const err = new SchemaValidationError({
			message: "invalid",
			issues: [{ message: "bad field", path: ["name"] }],
			path: "name",
		});
		expect(err._tag).toBe("SchemaValidationError");
		expect(err.message).toBe("invalid");
		expect(err.issues).toHaveLength(1);
	});

	test("EnvLoadError has _tag and fields", () => {
		const err = new EnvLoadError({ file: "/tmp/env", cause: "not found" });
		expect(err._tag).toBe("EnvLoadError");
		expect(err.file).toBe("/tmp/env");
	});

	test("PipelineError has _tag and stage", () => {
		const err = new PipelineError({
			hookName: "validate",
			stage: "handler",
			cause: new Error("boom"),
		});
		expect(err._tag).toBe("PipelineError");
		expect(err.stage).toBe("handler");
	});

	test("SessionLookupError has _tag", () => {
		const err = new SessionLookupError({
			sessionId: "abc-123",
			reason: "not found",
		});
		expect(err._tag).toBe("SessionLookupError");
	});

	test("CommandParseError has _tag", () => {
		const err = new CommandParseError({
			commandName: "run",
			message: "missing arg",
		});
		expect(err._tag).toBe("CommandParseError");
	});

	test("StdinError has _tag", () => {
		const err = new StdinError({ cause: "EOF" });
		expect(err._tag).toBe("StdinError");
	});

	test("ShellError has _tag", () => {
		const err = new ShellError({
			command: "git status",
			exitCode: 1,
			stderr: "fatal",
		});
		expect(err._tag).toBe("ShellError");
		expect(err.exitCode).toBe(1);
	});

	test("EnvPersistError has _tag", () => {
		const err = new EnvPersistError({
			path: "/tmp/env",
			cause: "permission denied",
		});
		expect(err._tag).toBe("EnvPersistError");
	});
});
