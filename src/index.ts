import { Service, Logging, AccessoryConfig, API, AccessoryPlugin, HAP, CharacteristicValue } from 'homebridge';
import { Device, DeviceInfo, DeviceOptions } from './lib/deviceFactory';
import { Commands } from './lib/commands';
import { EveHistoryService, HistoryServiceEntry } from './lib/eveHistoryService';
import { HttpService, AutomationReturn } from './lib/httpService';

let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('Cooper&HunterAC', CHThermostatAccessory);
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class CHThermostatAccessory implements AccessoryPlugin {
  private readonly device: Device;
  private readonly name: string;
  private readonly serial: string;
  private readonly model: string;
  private readonly heaterCoolerService: Service;
  private readonly serviceInfo: Service;
  private readonly host: string;
  private readonly updateInterval: number;
  private readonly httpPort: number;
  private readonly log: Logging;
  private readonly displayName: string;

  private readonly historyService: EveHistoryService;
  private readonly httpService: HttpService;

  private currentTemp: number;

  constructor(
    private logger: Logging, private config: AccessoryConfig, private api: API) {

    hap = api.hap;

    this.log = logger;

    // extract name from config
    this.name = config.name;
    this.displayName = this.name;
    this.host = config.host;
    this.serial = config.serial;
    this.model = config.model || 'Cooper&Hunter';
    this.updateInterval = config.updateInterval || 10000;
    this.httpPort = this.config.httpPort || 4567;
    this.currentTemp = 20;


    // Set AccessoryInformation
    this.serviceInfo = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Cooper&Hunter')
      .setCharacteristic(hap.Characteristic.Name, this.name)
      .setCharacteristic(hap.Characteristic.Model, this.model)
      .setCharacteristic(hap.Characteristic.SerialNumber, this.serial);

    // create a new Thermostat service
    this.heaterCoolerService = new hap.Service.HeaterCooler(this.name);

    // create handlers for required characteristics
    this.heaterCoolerService.getCharacteristic(hap.Characteristic.Active)
      .onGet(this.getThermostatActive.bind(this))
      .onSet(this.setThermostatActive.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.CoolingThresholdTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.HeatingThresholdTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeaterCoolerState.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeaterCoolerState.bind(this))
      .onSet(this.setTargetHeaterCoolerState.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 15,
        maxValue: 40,
        minStep: 0.01,
      })
      .onGet(this.getCurrentTemperature.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.SwingMode)
      .onGet(this.getSwingMode.bind(this))
      .onSet(this.setSwingMode.bind(this));

    this.heaterCoolerService.getCharacteristic(hap.Characteristic.RotationSpeed)
      .setProps({
        format: hap.Characteristic.Formats.UINT8,
        maxValue: 6,
        minValue: 1,
        validValues: [0, 1, 2, 3, 4, 5, 6], // 6 - auto
      })
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));


    this.device = this.discover(this.heaterCoolerService);

    this.historyService = new EveHistoryService(this, this.api, this.logger);

    this.readLastTemperature();

    this.httpService = new HttpService(this.httpPort, this.logger);
    this.httpService.start((fullPath: string) => this.httpHandler(fullPath));

  }

  httpHandler(fullPath: string): AutomationReturn {
    this.logger.info('Received request: %s', fullPath);

    const parts = fullPath.split('/');

    if (parts.length < 2) {
      return {
        error: true,
        message: 'Malformed uri',
      };
    }

    //update accessory temp value
    //uri example: /temp/22.5%C2%B0C
    //usually due to HomeKit automation when original uri is /temp/22.5C

    if (parts[1] === 'temp') {
      const tempParts = parts[2].split('%');
      if (tempParts.length > 0) {
        this.updateCurrentTemperature(parseFloat('' + tempParts[0]));

        const message = 'Updated accessory current temperature to: ' + this.currentTemp;
        this.logger.info(message);
        return {
          error: false,
          message: message,
        };
      }
    }

    return {
      error: false,
      message: 'OK',
    };

  }

  getServices(): Service[] {
    return [
      this.serviceInfo,
      this.heaterCoolerService,
      this.historyService.getService(),
    ];
  }

  readLastTemperature() {
    const lastEntryHandler = (lastEntry: string, history: HistoryServiceEntry[]) => {
      const lastItem = history.pop();
      if (lastItem) {
        this.logger.debug('History: last item: %s', lastItem);
        this.updateCurrentTemperature(lastItem.currentTemp);
      } else {
        this.logger.debug('History: no data');
      }
    };

    this.historyService.readHistory(lastEntryHandler);
  }

  /**
   * Handle requests to get the current value of the "Current Heating Cooling State" characteristic
   */
  getCurrentHeaterCoolerState(): CharacteristicValue {
    const mode = this.device.getMode();
    let state;

    switch (mode) {
      case Commands.mode.value.cool:
        state = hap.Characteristic.CurrentHeaterCoolerState.COOLING;
        break;
      case Commands.mode.value.heat:
        state = hap.Characteristic.CurrentHeaterCoolerState.HEATING;
        break;
      case Commands.mode.value.auto:
        state = hap.Characteristic.CurrentHeaterCoolerState.IDLE;
        break;
      default:
        state = hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    this.logger.debug('Triggered GET CurrentHeatingCoolingState: %s', state);
    return state;
  }


  /**
   * Handle requests to get the current value of the "Target Heating Cooling State" characteristic
   */
  getTargetHeaterCoolerState() {
    const currentValue = hap.Characteristic.TargetHeatingCoolingState.OFF;

    this.logger.debug('Triggered GET TargetHeatingCoolingState: %s', currentValue);
    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heating Cooling State" characteristic
   */
  setTargetHeaterCoolerState(value: CharacteristicValue) {

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

    this.logger.info('Triggered SET TargetHeaterCoolerState: %s', mode);

    this.device.setMode(mode);
  }

  updateCurrentTemperature(currentTemp: number) {
    this.currentTemp = currentTemp;

    this.heaterCoolerService
      .getCharacteristic(hap.Characteristic.CurrentTemperature)
      .updateValue(this.getCurrentTemperature());

    this.historyService
      .addEntry({ time: Math.round(new Date().valueOf() / 1000), currentTemp: this.currentTemp });
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  getCurrentTemperature(): number {
    // set this to a valid value for CurrentTemperature
    return this.currentTemp;
  }


  /**
   * Handle requests to get the current value of the "Target Temperature" characteristic
   */
  getTargetTemperature(): number {
    const currentValue = this.device.getTargetTemp() || this.currentTemp;

    this.logger.debug('Triggered GET TargetTemperature: %s', currentValue);

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Temperature" characteristic
   */
  setTargetTemperature(value: CharacteristicValue) {
    this.logger.info('Triggered SET TargetTemperature: %s', value);

    this.device.setTargetTemp(parseInt('' + value));
  }

  /**
   * Handle requests to get the current value of the "Temperature Display Units" characteristic
   */
  getTemperatureDisplayUnits(): number {
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
    const mode = this.device.getPower();
    this.logger.debug('Triggered GET ThermostatActive: %s', mode);

    return mode === Commands.power.value.off
      ? hap.Characteristic.Active.INACTIVE
      : hap.Characteristic.Active.ACTIVE;
  }

  setThermostatActive(value: CharacteristicValue) {
    const deviceOff = !this.device.getPower();

    this.logger.info('Triggered SET ThermostatActive: %s', deviceOff);

    if (deviceOff &&
      value === hap.Characteristic.Active.INACTIVE
    ) {
      // Do nothing, device is turned off
    } else {
      this.device.setPower(
        value === hap.Characteristic.Active.ACTIVE
          ? Commands.power.value.on
          : Commands.power.value.off,
      );
    }
  }

  getSwingMode(): CharacteristicValue {
    const mode = this.device.getSwingVert();
    this.logger.debug('Triggered GET SwingMode: %s', mode);

    return Commands.swingVert.fixedValues.includes(mode)
      ? hap.Characteristic.SwingMode.SWING_DISABLED
      : hap.Characteristic.SwingMode.SWING_ENABLED;
  }

  setSwingMode(value: CharacteristicValue) {
    this.logger.debug('Triggered SET SwingMode: %s', value);

    this.device.setSwingVert(value === hap.Characteristic.SwingMode.SWING_DISABLED ?
      Commands.swingVert.value.default
      : Commands.swingVert.value.full);
  }

  getRotationSpeed(): CharacteristicValue {
    const speed = this.device.getFanSpeed() || Commands.fanSpeed.value.auto;
    this.logger.debug('Triggered GET RotationSpeed: %s', speed);
    return speed === Commands.fanSpeed.value.auto ? 6 : speed;
  }

  setRotationSpeed(value: CharacteristicValue) {
    const speed =
      value === 6 ? Commands.fanSpeed.value.auto : value;
    this.logger.debug('Triggered Set RotationSpeed: %s', speed);

    this.device.setFanSpeed(parseInt('' + speed));
  }

  discover(thermostatService: Service): Device {
    const deviceOptions: DeviceOptions = {
      host: this.host,
      port: 8000 + parseInt(this.host.split('.')[3]),
      updateInterval: this.updateInterval,
      onStatus: (deviceInfo: DeviceInfo) => {
        this.logger.info('Status updated: %s props: %s', deviceInfo.name, JSON.stringify(deviceInfo.props));

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
        this.logger.debug('Status updated on %s', deviceInfo.name);
      },
      onConnected: (deviceInfo: DeviceInfo) => {
        this.logger.info('Connected to: %s', deviceInfo.name);
        if (deviceInfo.bound === true) {
          this.logger.info(
            'Connected to device "%s" with IP address "%s"',
            deviceInfo.name,
            deviceInfo.address,
          );
        } else {
          this.logger.info(
            'Error connecting to %s with IP address %s',
            deviceInfo.name,
            deviceInfo.address,
          );
        }
      },
      onError: (deviceInfo: DeviceInfo) => {
        this.logger.error(
          'Error communicating with device %s with IP address %s',
          deviceInfo.name,
          deviceInfo.address,
        );
      },
      onDisconnected: (deviceInfo: DeviceInfo) => {
        this.logger.error(
          'Disconnected from device %s with IP address %s',
          deviceInfo.name,
          deviceInfo.address,
        );
      },
    };
    this.logger.info('Started discover device %s', deviceOptions.host);
    return new Device(deviceOptions, this.logger);
  }
}
