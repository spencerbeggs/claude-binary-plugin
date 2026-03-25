import { Context, Schema } from "effect";

export class OtelConfigData extends Schema.Class<OtelConfigData>("OtelConfigData")({
	enabled: Schema.Boolean,
	endpoint: Schema.optional(Schema.String),
	protocol: Schema.optional(Schema.Literal("http", "grpc")),
	serviceName: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
	socketPath: Schema.optional(Schema.String),
}) {}

export class OtelConfig extends Context.Tag("OtelConfig")<OtelConfig, OtelConfigData>() {}
