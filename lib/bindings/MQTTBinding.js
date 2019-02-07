/*
 * Copyright 2016 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of iotagent-json
 *
 * iotagent-json is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * iotagent-json is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with iotagent-json.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::[contacto@tid.es]
 */

'use strict';

var iotAgentLib = require('iotagent-node-lib'),
    mqtt = require('mqtt'),
    commonBindings = require('../commonBindings'),
    async = require('async'),
    iotaUtils = require('../iotaUtils'),
    constants = require('../constants'),
    context = {
        op: 'IoTAgentJSON.MQTTBinding'
    },
    mqttClient,
    config = require('../configService');

/**
 * Generate the list of global topics to listen to.
 */
function generateTopics(callback) {
    var topics = [];

    config.getLogger().debug(context, 'Generating topics');
    topics.push('/+/+/' + constants.MEASURES_SUFIX + '/+');
    topics.push('/+/+/' + constants.MEASURES_SUFIX);
    topics.push('/+/+/' + constants.CONFIGURATION_SUFIX + '/' + constants.CONFIGURATION_COMMAND_SUFIX);
    topics.push('/+/+/' + constants.CONFIGURATION_COMMAND_UPDATE);

    callback(null, topics);
}

/**
 * Recreate the MQTT subscriptions for all the registered devices.
 */
function recreateSubscriptions(callback) {
    config.getLogger().debug(context, 'Recreating subscriptions for all devices');

    function subscribeToTopics(topics, callback) {
        config.getLogger().debug(context, 'Subscribing to topics: %j', topics);

        mqttClient.subscribe(topics, null, function(error) {
            if (error) {
                iotAgentLib.alarms.raise(constants.MQTTB_ALARM, error);
                config.getLogger().error(context, 'GLOBAL-001: Error subscribing to topics: %s', error);
                callback(error);
            } else {
                iotAgentLib.alarms.release(constants.MQTTB_ALARM);
                config.getLogger().debug(context, 'Successfully subscribed to the following topics:\n%j\n', topics);
                callback(null);
            }
        });
    }

    async.waterfall([
        generateTopics,
        subscribeToTopics
    ], callback);
}

/**
 * Extract all the information from a Context Broker response and send it to the topic indicated by the APIKey and
 * DeviceId.
 *
 * @param {String} apiKey           API Key for the Device Group
 * @param {String} deviceId         ID of the Device.
 * @param {Object} results          Context Broker response.
 */
function sendConfigurationToDevice(apiKey, deviceId, results, callback) {
    var configurations = iotaUtils.createConfigurationNotification(results);
    var options = {};
    if (config.getConfig().mqtt.qos) {
        options.qos = config.getConfig().mqtt.qos;
    }
    if (config.getConfig().mqtt.retain === true) {
        options.retain = config.getConfig().mqtt.retain;
    }
    config.getLogger().debug(context, 'Sending requested configuration to the device:\n %j', configurations);

    mqttClient.publish(
        '/' + apiKey + '/' + deviceId + '/' + constants.CONFIGURATION_SUFIX + '/' +
        constants.CONFIGURATION_VALUES_SUFIX,
        JSON.stringify(configurations), options, callback);
}

/**
 * Unsubscribe the MQTT Client from all the topics.
 */
function unsubscribeAll(callback) {
    function unsubscribeFromTopics(topics, callback) {
        mqttClient.unsubscribe(topics, null);

        callback();
    }

    async.waterfall([
        generateTopics,
        unsubscribeFromTopics
    ], callback);
}

/**
 * Start the binding.
 */
function start(callback) {
    let configuration = config.getConfig().mqtt;
    var options = {
        protocol: configuration.protocol != null ? configuration.protocol : "mqtt",
        host: configuration.host != null ? configuration.host : "localhost",
        port: configuration.port != null ? configuration.port : 1883,
        key: configuration.key != null ? configuration.key : null,
        cert: configuration.cert != null ? configuration.cert : null,
        rejectUnauthorized: configuration.rejectUnauthorized != null ? configuration.rejectUnauthorized : true,
        username: configuration.username != null ? configuration.username : null,
        password: configuration.password != null ? configuration.password : null,
        keepalive: 0,
        connectTimeout: 60 * 60 * 1000
    };

    mqttClient = mqtt.connect(options);
    mqttClient.on('message', commonBindings.messageHandler);
    mqttClient.on('connect', function() {
        config.getLogger().info(context, 'MQTT Client connected');
        recreateSubscriptions(callback);
    });
}

/**
 * Device provisioning handler.
 *
 * @param {Object} device           Device object containing all the information about the provisioned device.
 */
function deviceProvisioningHandler(device, callback) {
    callback(null, device);
}

/**
 * Stop the binding, releasing its resources.
 */
function stop(callback) {
    async.series([
        unsubscribeAll,
        mqttClient.end.bind(mqttClient, true)
    ], callback);
}

/**
 * Remove logical device suffix from a device id.
 */

/**
 * Removes logical device suffix from a device id.
 *
 * @param {String} deviceId  Complex device ID in format "<PHYSICAL_DEVICE_ID>[.L<LOGICAL_DEVICE_ID>]".
 */
function removeLogicalSuffix(deviceId) {
    var logicalDeviceSuffixPosition = deviceId.indexOf(".L");

    if (logicalDeviceSuffixPosition < 0) {
        return deviceId;
    }

    return deviceId.substring(0, logicalDeviceSuffixPosition);
}

/**
 * Execute a command for the device represented by the device object and the given APIKey, sending the serialized
 * JSON payload (already containing the command information).
 *
 * @param {String} apiKey                   APIKey of the device that will be receiving the command.
 * @param {Object} device                   Data object for the device receiving the command.
 * @param {String} serializedPayload        String payload in JSON format for the command.
 */
function executeCommand(apiKey, device, serializedPayload, callback) {
    var options = {};
    if (config.getConfig().mqtt.qos) {
        options.qos = config.getConfig().mqtt.qos;
    }
    if (config.getConfig().mqtt.retain) {
        options.retain = config.getConfig().mqtt.retain;
    }

    var deviceId = removeLogicalSuffix(device.id);

    mqttClient.publish('/' + apiKey + '/' + deviceId + '/cmd', serializedPayload, options);

    callback();
}

exports.start = start;
exports.stop = stop;
exports.sendConfigurationToDevice = sendConfigurationToDevice;
exports.deviceProvisioningHandler = deviceProvisioningHandler;
exports.executeCommand = executeCommand;
exports.protocol = 'MQTT';
