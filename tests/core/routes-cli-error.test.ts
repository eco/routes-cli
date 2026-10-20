import { ErrorCode, RoutesCliError } from '@/shared/errors';

describe('RoutesCliError.apiError', () => {
  it('formats a problem with code, title, detail and request id', () => {
    const err = RoutesCliError.apiError(
      {
        status: 400,
        code: 'no-route-found',
        title: 'No route',
        detail: 'No solver quoted 8453→5042',
      },
      'req-1'
    );
    expect(err).toBeInstanceOf(RoutesCliError);
    expect(err.code).toBe(ErrorCode.QUOTE_SERVICE_ERROR);
    expect(err.message).toContain('no-route-found');
    expect(err.message).toContain('No route');
    expect(err.message).toContain('No solver quoted 8453→5042');
    expect(err.message).toContain('req-1');
    expect(err.isUserError).toBe(false);
  });

  it.each([
    [{ status: 401, code: 'unauthorized', title: 'Unauthorized' }],
    [{ status: 403, code: 'forbidden', title: 'Forbidden' }],
    [{ status: 400, code: 'invalid-api-key', title: 'API key is missing, unknown, or revoked' }],
  ])('marks auth problems as user errors and names ECO_API_KEY: %j', problem => {
    expect(RoutesCliError.isAuthProblem(problem)).toBe(true);
    const err = RoutesCliError.apiError(problem);
    expect(err.isUserError).toBe(true);
    expect(err.message).toContain('ECO_API_KEY');
  });
});
