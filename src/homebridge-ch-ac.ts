import { Service, Logging, AccessoryConfig, API, AccessoryPlugin, HAP, Characteristic, CharacteristicValue } from 'homebridge';
import { Device, DeviceInfo, DeviceOptions } from './lib/deviceFactory';
import { Commands } from './lib/commands';

let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory("homebridge-ch-ac-ts", "Cooper&HunterAC", CHThermostatAccessory);
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class CHThermostatAccessory implements AccessoryPlugin {
  private readonly logger: Logging;
  private readonly device: Device;
  private readonly name: string;
  private readonly serial: string;
  private readonly model: string;
  private readonly thermostatService: Service;
  private readonly serviceInfo: Service;
  private readonly host: string;
  private readonly updateInterval: number;

  constructor(
    logger: Logging, config: AccessoryConfig, api: API) {

    hap = api.hap;

    this.logger = logger;

    // extract name from config
    this.name = config.name;
    this.host = config.ip;
    this.serial = config.serial;
    this.model = config.model || "Cooper&Hunter";
    this.updateInterval = config.updateInterval || 10000;

    // Set AccessoryInformation
    this.serviceInfo = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Cooper&Hunter")
      .setCharacteristic(hap.Characteristic.Name, this.name)
      .setCharacteristic(hap.Characteristic.Model, this.model)
      .setCharacteristic(hap.Characteristic.SerialNumber, this.serial);

    // create a new Thermostat service
    this.thermostatService = new hap.Service.Thermostat(this.name);

    // create handlers for required characteristics
    this.thermostatService.getCharacteristic(hap.Characteristic.Active)
      .onGet(this.getThermostatActive.bind(this))
      .onSet(this.setThermostatActive.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeaterCoolerState.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeaterCoolerState.bind(this))
      .onSet(this.setTargetHeaterCoolerState.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 15,
        maxValue: 40,
        minStep: 0.01,
      })
      .onGet(this.getCurrentTemperature.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.SwingMode)
      .onGet(this.getSwingMode.bind(this))
      .onSet(this.setSwingMode.bind(this));

    this.thermostatService.getCharacteristic(hap.Characteristic.RotationSpeed)
      .setProps({
        format: hap.Characteristic.Formats.UINT8,
        maxValue: 6,
        minValue: 1,
        validValues: [1, 2, 3, 4, 5, 6], // 6 - auto
      })
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));

    this.device = this.discover(this.thermostatService);
  }

  getServices(): Service[] {
    return [
      this.serviceInfo,
      this.thermostatService
    ];
  }

  /**
   * Handle requests to get the current value of the "Current Heating Cooling State" characteristic
   */
  getCurrentHeaterCoolerState() {
    this.logger.debug('Triggered GET CurrentHeatingCoolingState');

    // set this to a valid value for CurrentHeatingCoolingState
    const currentValue = hap.Characteristic.CurrentHeatingCoolingState.OFF;

    return currentValue;
  }


  /**
   * Handle requests to get the current value of the "Target Heating Cooling State" characteristic
   */
  getTargetHeaterCoolerState() {
    this.logger.debug('Triggered GET TargetHeatingCoolingState');

    // set this to a valid value for TargetHeatingCoolingState
    const currentValue = hap.Characteristic.TargetHeatingCoolingState.OFF;

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heating Cooling State" characteristic
   */
  setTargetHeaterCoolerState(value: CharacteristicValue) {
    this.logger.debug('Triggered SET TargetHeatingCoolingState:' + value);

    let mode = Commands.mode.value.auto;

    switch (value) {
      case hap.Characteristic.TargetHeaterCoolerState.HEAT:
        mode = Commands.mode.value.heat;
        break;
      case hap.Characteristic.TargetHeaterCoolerState.COOL:
        mode = Commands.mode.value.cool;
        break;
      default:
        mode = Commands.mode.value.auto;
    }
    this.device.setMode(mode);
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  getCurrentTemperature(): number {
    this.logger.debug('Triggered GET CurrentTemperature');

    // set this to a valid value for CurrentTemperature
    const currentValue = 30;// TODO: read temp from external source

    return currentValue;
  }


  /**
   * Handle requests to get the current value of the "Target Temperature" characteristic
   */
  getTargetTemperature(): number {
    this.logger.debug('Triggered GET TargetTemperature');

    const currentValue = this.device.getTargetTemp();

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Temperature" characteristic
   */
  setTargetTemperature(value: CharacteristicValue) {
    this.logger.debug('Triggered SET TargetTemperature:' + value);

    this.device.setTargetTemp(parseInt('' + value));
  }

  /**
   * Handle requests to get the current value of the "Temperature Display Units" characteristic
   */
  getTemperatureDisplayUnits(): number {
    this.logger.debug('Triggered GET TemperatureDisplayUnits');

    // set this to a valid value for TemperatureDisplayUnits
    const currentValue = hap.Characteristic.TemperatureDisplayUnits.CELSIUS;

    return currentValue;
  }

  /**
   * Handle requests to set the "Temperature Display Units" characteristic
   */
  setTemperatureDisplayUnits(value: CharacteristicValue) {
    this.logger.debug('Triggered SET TemperatureDisplayUnits:' + value);
  }

  getThermostatActive() {
    return this.device.getPower() === Commands.power.value.off
      ? hap.Characteristic.Active.INACTIVE
      : hap.Characteristic.Active.ACTIVE

  }

  setThermostatActive(value: CharacteristicValue) {
    if (
      this.device.getPower() === hap.Characteristic.Active.INACTIVE &&
      value === hap.Characteristic.Active.INACTIVE
    ) {
      // Do nothing, device is turned off
    } else {
      this.device.setPower(
        value === hap.Characteristic.Active.ACTIVE
          ? Commands.power.value.on
          : Commands.power.value.off
      );
    }
  }

  getSwingMode(): CharacteristicValue {
    return Commands.swingVert.fixedValues.includes(this.device.getSwingVert())
      ? hap.Characteristic.SwingMode.SWING_DISABLED
      : hap.Characteristic.SwingMode.SWING_ENABLED
  }

  setSwingMode(value: CharacteristicValue) {
    this.device.setSwingVert(value === hap.Characteristic.SwingMode.SWING_DISABLED ?
      Commands.swingVert.value.default
      : Commands.swingVert.value.full);
  }

  getRotationSpeed(): CharacteristicValue {
    const speed = this.device.getFanSpeed();
    return speed === Commands.fanSpeed.value.auto ? 6 : speed;
  }

  setRotationSpeed(value: CharacteristicValue) {
    const speed =
      value === 6 ? Commands.fanSpeed.value.auto : value;
    this.device.setFanSpeed(parseInt('' + speed));
  }

  discover(thermostatService: Service): Device {
    const deviceOptions: DeviceOptions = {
      host: this.host,
      port: 8000 + parseInt(this.host.split('.')[3]),
      updateInterval: this.updateInterval,
      onStatus: (deviceInfo: DeviceInfo) => {
        if (deviceInfo.bound === false) {
          return;
        }

        thermostatService
          .getCharacteristic(hap.Characteristic.Active)
          .updateValue(this.getThermostatActive());

        thermostatService
          .getCharacteristic(hap.Characteristic.TargetHeaterCoolerState)
          .updateValue(this.getTargetHeaterCoolerState());

        thermostatService
          .getCharacteristic(hap.Characteristic.CurrentHeaterCoolerState)
          .updateValue(this.getCurrentHeaterCoolerState());

        thermostatService
          .getCharacteristic(hap.Characteristic.CurrentTemperature)
          .updateValue(this.getCurrentTemperature());


        const targetTemperature = this.getTargetTemperature();
        thermostatService
          .getCharacteristic(hap.Characteristic.CoolingThresholdTemperature)
          .updateValue(targetTemperature);
        thermostatService
          .getCharacteristic(hap.Characteristic.HeatingThresholdTemperature)
          .updateValue(targetTemperature);

        thermostatService
          .getCharacteristic(hap.Characteristic.SwingMode)
          .updateValue(this.getSwingMode());

        thermostatService
          .getCharacteristic(hap.Characteristic.RotationSpeed)
          .updateValue(this.getRotationSpeed());
      },
      onUpdate: (deviceInfo: DeviceInfo) => {
        this.logger.info('Status updated on %s', deviceInfo.name)
      },
      onConnected: (deviceInfo: DeviceInfo) => {
        if (deviceInfo.bound == true) {
          this.logger.info(
            'Connected to device "%s" with IP address "%s"',
            deviceInfo.name,
            deviceInfo.address
          );
        } else {
          this.logger.info(
            "Error connecting to %s with IP address %s",
            deviceInfo.name,
            deviceInfo.address
          );
        }
      },
      onError: (deviceInfo: DeviceInfo) => {
        this.logger.info(
          "Error communicating with device %s with IP address %s",
          deviceInfo.name,
          deviceInfo.address
        );
      },
      onDisconnected: (deviceInfo: DeviceInfo) => {
        this.logger.info(
          "Disconnected from device %s with IP address %s",
          deviceInfo.name,
          deviceInfo.address
        );
      },
    };
    this.logger.info("Start discover device %s", deviceOptions.host);
    return new Device(deviceOptions, this.logger);
  }
}
