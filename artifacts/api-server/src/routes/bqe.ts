import { Router, type IRouter } from "express";
import { BqeConnectionError, getBqeAccessToken } from "../lib/bqe";
import { requireDashboardAccess } from "../middlewares/requireDashboardAccess";

const router: IRouter = Router();
router.use(requireDashboardAccess);

router.get("/bqe/test", async (req, res): Promise<void> => {
  try {
    const { accessToken, apiBase } = await getBqeAccessToken();
    const projectUrl = new URL(
      `${apiBase.replace(/\/+$/, "")}/project`,
    );
    projectUrl.searchParams.set("where", "code='23-0091'");

    const response = await fetch(projectUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await response.text();

    if (!response.ok) {
      req.log.error(
        { statusCode: response.status },
        "BQE project request failed",
      );
      res.status(502).json({
        error: `BQE project request failed with HTTP ${response.status}.`,
      });
      return;
    }

    res.type("application/json").send(body);
  } catch (error: unknown) {
    if (error instanceof BqeConnectionError) {
      req.log.error(
        {
          statusCode: error.statusCode,
          requiresReauthorization: error.requiresReauthorization,
        },
        "BQE connection request failed",
      );
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    req.log.error({ err: error }, "BQE project request failed unexpectedly");
    res.status(502).json({
      error: "BQE project request failed unexpectedly.",
    });
  }
});

export default router;