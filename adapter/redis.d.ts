/// <reference types="node" />
import { PubSuber } from '../app';
import { Redis, RedisOptions } from 'ioredis';
export declare class RedisPubSuber implements PubSuber {
    static TYPE_BINARY: string;
    static TYPE_STRING: string;
    publisher: Redis;
    subscriber: Redis;
    joinedRoomCounter: Map<string, number>;
    handlers: Set<Function>;
    listening: boolean;
    constructor(config: RedisOptions);
    publish(room: string, message: any): any;
    addMessageHandler(listener: Function): void;
    removeMessageHandler(listener: Function): void;
    handleMessage: (room: string | ArrayBufferLike, msg: any) => void;
    _processMessage(message: Buffer): {
        type: string;
        message: Buffer;
    } | {
        type: string;
        message: string;
    } | null;
    joinRoom(...rooms: string[]): any;
    leaveRoom(...rooms: string[]): any;
    private _addRoomCounter;
    private _deleteRoomCounter;
}
