import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SpanData } from "../../protocol.js";
import { SidecarProviders } from "./SidecarProviders.js";
import { SpanHandler } from "./SpanHandler.js";

describe("SpanHandler", () => {
	test("SpanHandler is exported", () => {
		expect(SpanHandler).toBeDefined();
	});

	test("handle is a static method", () => {
		expect(typeof SpanHandler.handle).toBe("function");
	});

	describe("handle", () => {
		// Track span operations for assertions
		let spanOps: {
			addEvent: Array<{ name: string; attributes?: Record<string, string | number | boolean>; time?: unknown }>;
			setStatus: Array<{ code: number; message?: string }>;
			recordException: Array<{ message: string }>;
			endTime: unknown;
		};

		afterEach(async () => {
			await SidecarProviders.reset();
		});

		function setupSpanMock() {
			spanOps = {
				addEvent: [],
				setStatus: [],
				recordException: [],
				endTime: undefined,
			};

			const mockSpan = {
				addEvent: mock((name: string, attributes?: Record<string, string | number | boolean>, time?: unknown) => {
					spanOps.addEvent.push({
						name,
						...(attributes !== undefined && { attributes }),
						...(time !== undefined && { time }),
					});
				}),
				setStatus: mock((status: { code: number; message?: string }) => {
					spanOps.setStatus.push(status);
				}),
				recordException: mock((error: Error) => {
					spanOps.recordException.push({ message: error.message });
				}),
				end: mock((endTime?: unknown) => {
					spanOps.endTime = endTime;
				}),
			};

			const mockTracer = {
				startSpan: mock(() => mockSpan),
			};

			// Override getTracer to return our mock
			const originalGetTracer = SidecarProviders.getTracer;
			SidecarProviders.getTracer = () => mockTracer as unknown as ReturnType<typeof SidecarProviders.getTracer>;

			return {
				mockTracer,
				mockSpan,
				restore: () => {
					SidecarProviders.getTracer = originalGetTracer;
				},
			};
		}

		test("handles basic span without events or status", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					endTimeNs: 1700000001000000000n,
				};

				SpanHandler.handle(data);

				expect(mocks.mockTracer.startSpan).toHaveBeenCalled();
				expect(spanOps.addEvent).toHaveLength(0);
				expect(spanOps.setStatus).toHaveLength(0);
				expect(spanOps.recordException).toHaveLength(0);
				expect(spanOps.endTime).toBeDefined();
			} finally {
				mocks.restore();
			}
		});

		test("handles span with events array", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					endTimeNs: 1700000001000000000n,
					events: [
						{
							name: "validation.start",
							timeNs: 1700000000100000000n,
							attributes: { "validation.type": "schema" },
						},
						{
							name: "validation.end",
							timeNs: 1700000000500000000n,
						},
					],
				};

				SpanHandler.handle(data);

				expect(spanOps.addEvent).toHaveLength(2);
				expect(spanOps.addEvent[0]?.name).toBe("validation.start");
				expect(spanOps.addEvent[0]?.attributes).toEqual({ "validation.type": "schema" });
				expect(spanOps.addEvent[1]?.name).toBe("validation.end");
			} finally {
				mocks.restore();
			}
		});

		test("handles span with ok status", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					status: { code: "ok" },
				};

				SpanHandler.handle(data);

				expect(spanOps.setStatus).toHaveLength(1);
				// SpanStatusCode.OK = 1
				expect(spanOps.setStatus[0]?.code).toBe(1);
				expect(spanOps.recordException).toHaveLength(0);
			} finally {
				mocks.restore();
			}
		});

		test("handles span with error status without message", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					status: { code: "error" },
				};

				SpanHandler.handle(data);

				expect(spanOps.setStatus).toHaveLength(1);
				// SpanStatusCode.ERROR = 2
				expect(spanOps.setStatus[0]?.code).toBe(2);
				// No message means no exception recorded
				expect(spanOps.recordException).toHaveLength(0);
			} finally {
				mocks.restore();
			}
		});

		test("handles span with error status and message (records exception)", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					status: { code: "error", message: "Validation failed" },
				};

				SpanHandler.handle(data);

				expect(spanOps.setStatus).toHaveLength(1);
				// SpanStatusCode.ERROR = 2
				expect(spanOps.setStatus[0]?.code).toBe(2);
				expect(spanOps.setStatus[0]?.message).toBe("Validation failed");
				// Error with message should record exception
				expect(spanOps.recordException).toHaveLength(1);
				expect(spanOps.recordException[0]?.message).toBe("Validation failed");
			} finally {
				mocks.restore();
			}
		});

		test("handles span without endTimeNs", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					// no endTimeNs
				};

				SpanHandler.handle(data);

				// endTime should be undefined when no endTimeNs
				expect(spanOps.endTime).toBeUndefined();
			} finally {
				mocks.restore();
			}
		});

		test("handles span with unset status", () => {
			const mocks = setupSpanMock();
			try {
				const data: SpanData = {
					spanId: "abc123",
					traceId: "def456",
					name: "hook.execute",
					kind: "internal",
					startTimeNs: 1700000000000000000n,
					status: { code: "unset" },
				};

				SpanHandler.handle(data);

				expect(spanOps.setStatus).toHaveLength(1);
				// SpanStatusCode.UNSET = 0
				expect(spanOps.setStatus[0]?.code).toBe(0);
				expect(spanOps.recordException).toHaveLength(0);
			} finally {
				mocks.restore();
			}
		});
	});
});
