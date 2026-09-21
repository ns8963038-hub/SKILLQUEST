import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AiUnavailableError, aiWakeUrl, mapGoal } from './aiClient';
import { errorHandler } from './errors';

describe('aiWakeUrl', () => {
  it('is the AI service health check, which the browser pokes to wake it', () => {
    expect(aiWakeUrl()).toMatch(/^https?:\/\/[^/]+.*\/health$/);
    expect(aiWakeUrl()).not.toMatch(/\/\/health$/); // no doubled slash
  });
});

describe('callAi retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries while the AI service is waking up (502), then succeeds', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;
        return Promise.resolve(
          calls < 3
            ? { ok: false, status: 502, json: () => Promise.resolve({}) }
            : { ok: true, status: 200, json: () => Promise.resolve({ goalCategory: 'service_placement', confidence: 0.8 }) },
        );
      }),
    );
    const promise = mapGoal('get placed');
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(promise).resolves.toEqual({ goalCategory: 'service_placement', confidence: 0.8 });
    expect(calls).toBe(3);
  });

  it('retries a dropped connection the same way', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new TypeError('fetch failed'))
          : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ goalCategory: 'dsa', confidence: 0.7 }) });
      }),
    );
    const promise = mapGoal('dsa');
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(promise).resolves.toEqual({ goalCategory: 'dsa', confidence: 0.7 });
  });

  it('gives up with AiUnavailableError after about 45 s of a service that never wakes', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = mapGoal('get placed');
    const outcome = expect(promise).rejects.toBeInstanceOf(AiUnavailableError);
    await vi.advanceTimersByTimeAsync(44_000);
    expect(fetchMock.mock.calls.length).toBeLessThan(6); // still waiting at 44 s
    await vi.advanceTimersByTimeAsync(2_000);
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(6); // the first try plus five retries
  });

  it('does not retry a real error', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(mapGoal('x')).rejects.toThrow(/401/);
    await expect(mapGoal('x')).rejects.not.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('errorHandler', () => {
  // A tiny app whose only route throws the given error.
  const appThrowing = (err: Error) => {
    const app = express();
    app.get('/boom', (_req, _res, next) => next(err));
    app.use(errorHandler);
    return app;
  };

  it('turns a sleeping AI service into a 503 the frontend can recognise', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(appThrowing(new AiUnavailableError('/ai/goal-map', 'status 502'))).get('/boom');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ai_unavailable');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('keeps every other failure a generic 500 that leaks nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(appThrowing(new Error('secret detail'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal error' });
    log.mockRestore();
  });
});
