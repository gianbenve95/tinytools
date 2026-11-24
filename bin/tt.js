#!/usr/bin/env node
'use strict';
// exitCode (non process.exit) lascia scaricare stdout prima di uscire: con output lunghi in pipe evita troncamenti
require('../src/core').main(process.argv.slice(2)).then(c => { process.exitCode = c; });
