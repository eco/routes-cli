#!/usr/bin/env node

/**
 * Lightweight postinstall script that prints the ECO logo.
 * Intentionally avoids importing the app bundle to keep install fast.
 */

try {
  const chalk = require('chalk');

  const lines = [
    ' ██████╗  ██████╗  ██████╗ ',
    '██╔════╝ ██╔════╝ ██╔═══██╗',
    '█████╗   ██║      ██║   ██║',
    '██╔══╝   ██║      ██║   ██║',
    '╚██████╗ ╚██████╗ ╚██████╔╝',
    ' ╚═════╝  ╚═════╝  ╚═════╝ ',
  ];

  console.log('');
  lines.forEach(line => console.log(chalk.white(line)));
  console.log(chalk.white.bold('                     CLI'));
  console.log('');
} catch {
  // chalk may not be available in all environments — skip silently
}
