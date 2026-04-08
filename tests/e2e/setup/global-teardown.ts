import { execFileSync } from 'child_process';
import path from 'path';

const COMPOSE_FILE = path.resolve(__dirname, '../docker-compose.e2e.yml');

export default function globalTeardown(): void {
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '--volumes'], {
    stdio: 'inherit',
  });
}
