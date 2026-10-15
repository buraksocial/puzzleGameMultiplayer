import { io } from 'socket.io-client';

// Production uses the public origin, never the visitor's localhost.
export const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

export const createSocket = () => io(serverUrl, { autoConnect: false });

export function peerOptions() {
  const url = new URL(import.meta.env.VITE_PEER_URL || '/peerjs', serverUrl);
  const iceServers = import.meta.env.VITE_ICE_SERVERS;
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    secure: url.protocol === 'https:',
    path: url.pathname,
    ...(iceServers ? { config: { iceServers: JSON.parse(iceServers) } } : {})
  };
}
