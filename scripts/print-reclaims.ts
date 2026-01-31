#!/usr/bin/env ts-node
import Reclaimer from '../src/kora-reclaimer';

const csv = Reclaimer.exportCSV(60*60*24);
console.log(csv);
