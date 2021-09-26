import http from 'http';
import { Logging } from 'homebridge';

export interface AutomationReturn {
    error: boolean;
    message: string;
    cooldownActive?: boolean;
}

export type HttpHandler = (uri: string) => AutomationReturn;

export class HttpService {

    private readonly server: http.Server;

    constructor(private httpPort: number, private logger: Logging) {
        this.logger.info('Setting up HTTP server on port ' + this.httpPort + '...');
        this.server = http.createServer();
    }

    start(httpHandler: HttpHandler) {
        this.server.listen(this.httpPort);
        this.server.on('request', (request: http.IncomingMessage, response: http.ServerResponse) => {
            let results: AutomationReturn = {
                error: true,
                message: 'Malformed URL.',
            };
            if (request.url) {
                results = httpHandler(request.url);
            }
            response.writeHead(results.error ? 500 : 200);
            response.write(JSON.stringify(results));
            response.end();
        });
    }
}