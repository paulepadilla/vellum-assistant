// Browser interaction types.

export interface BrowserScreencastFrame {
  type: "browser_screencast_frame";
  conversationId: string;
  surfaceId: string;
  data: string; // base64 JPEG
  width: number;
  height: number;
}

// --- Domain-level union aliases (consumed by the barrel file) ---

export type _BrowserClientMessages = never;

export type _BrowserServerMessages = BrowserScreencastFrame;
