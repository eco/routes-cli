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

  if (process.argv.length <= 2) {
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
