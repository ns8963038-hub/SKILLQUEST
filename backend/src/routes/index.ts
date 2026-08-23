import { Router } from 'express';
import { meRouter } from './me';
import { onboardingRouter } from './onboarding';
import { roadmapRouter } from './roadmap';
import { levelsRouter } from './levels';
import { dashboardRouter } from './dashboard';
import { placementRouter } from './placement';

// All authenticated API routes, combined. Mounted under /api behind requireAuth.
export const apiRouter = Router();
apiRouter.use(meRouter);
apiRouter.use(onboardingRouter);
apiRouter.use(roadmapRouter);
apiRouter.use(levelsRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(placementRouter);
