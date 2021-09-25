import * as dgram from 'dgram';
import { Logging } from 'homebridge';
import { Commands } from './commands';
import { EncryptionService } from './encryptionService';

export interface DeviceInfo {
    bound: boolean;
    props: any;
    id: string;
    name: string;
    address: string;
    port: number;
    key: string;
};

export interface DeviceOptions {
    host: string;
    port: number;
    updateInterval: number;
    onStatus: (deviceModel: DeviceInfo) => void;
    onUpdate: (deviceModel: DeviceInfo) => void;
    onConnected: (deviceModel: DeviceInfo) => void;
    onError: (deviceModel: DeviceInfo) => void;
    onDisconnected: (deviceModel: DeviceInfo) => void;
}
/**
 * Class representing a single connected device
 */
export class Device {
    private socket: dgram.Socket;
    private readonly logger: Logging;
    private readonly encryptionService = new EncryptionService();
    deviceInfo: DeviceInfo;
    deviceOptions: DeviceOptions;

    /**
     * Create device model and establish UDP connection with remote host
     * @param {object} [options] Options
     * @param {string} [options.address] HVAC IP address
     * @callback [options.onStatus] Callback function run on each status update
     * @callback [options.onUpdate] Callback function run after command
     * @callback [options.onConnected] Callback function run once connection is established
     */
    constructor(options: DeviceOptions, logger: Logging) {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.logger = logger;

        //  Set defaults
        this.deviceOptions = {
            host: options.host,
            onStatus: options.onStatus || function () { },
            onUpdate: options.onUpdate || function () { },
            onConnected: options.onConnected || function () { },
            onError: options.onError || function () { },
            onDisconnected: options.onDisconnected || function () { },
            updateInterval: options.updateInterval || 10000,
            port: options.port,
        };

        this.logger.info('Connecting new C&H AC device');
        this.logger.info("host: %s", this.deviceOptions.host);
        this.logger.info("port: %s", this.deviceOptions.port);

        this.deviceInfo = {
            bound: false,
            props: {}
        } as DeviceInfo;

        // Initialize connection and bind with device
        this._connectToDevice(this.deviceOptions.host, this.deviceOptions.port);

        // Handle incoming messages
        this.socket.on('message', (msg, rinfo) => this._handleResponse(msg, rinfo));
    }

    /**
     * Initialize connection
     * @param {string} address - IP/host address
     * @param {int} port
     */
    _connectToDevice(address: string, port: number) {
        try {
            this.socket.bind(port, "0.0.0.0", () => {
                const message = new Buffer(JSON.stringify({ t: 'scan' }));
                this.socket.setBroadcast(false);
                this.socket.send(message, 0, message.length, 7000, address);
                this.logger.info('Sent scan message to identify devices');
            });
        } catch (err) {
            const timeout = 5;
            this.deviceOptions.onDisconnected(this.deviceInfo);
            setTimeout(() => {
                this._connectToDevice(address, port);
            }, timeout * 1000);
        }
    }

    /**
     * Register new device locally
     * @param {string} id - CID received in handshake message
     * @param {string} name - Device name received in handshake message
     * @param {string} address - IP/host address
     * @param {number} port - Port number
     */
    _setDevice(id: string, name: string, address: string, port: number) {
        this.deviceInfo.id = id;
        this.deviceInfo.name = name;
        this.deviceInfo.address = address;
        this.deviceInfo.port = port;
        this.deviceInfo.bound = false;
        this.deviceInfo.props = {};
        this.logger('Device identified %s, %s, %s, %s', id, name, address, port);
    }

    /**
     * Send binding request to device
     * @param {Device} device Device object
     */
    _sendBindRequest(deviceInfo: DeviceInfo) {
        const message = {
            mac: this.deviceInfo.id,
            t: 'bind',
            uid: 0
        };
        const encryptedBoundMessage = this.encryptionService.encrypt(message);
        const request = {
            cid: 'app',
            i: 1,
            t: 'pack',
            uid: 0,
            pack: encryptedBoundMessage
        };
        const toSend = new Buffer(JSON.stringify(request));
        this.socket.send(toSend, 0, toSend.length, deviceInfo.port, deviceInfo.address);
        this.logger.info('Sent bind request');
    }

    /**
     * Confirm device is bound and update device status on list
     * @param {String} id - Device ID
     * @param {String} key - Encryption key
     */
    _confirmBinding(id: string, key: string) {
        this.deviceInfo.bound = true;
        this.deviceInfo.key = key;
        this.logger.info('Binding confirmed');
    }

    /**
     * Confirm device is bound and update device status on list
     * @param {Device} device - Device
     */
    _requestDeviceStatus(deviceInfo: DeviceInfo) {
        const cmd: any = Commands;
        const message = {
            cols: Object.keys(cmd).map(key => cmd[key].code),
            mac: deviceInfo.id,
            t: 'status'
        };
        this._sendRequest(message, deviceInfo.address, deviceInfo.port);
    }

    /**
     * Handle UDP response from device
     * @param {string} msg Serialized JSON string with message
     * @param {object} rinfo Additional request information
     * @param {string} rinfo.address IP/host address
     * @param {number} rinfo.port Port number
     */
    _handleResponse(msg: any, rinfo: dgram.RemoteInfo) {
        if (rinfo.address !== this.deviceOptions.host) {
            this.logger.info('Received response from unexpected address %s', rinfo.address);

            return;
        }
        const message = JSON.parse(msg + '');
        try {
            // Extract encrypted package from message using device key (if available)
            const pack = this.encryptionService.decrypt(message, (this.deviceInfo || {}).key);
            // If package type is response to handshake
            if (pack.t === 'dev') {
                this._setDevice(message.cid, pack.name, rinfo.address, rinfo.port);
                this._sendBindRequest(this.deviceInfo);

                return;
            }

            // If package type is binding confirmation
            if (pack.t === 'bindok' && this.deviceInfo.id) {
                this._confirmBinding(message.cid, pack.key);

                // Start requesting device status on set interval
                setInterval(this._requestDeviceStatus.bind(this, this.deviceInfo), this.deviceOptions.updateInterval);
                this.logger.info('Sent first device status request');
                this.deviceOptions.onConnected(this.deviceInfo);

                return;
            }

            // If package type is device status
            if (pack.t === 'dat' && this.deviceInfo.bound) {
                pack.cols.forEach((col: any, i: any) => {
                    this.deviceInfo.props[col] = pack.dat[i];
                });
                this.deviceOptions.onStatus(this.deviceInfo);

                return;
            }

            // If package type is response, update device properties
            if (pack.t === 'res' && this.deviceInfo.bound) {
                pack.opt.forEach((opt: any, i: any) => {
                    this.deviceInfo.props[opt] = pack.val[i];
                });
                this.deviceOptions.onUpdate(this.deviceInfo);
                return;
            }
            this.deviceOptions.onError(this.deviceInfo);
        } catch (err) {
            this.deviceOptions.onError(this.deviceInfo);
        }
    }

    /**
     * Send commands to a bound device
     * @param {string[]} commands List of commands
     * @param {number[]} values List of values
     */
    _sendCommand(commands: any = [], values: any = []) {
        const message = {
            opt: commands,
            p: values,
            t: 'cmd'
        };
        this._sendRequest(message);
    };

    /**
     * Send request to a bound device
     * @param {object} message
     * @param {string[]} message.opt
     * @param {number[]} message.p
     * @param {string} message.t
     * @param {string} [address] IP/host address
     * @param {number} [port] Port number
     */
    _sendRequest(message: any, address = this.deviceInfo.address, port = this.deviceInfo.port) {
        const encryptedMessage = this.encryptionService.encrypt(message, this.deviceInfo.key);
        const request = {
            cid: 'app',
            i: 0,
            t: 'pack',
            uid: 0,
            pack: encryptedMessage
        };
        const serializedRequest = new Buffer(JSON.stringify(request));
        this.socket.send(serializedRequest, 0, serializedRequest.length, port, address);
    };

    /**
     * Turn on/off
     * @param {boolean} value State
     */
    setPower(value: boolean) {
        this._sendCommand(
            [Commands.power.code],
            [value ? 1 : 0]
        );
    };

    getPower() {
        return this.deviceInfo.props[Commands.power.code];
    };

    /**
     * Set target temperature
     * @param {number} value Temperature
     * @param {number} [unit=0] Units (defaults to Celsius)
     */
    setTargetTemp(value: number, unit = Commands.temperatureUnit.value.celsius) {
        this._sendCommand(
            [Commands.temperatureUnit.code, Commands.temperature.code],
            [unit, value]
        );
    };

    getTargetTemp() {
        return this.deviceInfo.props[Commands.temperature.code];
    };

    /**
     * Set mode
     * @param {number} value Mode value (0-4)
     */
    setMode(value: number) {
        this._sendCommand(
            [Commands.mode.code],
            [value]
        );
    };

    getMode() {
        return this.deviceInfo.props[Commands.mode.code];
    };

    /**
     * Set fan speed
     * @param {number} value Fan speed value (0-5)
     */
    setFanSpeed(value: number) {
        this._sendCommand(
            [Commands.fanSpeed.code],
            [value]
        );
    };

    getFanSpeed() {
        return this.deviceInfo.props[Commands.fanSpeed.code];
    };

    /**
     * Set vertical swing
     * @param {number} value Vertical swing value (0-11)
     */
    setSwingVert(value: number) {
        this._sendCommand(
            [Commands.swingVert.code],
            [value]
        );
    };

    getSwingVert() {
        return this.deviceInfo.props[Commands.swingVert.code];
    };

    getRoomTemp() {
        return this.deviceInfo.props[Commands.TemSen.code];
    };
}

