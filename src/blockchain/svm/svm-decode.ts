/**
 * SVM Transaction Decoding Module
 * Handles decoding of Solana transaction data and program events
 */

import { EventParser, Program } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';

import { logger } from '@/utils/logger';

import { arrayToHex, bufferToHex } from './svm-buffer-utils';
import { DecodedEvent, DecodedIntentPublished, SvmError, SvmErrorType } from './svm-types';

/**
 * Decodes transaction logs to extract program events
 */
export async function decodeTransactionLogs(
  connection: Connection,
  signature: string,
  program: Program
): Promise<DecodedEvent[]> {
  try {
    // Fetch the transaction with logs
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
    });

    if (!transaction || !transaction.meta) {
      throw new Error('Transaction not found or missing metadata');
    }

    // Extract logs from the transaction
    const logs = transaction.meta.logMessages || [];

    // Parse events from logs using Anchor's event parser
    const events = parseEventsFromLogs(logs, program);

    return events;
  } catch (error: any) {
    logger.warn(`Failed to decode transaction logs: ${error.message}`);
    // Return empty array if decoding fails - this is non-critical
    return [];
  }
}

/**
 * Parses events from transaction logs using Anchor's EventParser
 */
function parseEventsFromLogs(logs: string[], program: Program): DecodedEvent[] {
  try {
    const eventParser = new EventParser(program.programId, program.coder);
    const events: DecodedEvent[] = [];

    // Parse all events from logs
    const parsedLogs = eventParser.parseLogs(logs);
    for (const event of parsedLogs) {
      events.push({
        name: event.name,
        data: event.data,
      });
    }

    return events;
  } catch (error: any) {
    logger.warn(`Failed to parse events from logs: ${error.message}`);
    return [];
  }
}

/**
 * Extracts and decodes IntentPublished event from transaction
 */
export async function extractIntentPublishedEvent(
  connection: Connection,
  signature: string,
  program: Program
): Promise<DecodedIntentPublished | null> {
  try {
    const events = await decodeTransactionLogs(connection, signature, program);

    // Find IntentPublished event
    const intentPublishedEvent = events.find(event => event.name === 'IntentPublished');

    if (!intentPublishedEvent) {
      logger.warn('IntentPublished event not found in transaction logs');
      return null;
    }

    // Transform the event data to our format
    return transformIntentPublishedEvent(intentPublishedEvent.data);
  } catch (error: any) {
    logger.warn(`Failed to extract IntentPublished event: ${error.message}`);
    return null;
  }
}

/**
 * Transforms raw event data to DecodedIntentPublished format
 */
function transformIntentPublishedEvent(eventData: any): DecodedIntentPublished {
  try {
    // Convert intent_hash array to hex string if it's an array
    const intentHash = Array.isArray(eventData.intentHash)
      ? bufferToHex(Buffer.from(eventData.intentHash))
      : eventData.intentHash;

    // Convert route bytes to hex string if it's an array
    const route = Array.isArray(eventData.route)
      ? bufferToHex(Buffer.from(eventData.route))
      : eventData.route;

    return {
      intentHash,
      destination: eventData.destination?.toString() || '',
      route,
      reward: {
        deadline: eventData.reward?.deadline?.toString() || '0',
        creator: eventData.reward?.creator?.toString() || '',
        prover: eventData.reward?.prover?.toString() || '',
        nativeAmount: eventData.reward?.nativeAmount?.toString() || '0',
        tokens:
          eventData.reward?.tokens?.map((token: any) => ({
            token: token.token?.toString() || '',
            amount: token.amount?.toString() || '0',
          })) || [],
      },
    };
  } catch (error: any) {
    throw new SvmError(
      SvmErrorType.TRANSACTION_FAILED,
      'Failed to transform IntentPublished event',
      error
    );
  }
}

/**
 * Decodes instruction data from a transaction
 */
export async function decodeInstructionData(
  program: Program,
  instructionData: Buffer,
  instructionName: string
): Promise<any> {
  try {
    // For now, we'll just log the instruction name
    // Actual decoding would require the instruction discriminator
    logger.info(`Processing ${instructionName} instruction`);
    return { name: instructionName };
  } catch (error: any) {
    logger.warn(`Failed to decode instruction data: ${error.message}`);
    return null;
  }
}

/**
 * Fetches and logs detailed transaction information
 */
export async function logTransactionDetails(
  connection: Connection,
  signature: string,
  program: Program
): Promise<void> {
  try {
    // Fetch parsed transaction
    const parsedTx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
    });

    if (!parsedTx) {
      logger.warn('Could not fetch parsed transaction');
      return;
    }

    // Log basic transaction info
    logger.info('Transaction Details:');
    logger.info(`  Signature: ${signature}`);
    logger.info(`  Slot: ${parsedTx.slot}`);
    logger.info(
      `  Block Time: ${parsedTx.blockTime ? new Date(parsedTx.blockTime * 1000).toISOString() : 'Unknown'}`
    );
    logger.info(`  Fee: ${parsedTx.meta?.fee} lamports`);

    // Decode and log events
    const events = await decodeTransactionLogs(connection, signature, program);
    if (events.length > 0) {
      logger.info('Decoded Events:');
      events.forEach((event, index) => {
        logger.info(`  Event ${index + 1}: ${event.name}`);

        if ('intentHash' in event.data)
          event.data.intentHash = arrayToHex(event.data.intentHash[0]);
        if ('route' in event.data) event.data.route = bufferToHex(event.data.route);

        logger.info(`    Data: ${JSON.stringify(event.data, null, 2)}`);
      });
    }

    // Log any errors
    if (parsedTx.meta?.err) {
      logger.error(`Transaction Error: ${JSON.stringify(parsedTx.meta.err)}`);
    }
  } catch (error: any) {
    logger.warn(`Failed to log transaction details: ${error.message}`);
  }
}
