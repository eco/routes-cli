import { PortalIdlTypes } from '@/commons/types/portal-idl.type';
import { Snakify } from '@/commons/types/snake-case.types';

export type RouteInstruction = Snakify<PortalIdlTypes['route']>;
export type RewardInstruction = Snakify<PortalIdlTypes['reward']>;
export type CalldataInstruction = Snakify<PortalIdlTypes['calldata']>;
export type CalldataWithAccountsInstruction = Snakify<PortalIdlTypes['calldataWithAccounts']>;

// Events
export type IntentPublishedInstruction = Snakify<PortalIdlTypes['intentPublished']>;
export type IntentFulfilledInstruction = Snakify<PortalIdlTypes['intentFulfilled']>;
export type IntentWithdrawnInstruction = Snakify<PortalIdlTypes['intentWithdrawn']>;
