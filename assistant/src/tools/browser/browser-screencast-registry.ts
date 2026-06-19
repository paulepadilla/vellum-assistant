import type { ServerMessage } from "../../daemon/message-protocol.js";

// Registry of sendToClient callbacks per conversation
const conversationSenders = new Map<string, (msg: ServerMessage) => void>();

/**
 * Register a sendToClient callback for a conversation.
 * Called from conversation-tool-setup when the conversation is created.
 */
export function registerConversationSender(
  conversationId: string,
  sendToClient: (msg: ServerMessage) => void,
): void {
  conversationSenders.set(conversationId, sendToClient);
}

/**
 * Unregister the sendToClient callback for a conversation.
 */
export function unregisterConversationSender(conversationId: string): void {
  conversationSenders.delete(conversationId);
}

export function getSender(
  conversationId: string,
): ((msg: ServerMessage) => void) | undefined {
  return conversationSenders.get(conversationId);
}
