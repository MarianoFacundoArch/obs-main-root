const geolib = require('geolib');
const configProvider = require('../config-provider/configProvider');

const logger = require('../logger/logger');
const {
	getServersThatAreNotDisabledAndNotInMaintenanceAndCanReceiveNewStreamsClearingRepublishedStreamsField
} = require('../server-tracker/serverTracker');
const { getFullLocationInformation } = require('../geoip/geoIp');
const { findTrackedServerByServerName } = require('../server-tracker/serverTracker');
const {
	getTrackedServersClearingRepublishedStreamsField
} = require('../server-tracker/serverTracker');

const selectOptimalServerBasedOnLocation = (
	clientIp = '85.208.100.21',
	requestedFromHostname,
	excludedServers = [],
	debugMode = false
) => {
	try {
		let debugResult = { debugMode: debugMode };

		let availableServers =
			getServersThatAreNotDisabledAndNotInMaintenanceAndCanReceiveNewStreamsClearingRepublishedStreamsField().filter(
				(current) => {
					const isServerExcluded =
						excludedServers.filter((currentExcludedServer) => {
							return currentExcludedServer === current.name;
						}).length > 0;

					let serverShouldBeReturnedAfterTagsLimitations = !current.serverTags;
					if (!serverShouldBeReturnedAfterTagsLimitations) {
						if (Array.isArray(current.serverTags)) {
							current.serverTags.forEach((currentServerTag) => {
								if (
									requestedFromHostname &&
									requestedFromHostname.includes(currentServerTag)
								) {
									serverShouldBeReturnedAfterTagsLimitations = true;
								}
							});
						} else {
							if (
								requestedFromHostname &&
								requestedFromHostname.includes(current.serverTags)
							)
								serverShouldBeReturnedAfterTagsLimitations = true;
						}
					}
					return (
						serverShouldBeReturnedAfterTagsLimitations &&
						!isServerExcluded &&
						// !current.disabled &&
						// !current.maintenance &&
						// current.serverCanReceiveNewStreams &&
						current.consequentFailures === 0 &&
						(!current.cpuUsage ||
							current.cpuUsage < configProvider.OBS_LEAVES_MAX_CPU_USAGE) &&
						(!current.maxGpuUsage ||
							current.maxGpuUsage < configProvider.OBS_LEAVES_MAX_GPU_USAGE)
					);
				}
			);

		if (debugMode)
			debugResult.stepOne = {
				description:
					'List of available servers that are not under maintenance, not disabled, does not have any consequent failure, they report to be in good health and resources usage are OK from root evaluation and are also accomplishing tags limitations',
				servers: availableServers
			};

		if (!availableServers || availableServers.length === 0) {
			if (debugMode) return debugResult;
			throw new Error('No servers available');
		}

		const clientGeoIp = getFullLocationInformation(clientIp);
		if (clientGeoIp) {
			const clientCoordinates = [
				clientGeoIp.location.latitude,
				clientGeoIp.location.longitude
			];
			availableServers.forEach((current) => {
				current.distanceToClientIp = geolib.getDistance(
					{ latitude: current.ll[0], longitude: current.ll[1] },
					{ latitude: clientCoordinates[0], longitude: clientCoordinates[1] }
				);
			});
		} else {
			availableServers.forEach((current) => {
				current.distanceToClientIp = 0;
			});
		}

		// Sort the available ones based on geoLocation
		availableServers.sort((a, b) => {
			return a.distanceToClientIp < b.distanceToClientIp ? -1 : 1;
		});

		if (debugMode)
			debugResult.stepTwo = {
				description: 'Ordered servers by distance to client ip',
				servers: availableServers
			};

		let distanceToNearestServerInKm = availableServers[0].distanceToClientIp / 1000;
		/* If was backup server, take nearest non backup server */
		if (availableServers[0].isBackupServer) {
			let nonBackupServers = availableServers.filter((current) => {
				return !current.isBackupServer;
			});

			if (nonBackupServers && nonBackupServers.length > 0)
				distanceToNearestServerInKm = nonBackupServers[0].distanceToClientIp / 1000;
		}

		// Select only those within the configured radius
		availableServers = availableServers.filter((current) => {
			const shouldBeConsidered =
				Math.abs(current.distanceToClientIp / 1000 - distanceToNearestServerInKm) <
				configProvider.SERVER_SELECTOR_RADIUS_FROM_NEAREST_SERVER_TO_CONSIDER_REST_IN_KM;
			return shouldBeConsidered;
		});

		// Sort the resulting available ones based on max usage medition
		availableServers.sort((a, b) => {
			return a.maxUsageMedition > b.maxUsageMedition ? 1 : -1;
		});

		if (debugMode)
			debugResult.stepThree = {
				description:
					'Servers within allowed radius from the available closest one considering backupserver condition, ordered by CPU usage and then Backup Servers',
				servers: availableServers
			};

		let nonBackupServers = availableServers.filter((current) => {
			return !current.isBackupServer;
		});

		if (nonBackupServers && nonBackupServers.length > 0) {
			availableServers = [...nonBackupServers];

			if (debugMode)
				debugResult.stepFour = {
					description: 'Filtered nonBackupServers',
					servers: availableServers
				};
		} else {
			logger.error('No available nonBackup Servers. Returning backup servers');
		}

		if (availableServers.length > configProvider.NUMBER_OF_SERVERS_TO_RETRIEVE_VIA_A_RECORD) {
			availableServers = availableServers.slice(
				0,
				configProvider.NUMBER_OF_SERVERS_TO_RETRIEVE_VIA_A_RECORD
			);
		}

		if (debugMode)
			debugResult.result = {
				description: 'Resulting selection',
				servers: availableServers
			};

		if (debugMode) {
			return debugResult;
		}
		return availableServers;
	} catch (err) {
		logger.error('Error on ServerSelector: ' + err);
		return { name: configProvider.SERVER_SELECTOR_DEFAULT_IF_FAILURE };
	}
};

const evaluateIfSpecificServerCanAcceptNewStreams = (serverName) => {
	let canAcceptNewStreams = true;
	let serverObjectToEvaluate = findTrackedServerByServerName(serverName);
	if (serverObjectToEvaluate) {
		if (
			serverObjectToEvaluate.cpuUsage !== null &&
			serverObjectToEvaluate.cpuUsage > configProvider.OBS_LEAVES_MAX_CPU_USAGE
		)
			canAcceptNewStreams = false;

		if (
			canAcceptNewStreams &&
			serverObjectToEvaluate.maxGpuUsage !== null &&
			serverObjectToEvaluate.maxGpuUsage > configProvider.OBS_LEAVES_MAX_GPU_USAGE
		)
			canAcceptNewStreams = false;

		if (
			canAcceptNewStreams &&
			serverObjectToEvaluate.serverCanReceiveNewStreams !== null &&
			!!serverObjectToEvaluate.serverCanReceiveNewStreams
		)
			canAcceptNewStreams = false;

		if (canAcceptNewStreams && serverObjectToEvaluate.disabled) canAcceptNewStreams = false;

		if (canAcceptNewStreams && serverObjectToEvaluate.maintenance) canAcceptNewStreams = false;

		if (
			canAcceptNewStreams &&
			serverObjectToEvaluate.consequentFailures &&
			serverObjectToEvaluate.consequentFailures > 0
		)
			canAcceptNewStreams = false;
	}

	return canAcceptNewStreams;
};

module.exports = {
	selectOptimalServerBasedOnLocation,
	evaluateIfSpecificServerCanAcceptNewStreams
};
