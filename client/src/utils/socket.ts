import { io, Socket } from 'socket.io-client';
import { getAuthTokenValue } from '../services/api';

// Production (Vercel) serves the site and the API from different hosts, and Vercel can't forward
// WebSockets, so connect straight to the API server. In development VITE_API_URL is unset and the
// Vite dev server forwards /socket.io to the local API.
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
const URL = apiUrl ? new globalThis.URL(apiUrl).origin : '/';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    // Re-evaluated on every (re)connect, so the server always sees a fresh Clerk token.
    // Signed-out visitors connect without one and can watch rooms but not broadcast.
    socket = io(URL, {
      auth: (cb) => {
        getAuthTokenValue().then(token => cb({ token })).catch(() => cb({ token: null }));
      },
    });
  }
  return socket;
};

/** Reconnect so the server re-reads our identity after signing in or out. */
export const reconnectSocket = () => {
  if (socket) {
    socket.disconnect().connect();
  }
};
