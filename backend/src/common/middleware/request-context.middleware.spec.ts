import { EventEmitter } from 'node:events';
import { RequestContextMiddleware } from './request-context.middleware';

describe('production request aggregates', () => {
  const oldEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = oldEnvironment;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('emits bounded route/status latency buckets without individual successful requests', () => {
    process.env.NODE_ENV = 'production';
    jest.useFakeTimers();
    const output = jest.spyOn(console, 'log').mockImplementation();
    const middleware = new RequestContextMiddleware();

    for (const statusCode of [200, 200]) {
      const response = new EventEmitter() as EventEmitter & { statusCode: number; setHeader: jest.Mock };
      response.statusCode = statusCode;
      response.setHeader = jest.fn();
      middleware.use({ header: () => undefined, method: 'GET', route: { path: '/tests/:testId/questions' } } as never,
        response as never, jest.fn());
      response.emit('finish');
    }

    expect(output).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000);
    expect(output).toHaveBeenCalledTimes(1);
    const event = JSON.parse(output.mock.calls[0][0]);
    expect(event).toMatchObject({ event: 'http_request_aggregate', method: 'GET',
      route: '/tests/:testId/questions', status_class: 2, requests: 2 });
    expect(event.buckets.reduce((sum: number, count: number) => sum + count, 0)).toBe(2);
    expect(JSON.stringify(event)).not.toContain('request_id');
  });
});
