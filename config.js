module.exports = {

    mqtt: {
        host: 'localhost',
        port: 1883
    },

    iota: {
        logLevel: 'INFO',
        contextBroker: {
            url: 'https://context.fiware.cityvision.cloud',
            ngsiVersion: "v2"
        },
        server: {
            port: 4041
        },
        deviceRegistry: {
            type: 'mongodb'
        },
        mongodb: {
            host: 'context.fiware.cityvision.cloud',
            port: '27017',
            db: 'iotagentjson'
        },
        types: {},
        service: 'poc',
        subservice: '/',
        providerUrl: 'http://35.159.23.67:4041',
        deviceRegistrationDuration: 'P1M',
        defaultType: 'Streetlight',
        defaultResource: '/iot/json'
    },

    http: {},

    configRetrieval: false,
    defaultKey: '12345',
    defaultTransport: 'MQTT'
};
