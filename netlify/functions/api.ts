import serverless from 'serverless-http';
import { createSentinelApiApp } from '../../src/server/createApiApp.ts';

// Reuse the warm Sentinel API app across Netlify Function invocations
const { app } = createSentinelApiApp();

export const handler = serverless(app);
