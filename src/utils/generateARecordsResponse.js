const logger = require('../modules/logger/logger');
const { getTrackedServers } = require('../modules/server-tracker/serverTracker');
const { selectOptimalServerBasedOnLocation } = require('../modules/server-selector/serverSelector');
const dns2 = require('dns2');
const {
	getServersThatAreNotDisabledAndNotInMaintenanceAndCanReceiveNewStreamsClearingRepublishedStreamsField
} = require('../modules/server-tracker/serverTracker');
const { Packet } = dns2;

const generateARecordsResponse = (clientIp, responseAnswersObject, name) => {
	const response = [];
	let availableServers;
	try {
		availableServers = [...selectOptimalServerBasedOnLocation(clientIp, name)];
	} catch (err) {
		logger.error('Error on generateARecordsResponse: ' + err.toString());
		availableServers =
			getServersThatAreNotDisabledAndNotInMaintenanceAndCanReceiveNewStreamsClearingRepublishedStreamsField();
	}

	if (availableServers) {
		availableServers.forEach((current) => {
			responseAnswersObject.push({
				name,
				type: Packet.TYPE.A,
				class: Packet.CLASS.IN,
				ttl: 30,
				address: current.ip
			});
		});
	}
};

module.exports = { generateARecordsResponse };
