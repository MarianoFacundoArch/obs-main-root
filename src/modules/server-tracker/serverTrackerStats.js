const logger = require('../logger/logger');
const { getTrackedServers } = require('./serverTracker');

const getMediumCpuUsageOfEnabledAndNotOnMaintenanceServers = () => {
	try {
		const trackedServers = getTrackedServers();
		let sum = 0;
		let count = 0;
		trackedServers.forEach((current) => {
			if (!current.maintenance && !current.disabled && current.cpuUsage !== null) {
				sum += current.cpuUsage;
				count++;
			}
		});
		if (count > 0 && sum > 0) return sum / count;
		return 0;
	} catch (err) {
		logger.error('Error on getMediumCpuUsageOfEnabledAndNotOnMaintenanceServers: ' + err);
	}
};

const getMediumNumberOfTotalServerFailuresPerServer = () => {
	try {
		const trackedServers = getTrackedServers();
		let sum = 0;
		let count = 0;
		trackedServers.forEach((current) => {
			if (!current.maintenance && !current.disabled) {
				if (current.totalFailures) sum += current.totalFailures;

				count++;
			}
		});

		if (count > 0 && sum > 0) return sum / count;
		return 0;
	} catch (err) {
		logger.error('Error on getMediumNumberOfTotalServerFailuresPerServer: ' + err);
	}
};

const getMediumNumberOfTotalClientFailuresPerServer = () => {
	try {
		const trackedServers = getTrackedServers();
		let sum = 0;
		let count = 0;
		trackedServers.forEach((current) => {
			if (!current.maintenance && !current.disabled) {
				if (current.clientFailuresCount) sum += current.clientFailuresCount;

				count++;
			}
		});

		if (count > 0 && sum > 0) return sum / count;
		return 0;
	} catch (err) {
		logger.error('Error on getMediumNumberOfTotalClientFailuresPerServer: ' + err);
	}
};

const getServerWithMostServerFailures = () => {
	try {
		const trackedServers = getTrackedServers();
		let maxFailures = -1;
		let server = null;
		trackedServers.forEach((current) => {
			if (!current.maintenance && !current.disabled) {
				{
					if (current.totalFailures && current.totalFailures > maxFailures) {
						maxFailures = current.totalFailures;
						server = current.name;
					}
				}
			}
		});

		if (server) return { server, maxFailures };

		return null;
	} catch (err) {
		logger.error('Error on getServerWithMostServerFailures: ' + err);
	}
};

const getServerWithMostClientFailures = () => {
	try {
		const trackedServers = getTrackedServers();
		let maxFailures = -1;
		let server = null;
		trackedServers.forEach((current) => {
			if (!current.maintenance && !current.disabled) {
				{
					if (current.clientFailuresCount && current.clientFailuresCount > maxFailures) {
						maxFailures = current.clientFailuresCount;
						server = current.name;
					}
				}
			}
		});
		if (server) return { server, maxFailures };

		return null;
	} catch (err) {
		logger.error('Error on getServerWithMostClientFailures: ' + err);
	}
};

const getServerWithMostCPUUsage = () => {
	try {
		const trackedServers = getTrackedServers();
		let maxCpuUsage = -1;
		let server = null;
		trackedServers.forEach((current) => {
			if (!current.maintenance && !current.disabled) {
				{
					if (current.cpuUsage && current.cpuUsage > maxCpuUsage) {
						maxCpuUsage = current.cpuUsage;
						server = current.name;
					}
				}
			}
		});
		if (server) return { server, maxCpuUsage };

		return null;
	} catch (err) {
		logger.error('Error on getServerWithMostCPUUsage: ' + err);
	}
};

module.exports = {
	getMediumCpuUsageOfEnabledAndNotOnMaintenanceServers,
	getMediumNumberOfTotalServerFailuresPerServer,
	getMediumNumberOfTotalClientFailuresPerServer,
	getServerWithMostClientFailures,
	getServerWithMostServerFailures,
	getServerWithMostCPUUsage
};
