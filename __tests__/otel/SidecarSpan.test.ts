import { describe, expect, test } from "bun:test";
import { Context, Effect, Exit, Option, Tracer } from "effect";
import type { SpanMessage } from "../../src/otel/protocol.js";
import { SidecarSpan } from "../../src/otel/SidecarSpan.js";

// =============================================================================
// Helpers
// =============================================================================

const emptyContext = Context.empty() as Context.Context<never>;

function makeSpan(
	name: string,
	opts?: {
		parent?: Tracer.AnySpan;
		emitCallback?: (msg: SpanMessage) => void;
		sessionId?: string;
		kind?: Tracer.SpanKind;
	},
): SidecarSpan {
	const parent = opts?.parent ? Option.some(opts.parent) : Option.none<Tracer.AnySpan>();
	return new SidecarSpan(
		name,
		parent,
		emptyContext,
		[],
		1_000_000n,
		opts?.kind ?? "internal",
		opts?.emitCallback ?? (() => {}),
		opts?.sessionId ?? "test-session",
	);
}

// =============================================================================
// SidecarSpan unit tests
// =============================================================================

describe("SidecarSpan", () => {
	test("creates with name and generates spanId/traceId", () => {
		const span = makeSpan("test-span");

		expect(span.name).toBe("test-span");
		expect(span._tag).toBe("Span");
		expect(span.spanId).toHaveLength(16); // 8 bytes = 16 hex chars
		expect(span.traceId).toHaveLength(32); // 16 bytes = 32 hex chars
		expect(span.kind).toBe("internal");
		expect(span.sampled).toBe(true);
		expect(span.status._tag).toBe("Started");
	});

	test("attribute() accumulates attributes", () => {
		const span = makeSpan("test-span");

		span.attribute("key1", "value1");
		span.attribute("key2", 42);
		span.attribute("key3", true);

		expect(span.attributes.get("key1")).toBe("value1");
		expect(span.attributes.get("key2")).toBe(42);
		expect(span.attributes.get("key3")).toBe(true);
		expect(span.attributes.size).toBe(3);
	});

	test("event() accumulates events", () => {
		const span = makeSpan("test-span");

		span.event("event-1", 2_000_000n);
		span.event("event-2", 3_000_000n, { detail: "something" });

		// Events are private, but we can verify them through the emitted message
		const messages: SpanMessage[] = [];
		const emitSpan = makeSpan("emit-test", {
			emitCallback: (msg) => messages.push(msg),
		});
		emitSpan.event("ev1", 100n);
		emitSpan.event("ev2", 200n, { key: "val" });
		emitSpan.end(500n, Exit.succeed("ok"));

		expect(messages).toHaveLength(1);
		expect(messages[0].data.events).toHaveLength(2);
		expect(messages[0].data.events![0].name).toBe("ev1");
		expect(messages[0].data.events![0].timeNs).toBe(100n);
		expect(messages[0].data.events![1].name).toBe("ev2");
		expect(messages[0].data.events![1].attributes).toEqual({ key: "val" });
	});

	test("end() with success exit calls emit callback with SpanMessage", () => {
		const messages: SpanMessage[] = [];
		const span = makeSpan("success-span", {
			emitCallback: (msg) => messages.push(msg),
			sessionId: "session-123",
		});

		span.attribute("custom.attr", "hello");
		span.end(5_000_000n, Exit.succeed("result"));

		expect(messages).toHaveLength(1);
		const msg = messages[0];
		expect(msg.type).toBe("span");
		expect(msg.sessionId).toBe("session-123");
		expect(msg.data.name).toBe("success-span");
		expect(msg.data.spanId).toBe(span.spanId);
		expect(msg.data.traceId).toBe(span.traceId);
		expect(msg.data.kind).toBe("internal");
		expect(msg.data.startTimeNs).toBe(1_000_000n);
		expect(msg.data.endTimeNs).toBe(5_000_000n);
		expect(msg.data.status?.code).toBe("ok");
		expect(msg.data.attributes?.["custom.attr"]).toBe("hello");
	});

	test("end() with failure exit sets error status", () => {
		const messages: SpanMessage[] = [];
		const span = makeSpan("fail-span", {
			emitCallback: (msg) => messages.push(msg),
		});

		span.end(5_000_000n, Exit.fail(new Error("something broke")));

		expect(messages).toHaveLength(1);
		const msg = messages[0];
		expect(msg.data.status?.code).toBe("error");
		expect(msg.data.status?.message).toBeDefined();
	});

	test("parent span inheritance: traceId propagation", () => {
		const parentSpan = makeSpan("parent");
		const childSpan = makeSpan("child", { parent: parentSpan });

		// Child inherits traceId from parent
		expect(childSpan.traceId).toBe(parentSpan.traceId);
		// But has its own spanId
		expect(childSpan.spanId).not.toBe(parentSpan.spanId);

		// Parent option is set
		expect(Option.isSome(childSpan.parent)).toBe(true);
	});

	test("parent spanId is included in emitted SpanData", () => {
		const messages: SpanMessage[] = [];
		const parentSpan = makeSpan("parent");
		const childSpan = makeSpan("child", {
			parent: parentSpan,
			emitCallback: (msg) => messages.push(msg),
		});

		childSpan.end(2_000_000n, Exit.succeed(undefined));

		expect(messages[0].data.parentSpanId).toBe(parentSpan.spanId);
	});

	test("addLinks accumulates links", () => {
		const span = makeSpan("linked");
		const otherSpan = makeSpan("other");
		const link: Tracer.SpanLink = { _tag: "SpanLink", span: otherSpan, attributes: { reason: "test" } };
		span.addLinks([link]);
		expect(span.links).toHaveLength(1);
	});

	test("end() sets status to Ended", () => {
		const span = makeSpan("test");
		expect(span.status._tag).toBe("Started");

		span.end(2_000_000n, Exit.succeed(undefined));
		expect(span.status._tag).toBe("Ended");
		if (span.status._tag === "Ended") {
			expect(span.status.startTime).toBe(1_000_000n);
			expect(span.status.endTime).toBe(2_000_000n);
		}
	});

	test("attributes omitted when empty", () => {
		const messages: SpanMessage[] = [];
		const span = makeSpan("no-attrs", {
			emitCallback: (msg) => messages.push(msg),
		});
		span.end(2_000_000n, Exit.succeed(undefined));

		expect(messages[0].data.attributes).toBeUndefined();
	});

	test("events omitted when empty", () => {
		const messages: SpanMessage[] = [];
		const span = makeSpan("no-events", {
			emitCallback: (msg) => messages.push(msg),
		});
		span.end(2_000_000n, Exit.succeed(undefined));

		expect(messages[0].data.events).toBeUndefined();
	});

	test("respects span kind parameter", () => {
		const span = makeSpan("client-span", { kind: "client" });
		expect(span.kind).toBe("client");

		const messages: SpanMessage[] = [];
		const span2 = makeSpan("server-span", {
			kind: "server",
			emitCallback: (msg) => messages.push(msg),
		});
		span2.end(2_000_000n, Exit.succeed(undefined));
		expect(messages[0].data.kind).toBe("server");
	});
});

// =============================================================================
// Tracer integration
// =============================================================================

describe("Tracer integration", () => {
	function makeSidecarTracer(messages: SpanMessage[], sessionId: string): Tracer.Tracer {
		return Tracer.make({
			span: (name, parent, context, links, startTime, kind) => {
				return new SidecarSpan(
					name,
					parent,
					context,
					links,
					startTime,
					kind ?? "internal",
					(msg) => messages.push(msg),
					sessionId,
				);
			},
			context: (f, _fiber) => f(),
		});
	}

	test("Effect.withSpan produces a span when tracer is provided", async () => {
		const messages: SpanMessage[] = [];
		const tracer = makeSidecarTracer(messages, "integration-session");

		const program = Effect.void.pipe(Effect.withSpan("test-operation"), Effect.withTracer(tracer));

		await Effect.runPromise(program);

		expect(messages).toHaveLength(1);
		expect(messages[0].data.name).toBe("test-operation");
		expect(messages[0].data.status?.code).toBe("ok");
		expect(messages[0].sessionId).toBe("integration-session");
	});

	test("Effect.withSpan captures failure", async () => {
		const messages: SpanMessage[] = [];
		const tracer = makeSidecarTracer(messages, "fail-session");

		const program = Effect.fail("boom").pipe(Effect.withSpan("failing-op"), Effect.withTracer(tracer));

		const result = await Effect.runPromiseExit(program);

		expect(Exit.isFailure(result)).toBe(true);
		expect(messages).toHaveLength(1);
		expect(messages[0].data.name).toBe("failing-op");
		expect(messages[0].data.status?.code).toBe("error");
	});

	test("nested Effect.withSpan propagates traceId", async () => {
		const messages: SpanMessage[] = [];
		const tracer = makeSidecarTracer(messages, "nested-session");

		const program = Effect.void.pipe(Effect.withSpan("inner"), Effect.withSpan("outer"), Effect.withTracer(tracer));

		await Effect.runPromise(program);

		expect(messages).toHaveLength(2);
		// Inner span ends first, then outer
		const innerMsg = messages.find((m) => m.data.name === "inner")!;
		const outerMsg = messages.find((m) => m.data.name === "outer")!;

		// Both should share the same traceId
		expect(innerMsg.data.traceId).toBe(outerMsg.data.traceId);
		// Inner should have outer as parent
		expect(innerMsg.data.parentSpanId).toBe(outerMsg.data.spanId);
	});
});
