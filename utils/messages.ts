/**
 * @file ScreenBolt — Message Passing Utility
 * Type-safe message sending/receiving helpers and message validation.
 * Provides consistent message format across all extension components.
 */

import { MESSAGE_TYPES, type MessageType } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('Messages');

/** Set of all valid message types for validation */
const VALID_TYPES: Set<string> = new Set(Object.values(MESSAGE_TYPES));

/** Standard message envelope sent via chrome.runtime/tabs */
export interface ExtensionMessage {
  action: string;
  [key: string]: unknown;
}

/** Response shape returned by sendMessage / sendToTab */
export interface MessageResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Send a message to the background service worker with standard format.
 * Warns (but does not throw) when the action is not in MESSAGE_TYPES.
 */
export async function sendMessage(
  action: MessageType,
  payload: Record<string, unknown> = {},
): Promise<MessageResponse> {
  if (!VALID_TYPES.has(action)) {
    log.warn('Sending unknown message type:', action);
  }

  try {
    const response: MessageResponse | undefined =
      await chrome.runtime.sendMessage({ action, ...payload });
    return response ?? { success: false, error: 'No response' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Message "${action}" failed:`, message);
    return { success: false, error: message };
  }
}

/** Send a message to a specific tab's content script. */
export async function sendToTab(
  tabId: number,
  action: MessageType,
  payload: Record<string, unknown> = {},
): Promise<MessageResponse> {
  try {
    const response: MessageResponse | undefined =
      await chrome.tabs.sendMessage(tabId, { action, ...payload });
    return response ?? { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Message to tab ${tabId} failed:`, message);
    return { success: false, error: message };
  }
}

/** Validate that an incoming message has the expected structure. */
export function isValidMessage(message: unknown): message is ExtensionMessage {
  return (
    message !== null &&
    message !== undefined &&
    typeof message === 'object' &&
    'action' in message &&
    typeof (message as ExtensionMessage).action === 'string' &&
    (message as ExtensionMessage).action.length > 0
  );
}

/** Check if a message action is a known type defined in MESSAGE_TYPES. */
export function isKnownAction(action: string): action is MessageType {
  return VALID_TYPES.has(action);
}
