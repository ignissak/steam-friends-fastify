import * as winston from 'winston';
import moment from 'moment';

/**
 * Configures the winston logger. There are also file and remote transports available
 */
const logger = winston.createLogger({
	transports: [
		new winston.transports.File({
			filename: `logs/app.log`,
			level: 'info',
			handleExceptions: true,
			maxsize: 5242880, // 5MB
			maxFiles: 20,
			format: winston.format.combine(
				winston.format.printf((info: any) => {
					return `[${moment().format('DD/MM/YYYY HH:mm:ss')}] [${
						info.level
					}]: ${info.message}`;
				}),
			),
		}),
		new winston.transports.Console({
			level: 'debug',
			handleExceptions: true,
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.printf((info: any) => {
					return `[${moment().format('DD/MM/YYYY HH:mm:ss')}] [${
						info.level
					}]: ${info.message}`;
				}),
			),
		}),
	],
	exitOnError: false,
});

const stream = (streamFunction: any) => ({
	stream: streamFunction,
});

const write = (writeFunction: any) => ({
	write: (message: string) => writeFunction(message),
});

/**
 * Winston logger stream for the morgan plugin
 */
export const winstonStream = stream(write(logger.info));

// imports debug moduel
import Debug from 'debug';
const debug = Debug('app:response');

/**
 * Debug stream for the morgan plugin
 */
export const debugStream = stream(write(debug));

/**
 * Exports a wrapper for all the loggers we use in this configuration
 */
const format = (scope: string, message: string): string =>
	`[${scope}] ${message}`;

const parse = (args: any[]) => (args.length > 0 ? args : '');

export const Logger = (scope: string) => {
	const scopeDebug = Debug(scope);
	return {
		debug: (message: string, ...args: any[]) => {
			const isDebug = process.env.DEBUG;
			if (isDebug && isDebug === 'true') {
				logger.debug(format(scope, message), parse(args));
			}
			scopeDebug(message, parse(args));
		},
		verbose: (message: string, ...args: any[]) =>
			logger.verbose(format(scope, message), parse(args)),
		silly: (message: string, ...args: any[]) =>
			logger.silly(format(scope, message), parse(args)),
		info: (message: string, ...args: any[]) =>
			logger.info(format(scope, message), parse(args)),
		warn: (message: string, ...args: any[]) =>
			logger.warn(format(scope, message), parse(args)),
		error: (message: string, ...args: any[]) =>
			logger.error(format(scope, message), parse(args)),
	};
};
