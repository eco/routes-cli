#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';

import 'reflect-metadata';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const majorVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (majorVersion < 18) {
    console.error(`Node.js >= 18 required. Current: ${process.version}`);
    process.exit(1);
  }

  const isVersion = process.argv.includes('--version') || process.argv.includes('-V');
  if (isVersion || process.argv.length <= 2) {
    const { logger } = await import('./utils/logger');
    logger.logo();

    if (isVersion) {
      const pkg = await import('../package.json');
      process.stdout.write(`${pkg.version}\n`);
      process.exit(0);
    }

    process.argv.push('--help');
  }

  await CommandFactory.run(AppModule, {
    logger: false,
    errorHandler: err => {
      if (err.message === '(outputHelp)') process.exit(0);
      console.error(err.message);
      if (process.env['DEBUG']) console.error(err.stack);
      process.exit(1);
    },
  });
}

void bootstrap();
