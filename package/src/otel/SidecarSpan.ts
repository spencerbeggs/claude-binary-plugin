import type { Context, Exit, Option, Tracer } from "effect";
import { Cause, Exit as ExitModule, Option as O } from "effect";
import type { SpanData, SpanEvent, SpanMessage } from "./protocol.js";

/**
 * Generate a random hex string for span/trace IDs.
 * @internal
 */
function randomHex(bytes: number): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Extract a span ID from an AnySpan (either a Span or ExternalSpan).
 * @internal
 */
function getSpanId(span: Tracer.AnySpan): string {
	return span.spanId;
}

/**
 * A custom Effect Tracer.Span that bridges Effect.withSpan to the OTEL sidecar IPC.
 *
 * When a span ends, it serializes collected data as a SpanMessage and invokes
 * the provided emit callback (which routes to SidecarConnection.emit).
 *
 * @public
 */
export class SidecarSpan implements Tracer.Span {
	readonly _tag = "Span" as const;
	readonly spanId: string;
	readonly traceId: string;
	readonly name: string;
	readonly parent: Option.Option<Tracer.AnySpan>;
	readonly context: Context.Context<never>;
	readonly links: ReadonlyArray<Tracer.SpanLink>;
	readonly sampled: boolean = true;
	readonly kind: Tracer.SpanKind;

	status: Tracer.SpanStatus;
	attributes: ReadonlyMap<string, unknown>;

	private readonly _events: SpanEvent[] = [];
	private readonly _emitCallback: (message: SpanMessage) => void;
	private readonly _sessionId: string;

	constructor(
		name: string,
		parent: Option.Option<Tracer.AnySpan>,
		context: Context.Context<never>,
		links: ReadonlyArray<Tracer.SpanLink>,
		startTime: bigint,
		kind: Tracer.SpanKind,
		emitCallback: (message: SpanMessage) => void,
		sessionId: string,
	) {
		this.name = name;
		this.parent = parent;
		this.context = context;
		this.links = [...links];
		this.kind = kind;
		this._emitCallback = emitCallback;
		this._sessionId = sessionId;

		this.spanId = randomHex(8);
		this.traceId = O.isSome(parent) ? parent.value.traceId : randomHex(16);

		this.status = { _tag: "Started", startTime };
		this.attributes = new Map();
	}

	attribute(key: string, value: unknown): void {
		(this.attributes as Map<string, unknown>).set(key, value);
	}

	event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
		const spanEvent: SpanEvent = {
			name,
			timeNs: startTime,
			...(attributes !== undefined && { attributes: attributes as Record<string, string | number | boolean> }),
		};
		this._events.push(spanEvent);
	}

	addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
		(this.links as Tracer.SpanLink[]).push(...links);
	}

	end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
		const startTime = this.status._tag === "Started" ? this.status.startTime : endTime;

		this.status = {
			_tag: "Ended",
			startTime,
			endTime,
			exit,
		};

		// Build attributes record from the Map
		const attrs: Record<string, string | number | boolean> = {};
		for (const [key, value] of this.attributes) {
			if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
				attrs[key] = value;
			}
		}

		// Determine status code from exit
		const isSuccess = ExitModule.isSuccess(exit);
		let statusMessage: string | undefined;
		if (!isSuccess && ExitModule.isFailure(exit)) {
			statusMessage = Cause.pretty(exit.cause);
		}

		// Build SpanData as a complete object (Schema.Class fields are readonly)
		const spanData: SpanData = {
			spanId: this.spanId,
			traceId: this.traceId,
			name: this.name,
			kind: this.kind,
			startTimeNs: startTime,
			endTimeNs: endTime,
			status: {
				code: isSuccess ? "ok" : "error",
				...(statusMessage !== undefined && { message: statusMessage }),
			},
			...(O.isSome(this.parent) && { parentSpanId: getSpanId(this.parent.value) }),
			...(Object.keys(attrs).length > 0 && { attributes: attrs }),
			...(this._events.length > 0 && { events: this._events }),
		};

		// Emit the span message
		const message: SpanMessage = {
			type: "span",
			sessionId: this._sessionId,
			data: spanData,
		};

		this._emitCallback(message);
	}
}
