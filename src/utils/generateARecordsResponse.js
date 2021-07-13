const logger = require('../modules/logger/logger');
const { getTrackedServers } = require('../modules/server-tracker/serverTracker');
const { selectOptimalServerBasedOnLocation } = require('../modules/server-selector/serverSelector');
const { Packet } = dns2;

const generateARecordsResponse = (clientIp, responseAnswersObject) => {
	const response = [];
	let availableServers;
	try {
		availableServers = [...selectOptimalServerBasedOnLocation(clientIp)];
	} catch (err) {
		logger.error('Error on generateARecordsResponse: ' + err.toString());
		availableServers = getTrackedServers();
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
