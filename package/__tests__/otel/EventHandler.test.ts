import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "@opentelemetry/api-logs";
import { EventHandler } from "../../src/otel/EventHandler.js";
import type { EventData } from "../../src/otel/protocol.js";

describe("EventHandler", () => {
	describe("handle", () => {
		let emitCalls: Array<Record<string, unknown>>;
		let mockLogger: Logger;

		function setupLoggerMock(): Logger {
			emitCalls = [];

			mockLogger = {
				emit: mock((record: Record<string, unknown>) => {
					emitCalls.push(record);
				}),
			} as unknown as Logger;

			return mockLogger;
		}

		test("emits log record with info severity by default", () => {
			const logger = setupLoggerMock();

			const data: EventData = {
				name: "hook.execution",
				timeNs: BigInt(1700000000000000000),
				body: "Hook executed successfully",
			};

			EventHandler.handle(data, logger);

			expect(emitCalls).toHaveLength(1);
			expect(emitCalls[0]?.body).toBe("Hook executed successfully");
			// SeverityNumber.INFO = 9
			expect(emitCalls[0]?.severityNumber).toBe(9);
			expect(emitCalls[0]?.severityText).toBe("INFO");
		});

		test("emits log record with explicit severity", () => {
			const logger = setupLoggerMock();

			const data: EventData = {
				name: "hook.error",
				timeNs: BigInt(1700000000000000000),
				severity: "error",
				body: "Something failed",
			};

			EventHandler.handle(data, logger);

			// SeverityNumber.ERROR = 17
			expect(emitCalls[0]?.severityNumber).toBe(17);
			expect(emitCalls[0]?.severityText).toBe("ERROR");
		});

		test("uses event name as body when body is not provided", () => {
			const logger = setupLoggerMock();

			const data: EventData = {
				name: "hook.start",
				timeNs: BigInt(1700000000000000000),
			};

			EventHandler.handle(data, logger);

			expect(emitCalls[0]?.body).toBe("hook.start");
		});

		test("includes event.name in attributes", () => {
			const logger = setupLoggerMock();

			const data: EventData = {
				name: "hook.execution",
				timeNs: BigInt(1700000000000000000),
				body: "test",
				attributes: { "hook.type": "PreToolUse" },
			};

			EventHandler.handle(data, logger);

			const attrs = emitCalls[0]?.attributes as Record<string, string>;
			expect(attrs["event.name"]).toBe("hook.execution");
			expect(attrs["hook.type"]).toBe("PreToolUse");
		});

		test("converts nanoseconds to milliseconds for timestamp", () => {
			const logger = setupLoggerMock();

			// 1_700_000_000_000 ms = 1_700_000_000_000_000_000 ns
			const data: EventData = {
				name: "test",
				timeNs: 1_700_000_000_000_000_000n,
			};

			EventHandler.handle(data, logger);

			expect(emitCalls[0]?.timestamp).toBe(1_700_000_000_000);
		});

		test("handles all severity levels", () => {
			const logger = setupLoggerMock();

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

				EventHandler.handle(data, logger);

				expect(emitCalls[0]?.severityNumber).toBe(expectedNumbers[i]);
				expect(emitCalls[0]?.severityText).toBe(expectedTexts[i]);
			}
		});
	});
});
