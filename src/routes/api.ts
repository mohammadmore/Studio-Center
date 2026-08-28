import express from "express";
import { apiAuthGuard } from "../middleware/auth.js";
import usersRouter from "./api_routes/users.js";
import authRouter from "./api_routes/auth.js";
import dashboardRouter from "./api_routes/dashboard.js";
import collectionsRouter from "./api_routes/collections.js";
import contentsRouter from "./api_routes/contents.js";
import eventsRouter from "./api_routes/events.js";
import settingsRouter from "./api_routes/settings.js";
import leavesRouter from "./api_routes/leaves.js";
import mediaRouter from "./api_routes/media.js";
import notificationsRouter from "./api_routes/notifications.js";
import clientRouter from "./api_routes/client.js";
import financesRouter from "./api_routes/finances.js";

const apiRouter = express.Router();
apiRouter.use(apiAuthGuard);













apiRouter.use("/", usersRouter);
apiRouter.use("/", authRouter);
apiRouter.use("/", dashboardRouter);
apiRouter.use("/", collectionsRouter);
apiRouter.use("/", contentsRouter);
apiRouter.use("/", eventsRouter);
apiRouter.use("/", settingsRouter);
apiRouter.use("/", leavesRouter);
apiRouter.use("/", mediaRouter);
apiRouter.use("/", notificationsRouter);
apiRouter.use("/", clientRouter);
apiRouter.use("/", financesRouter);

export default apiRouter;
