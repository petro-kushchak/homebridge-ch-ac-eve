
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

# Cooper&Hunter AC plugin for Homebridge (with Eve app temp/humidity monitoring)


This plugin is based on https://github.com/norberttech/homebridge-ch-ac

Should work with all Cooper&Hunter AC controlled by EWPE Smart APP. 

## Requirements 
- NodeJS (>=8.9.3) with NPM (>=6.4.1)

For each AC device you need to add an accessory and specify the IP address of the device. 
Some of Cooper&Hunter AC does not provide current temperature information, so this plugin allows to fetch this data from another Homebridge plugin using "globals" dictionary

## AC room temperature
Some of Cooper&Hunter ACs are not exposing room temperature over APIs, so there is a need to provide AC temperature from other source.

## Endpoint for AC temperature
This plugin supports temperature updates from http web hook. You can enable HomeKit automation to send room temperature sensor information.
Once plugin is started, it starts http server with port httpPort. Currently plugin supports URL (example with Homebridge Raspberry Pi setup and default httpPort: 4567):
```
GET http://homebridge.localhost:4567/temp/21.5%32%C
```

## Eve app temperature history

- AC temperature updates are stored using fakegato lib, so when open AC accessory with Eve app its possible to see AC temperature change history
- when AC accessory starts it tries to read last logged temperature from fakegato lib storage

Fakegato  open source project [fakegato-history](https://github.com/simont77/fakegato-history). 



## Usage Example:
```
{
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "123-45-568"
    },
    "accessories": [
        {
            "accessory": "CooperHunterAC",
            "host": "192.168.1.X",
            "name": "Bedroom AC",
            "serial": "ch-00-00-01",
            "model": "CH-S09FTXE WIFI",
            "httpPort": 4567,
            "updateInterval": 10000
        },
        {
            "accessory": "CooperHunterAC",
            "host": "192.168.1.Y",
            "name": "Living room AC",
            "serial": "ch-00-00-02",
            "model": "CH-S09FTXE WIFI",
            "httpPort": 4567,
            "updateInterval": 10000
        }
    ]
}
```

## C&H AC communication protocol 

Communication protocol for C&H AC is the same as for [GreeSmart](https://play.google.com/store/apps/details?id=com.gree.smarthome). 
It is described in open source project [Gree Remote](https://github.com/tomikaa87/gree-remote#protocol-details). 

