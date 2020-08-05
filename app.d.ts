import * as WebSocket from 'ws';
import { Application } from 'egg';
export interface EggWsClient extends WebSocket {
    room: EggWebsocketRoom;
}
export interface PubSuber {
    publish(room: string, message: any): void;
    addMessageHandler(listener: Function): void;
    removeMessageHandler(listener: Function): void;
    joinRoom(...rooms: string[]): Promise<number>;
    leaveRoom(...rooms: string[]): Promise<number>;
}
export declare type RoomHandler = (params: {
    room: string;
    message: ArrayBufferLike | string;
}) => void;
export declare class EggWebsocketRoom {
    private _conn;
    private _joinedRooms;
    private _listening;
    private _roomHandlers;
    constructor(conn: WebSocket);
    sendTo(room: string, data: ArrayBufferLike | string): void;
    sendJsonTo(room: string, data: any): void;
    join(rooms: string | string[], fn?: RoomHandler): Promise<number>;
    leave(rooms: string | string[]): Promise<number>;
    private onMessage;
    private _defaultHandler;
}
export declare class EggWsServer {
    static resolveController(controller: any, app: any): any;
    server: WebSocket.Server;
    private _app;
    private _router;
    private _middlewares;
    constructor(app: Application);
    private _upgradeHandler;
    use(middleware: any): void;
    route(path: any, ...middleware: any[]): void;
    sendTo(room: string, data: ArrayBufferLike | string): void;
    sendJsonTo(room: string, data: any): void;
    private notFound;
}
declare const _default: (app: Application) => void;
export default _default;
