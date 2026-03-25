import type { SessionStartPipeline } from "claude-binary-plugin";

const handler: SessionStartPipeline<Record<string, never>> = () => {
	return {
		status: "executed" as const,
		summary: "Test plugin initialized",
	};
};

export default handler;
