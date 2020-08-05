"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EggWsServer = exports.EggWebsocketRoom = void 0;
const assert = require("assert");
const compose = require("koa-compose");
const url = require("url");
const WebSocket = require("ws");
const Router = require("@eggjs/router");
const redis_1 = require("./adapter/redis");
const http = require('http');
let PubSubAdapter;
function isFunction(v) {
    return typeof v === 'function';
}
function isString(v) {
    return typeof v === 'string';
}
function getAdapter() {
    if (!PubSubAdapter) {
        throw new Error('[egg-websocket-plugin] no pub/sub adapter configure');
    }
    return PubSubAdapter;
}
// 运行 controller 并等待退出
function waitWebSocket(controller) {
    return ctx => {
        return new Promise((resolve, reject) => {
            ctx.websocket.on('close', resolve);
            ctx.websocket.on('error', reject);
            try {
                const ret = controller.call(ctx);
                if (ret instanceof Promise) {
                    ret.catch(reject);
                }
            }
            catch (e) {
                reject(e);
            }
        });
    };
}
class EggWebsocketRoom {
    constructor(conn) {
        this._roomHandlers = new Map();
        this.onMessage = ({ room, message, }) => {
            const roomName = room.toString();
            const handlers = this._roomHandlers.get(roomName);
            if (handlers) {
                handlers({ room, message });
            }
        };
        this._defaultHandler = ({ message }) => {
            this._conn.send(message);
        };
        this._conn = conn;
        this._joinedRooms = new Set();
        this._listening = false;
        this._conn.on('close', () => {
            this.leave(Array.from(this._joinedRooms));
        });
    }
    sendTo(room, data) {
        return getAdapter().publish(room, data);
    }
    sendJsonTo(room, data) {
        return getAdapter().publish(room, JSON.stringify(data));
    }
    join(rooms, fn) {
        const adapter = getAdapter();
        const newRooms = [];
        let handler;
        if (!fn) {
            handler = this._defaultHandler;
        }
        else {
            handler = fn;
        }
        let roomsArray;
        if (!Array.isArray(rooms)) {
            roomsArray = [rooms];
        }
        else {
            roomsArray = rooms;
        }
        roomsArray.forEach(room => {
            if (!this._joinedRooms.has(room)) {
                newRooms.push(room);
                this._joinedRooms.add(room);
            }
            this._roomHandlers.set(room, handler);
        });
        if (this._joinedRooms.size > 0 && !this._listening) {
            this._listening = true;
            adapter.addMessageHandler(this.onMessage);
        }
        return adapter.joinRoom(...newRooms);
    }
    leave(rooms) {
        const adapter = getAdapter();
        const leaveRooms = [];
        let roomsArray;
        if (!Array.isArray(rooms)) {
            roomsArray = [rooms];
        }
        else {
            roomsArray = rooms;
        }
        roomsArray.forEach(room => {
            if (this._joinedRooms.has(room)) {
                leaveRooms.push(room);
                this._joinedRooms.delete(room);
            }
            this._roomHandlers.delete(room);
        });
        if (this._joinedRooms.size <= 0 && this._listening) {
            this._listening = false;
            adapter.removeMessageHandler(this.onMessage);
        }
        return adapter.leaveRoom(...leaveRooms);
    }
}
exports.EggWebsocketRoom = EggWebsocketRoom;
// Egg Websocket Plugin
class EggWsServer {
    constructor(app) {
        this._router = new Router();
        this._upgradeHandler = (request, socket, head) => {
            if (!request.url) {
                return this.notFound(socket);
            }
            const pathname = url.parse(request.url).pathname;
            const matches = this._router.match(pathname, 'GET');
            // check if the route has a handler or not
            if (!matches.route) {
                return this.notFound(socket);
            }
            const controller = this._router.routes();
            // upgrade to websocket connection
            this.server.handleUpgrade(request, socket, head, conn => {
                this.server.emit('connection', conn, request);
                const ctx = this._app.createContext(request, new http.ServerResponse(request));
                const expandConn = conn;
                expandConn.room = new EggWebsocketRoom(conn);
                ctx.websocket = expandConn;
                controller(ctx).catch(e => {
                    // close websocket connection
                    if (!ctx.websocket.CLOSED) {
                        ctx.websocket.close();
                    }
                    ctx.onerror(e);
                });
            });
        };
        this.server = new WebSocket.Server({
            noServer: true,
        });
        this._app = app;
        this._middlewares = [];
        this.server.on('error', e => {
            app.logger.error('[egg-websocket-plugin] error: ', e);
        });
        if (app.config.websocket && app.config.websocket.redis) {
            PubSubAdapter = new redis_1.RedisPubSuber(app.config.websocket.redis);
        }
        // add ws object to app
        app.ws = this;
        app.on('server', server => {
            server.on('upgrade', this._upgradeHandler);
        });
    }
    static resolveController(controller, app) {
        if (isString(controller)) {
            const actions = controller.split('.');
            let obj = app.controller;
            actions.forEach(key => {
                obj = obj[key];
                assert(isFunction(obj), `[egg-websocket-plugin]: controller '${controller}' not exists`);
            });
            controller = obj;
        }
        // ensure controller is exists
        assert(isFunction(controller), '[egg-websocket-plugin]: controller not exists');
        return controller;
    }
    use(middleware) {
        assert(isFunction(middleware), '[egg-websocket-plugin] middleware should be a function');
        if (this._middlewares.includes(middleware)) {
            return;
        }
        this._middlewares.push(middleware);
    }
    route(path, ...middleware) {
        assert(middleware.length > 0, '[egg-websocket-plugin] controller not set');
        // get last middleware as handler
        const handler = middleware.pop();
        const app = this._app;
        let controller;
        if (isString(handler)) {
            // resolve handler from app's controller
            controller = EggWsServer.resolveController(handler, app);
        }
        else {
            controller = handler;
        }
        // check if need to use app middlewares
        let appMiddlewares = [];
        if (app.config.websocket &&
            app.config.websocket.useAppMiddlewares === true) {
            appMiddlewares = app.middleware;
        }
        const composedMiddleware = compose([
            ...appMiddlewares,
            ...this._middlewares,
            ...middleware,
            waitWebSocket(controller),
        ]);
        this._router.all(path, composedMiddleware);
    }
    sendTo(room, data) {
        return getAdapter().publish(room, data);
    }
    sendJsonTo(room, data) {
        return getAdapter().publish(room, JSON.stringify(data));
    }
    notFound(socket) {
        socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    }
}
exports.EggWsServer = EggWsServer;
exports.default = (app) => {
    new EggWsServer(app);
};
