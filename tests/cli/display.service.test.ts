import { DisplayService } from '@/cli/services/display.service';

describe('DisplayService JSON mode', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('routes log/title/section/success/displayTable to stderr when enabled', () => {
    const display = new DisplayService();
    display.setJsonMode(true);
    display.log('a');
    display.title('b');
    display.section('c');
    display.success('d');
    display.displayTable(['h'], [['v']]);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('keeps stdout for human output when disabled', () => {
    const display = new DisplayService();
    display.log('a');
    expect(stdoutSpy).toHaveBeenCalled();
  });
});
