import { io } from "socket.io-client";
import { API_BASE } from "./api";

export function createSocket(token) {
  return io(API_BASE, {
    transports: ["websocket"],
    auth: { token },
    reconnection: true
  });
}
