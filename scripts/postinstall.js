#!/usr/bin/env node

/**
 * Lightweight postinstall script that prints the ECO logo.
 * Uses raw ANSI codes to avoid any dependency on chalk being installed.
 * Writes to stderr so npm doesn't suppress the output.
 */

const white = '\x1b[37m';
const bold = '\x1b[1m';
const reset = '\x1b[0m';

const lines = [
  ' ██████╗  ██████╗  ██████╗ ',
  '██╔════╝ ██╔════╝ ██╔═══██╗',
  '█████╗   ██║      ██║   ██║',
  '██╔══╝   ██║      ██║   ██║',
  '╚██████╗ ╚██████╗ ╚██████╔╝',
];

process.stderr.write('\n');
lines.forEach(line => process.stderr.write(`${white}${line}${reset}\n`));
process.stderr.write(`${white} ╚═════╝  ╚═════╝  ╚═════╝ ${reset}${bold} CLI${reset}\n`);
process.stderr.write('\n');
