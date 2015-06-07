/**
 * augur.js unit tests
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var BigNumber = require("bignumber.js");
var assert = require("assert");
var _ = require("lodash");
var fs = require('fs');
var Augur = require("../augur");
var constants = require("./constants");

require('it-each')({ testPerIteration: true });

Augur.connect();

var log = console.log;
var TIMEOUT = 120000;

var branch = Augur.branches.dev;
var vote_period = Augur.getVotePeriod(branch);

describe("populating vote periods +1 and +50", function () {

    var events = fs.readFileSync('events.dat').toString().split("\n");
    for (var i in events) {
        console.log(events[i]);
    }

    // it.each(events, "addEvent: %s", ['element'], function (element, next) {
    //     Augur.tx.addEvent.send = false;
    //     assert.equal(Augur.addEvent(branch, parseInt(vote_period) + 1, element), "0x01");
    //     Augur.tx.addEvent.send = true;
    //     Augur.addEvent(branch, parseInt(vote_period) + 10, element);
    //     next();
    // });
    
    // it.each(events, "addEvent (future): %s", ['element'], function (element, next) {
    //     Augur.tx.addEvent.send = false;
    //     assert.equal(Augur.addEvent(branch, parseInt(vote_period) + 50, element), "0x01");
    //     Augur.tx.addEvent.send = true;
    //     Augur.addEvent(branch, parseInt(vote_period) + 50, element);
    //     next();
    // });

});
