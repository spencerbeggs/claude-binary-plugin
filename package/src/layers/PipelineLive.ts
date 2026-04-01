import { Layer, pipe } from "effect";
import { ClaudeAccountInfoLive } from "./ClaudeAccountInfoLive.js";
import { EnvLoaderLive } from "./EnvLoaderLive.js";
import { EnvPersisterLive } from "./EnvPersisterLive.js";
import { GitInfoLive } from "./GitInfoLive.js";
import { OtelConfigLive } from "./OtelConfigLive.js";
import { PlatformInfoLive } from "./PlatformInfoLive.js";
import { PluginInfoServiceLive } from "./PluginInfoServiceLive.js";
import { SchemaValidatorLive } from "./SchemaValidatorLive.js";
import { SessionStoreLive } from "./SessionStoreLive.js";
import { ShellExecutorLive } from "./ShellExecutorLive.js";
import { SidecarConnectionLive } from "./SidecarConnectionLive.js";
import { StdinReaderLive } from "./StdinReaderLive.js";
import { TelemetryLive } from "./TelemetryLive.js";

const OtelClientLive = pipe(
	TelemetryLive,
	Layer.provide(SidecarConnectionLive),
	Layer.provide(OtelConfigLive),
	Layer.provide(PlatformInfoLive),
);

export const PipelineLive = Layer.mergeAll(
	StdinReaderLive,
	SchemaValidatorLive,
	EnvLoaderLive,
	EnvPersisterLive,
	SessionStoreLive,
	OtelClientLive,
	ShellExecutorLive,
	PluginInfoServiceLive,
	pipe(GitInfoLive, Layer.provide(ShellExecutorLive)),
	ClaudeAccountInfoLive,
);
