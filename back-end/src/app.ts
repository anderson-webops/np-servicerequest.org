import cors from "cors";
import express from "express";
import helmet from "helmet";

import { SubmissionValidationError, isSubmissionKind, saveSubmission } from "./submissions.js";

const startedAt = Date.now();
let pageview = 0;

export function createApp() {
	const app = express();

	app.disable("x-powered-by");
	app.use(helmet({ contentSecurityPolicy: false }));
	app.use(cors({ origin: true, credentials: true }));
	app.use(express.json());

	app.get("/api/health", (_request, response) => {
		response.json({
			ok: true,
			startedAt
		});
	});

	app.get("/api/pageview", (_request, response) => {
		response.json({
			pageview: pageview++,
			startAt: startedAt
		});
	});

	app.post("/api/submissions/:kind", async (request, response) => {
		const { kind } = request.params;

		if (!isSubmissionKind(kind)) {
			response.status(404).json({
				message: "Unknown submission type."
			});
			return;
		}

		try {
			const result = await saveSubmission({
				kind,
				rawPayload: request.body,
				ip: request.ip,
				userAgent: request.get("user-agent")
			});

			response.status(result.accepted ? 201 : 202).json({
				ok: true,
				id: result.id,
				accepted: result.accepted,
				createdAt: result.createdAt
			});
		}
		catch (error) {
			if (error instanceof SubmissionValidationError) {
				response.status(400).json({
					message: error.message
				});
				return;
			}

			console.error("Failed to store submission:", error);
			response.status(500).json({
				message: "Unable to store your submission right now."
			});
		}
	});

	return app;
}
