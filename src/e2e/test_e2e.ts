import { Logging } from 'homebridge';
import { Device, DeviceInfo, DeviceOptions } from '../lib/deviceFactory';
import { delay } from '../lib/promices';

const logger = {
  info: (...args) => {
    console.log(args.join(' '));
  },
  debug: (...args) => {
    console.log(args.join(' '));
  },
  warn: (...args) => {
    console.log(args.join(' '));
  },
  error: (...args) => {
    console.log(args.join(' '));
  },
  log: (...args) => {
    console.log(args.join(' '));
  },
  prefix: '',
};

const deviceE2E = async () => {
  const host = '192.168.200.69';
  const acPort = 7000; //8000 + parseInt(host.split('.')[3])

  const deviceOptions: DeviceOptions = {
    host: host,
    port: acPort,
    updateInterval: 1000,
    onStatus: (deviceInfo: DeviceInfo) => {
      logger.info(
        'Status updated: %s props: %s',
        deviceInfo.name,
        JSON.stringify(deviceInfo.props),
      );

      if (deviceInfo.bound === false) {
        return;
      }
    },
    onUpdate: (deviceInfo: DeviceInfo) => {
      logger.info('Status updated on %s', deviceInfo.name);
    },
    onConnected: (deviceInfo: DeviceInfo) => {
      logger.info('Connected to: %s', deviceInfo.name);
      if (deviceInfo.bound === true) {
        logger.info(
          'Connected to device "%s" with IP address "%s"',
          deviceInfo.name,
          deviceInfo.address,
        );
      } else {
        logger.info(
          'Error connecting to %s with IP address %s',
          deviceInfo.name,
          deviceInfo.address,
        );
      }
    },
    onError: (deviceInfo: DeviceInfo, err) => {
      logger.info(
        'Error communicating with device %s with IP address %s, details: %s',
        deviceInfo.name,
        deviceInfo.address,
        err,
      );
    },
    onDisconnected: (deviceInfo: DeviceInfo) => {
      logger.info(
        'Disconnected from device %s with IP address %s',
        deviceInfo.name,
        deviceInfo.address,
      );
    },
  };

  logger.info('Started discover device %s', deviceOptions.host);
  const device = new Device(deviceOptions, logger as Logging);
  await delay(100, 0);
  device.setPower(1);
  await delay(100, 0);
  device.setPower(0);
  await delay(100, 0);
  device.getPower();
};

// Create a new async function (a new scope) and immediately call it!
(async () => {
  await deviceE2E();
})();
