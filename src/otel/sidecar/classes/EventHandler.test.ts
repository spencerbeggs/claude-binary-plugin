import { afterEach, describe, expect, mock, test } from "bun:test";
import type { EventData } from "../../protocol.js";
import { EventHandler } from "./EventHandler.js";
import { SidecarLog } from "./SidecarLog.js";
import { SidecarProviders } from "./SidecarProviders.js";

describe("EventHandler", () => {
	test("can be instantiated", () => {
		// @ts-expect-error: Private constructor - testing for coverage
		const instance = new EventHandler();
		expect(instance).toBeInstanceOf(EventHandler);
	});

	describe("handle", () => {
		let emitCalls: Array<Record<string, unknown>>;
		let originalGetLogger: typeof SidecarProviders.getLogger;

		afterEach(async () => {
			SidecarProviders.getLogger = originalGetLogger;
			SidecarLog.disable();
			await SidecarProviders.reset();
		});

		function setupLoggerMock() {
			emitCalls = [];

			const mockLogger = {
				emit: mock((record: Record<string, unknown>) => {
					emitCalls.push(record);
				}),
			};

			originalGetLogger = SidecarProviders.getLogger;
			SidecarProviders.getLogger = () => mockLogger as unknown as ReturnType<typeof SidecarProviders.getLogger>;

			// Suppress file logging
			SidecarLog.disable();

			return mockLogger;
		}

		test("emits log record with info severity by default", () => {
			const mockLogger = setupLoggerMock();

			const data: EventData = {
				name: "hook.execution",
				timeNs: BigInt(1700000000000000000),
				body: "Hook executed successfully",
			};

			EventHandler.handle(data);

			expect(mockLogger.emit).toHaveBeenCalledTimes(1);
			expect(emitCalls[0]?.body).toBe("Hook executed successfully");
			// SeverityNumber.INFO = 9
			expect(emitCalls[0]?.severityNumber).toBe(9);
			expect(emitCalls[0]?.severityText).toBe("INFO");
		});

		test("emits log record with explicit severity", () => {
			setupLoggerMock();

			const data: EventData = {
				name: "hook.error",
				timeNs: BigInt(1700000000000000000),
				severity: "error",
				body: "Something failed",
			};

			EventHandler.handle(data);

			// SeverityNumber.ERROR = 17
			expect(emitCalls[0]?.severityNumber).toBe(17);
			expect(emitCalls[0]?.severityText).toBe("ERROR");
		});

		test("uses event name as body when body is not provided", () => {
			setupLoggerMock();

			const data: EventData = {
				name: "hook.start",
				timeNs: BigInt(1700000000000000000),
			};

			EventHandler.handle(data);

			expect(emitCalls[0]?.body).toBe("hook.start");
		});

		test("includes event.name in attributes", () => {
			setupLoggerMock();

			const data: EventData = {
				name: "hook.execution",
				timeNs: BigInt(1700000000000000000),
				body: "test",
				attributes: { "hook.type": "PreToolUse" },
			};

			EventHandler.handle(data);

			const attrs = emitCalls[0]?.attributes as Record<string, string>;
			expect(attrs["event.name"]).toBe("hook.execution");
			expect(attrs["hook.type"]).toBe("PreToolUse");
		});

		test("converts nanoseconds to milliseconds for timestamp", () => {
			setupLoggerMock();

			// 1_700_000_000_000 ms = 1_700_000_000_000_000_000 ns
			const data: EventData = {
				name: "test",
				timeNs: 1_700_000_000_000_000_000n,
			};

			EventHandler.handle(data);

			expect(emitCalls[0]?.timestamp).toBe(1_700_000_000_000);
		});

		test("uses custom scope when provided", () => {
			const loggers: Array<{ name: string | undefined; version: string | undefined }> = [];

			originalGetLogger = SidecarProviders.getLogger;
			SidecarProviders.getLogger = (name?: string, version?: string) => {
				loggers.push({ name, version });
				return {
					emit: mock(() => {}),
				} as unknown as ReturnType<typeof SidecarProviders.getLogger>;
			};
			SidecarLog.disable();

			const data: EventData = {
				name: "test",
				timeNs: BigInt(1700000000000000000),
				scope: { name: "my-scope", version: "1.0.0" },
			};

			EventHandler.handle(data);

			expect(loggers[0]?.name).toBe("my-scope");
			expect(loggers[0]?.version).toBe("1.0.0");
		});

		test("handles all severity levels", () => {
			setupLoggerMock();

			const severities = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
			// SeverityNumber values: TRACE=1, DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21
			const expectedNumbers = [1, 5, 9, 13, 17, 21];
			const expectedTexts = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

			for (let i = 0; i < severities.length; i++) {
				emitCalls = [];
				const data: EventData = {
					name: `test.${severities[i]}`,
					timeNs: BigInt(1700000000000000000),
					severity: severities[i],
					body: `${severities[i]} message`,
				};

				EventHandler.handle(data);

				expect(emitCalls[0]?.severityNumber).toBe(expectedNumbers[i]);
				expect(emitCalls[0]?.severityText).toBe(expectedTexts[i]);
			}
		});
	});
});
