export {};

declare global {
  interface Window {
    io?: (options?: { withCredentials?: boolean }) => {
      connected: boolean;
      on: (event: string, listener: (payload?: unknown) => void) => void;
      disconnect: () => void;
    };
  }
}
