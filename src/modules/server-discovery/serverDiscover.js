const logger = require('../logger/logger');
const configProvider = require('../config-provider/configProvider');

const { getCoordinatesForIp } = require('../geoip/geoIp');
const { Resolver } = require('dns').promises;
const resolver = new Resolver();

let discoveredServersInLastTrigger = [];

let discoveredServers = [];

let currentlyRunning = false;
let numberOfSrvBranchesInLastTrigger = 0;
const discoverServers = async () => {
	try {
		return new Promise(async (resolve, reject) => {
			if (!currentlyRunning) {
				currentlyRunning = true;
				try {
					const initialSrvLookup = configProvider.MAIN_OBS_DISCOVERY_BRANCH_SRV;
					numberOfSrvBranchesInLastTrigger = 0;
					discoveredServersInLastTrigger = [];
					await lookUpAndProcessSpecificRecord(initialSrvLookup);
					discoveredServers = discoveredServersInLastTrigger;
				} catch (err) {
					logger.error('Error on discoverServers:' + err);
					reject(err);
				}
			}

			currentlyRunning = false;
			resolve();
		}).then((d) => {
			return d;
		});
	} catch (err) {
		logger.error('Error on discoverServers main block: ' + err);
	}
};

const lookUpAndProcessSpecificRecord = async (record) => {
	try {
		const records = await resolver.resolveSrv(record);

		if (records) {
			for (const currentRecord of records) {
				if (currentRecord.port === 53) {
					numberOfSrvBranchesInLastTrigger++;
					// It's a branch, not a leaf
					await lookUpAndProcessSpecificRecord(currentRecord.name);
				} else {
					try {
						const currentRecordWasAlreadyAddedBefore =
							discoveredServersInLastTrigger.filter((current) => {
								return current.name === currentRecord.name;
							}).length > 0;
						if (!currentRecordWasAlreadyAddedBefore) {
							const ipOfServer = await resolver.resolve4(currentRecord.name);
							discoveredServersInLastTrigger = [
								...discoveredServersInLastTrigger,
								{
									name: currentRecord.name,
									ip: ipOfServer[0],
									ll: getCoordinatesForIp(ipOfServer[0]),
									maintenance: currentRecord.port !== 443
								}
							];
						} else {
							logger.warn(
								'Server ' +
									currentRecord.name +
									' was already discovered from another branch of SRV records.'
							);
						}
					} catch (err) {
						logger.error(
							`Error on trying to add new leaf server ${currentRecord.name}:  ${err}`
						);
					}
				}
			}
		}
	} catch (err) {
		logger.error('Error on lookUpAndProcessSpecificRecord:' + err);
	}
};

const getDiscoveredServers = () => {
	return discoveredServers;
};

module.exports = { discoverServers, getDiscoveredServers };
