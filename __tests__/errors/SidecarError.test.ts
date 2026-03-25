import { describe, expect, test } from "bun:test";
import { SidecarError } from "../../src/errors/SidecarError.js";

describe("SidecarError", () => {
	test("creates tagged error with stage", () => {
		const err = new SidecarError({
			stage: "connect",
			message: "socket not found",
		});
		expect(err._tag).toBe("SidecarError");
		expect(err.stage).toBe("connect");
		expect(err.message).toBe("socket not found");
	});

	test("accepts optional cause", () => {
		const cause = new Error("ECONNREFUSED");
		const err = new SidecarError({
			stage: "spawn",
			message: "failed",
			cause,
		});
		expect(err.cause).toBe(cause);
	});
});
