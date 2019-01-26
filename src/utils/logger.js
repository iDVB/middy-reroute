import debug from 'debug';
const log = debug('reroute:log');
log.log = console.log.bind(console);

export default log;
