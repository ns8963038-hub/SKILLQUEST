import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('GET /health', () => {
  it('returns ok with a db status', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    // db is "up" once Supabase is configured, "down" before that — both are valid.
    expect(['up', 'down']).toContain(res.body.db);
  });
});
