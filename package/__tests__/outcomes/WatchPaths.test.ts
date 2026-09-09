import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { Outcome } from "../../src/outcomes/Outcome.js";
import { WatchPaths } from "../../src/outcomes/WatchPaths.js";

describe("WatchPaths", () => {
	it("is an Outcome subclass", () => {
		const wp = new WatchPaths({ paths: ["src/**/*.ts"] });
		expect(Outcome.isOutcome(wp)).toBe(true);
	});

	it("has _tag 'WatchPaths'", () => {
		expect(WatchPaths._tag).toBe("WatchPaths");
	});

	it("stores paths array", () => {
		const wp = new WatchPaths({ paths: ["src/**/*.ts", "package.json"] });
		expect(wp.paths).toEqual(["src/**/*.ts", "package.json"]);
	});

	it("toResponse returns watchPaths array", () => {
		const wp = new WatchPaths({ paths: ["src/**/*.ts"] });
		expect(wp.toResponse()).toEqual({ watchPaths: ["src/**/*.ts"] });
	});

	it("toTelemetry returns outcome and pathCount", () => {
		const wp = new WatchPaths({ paths: ["a", "b", "c"] });
		expect(wp.toTelemetry()).toEqual({
			outcome: "watchPaths",
			pathCount: 3,
		});
	});

	it("validates through Schema", () => {
		const decoded = Schema.decodeUnknownSync(WatchPaths)({
			paths: ["test"],
		});
		expect(decoded).toBeInstanceOf(WatchPaths);
	});

	it("rejects missing paths", () => {
		expect(() => Schema.decodeUnknownSync(WatchPaths)({})).toThrow();
	});

	it("is extensible via .extend()", () => {
		class TaggedWatchPaths extends WatchPaths.extend<TaggedWatchPaths>("TaggedWatchPaths")({
			reason: Schema.String,
		}) {}
		const custom = new TaggedWatchPaths({
			paths: ["*.md"],
			reason: "docs changed",
		});
		expect(custom.paths).toEqual(["*.md"]);
		expect(custom.reason).toBe("docs changed");
		expect(Outcome.isOutcome(custom)).toBe(true);
	});
});
