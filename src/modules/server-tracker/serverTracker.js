const axios = require('axios');
const configProvider = require('../config-provider/configProvider');
const logger = require('../logger/logger');
const { getDiscoveredServers } = require('../server-discovery/serverDiscover');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

let currentlyRunning = false;
let trackedServers = [];
const getThereIsAnyTrackedServer = () => {
	try {
		return trackedServers.length > 0;
	} catch (err) {
		logger.error('Error in serverTracker - getThereIsAnyTrackedServer : ' + err);
	}
};

const clearAllStreamStats = () => {
	lock.acquire(
		'trackedServers',
		function (cb) {
			// Concurrency safe
			try {
				let modifiedTrackedServers = [];
				trackedServers.forEach((currentTrackedServer) => {
					modifiedTrackedServers = [
						...modifiedTrackedServers,
						{
							...currentTrackedServer,
							totalFailures: 0,
							consequentFailures: 0
						}
					];
				});
				trackedServers = modifiedTrackedServers;
			} catch (err) {
				logger.error('Error on serverTracker - clearAllStreamStats: ' + err);
			}

			cb();
		},
		function (err, ret) {
			//released lock
		}
	);
};

const clearSpecificStreamStats = (serverName) => {
	lock.acquire(
		'trackedServers',
		function (cb) {
			// Concurrency safe
			try {
				let modifiedTrackedServers = [];
				trackedServers.forEach((currentTrackedServer) => {
					if (currentTrackedServer.name === serverName)
						modifiedTrackedServers = [
							...modifiedTrackedServers,
							{
								...currentTrackedServer,
								totalFailures: 0,
								consequentFailures: 0
							}
						];
					else
						modifiedTrackedServers = [
							...modifiedTrackedServers,
							{
								...currentTrackedServer
							}
						];
				});

				trackedServers = modifiedTrackedServers;
			} catch (err) {
				logger.error('Error on serverTracker - clearSpecificStreamStats: ' + err);
			}

			cb();
		},
		function (err, ret) {
			//released lock
		}
	);
};
const evaluateAndDisplayDebugInformationBasedOnChanges = (
	existingServerObject,
	newServerObject
) => {
	if (existingServerObject === null) {
		logger.info(
			'Server ' + newServerObject.name + ' was found and added to the pool for first time.'
		);

		if (newServerObject.maintenance) {
			logger.warn('Server ' + newServerObject.name + ' set on maintenance on discovery.');
		}

		if (newServerObject.isBackupServer) {
			logger.warn('Server ' + newServerObject.name + ' set as backup server on discovery.');
		}

		if (newServerObject.serverTags) {
			logger.warn(
				'Server ' +
					newServerObject.name +
					' is set only for tags ' +
					(Array.isArray(newServerObject.serverTags)
						? newServerObject.serverTags.join(', ')
						: newServerObject.serverTags)
			);
		}
	} else {
		if (newServerObject.serverTags && !existingServerObject.serverTags) {
			logger.warn(
				'Server ' +
					newServerObject.name +
					' is now set only for tags ' +
					(Array.isArray(newServerObject.serverTags)
						? newServerObject.serverTags.join(', ')
						: newServerObject.serverTags)
			);
		}
		if (!newServerObject.serverTags && existingServerObject.serverTags) {
			logger.warn('Server ' + newServerObject.name + ' is no longer tag limitted');
		}
		if (
			newServerObject.serverTags &&
			existingServerObject.serverTags &&
			JSON.stringify(newServerObject.serverTags) !==
				JSON.stringify(existingServerObject.serverTags)
		) {
			logger.warn(
				'Server ' +
					newServerObject.name +
					' modified its tags to ' +
					(Array.isArray(newServerObject.serverTags)
						? newServerObject.serverTags.join(', ')
						: newServerObject.serverTags)
			);
		}
		if (existingServerObject.isBackupServer && !newServerObject.isBackupServer) {
			logger.warn('Server ' + newServerObject.name + ' is no longer a backup server.');
		}

		if (!existingServerObject.isBackupServer && newServerObject.isBackupServer) {
			logger.warn('Server ' + newServerObject.name + ' is now a backup server.');
		}
		if (
			existingServerObject.serverCanReceiveNewStreams &&
			!newServerObject.serverCanReceiveNewStreams
		) {
			logger.error(
				'Server ' +
					newServerObject.name +
					' started reporting unhealthy process or resource usage'
			);
		}

		if (
			!existingServerObject.serverCanReceiveNewStreams &&
			newServerObject.serverCanReceiveNewStreams
		) {
			logger.warn('Server ' + newServerObject.name + ' started reporting healthy again.');
		}
		if (
			existingServerObject.consequentFailures === 0 &&
			newServerObject.consequentFailures > 0 &&
			!existingServerObject.maintenance &&
			!existingServerObject.disabled
		)
			logger.error('Server ' + newServerObject.name + ' started failing.');

		if (
			existingServerObject.consequentFailures > 0 &&
			newServerObject.consequentFailures === 0 &&
			!existingServerObject.maintenance &&
			!existingServerObject.disabled
		)
			logger.warn(
				'Server ' + newServerObject.name + ' went live again after consequently failing.'
			);

		if (existingServerObject.maintenance && !newServerObject.maintenance)
			logger.warn('Server ' + newServerObject.name + ' went out of maintenance.');
		if (!existingServerObject.maintenance && newServerObject.maintenance)
			logger.warn('Server ' + newServerObject.name + ' set on maintenance.');
	}
};
const modifyTrackedServerIfExistsOrAddItIfNot = (serverObjectToAddOrModify) => {
	lock.acquire(
		'trackedServers',
		function (cb) {
			// Concurrency safe
			try {
				let modifiedTrackedServers = [];
				let wasPresentAndModified = false;
				trackedServers.forEach((current) => {
					if (current.name === serverObjectToAddOrModify.name) {
						wasPresentAndModified = true;
						evaluateAndDisplayDebugInformationBasedOnChanges(
							current,
							serverObjectToAddOrModify
						);

						modifiedTrackedServers = [
							...modifiedTrackedServers,
							{ ...current, ...serverObjectToAddOrModify }
						];
					} else {
						modifiedTrackedServers = [...modifiedTrackedServers, current];
					}
				});

				if (!wasPresentAndModified) {
					evaluateAndDisplayDebugInformationBasedOnChanges(
						null,
						serverObjectToAddOrModify
					);
					modifiedTrackedServers = [...modifiedTrackedServers, serverObjectToAddOrModify];
				}

				trackedServers = [...modifiedTrackedServers];
			} catch (err) {
				logger.error('Error on modifyTrackedServerIfExistsOrAddItIfNot: ' + err);
			}

			cb();
		},
		function (err, ret) {
			//released lock
		}
	);
};

const disableNotFoundServers = (latestDiscoveredServers) => {
	lock.acquire(
		'trackedServers',
		function (cb) {
			// Concurrency safe
			try {
				let modifiedTrackedServers = [];
				trackedServers.forEach((currentTrackedServer) => {
					const isCurrentTrackedServerPresentInLatestDiscoveredServers =
						latestDiscoveredServers.filter((current) => {
							return current.name === currentTrackedServer.name;
						}).length > 0;

					if (!isCurrentTrackedServerPresentInLatestDiscoveredServers) {
						if (!currentTrackedServer.disabled)
							logger.warn(
								'Server ' +
									currentTrackedServer.name +
									' was disabled because it was no longer found in DNS records.'
							);
						modifiedTrackedServers = [
							...modifiedTrackedServers,
							{ ...currentTrackedServer, disabled: true }
						];
					} else {
						if (currentTrackedServer.disabled)
							logger.warn(
								'Server ' + currentTrackedServer.name + ' was enabled again.'
							);
						modifiedTrackedServers = [
							...modifiedTrackedServers,
							{ ...currentTrackedServer, disabled: false }
						];
					}
				});

				trackedServers = modifiedTrackedServers;
			} catch (err) {
				logger.error('Error on serverTracker - disableNotFoundServers: ' + err);
			}

			cb();
		},
		function (err, ret) {
			//released lock
		}
	);
};
const processTrackedServersTimeouts = () => {
	lock.acquire(
		'trackedServers',
		function (cb) {
			// Concurrency safe
			try {
				let modifiedTrackedServers = [];

				trackedServers.forEach((current) => {
					const modifiedTrackedServer = { ...current };
					const now = new Date();
					/*
                    If is in maintenance mode, we treat it all the same, but we don't add totalFailures
                     */
					if (
						!current.disabled &&
						current.lastSeen &&
						(now.getTime() - current.lastSeen.getTime()) / 1000 >
							configProvider.INTERVAL_FOR_SERVER_TRACKER_IN_SECONDS *
								configProvider.MINIMUM_NUMBER_OF_SUBSEQUENT_TRACK_REQUESTS_BEFORE_INCREASING_FAILURES
					) {
						modifiedTrackedServer.consequentFailures++;
						if (!current.maintenance) {
							if (!modifiedTrackedServer.totalFailures)
								modifiedTrackedServer.totalFailures = 1;
							else modifiedTrackedServer.totalFailures++;
						}
					} else {
						modifiedTrackedServer.consequentFailures = 0;
					}
					modifiedTrackedServers = [...modifiedTrackedServers, modifiedTrackedServer];
				});

				trackedServers = [...modifiedTrackedServers];
			} catch (err) {
				logger.error('Error on modifyTrackedServerIfExistsOrAddItIfNot: ' + err);
			}

			cb();
		},
		function (err, ret) {
			//released lock
		}
	);
};
const trackServers = () => {
	if (!currentlyRunning) {
		currentlyRunning = true;
		try {
			const serversToProcess = getDiscoveredServers();
			disableNotFoundServers(serversToProcess);
			serversToProcess.forEach((current) => {
				trackSpecificServerAndGenerateServerObject(current)
					.then((serverObject) => {
						modifyTrackedServerIfExistsOrAddItIfNot(serverObject);
					})
					.catch((err) => {
						if (!current.maintenance)
							logger.error(
								'Could not track specific server ' +
									current.name +
									'(' +
									current.ip +
									') : ' +
									err
							);
					});
			});
		} catch (err) {
			logger.error('Error on trackServers:' + err);
		}
	}
	currentlyRunning = false;
};

const trackSpecificServerAndGenerateServerObject = (server) => {
	return new Promise((resolve, reject) => {
		/* server.maintenance is not considered because we still want to try to update in case there were still alive streams for monitor.
		 * What we don't do is displaying errors for servers on maintenance. In case of disabled servers, we do not retrieve streams or anything. */

		if (server.disabled) {
			const existingTrackedServer = findTrackedServerByServerName(server.name);
			if (existingTrackedServer) {
				resolve({
					...existingTrackedServer,
					...server
				});
			} else {
				resolve({
					...server,
					lastSeen: null,
					consequentFailures: 0
				});
			}
		} else {
			axios
				.get(
					`http://${server.name}:${configProvider.OBS_LEAVES_INNER_TRUNK_PORT}/innerTrunk?token=${configProvider.OBS_LEAVES_AUTH_TOKEN}`,
					{ timeout: configProvider.MILLISECONDS_FOR_SERVER_TRACKER_TIMEOUT }
				)
				.then((res) => {
					if (res.data) {
						const serverObject = {
							...res.data,
							...server,
							lastSeen: new Date(),
							consequentFailures: 0
						};
						resolve(serverObject);
					} else {
						reject();
					}
				})
				.catch((err) => {
					if (server.maintenance) {
						/*
                        If server is in maintenance and does not exist, we add it to server list anyways for the first time, with lastSeen null
                         */
						const existingTrackedServer = findTrackedServerByServerName(server.name);

						if (!existingTrackedServer) {
							resolve({
								...server,
								lastSeen: null,
								consequentFailures: 0
							});
						} else {
							reject(err);
						}
					} else {
						reject(err);
					}
				});
		}
	});
};
//
// const getStreamsForMonitorOnDevelEnvironment = () => {
// 	try {
// 		const streams = getStreamsForMonitor();
// 		let responseStreams = [];
// 		streams.forEach((current) => {
// 			if (current.streamId.includes(configProvider.DEVEL_INSTANCE)) {
// 				const streamToAdd = {
// 					...current,
// 					channelId: current.streamId.replace(configProvider.DEVEL_INSTANCE + '_', '')
// 				};
// 				responseStreams = [...responseStreams, streamToAdd];
// 			}
// 		});
// 		return responseStreams;
// 	} catch (err) {
// 		logger.error(
// 			'Error on getStreamsForMonitorOnDevelEnvironment for environment ' +
// 				environment +
// 				':' +
// 				err
// 		);
// 		return [];
// 	}
// };
//
// const getStreamsForMonitor = () => {
// 	try {
// 		let streamsMonitorResponse = [];
// 		trackedServers.forEach((current) => {
// 			if (
// 				current &&
// 				!current.disabled &&
// 				current.republishedStreamsInCurrentServer &&
// 				(current.maintenance ||
// 					(!current.maintenance &&
// 						current.consequentFailures <
// 							process.env
// 								.MAXIMUM_NUMBER_OF_CONSEQUENT_FAILURES_BEFORE_CONSIDERING_STREAMS_OF_THE_SERVER_OFFLINE))
// 			) {
// 				const now = new Date();
//
// 				/** To retrieve streams, if server is on maintenance, it should have retrieved data within the configured time margin **/
// 				if (
// 					!current.maintenance ||
// 					(current.maintenance &&
// 						current.lastSeen &&
// 						(now.getTime() - current.lastSeen.getTime()) / 1000 <
// 							process.env
// 								.TIME_SINCE_LAST_SERVER_TRACK_ON_MAINTENANCE_SERVERS_TO_STOP_RETRIEVING_STREAMS_IN_MINUTES *
// 								60)
// 				) {
// 					current.republishedStreamsInCurrentServer.forEach(
// 						(currentRepublishedStream) => {
// 							let isCurrentStreamAlreadyPresentInStreamsMonitor = false;
// 							let isCurrentStreamInAnotherServerAndCurrentOneIsNewer = false;
// 							streamsMonitorResponse.forEach((current) => {
// 								if (current.streamId === currentRepublishedStream.streamId) {
// 									isCurrentStreamAlreadyPresentInStreamsMonitor = true;
// 									if (currentRepublishedStream.startTime > current.startTime)
// 										isCurrentStreamInAnotherServerAndCurrentOneIsNewer = true;
// 								}
// 							});
//
// 							if (!isCurrentStreamAlreadyPresentInStreamsMonitor) {
// 								streamsMonitorResponse = [
// 									...streamsMonitorResponse,
// 									currentRepublishedStream
// 								];
// 							} else if (isCurrentStreamInAnotherServerAndCurrentOneIsNewer) {
// 								streamsMonitorResponse = streamsMonitorResponse.filter(
// 									(current) => {
// 										return (
// 											current.streamId !== currentRepublishedStream.streamId
// 										);
// 									}
// 								);
// 								streamsMonitorResponse = [
// 									...streamsMonitorResponse,
// 									currentRepublishedStream
// 								];
// 							}
// 						}
// 					);
// 				}
// 			}
// 		});
// 		return streamsMonitorResponse;
// 	} catch (err) {
// 		logger.error('Error on getStreamsForMonitor: ' + err);
// 		throw new Error(err);
// 	}
// };

const getTrackedServers = () => {
	return trackedServers;
};

const getTrackedServersClearingRepublishedStreamsField = () => {
	try {
		let response = [];
		trackedServers.forEach((current) => {
			let newCurrentTrackedServerForResponse = { ...current };
			if (newCurrentTrackedServerForResponse.republishedStreamsInCurrentServer)
				delete newCurrentTrackedServerForResponse.republishedStreamsInCurrentServer;
			response = [...response, newCurrentTrackedServerForResponse];
		});
		return response;
	} catch (err) {
		logger.error('Error on getTrackedServersClearingRepublishedStreamsField' + err);
	}
};

const getServersThatAreNotDisabledAndNotInMaintenanceAndCanReceiveNewStreamsClearingRepublishedStreamsField =
	() => {
		try {
			let response = [];
			trackedServers.forEach((current) => {
				let newCurrentTrackedServerForResponse = { ...current };
				if (newCurrentTrackedServerForResponse.republishedStreamsInCurrentServer)
					delete newCurrentTrackedServerForResponse.republishedStreamsInCurrentServer;
				if (
					!current.disabled &&
					!current.maintenance &&
					current.serverCanReceiveNewStreams
				) {
					response = [...response, newCurrentTrackedServerForResponse];
				}
			});
			return response;
		} catch (err) {
			logger.error('Error on getTrackedServersClearingRepublishedStreamsField' + err);
		}
	};

const getOfflineTrackedServers = () => {
	return trackedServers.filter((current) => {
		return current.consequentFailures > 0;
	});
};

const getOnlineTrackedServers = () => {
	return trackedServers.filter((current) => {
		return current.consequentFailures === 0;
	});
};

const getWithServerFailuresTrackedServers = () => {
	return trackedServers.filter((current) => {
		return current.totalFailures > 0 || current.consequentFailures > 0;
	});
};

const getWithAnyFailuresTrackedServers = () => {
	return trackedServers.filter((current) => {
		return (
			current.totalFailures > 0 ||
			current.consequentFailures > 0 ||
			(current.serverCanReceiveNewStreams !== null && !!current.serverCanReceiveNewStreams)
		);
	});
};

const getWithConsequentFailuresOrCantReceiveNewStreams = () => {
	return trackedServers.filter((current) => {
		return (
			current.consequentFailures > 0 ||
			(current.serverCanReceiveNewStreams !== null && !current.serverCanReceiveNewStreams)
		);
	});
};

const getInMaintenanceTrackedServers = () => {
	return trackedServers.filter((current) => {
		return !!current.maintenance;
	});
};
const getDisabledTrackedServers = () => {
	return trackedServers.filter((current) => {
		return !!current.disabled;
	});
};
const findTrackedServerByServerName = (serverName) => {
	let foundServer = null;
	trackedServers.forEach((current) => {
		if (current.name === serverName) {
			foundServer = current;
		}
	});
	return foundServer;
};

const getServerIsOnMaintenance = (serverName) => {
	const foundServerObject = findTrackedServerByServerName(serverName);
	if (foundServerObject) return !!foundServerObject.maintenance;
	return false;
};
const getServerIsDisabled = (serverName) => {
	const foundServerObject = findTrackedServerByServerName(serverName);
	if (foundServerObject) return !!foundServerObject.disabled;
	return false;
};

const getBusyServers = () => {
	return trackedServers.filter((current) => {
		if (current.cpuUsage && current.cpuUsage >= configProvider.OBS_LEAVES_MAX_CPU_USAGE)
			return true;

		if (current.maxGpuUsage && current.maxGpuUsage >= configProvider.OBS_LEAVES_MAX_GPU_USAGE)
			return true;
		return false;
	});
};
module.exports = {
	getBusyServers,
	getServerIsDisabled,
	trackServers,
	getTrackedServers,
	getWithServerFailuresTrackedServers,
	getOnlineTrackedServers,
	processTrackedServersTimeouts,
	getOfflineTrackedServers,
	getWithAnyFailuresTrackedServers,
	getServerIsOnMaintenance,
	getTrackedServersClearingRepublishedStreamsField,
	getThereIsAnyTrackedServer,
	getInMaintenanceTrackedServers,
	getDisabledTrackedServers,
	findTrackedServerByServerName,
	clearSpecificStreamStats,
	getWithConsequentFailuresOrCantReceiveNewStreams,
	clearAllStreamStats,
	getServersThatAreNotDisabledAndNotInMaintenanceAndCanReceiveNewStreamsClearingRepublishedStreamsField
};
