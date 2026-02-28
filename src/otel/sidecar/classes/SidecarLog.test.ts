import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { SidecarLog } from "./SidecarLog.js";

describe("SidecarLog", () => {
	test("can be instantiated", () => {
		// @ts-expect-error: Private constructor - testing for coverage
		const instance = new SidecarLog();
		expect(instance).toBeInstanceOf(SidecarLog);
	});

	afterEach(() => {
		SidecarLog.disable();
	});

	describe("enable/disable/isEnabled", () => {
		test("is disabled by default", () => {
			expect(SidecarLog.isEnabled()).toBe(false);
		});

		test("enable() enables logging", () => {
			SidecarLog.enable();
			expect(SidecarLog.isEnabled()).toBe(true);
		});

		test("disable() disables logging", () => {
			SidecarLog.enable();
			SidecarLog.disable();
			expect(SidecarLog.isEnabled()).toBe(false);
		});
	});

	describe("getLogFile", () => {
		test("returns log file path", () => {
			const path = SidecarLog.getLogFile();
			expect(path).toBe("/tmp/claude-otel-sidecar.log");
		});
	});

	describe("write", () => {
		test("does nothing when disabled", () => {
			const spy = spyOn(fs, "appendFileSync").mockImplementation(() => {});
			try {
				SidecarLog.write("test message");
				expect(spy).not.toHaveBeenCalled();
			} finally {
				spy.mockRestore();
			}
		});

		test("writes timestamped message when enabled", () => {
			const written: unknown[] = [];
			const spy = spyOn(fs, "appendFileSync").mockImplementation((_path, data) => {
				written.push(data);
			});

			try {
				SidecarLog.enable();
				SidecarLog.write("test message");

				expect(spy).toHaveBeenCalledTimes(1);
				expect(written).toHaveLength(1);
				// Check format: [ISO timestamp] message\n
				expect(written[0]).toMatch(/^\[.*\] test message\n$/);
			} finally {
				spy.mockRestore();
			}
		});

		test("writes to correct log file path", () => {
			let writtenPath: unknown;
			const spy = spyOn(fs, "appendFileSync").mockImplementation((path) => {
				writtenPath = path;
			});

			try {
				SidecarLog.enable();
				SidecarLog.write("test");
				expect(writtenPath).toBe("/tmp/claude-otel-sidecar.log");
			} finally {
				spy.mockRestore();
			}
		});

		test("suppresses write errors", () => {
			const spy = spyOn(fs, "appendFileSync").mockImplementation(() => {
				throw new Error("disk full");
			});

			try {
				SidecarLog.enable();
				// Should not throw
				expect(() => SidecarLog.write("test")).not.toThrow();
			} finally {
				spy.mockRestore();
			}
		});
	});
});
