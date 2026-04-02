import { AddContext, MarkdownContext } from "claude-binary-plugin";
import type { Handlers } from "../plugin.config.js";

const handler: Handlers["SessionStart"] = ({ state }) => {
	const ctx = new MarkdownContext()
		.heading(2, "Test Plugin Environment")
		.list([
			`Package manager: ${state.packageManager} (exec: ${state.getPmExec()})`,
			`Git available: ${state.git}`,
			`Bun available: ${state.bun}`,
		]);

	if (!state.canUseGit()) {
		ctx.rule("Git is not available — do not attempt git operations");
	}

	return AddContext.make({
		context: ctx,
		summary: "injected environment context",
	});
};

export default handler;
