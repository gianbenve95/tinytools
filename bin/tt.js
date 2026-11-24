#!/usr/bin/env node
'use strict';
require('../src/core').main(process.argv.slice(2)).then(c => process.exit(c));
