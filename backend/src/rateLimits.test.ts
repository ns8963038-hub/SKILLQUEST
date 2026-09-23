import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeLimit } from './rateLimits';

// A tiny app: a fake sign-in reads the student from a header, then the limit.
function appWithLimit(limit: number) {
  const app = express();
  app.use((req, _res, next) => {
    req.userId = req.header('x-student') ?? undefined;
    next();
  });
  app.post('/run', makeLimit(limit, 'slow down'), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('per-student rate limit', () => {
  it('lets a student run code 10 times a minute, then answers 429', async () => {
    const app = appWithLimit(10);
    for (let i = 0; i < 10; i++) expect((await request(app).post('/run').set('x-student', 'asha')).status).toBe(200);
    const blocked = await request(app).post('/run').set('x-student', 'asha');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'rate_limited', message: 'slow down' });
  });

  it('counts each student separately, even from the same lab IP', async () => {
    const app = appWithLimit(2);
    await request(app).post('/run').set('x-student', 'asha');
    await request(app).post('/run').set('x-student', 'asha');
    expect((await request(app).post('/run').set('x-student', 'asha')).status).toBe(429);
    expect((await request(app).post('/run').set('x-student', 'ravi')).status).toBe(200);
  });
});
