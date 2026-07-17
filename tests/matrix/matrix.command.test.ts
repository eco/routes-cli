import { MatrixCommand } from '@/cli/commands/matrix.command';

describe('MatrixCommand', () => {
  it('passes quote-only mode to MatrixService', async () => {
    const matrixService = { run: jest.fn().mockResolvedValue(undefined) };
    const display = { title: jest.fn() };
    const command = new MatrixCommand(matrixService as never, display as never);

    await command.run([], {
      config: 'config/matrix-pairs-a2a-production.json',
      timeout: 30,
      quoteOnly: true,
    });

    expect(matrixService.run).toHaveBeenCalledWith({
      configPath: 'config/matrix-pairs-a2a-production.json',
      timeoutSec: 30,
      quoteOnly: true,
    });
  });
});
