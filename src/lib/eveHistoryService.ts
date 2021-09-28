import fakegato from 'fakegato-history';
import { AccessoryPlugin, API, Logging, Service } from 'homebridge';

export interface HistoryServiceEntry extends Record<string, number> {
    time: number;
}

export interface HistoryService {
    addEntry(entry: HistoryServiceEntry): void;
}

export interface HistoryServiceStorageReaderOptions {
    service: unknown;
    callback: (err: unknown, data: string) => void;
}

export interface HistoryServiceStorage {
    globalFakeGatoStorage: {
        read: (options: HistoryServiceStorageReaderOptions) => void;
    };
}

export class EveHistoryService {

    private readonly historyService: unknown;

    constructor(private accessory: AccessoryPlugin, private api: API, private logger: Logging) {
      const FakeGatoHistoryService = fakegato(api);
      this.historyService = new FakeGatoHistoryService('thermo', this.accessory, { storage: 'fs', log: this.logger });
    }

    getService(): Service {
      return this.historyService as Service;
    }

    addEntry(entry: HistoryServiceEntry) {
      (this.historyService as HistoryService).addEntry(entry);
    }

    readHistory(lastEntryHandler: (lastEntry: string, history: HistoryServiceEntry[]) => void) {
      const storage = ((this.api as unknown) as HistoryServiceStorage).globalFakeGatoStorage;

      if (!storage) {
        this.logger.debug('Failed to access globalFakeGatoStorage');
        return;
      }

      this.logger.debug('Reading data from globalFakeGatoStorage ...');
      const thisAccessory = this.accessory;
      storage.read({
        service: this.historyService,
        callback: function (err, data) {
          if (!err) {
            if (data) {
              try {
                const accessoryName = 'name' in thisAccessory ? thisAccessory['name'] : thisAccessory;
                this.logger.debug('read data from', accessoryName);
                const jsonFile = typeof (data) === 'object' ? data : JSON.parse(data);
                lastEntryHandler(jsonFile.lastEntry, jsonFile.history as HistoryServiceEntry[]);
              } catch (e) {
                this.logger.debug('**ERROR fetching persisting data restart from zero - invalid JSON**', e);
              }
            }
          } else {
            // file don't exists
            this.logger.debug('**ERROR fetching persisting data: file dont exists', err);
          }
        }.bind(this),
      });
    }
}