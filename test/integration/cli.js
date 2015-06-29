var argv = require('optimist').argv;
var integration = require('./index');
argv.callback = function () { process.exit(); };
integration(argv);
