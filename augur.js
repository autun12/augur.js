/**
 * JavaScript bindings for the Augur API
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var MODULAR = (typeof(module) !== 'undefined');
var NODE_JS = MODULAR && process && !process.browser;
if (MODULAR) {
    if (NODE_JS) {
        var request = require('sync-request');
        var XHR2 = require('xhr2');
    }
    var keccak_256 = require('js-sha3').keccak_256;
    var BigNumber = require('bignumber.js');
    var moment = require('moment');
    var chalk = require('chalk');
}

var log = console.log;

var Augur = (function (augur) {

    BigNumber.config({ MODULO_MODE: BigNumber.EUCLID });

    // default RPC settings
    augur.RPC = {
        protocol: "http",
        host: "127.0.0.1",
        port: 8545
    };

    // default gas: 3.135M
    augur.default_gas = "0x2fd618";

    // if set to true, all numerical results (including hashes)
    // are returned as BigNumber objects
    augur.BigNumberOnly = false;

    // max number of tx verification attempts
    augur.TX_POLL_MAX = 24;

    // comment polling interval (in milliseconds)
    augur.COMMENT_POLL_INTERVAL = 10000;

    // eth filter polling interval (in milliseconds)
    augur.ETH_POLL_INTERVAL = 10000;

    // transaction polling interval
    augur.TX_POLL_INTERVAL = 6000;

    // constants
    augur.MAXBITS = (new BigNumber(2)).toPower(256);
    augur.MAXNUM = (new BigNumber(2)).toPower(255);
    augur.ONE = (new BigNumber(2)).toPower(64);
    augur.TWO = (new BigNumber(2)).toPower(65);
    augur.BAD = ((new BigNumber(2)).toPower(63)).mul(new BigNumber(3));
    augur.ETHER = (new BigNumber(10)).toPower(18);
    augur.AGAINST = augur.NO = 1; // against: "won't happen"
    augur.ON = augur.YES = 2;     // on: "will happen"
    augur.SECONDS_PER_BLOCK = 12;

    augur.id = 1;
    augur.data = {};

    // whisper filters
    augur.filters = {}; // key: marketId => {filterId: hexstring, polling: bool}

    // price log filters
    augur.price_filters = {
        updatePrice: null,
        pricePaid: null,
        priceSold: null
    };

    // contract error codes
    augur.ERRORS = {
        "0x": "no response or bad input",
        getSimulatedBuy: {
            "-2": "cost updating error (did you enter a valid quantity?)"
        },
        closeMarket: {
            "-1": "market has no cash",
            "-2": "0 outcome",
            "-3": "outcome indeterminable"
        },
        report: {
            "0": "could not set reporter ballot",
            "-1": "report length does not match number of expiring events",
            "-2": "voting period expired",
            "-3": "incorrect hash"
        },
        submitReportHash: {
            "0": "could not set report hash",
            "-1": "reporter doesn't exist, voting period is over, or voting "+
                "period hasn't started yet",
            "-2": "not in hash submitting timeframe"
        },
        checkReportValidity: {
            "-1": "report isn't long enough",
            "-2": "reporter doesn't exist, voting period is over, or voting "+
                "period hasn't started yet"
        },
        slashRep: {
            "0": "incorrect hash",
            "-2": "incorrect reporter ID"
        },
        createEvent: {
            "0": "not enough money to pay fees or event already exists",
            "-1": "we're either already past that date, branch doesn't "+
                "exist, or description is bad"
        },
        createMarket: {
            "-1": "bad input or parent doesn't exist",
            "-2": "too many events",
            "-3": "too many outcomes",
            "-4": "not enough money or market already exists"
        },
        sendReputation: {
            "0": "not enough reputation",
            "-1": "Your reputation account was just created! Earn some "+
                "reputation before you can send to others",
            "-2": "Receiving address doesn't exist"
        },
        buyShares: {
            "-1": "invalid outcome or trading closed",
            "-2": "entered a negative number of shares",
            "-3": "not enough money",
            "-4": "bad nonce/hash"
        }
    };
    augur.ERRORS.getSimulatedSell = augur.ERRORS.getSimulatedBuy;
    augur.ERRORS.sellShares = augur.ERRORS.buyShares;

    /**********************
     * Contract addresses *
     **********************/

    /* Ethereum testnet addresses */
    augur.testnet_contracts = {

        // Functions
        checkQuorum: "0xcfae33b64e8aeb7d486f66da0b5946da344ab255",
        buyAndSellShares: "0x53f58efd50c9a5e39b89411c5add8068a4212302",
        createBranch: "0x85b279b8e47e54ecf3f3f2469cb198e355707699",
        p2pWagers: "0x3419dc5b6aa801afa7ce050189c6a732dadc5698",
        sendReputation: "0x2a77d5e9bb15c05b5d75cec058dfc1eb13ddf28e",
        transferShares: "0x0c8db477a5beac34e8da7d6abbbfeea3dac04aca",
        makeReports: "0xcb6095b1b1e690a83d8056f68edbf4773e2633b1",
        createEvent: "0xf07bab64e50642477129c2188bfbd357647c61a4",
        createMarket: "0x22cc7b4a20fd18fc7014c2f781318e451a1d8654",
        closeMarket: "0x46e3aed29cf99786ae87cfb92b39b35501006a19",
        closeMarketOne: "0x3e4c03854540a0976799a4eb0cecc4c3e562f6ac",
        closeMarketTwo: "0xb1e2bbc22eb477276a93a6792975b02226568e94",
        closeMarketFour: "0x867302e5d20f322326b8f9e10baf0c6f5bc3188a",
        closeMarketEight: "0x0632e0ded38995753327b2368f4186abfa9a1d41",
        dispatch: "0x8104c3881cbd7ea9a129aaec80e346784ff83d55",

        // Consensus
        statistics: "0xfb1377305dc846b7cef2805c41701e4afabedc27",
        interpolate: "0x8b2b49f5de8b9d505c1babd089fffd5df91b0843",
        center: "0x47c400e2cfa58b00ec687e78b429e283e8ac8311",
        score: "0xbc4494e6dba414fdf47f2ea5bff63592fd4e4240",
        adjust: "0x12c30624ebe0e3bc3299db47748d678afa2c5a64",
        resolve: "0x0f809587da977cad60eb572d9f1b6403141d09da",
        payout: "0x71e9b98042baee7291bd1fceeaa2e520469696d4",
        redeem_interpolate: "0xde63100ad35d735ec43720ea3006e20497801379",
        redeem_center: "0x84d6c8c19a35a95da735918f1152cf23b5c4e84a",
        redeem_score: "0x63a69c85ffbd6e74b8fa570d9132e29067126d5d",
        redeem_adjust: "0xdbb0e7eb9cee7bbe4b508ff97c68945041ff6f99",
        redeem_resolve: "0xbfabbadc6e750001121868244bf63b6bc55435d2",
        redeem_payout: "0xe271890e035a36e8a61c128617c0684f54f68e58",

        // Data and api
        cash: "0xa60f44a6a44602770e9842881afe311ed7271089",
        info: "0x406a75f79a60fbd4560baab945b99d356ba52388",
        branches: "0xb77802f2beeaf05f1014b3089b17942efcdd0b4a",
        events: "0xcbb898b5bffc62e21ffc6b9d50e071383fb05f03",
        expiringEvents: "0xabb5c347ac3f5392d69f7f94280423b5c072a927",
        fxMath: "0x6befe06a7b6a0511fc1bf5966f3babff120c090f",
        markets: "0xc1d720000b342bbc4ab46e6ac6cb7940d43134fe",
        reporting: "0x3fef2aaedbd0fc6c1d5e1453a773a74326a33c45"
    };

    /* Augur private chain (networkid 1010101) addresses */
    augur.privatechain_contracts =  {
        "checkQuorum": "0x68c44cedcbc5e47927bad7f19438947689915e2a",
        "buyAndSellShares": "0x56d1a380aba030e00798b84bfa2c5e8700cbf7d6",
        "createBranch": "0x4671a332f05b711324526b488942230e320aef3e",
        "p2pWagers": "0x9bc65745ddefdd6cbce1e0f66eb353f4507cdc8a",
        "sendReputation": "0x3426b13b188052fc0d2bf7f4849e6286d09645c7",
        "transferShares": "0x99e016dcd8ae6b9341c29bba1eae5c561216d8b4",
        "makeReports": "0x949e2f69cc7aedc68b78549e744b7f492c8494c9",
        "createEvent": "0xfdad48538d0d58c983b5b4fec4f5b85f1ab39f88",
        "createMarket": "0xf152244b598d39faa71f973d58b662b927c2ab11",
        "closeMarket": "0x5ca803c6d12ff101f132ab1e1c0b1a75216a6a02",
        "closeMarketOne": "0x08558b6e4fcc0dfd09f1507f17fe3edeaaafb137",
        "closeMarketTwo": "0x26bad3f2f51a83b59bfbc9cfb15257290bd0c981",
        "closeMarketFour": "0xb7a553f89b116809dfbabcb93de1ed51c50c7fd3",
        "closeMarketEight": "0x35185da9f690c18286895b933b3794e2aed0ee6d",
        "dispatch": "0x09f8647178d61f73691560fa90098bcb3e51170b",

        "cash": "0xff62e09a1374985259da0a05a970172814b50285",
        "info": "0xb1f2223c2ef0f7a4f50076594c426614b32939c1",
        "branches": "0x1d0a4d844ff543d5d32af631e15c7cb42c136e0e",
        "events": "0x2b239ef79cb6e0ef8e27b17d2682d70b2f2b969b",
        "expiringEvents": "0x7e433022ebdc8b11444104c0ab4064652dcb1444",
        "fxpFunctions": "0x42a88259280250fc9803f5f9caaa8f607b06e044",
        "markets": "0xb54ecd11ae41c65f53af12a36554eb981e20652a",
        "reporting": "0x0a833f10b1fb3e0764c91fa2f8341aff3d8d100f",

        "statistics": "0xbaafd72214725950f5cfda09b44222c2fa055a6f",
        "interpolate": "0x5e6b04832ea5dce02306d0e57b6c56481eb0517d",
        "center": "0x3c28ffca64b3ff751b0db3f1b6a833a27f1f40e7",
        "score": "0xb1cf92c59fa8eed193bc1788d53bbf54dfe6bac3",
        "adjust": "0x14f3d78578d9b9c76a54cbc92c9bd57816026500",
        "resolve": "0x56d833ceb6f631018e8fa647eeea70c1d217dd60",
        "payout": "0xf46bc561c383ca2bfae2f0bde39336f3fd75a83d",
        "redeem_interpolate": "0x03b327a51bfb2198f821c4785dd3c8b6b93c4337",
        "redeem_center": "0xb32454b1ed72efb4200560543b789fbfd9502486",
        "redeem_score": "0x90d179ee9dd4ca587f5cc1b1163507d54ac164db",
        "redeem_adjust": "0x9f128263813539a4751565784f81f3e14eed0145",
        "redeem_resolve": "0x28fb2c3057e73fc9ee4f18de9c43808c13cea286",
        "redeem_payout": "0x7dc5f70d8747281fff1b57abcd8e9a7f49cb7de5"
    };

    /* Testing private chain (networkid 10101) addresses */
    augur.testchain_contracts = {
        "checkQuorum": "0x681e3e5c3133ff351017fb544c46363a9e2ee8d3",
        "buyAndSellShares": "0x803ab720b1883301fc869b3ed1a61899b0742df9",
        "createBranch": "0x8512b58d2868c44a5bb2c2171fffb395fd3adbba",
        "p2pWagers": "0x77e6db6a22ab6025b9926b7495a5c6dc4731c2ba",
        "sendReputation": "0xacbd9270c1a1ec8ab7c34b995fe1315b158490ae",
        "transferShares": "0xfe29a60e60eec7d4b91f730fa188d9d8f35a65de",
        "makeReports": "0x17895f30b2facf56413e7356cf5385edcdc48b5e",
        "createEvent": "0x190fc1bbea242a30baf8a5befe709b89c369f561",
        "createMarket": "0xb67bc8941ea02b8353eca985ee572db6695614a3",
        "closeMarket": "0x3864c7f86352da4f0aaf80e78a34e10a76200727",
        "closeMarketOne": "0x2ce345cb0cdcbb7dd13f63aca7ccce50a7401533",
        "closeMarketTwo": "0xc4728649ce1964af65f3910ff2ebcb2d9205c4b5",
        "closeMarketFour": "0x1b103614482bab1afdbc492221cad83ae87552f4",
        "closeMarketEight": "0xcda9e4636a1e54d18ba217133dafa2367cd563da",
        "dispatch": "0xe0e0706aa7fc7507009a75e24122b2c400f67d86",

        "cash": "0x08163213345163e38b45b2fed9dcfd75594a838a",
        "info": "0xa178f560e5174ef566929549e386495910dd23fc",
        "branches": "0x85693da19f633b8ef0bdbfb527a68cdaf30ff192",
        "events": "0xc0fa90ea6643fc94e6cc43993ade17c43674e7e1",
        "expiringEvents": "0x7f668cdf010983142fada98d1731e52c0d1a35f9",
        "fxpFunctions": "0x0de7904a19f3cd77d5a22d56fabf271daeb61cc4",
        "markets": "0x163fe7bb13b6f852f4005fb36b335530cc2145f9",
        "reporting": "0xdaba557e6690415c7f81daec3487ea0e8e3205ab",

        "statistics": "0xc3b183d35754c995dc58b2ac67c49d79958e6287",
        "interpolate": "0x8fcd63f1ab2b86c226cbe30d3d7736b09f5790c1",
        "center": "0xb14010eb05acce2a0493479db9955cd8967500e6",
        "score": "0xb3626139e8a2772a341111cf7035b72379c59681",
        "adjust": "0x795af763dd0c5627ce6ad590d8734bf4ce64a266",
        "resolve": "0x67f0ea717bc1587353c1119abf856bc5f68b8b6c",
        "payout": "0x6191967b297bc02f7dbf06e9270b2ad35b3692bf",
        "redeem_interpolate": "0x796fe6c1dd8064439a51f8f1762080f5434baf62",
        "redeem_center": "0xc1612c769fda098f7d68b38b1c8b3da5a4f6f8d6",
        "redeem_score": "0x39493c0aea20ccc3a7571fb8bd6d51a32794c360",
        "redeem_adjust": "0xee647a5ba4337728165e6a23bb28f3ccc411870b",
        "redeem_resolve": "0x159c4ce332b8e82110daf3ad5371502207008a4b",
        "redeem_payout": "0x119d2b859e2b5fe6940f37ca3222f7506d3915af"
    };

    // Branch IDs
    augur.branches = {
        demo: '0x00000000000000000000000000000000000000000000000000000000000f69b5',
        alpha: '0x00000000000000000000000000000000000000000000000000000000000f69b5',
        dev: '0x00000000000000000000000000000000000000000000000000000000000f69b5'
    };

    // Demo account (for demo.augur.net)
    augur.demo = "0x5baaabf5213c7189d2f97c8580cb933494454b3b";

    /*********************
     * Utility functions *
     *********************/

    function copy(obj) {
        if (null === obj || "object" !== typeof obj) return obj;
        var clone = obj.constructor();
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) clone[attr] = obj[attr];
        }
        return clone;
    }
    function has_value(o, v) {
        for (var p in o) {
            if (o.hasOwnProperty(p)) {
                if (o[p] === v) {
                    return p;
                }
            }
        }
    }
    augur.loop = function(list, iterator) {
        var n = list.length;
        var i = -1;
        var calls = 0;
        var looping = false;
        var iterate = function () {
            calls -= 1;
            i += 1;
            if (i === n) return;
            iterator(list[i], next);
        };
        var runloop = function () {
            if (looping) return;
            looping = true;
            while (calls > 0) iterate();
            looping = false;
        };
        var next = function () {
            calls += 1;
            if (typeof setTimeout === 'undefined') runloop();
            else setTimeout(iterate, 1);
        };
        next();
    };
    augur.fold = function(arr, num_cols) {
        var i, j, folded, num_rows, row;
        folded = [];
        num_cols = parseInt(num_cols);
        num_rows = arr.length / num_cols;
        num_rows = parseInt(num_rows);
        for (i = 0; i < parseInt(num_rows); ++i) {
            row = [];
            for (j = 0; j < num_cols; ++j) {
                row.push(arr[i*num_cols + j]);
            }
            folded.push(row);
        }
        return folded;
    };

    // calculate date from block number
    augur.block_to_date = function (block) {
        var current_block = augur.blockNumber();
        var seconds = (block - current_block) * augur.SECONDS_PER_BLOCK;
        var date = moment().add(seconds, 'seconds');
        return date;
    };

    augur.date_to_block = function (date) {
        date = moment(new Date(date));
        var current_block = augur.blockNumber();
        var now = moment();
        var seconds_delta = date.diff(now, 'seconds');
        var block_delta = parseInt(seconds_delta / augur.SECONDS_PER_BLOCK);
        return current_block + block_delta;
    };

    augur.contracts = copy(augur.testnet_contracts);

    /**************************
     * Fixed-point conversion *
     **************************/

    augur.prefix_hex = function (n) {
        if (n.constructor === Number || n.constructor === BigNumber) {
            n = n.toString(16);
        }
        if (n.slice(0,2) !== "0x" && n.slice(0,3) !== "-0x") {
            if (n.slice(0,1) === '-') {
                n = "-0x" + n.slice(1);
            } else {
                n = "0x" + n;
            }
        }
        return n;
    };
    augur.bignum = function (n, compact) {
        var bn, len;
        if (n !== null && n !== undefined && n !== "0x") {
            if (n.constructor === Number) {
                if (Math.floor(Math.log(n) / Math.log(10) + 1) <= 15) {
                    bn = new BigNumber(n);
                } else {
                    n = n.toString();
                    try {
                        bn = new BigNumber(n);
                    } catch (exc) {
                        if (n.slice(0,1) === '-') {
                            bn = new BigNumber("-0x" + n.slice(1));
                        }
                        bn = new BigNumber("0x" + n);
                    }
                }
            } else if (n.constructor === String) {
                try {
                    bn = new BigNumber(n);
                } catch (exc) {
                    if (n.slice(0,1) === '-') {
                        bn = new BigNumber("-0x" + n.slice(1));
                    }
                    bn = new BigNumber("0x" + n);
                }
            } else if (n.constructor === BigNumber) {
                bn = n;
            } else if (n.constructor === Array ) {
                len = n.length;
                bn = new Array(len);
                for (var i = 0; i < len; ++i) {
                    bn[i] = augur.bignum(n[i]);
                }
            }
            if (bn && bn.constructor !== Array && bn.gt(augur.MAXNUM)) {
                bn = bn.sub(augur.MAXBITS);
            }
            if (compact && bn.constructor !== Array) {
                var cbn = bn.sub(augur.MAXBITS);
                if (bn.toString(16).length > cbn.toString(16).length) {
                    bn = cbn;
                }
            }
            return bn;
        } else {
            return n;
        }
    };
    augur.fix = function (n, encode) {
        var fixed;
        if (n && n !== "0x") {
            if (encode) encode = encode.toLowerCase();
            if (n.constructor === Array) {
                var len = n.length;
                fixed = new Array(len);
                for (var i = 0; i < len; ++i) {
                    fixed[i] = augur.fix(n[i], encode);
                }
            } else {
                if (n.constructor === BigNumber) {
                    fixed = n.mul(augur.ONE).round();
                } else {
                    fixed = augur.bignum(n).mul(augur.ONE).round();
                }
                if (fixed && fixed.gt(augur.MAXNUM)) {
                    fixed = fixed.sub(augur.MAXBITS);
                }
                if (encode) {
                    if (encode === "string") {
                        fixed = fixed.toFixed();
                    } else if (encode === "hex") {
                        fixed = augur.prefix_hex(fixed);
                    }
                }
            }
            return fixed;
        } else {
            return n;
        }
    };
    augur.unfix = function (n, encode) {
        var unfixed;
        if (n && n !== "0x") {
            if (encode) encode = encode.toLowerCase();
            if (n.constructor === Array) {
                var len = n.length;
                unfixed = new Array(len);
                for (var i = 0; i < len; ++i) {
                    unfixed[i] = augur.unfix(n[i], encode);
                }
            } else {
                if (n.constructor === BigNumber) {
                    unfixed = n.dividedBy(augur.ONE);
                } else {
                    unfixed = augur.bignum(n).dividedBy(augur.ONE);
                }
                if (encode) {
                    if (encode === "hex") {
                        unfixed = augur.prefix_hex(unfixed);
                    } else if (encode === "string") {
                        unfixed = unfixed.toFixed();
                    } else if (encode === "number") {
                        unfixed = unfixed.toNumber();
                    }
                }
            }
            return unfixed;
        } else {
            return n;
        }
    };

    /***********************************
     * Contract ABI data serialization *
     ***********************************/

    function encode_int(value) {
        var cs = [];
        var x = new BigNumber(value);
        while (x.gt(new BigNumber(0))) {
            cs.push(String.fromCharCode(x.mod(new BigNumber(256))));
            x = x.dividedBy(new BigNumber(256)).floor();
        }
        return (cs.reverse()).join('');
    }
    function remove_leading_zeros(h) {
        var hex = h.toString();
        if (hex.slice(0, 2) === "0x") {
            hex = hex.slice(2);
        }
        if (!/^0+$/.test(hex)) {
            while (hex.slice(0, 2) === "00") {
                hex = hex.slice(2);
            }
        }
        return hex;
    }
    function remove_trailing_zeros(h) {
        var hex = h.toString();
        while (hex.slice(-2) === "00") {
            hex = hex.slice(0,-2);
        }
        return hex;
    }
    augur.encode_hex = function (str) {
        var hexbyte, hex = '';
        for (var i = 0, len = str.length; i < len; ++i) {
            hexbyte = str.charCodeAt(i).toString(16);
            if (hexbyte.length === 1) hexbyte = "0" + hexbyte;
            hex += hexbyte;
        }
        return hex;
    };
    augur.decode_hex = function (h, strip) {
        var hex = h.toString();
        var str = '';
        // first 32 bytes = new ABI offset
        if (strip) {
            if (h.slice(0,2) === "0x") h = h.slice(2);
            h = h.slice(64);
        }
        hex = remove_leading_zeros(h);
        // remove leading byte(s) = string length
        if (strip) {
            var len = hex.length;
            if (len > 16777215) {     // leading 4 bytes if > 16777215
                hex = hex.slice(8);
            } else if (len > 65540) { // leading 3 bytes if > 65535
                hex = hex.slice(6);
            } else if (len > 259) {   // leading 2 bytes if > 255
                hex = hex.slice(4);
            } else {
                hex = hex.slice(2);
            }
            hex = remove_trailing_zeros(hex);
        }
        for (var i = 0, l = hex.length; i < l; i += 2) {
            str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
        return str;
    };
    function pad_right(s) {
        var output = s;
        while (output.length < 64) {
            output += '0';
        }
        return output;
    }
    function pad_left(r, ishex) {
        var output = r;
        if (!ishex) output = augur.encode_hex(output);
        while (output.length < 64) {
            output = '0' + output;
        }
        return output;
    }
    augur.get_prefix = function(funcname, signature) {
        signature = signature || "";
        var summary = funcname + "(";
        for (var i = 0, len = signature.length; i < len; ++i) {
            switch (signature[i]) {
                case 's':
                    summary += "bytes";
                    break;
                case 'i':
                    summary += "int256";
                    break;
                case 'a':
                    summary += "int256[]";
                    break;
                default:
                    summary += "weird";
            }
            if (i !== len - 1) summary += ",";
        }
        var prefix = keccak_256(summary + ")").slice(0, 8);
        while (prefix.slice(0, 1) === '0') {
            prefix = prefix.slice(1);
        }
        return "0x" + prefix;
    };

    /********************************
     * Parse Ethereum response JSON *
     ********************************/

    function parse_array(string, returns, stride, init) {
        var elements, array, position;
        if (string.length >= 66) {
            stride = stride || 64;
            elements = (string.length - 2) / stride;
            array = new Array(elements);
            position = init || 2;
            for (var i = 0; i < elements; ++i) {
                array[i] = augur.prefix_hex(string.slice(position, position + stride));
                position += stride;
            }
            if (array.length) {
                if (parseInt(array[0]) === array.length - 1) {
                    array.splice(0, 1);
                } else if (parseInt(array[1]) === array.length - 2 || parseInt(array[1]) / 32 === array.length - 2) {
                    array.splice(0, 2);
                }
            }
            for (i = 0; i < array.length; ++i) {
                if (returns === "hash[]" && augur.BigNumberOnly) {
                    array[i] = augur.bignum(array[i]);
                } else {
                    if (returns === "number[]") {
                        array[i] = augur.bignum(array[i]).toFixed();
                    } else if (returns === "unfix[]") {
                        if (augur.BigNumberOnly) {
                            array[i] = augur.unfix(array[i]);
                        } else {
                            array[i] = augur.unfix(array[i], "string");
                        }
                    }
                }
            }
            return array;
        } else {
            // expected array, got scalar error code
            return string;
        }
    }
    function format_result(returns, result) {
        returns = returns.toLowerCase();
        if (result && result !== "0x") {
            if (returns && returns.slice(-2) === "[]") {
                result = parse_array(result, returns);
            } else if (returns === "string") {
                result = augur.decode_hex(result, true);
            } else {
                if (augur.BigNumberOnly) {
                    if (returns === "unfix") {
                        result = augur.unfix(result);
                    }
                    if (result.constructor !== BigNumber) {
                        result = augur.bignum(result);
                    }
                } else {
                    if (returns === "number") {
                        result = augur.bignum(result).toFixed();
                    } else if (returns === "bignumber") {
                        result = augur.bignum(result);
                    } else if (returns === "unfix") {
                        result = augur.unfix(result, "string");
                    }
                }
            }
        }
        return result;
    }

    function parse(response, returns, callback) {
        var results, len;
        try {
            if (response !== undefined) {
                response = JSON.parse(response);
                if (response.error) {
                    response = {
                        error: response.error.code,
                        message: response.error.message
                    };
                    if (callback) {
                        callback(response);
                    } else {
                        return response;
                    }
                } else if (response.result !== undefined) {
                    if (returns) {
                        response.result = format_result(returns, response.result);
                    } else {
                        if (response.result && response.result.length > 2 && response.result.slice(0,2) === "0x") {
                            response.result = remove_leading_zeros(response.result);
                            response.result = augur.prefix_hex(response.result);
                        }
                    }
                    // if (augur.BigNumberOnly) {
                    //     response.result = augur.bignum(response.result);
                    // }
                    if (callback) {
                        callback(response.result);
                    } else {
                        return response.result;
                    }
                } else if (response.constructor === Array && response.length) {
                    len = response.length;
                    results = new Array(len);
                    for (var i = 0; i < len; ++i) {
                        if (response.error) {
                            console.error(
                                "[" + response.error.code + "]",
                                response.error.message
                            );
                        } else if (response[i].result !== undefined) {
                            if (returns[i]) {
                                results[i] = format_result(returns[i], response[i].result);
                            }
                        }
                    }
                    if (callback) {
                        callback(results);
                    } else {
                        return results;
                    }
                } else { // no result or error field :(
                    if (callback) {
                        callback(response);
                    } else {
                        return response;
                    }
                }
            }
        } catch (e) {
            if (callback) {
                callback(e);
            } else {
                return e;
            }
        }
    }

    /********************************************
     * Post JSON-RPC command to Ethereum client *
     ********************************************/

    function strip_returns(tx) {
        var returns;
        if (tx.params && tx.params.length && tx.params[0] && tx.params[0].returns) {
            returns = tx.params[0].returns;
            delete tx.params[0].returns;
        }
        return returns;
    }
    function json_rpc(command, callback) {
        var protocol, host, port, rpc_url, num_commands, returns, req = null;
        protocol = augur.RPC.protocol || "http";
        host = augur.RPC.host || "127.0.0.1";
        port = augur.RPC.port || "8545";
        rpc_url = protocol + "://" + host + ":" + port;
        if (command.constructor === Array) {
            num_commands = command.length;
            returns = new Array(num_commands);
            for (var i = 0; i < num_commands; ++i) {
                returns[i] = strip_returns(command[i]);
            }
        } else {
            returns = strip_returns(command);
        }
        if (NODE_JS) {
            // asynchronous if callback exists
            if (callback && callback.constructor === Function) {
                req = new XHR2();
                req.onreadystatechange = function () {
                    if (req.readyState === 4) {
                        parse(req.responseText, returns, callback);
                    }
                };
                req.open("POST", rpc_url, true);
                req.setRequestHeader("Content-type", "application/json");
                req.send(JSON.stringify(command));
            } else {
                return parse(request('POST', rpc_url, {
                    json: command
                }).getBody().toString(), returns);
            }
        } else {
            command = JSON.stringify(command);
            if (window.XMLHttpRequest) {
                req = new window.XMLHttpRequest();
            } else {
                req = new window.ActiveXObject("Microsoft.XMLHTTP");
            }
            if (callback && callback.constructor === Function) {
                req.onreadystatechange = function () {
                    if (req.readyState === 4) {
                        parse(req.responseText, returns, callback);
                    }
                };
                req.open("POST", rpc_url, true);
                req.setRequestHeader("Content-type", "application/json");
                req.send(command);
            } else {
                req.open("POST", rpc_url, false);
                req.setRequestHeader("Content-type", "application/json");
                req.send(command);
                return parse(req.responseText, returns);
            }
        }
    }
    function postdata(command, params, prefix) {
        augur.data = {
            id: augur.id++,
            jsonrpc: "2.0"
        };
        if (prefix === "null") {
            augur.data.method = command.toString();
        } else {
            augur.data.method = (prefix || "eth_") + command.toString();
        }
        if (params) {
            if (params.constructor === Array) {
                augur.data.params = params;
            } else {
                augur.data.params = [params];
            }
        } else {
            augur.data.params = [];
        }
        return augur.data;
    }

    /********************
     * Ethereum filters *
     ********************/

    augur.eth_newFilter = function (params, f) {
        return json_rpc(postdata("newFilter", params), f);
    };
    augur.create_price_filter = function (market, f) {
        return augur.eth_newFilter({ topics: [ market ]}, f);
    };
    augur.eth_getFilterChanges = function (filter, f) {
        return json_rpc(postdata("getFilterChanges", filter), f);
    };
    augur.eth_getFilterLogs = function (filter, f) {
        return json_rpc(postdata("getFilterLogs", filter), f);
    };
    augur.eth_getLogs = function (filter, f) {
        return json_rpc(postdata("getLogs", filter), f);
    };
    augur.eth_uninstallFilter = function (filter, f) {
        return json_rpc(postdata("uninstallFilter", filter), f);
    };
    // augur.getMarketPriceHistory = function (market, outcome, f) {
        // [...{price: BigNumber, timestamp: moment or Date}...]
    // };
    augur.poll_eth_filter = function (filter) {
        augur.eth_getFilterChanges(filter, function (message) {
            // log("Polling filter " + chalk.green(filter) + "...");
            if (message) {
                var num_messages = message.length;
                if (num_messages) {
                    for (var i = 0; i < num_messages; ++i) {
                        log(chalk.cyan(JSON.stringify(message, null, 2)));
                    }
                }
            }
            setTimeout(function () {
                augur.poll_eth_filter(filter);
            }, augur.ETH_POLL_INTERVAL);
        });
    };
    function start_price_listeners() {
        var filter, filter_types;
        filter_types = ["updatePrice", "pricePaid", "priceSold"];
        for (var i = 0, len = filter_types.length; i < len; ++i) {
            if (augur.price_filters[filter_types[i]] &&
                augur.price_filters[filter_types[i]].filterId) {
                filter = augur.price_filters[filter_types[i]].filterId;
                log(filter_types[i] + " filter found:", chalk.green(filter));
                augur.poll_eth_filter(filter);
            } else {
                filter = augur.create_price_filter(filter_types[i]);
                if (filter && filter !== "0x") {
                    // log("Create " + filter_types[i] + " filter:",
                    //     chalk.green(filter));
                    augur.price_filters[filter_types[i]] = {
                        filterId: filter,
                        polling: true
                    };
                    augur.poll_eth_filter(filter);
                } else {
                    log("Couldn't create " + filter_types[i] + " filter:",
                        chalk.green(filter));
                }
            }
        }
    }

    /*******************************
     * Ethereum network connection *
     *******************************/

    augur.connect = function (rpcinfo, chain) {
        var rpc, key;
        if (rpcinfo) {
            if (rpcinfo.constructor === Object) {
                if (rpcinfo.protocol) augur.RPC.protocol = rpcinfo.protocol;
                if (rpcinfo.host) augur.RPC.host = rpcinfo.host;
                if (rpcinfo.port) {
                    augur.RPC.port = rpcinfo.port;
                } else {
                    if (rpcinfo.host) {
                        rpc = rpcinfo.host.split(":");
                        if (rpc.length === 2) {
                            augur.RPC.host = rpc[0];
                            augur.RPC.port = rpc[1];
                        }
                    }
                }
                if (rpcinfo.chain) chain = rpcinfo.chain;
            } else if (rpcinfo.constructor === String) {
                try {
                    rpc = rpcinfo.split("://");
                    console.assert(rpc.length === 2);
                    augur.RPC.protocol = rpc[0];
                    rpc = rpc[1].split(':');
                    if (rpc.length === 2) {
                        augur.RPC.host = rpc[0];
                        augur.RPC.port = rpc[1];
                    } else {
                        augur.RPC.host = rpc;
                    }
                } catch (e) {
                    try {
                        rpc = rpcinfo.split(':');
                        if (rpc.length === 2) {
                            augur.RPC.host = rpc[0];
                            augur.RPC.port = rpc[1];
                        } else {
                            augur.RPC.host = rpc;
                        }
                    } catch (exc) {
                        return false;
                    }
                }
            }
        } else {
            augur.RPC = {
                protocol: "http",
                host: "127.0.0.1",
                port: 8545
            };
        }
        // start_price_listeners();
        try {
            if (JSON.stringify(augur.contracts) === JSON.stringify(augur.init_contracts)) {
                if (chain) {
                    if (chain === "1010101" || chain === 1010101) {
                        augur.contracts = copy(augur.privatechain_contracts);
                    } else if (chain === "10101" || chain === 10101) {
                        augur.contracts = copy(augur.testchain_contracts);
                    }
                } else {
                    chain = json_rpc(postdata("version", [], "net_"));
                    if (chain === "1010101" || chain === 1010101) {
                        augur.contracts = copy(augur.privatechain_contracts);
                    } else if (chain === "10101" || chain === 10101) {
                        augur.contracts = copy(augur.testchain_contracts);
                    } else {
                        augur.contracts = copy(augur.testnet_contracts);
                    }
                }
            }
            augur.coinbase = json_rpc(postdata("coinbase"));
            if (augur.coinbase && augur.coinbase !== "0x") {
                for (var method in augur.tx) {
                    if (!augur.tx.hasOwnProperty(method)) continue;
                    augur.tx[method].from = augur.coinbase;
                    key = has_value(augur.init_contracts, augur.tx[method].to);
                    if (key) {
                        augur.tx[method].to = augur.contracts[key];
                    }
                }
            }
            augur.init_contracts = copy(augur.contracts);
            return true;
        } catch (exc) {
            return false;
        }
    };
    augur.setCoinbase = function (repeat) {
        try {
            augur.coinbase = json_rpc(postdata("coinbase"));
        } catch (e) {
            var delay = 5000 * repeat;
            log("connection error, retrying in " + parseInt(delay / 1000).toString() + " seconds");
            if (repeat && repeat < 3) {
                setTimeout(function () { augur.setCoinbase(repeat + 1); }, delay);
            }
        }
    };

    /******************************
     * Ethereum JSON-RPC bindings *
     ******************************/

    augur.rpc = function (command, params, f) {
        return json_rpc(postdata(command, params, "null"), f);
    };
    augur.eth = function (command, params, f) {
        return json_rpc(postdata(command, params), f);
    };
    augur.net = function (command, params, f) {
        return json_rpc(postdata(command, params, "net_"), f);
    };
    augur.web3 = function (command, params, f) {
        return json_rpc(postdata(command, params, "web3_"), f);
    };
    augur.db = function (command, params, f) {
        return json_rpc(postdata(command, params, "db_"), f);
    };
    augur.shh = function (command, params, f) {
        return json_rpc(postdata(command, params, "shh_"), f);
    };
    augur.sha3 = augur.hash = function (data, f) {
        if (data) {
            if (data.constructor === Array || data.constructor === Object) {
                data = JSON.stringify(data);
            }
            return json_rpc(postdata("sha3", data.toString(), "web3_"), f);
        }
    };
    augur.gasPrice = function (f) {
        return json_rpc(postdata("gasPrice"), f);
    };
    augur.blockNumber = function (f) {
        if (f) {
            json_rpc(postdata("blockNumber"), f);
        } else {
            return parseInt(json_rpc(postdata("blockNumber")));
        }
    };
    augur.getBalance = augur.balance = function (address, block, f) {
        return json_rpc(postdata("getBalance", [address || augur.coinbase, block || "latest"]), f);
    };
    augur.getTransactionCount = augur.txCount = function (address, f) {
        return json_rpc(postdata("getTransactionCount", address || augur.coinbase), f);
    };
    augur.sendEther = augur.pay = function (to, value, from, onSent, onSuccess, onFailed) {
        from = from || json_rpc(postdata("coinbase"));
        if (from !== augur.demo) {
            var tx, txhash;
            if (to && to.value) {
                value = to.value;
                if (to.from) from = to.from;
                if (to.onSent) onSent = to.onSent;
                if (to.onSuccess) onSuccess = to.onSuccess;
                if (to.onFailed) onFailed = to.onFailed;
                to = to.to;
            }
            tx = {
                from: from,
                to: to,
                value: augur.bignum(value).mul(augur.ETHER).toFixed()
            };
            if (onSent) {
                augur.sendTx(tx, function (txhash) {
                    if (txhash) {
                        onSent(txhash);
                        if (onSuccess) tx_notify(0, null, txhash, onSuccess);
                    }
                });
            } else {
                txhash = augur.sendTx(tx);
                if (txhash) {
                    if (onSuccess) tx_notify(0, null, txhash, onSuccess);
                    return txhash;
                }
            }
        }
    };
    augur.getTransactionByHash = augur.getTx = function (hash, f) {
        return json_rpc(postdata("getTransactionByHash", hash), f);
    };
    augur.peerCount = function (f) {
        if (f) {
            json_rpc(postdata("peerCount", [], "net_"), f);
        } else {
            return parseInt(json_rpc(postdata("peerCount", [], "net_")));
        }
    };
    augur.accounts = function (f) {
        return json_rpc(postdata("accounts"), f);
    };
    augur.mining = function (f) {
        return json_rpc(postdata("mining"), f);
    };
    augur.hashrate = function (f) {
        if (f) {
            json_rpc(postdata("hashrate"), f);
        } else {
            return parseInt(json_rpc(postdata("hashrate")));
        }
    };
    augur.protocolversion = augur.protocolVersion = augur.version = function (f) {
        return json_rpc(postdata("version", [], "net_"), f);
    };

    // estimate a transaction's gas cost
    augur.estimateGas = function (tx, f) {
        tx.to = tx.to || "";
        return json_rpc(postdata("estimateGas", tx), f);
    };

    // execute functions on contracts on the blockchain
    augur.call = function (tx, f) {
        tx.to = tx.to || "";
        tx.gas = (tx.gas) ? augur.prefix_hex(tx.gas.toString(16)) : augur.default_gas;
        return json_rpc(postdata("call", tx), f);
    };
    augur.sendTransaction = augur.sendTx = function (tx, f) {
        tx.to = tx.to || "";
        tx.gas = (tx.gas) ? augur.prefix_hex(tx.gas.toString(16)) : augur.default_gas;
        // tx.gasPrice = "15000000000000";
        return json_rpc(postdata("sendTransaction", tx), f);
    };

    // publish a new contract to the blockchain (from the coinbase account)
    augur.publish = function (compiled, f) {
        return this.sendTx({ from: augur.coinbase, data: compiled }, f);
    };

    // hex-encode a function's ABI data and return it
    augur.abi_data = augur.encode_abi = function (tx) {
        tx.signature = tx.signature || "";
        var stat, statics = '';
        var dynamic, dynamics = '';
        var num_params = tx.signature.length;
        var data_abi = augur.get_prefix(tx.method, tx.signature);
        var types = [];
        for (var i = 0, len = tx.signature.length; i < len; ++i) {
            if (tx.signature[i] === 's') {
                types.push("bytes");
            } else if (tx.signature[i] === 'a') {
                types.push("int256[]");
            } else {
                types.push("int256");
            }
        }
        if (tx.params !== undefined && tx.params !== null && tx.params !== [] && tx.params !== "") {
            if (tx.params.constructor === String) {
                if (tx.params.slice(0,1) === "[" && tx.params.slice(-1) === "]") {
                    tx.params = JSON.parse(tx.params);
                }
                if (tx.params.constructor === String) {
                    tx.params = [tx.params];
                }
            } else if (tx.params.constructor === Number) {
                tx.params = [tx.params];
            }
        } else {
            tx.params = [];
        }
        if (num_params === tx.params.length) {
            for (i = 0, len = types.length; i < len; ++i) {
                if (types[i] === "int256") {
                    if (tx.params[i] !== undefined && tx.params[i] !== null && tx.params[i] !== [] && tx.params[i] !== "") {
                        if (tx.params[i].constructor === Number) {
                            stat = augur.bignum(tx.params[i]);
                            if (stat !== 0) {
                                stat = stat.mod(augur.MAXBITS).toFixed();
                            } else {
                                stat = stat.toFixed();
                            }
                            statics += pad_left(encode_int(stat));
                        } else if (tx.params[i].constructor === String) {
                            if (tx.params[i].slice(0,1) === '-') {
                                stat = augur.bignum(tx.params[i]).mod(augur.MAXBITS).toFixed();
                                statics += pad_left(encode_int(stat));
                            } else if (tx.params[i].slice(0,2) === "0x") {
                                statics += pad_left(tx.params[i].slice(2), true);
                            } else {
                                stat = augur.bignum(tx.params[i]).mod(augur.MAXBITS);
                                statics += pad_left(encode_int(stat));
                            }
                        }
                    }
                } else if (types[i] === "bytes" || types[i] === "string") {
                    // offset (in 32-byte chunks)
                    stat = 32*num_params + 0.5*dynamics.length;
                    stat = augur.bignum(stat).mod(augur.MAXBITS).toFixed();
                    statics += pad_left(encode_int(stat));
                    dynamics += pad_left(encode_int(tx.params[i].length));
                    dynamics += pad_right(augur.encode_hex(tx.params[i]));
                } else if (types[i] === "int256[]") {
                    stat = 32*num_params + 0.5*dynamics.length;
                    stat = augur.bignum(stat).mod(augur.MAXBITS).toFixed();
                    statics += pad_left(encode_int(stat));
                    var arraylen = tx.params[i].length;
                    dynamics += pad_left(encode_int(arraylen));
                    for (var j = 0; j < arraylen; ++j) {
                        if (tx.params[i][j]) {
                            if (tx.params[i][j].constructor === Number) {
                                dynamic = augur.bignum(tx.params[i][j]).mod(augur.MAXBITS).toFixed();
                                dynamics += pad_left(encode_int(dynamic));
                            } else if (tx.params[i][j].constructor === String) {
                                if (tx.params[i][j].slice(0,1) === '-') {
                                    dynamic = augur.bignum(tx.params[i][j]).mod(augur.MAXBITS).toFixed();
                                    dynamics += pad_left(encode_int(dynamic));
                                } else if (tx.params[i][j].slice(0,2) === "0x") {
                                    dynamics += pad_left(tx.params[i][j].slice(2), true);
                                } else {
                                    dynamic = augur.bignum(tx.params[i][j]).mod(augur.MAXBITS);
                                    dynamics += pad_left(encode_int(dynamic));
                                }
                            }
                        }
                    }
                }
            }
            return data_abi + statics + dynamics;
        } else {
            return console.error("wrong number of parameters");
        }
    };
    /**
     * Invoke a function from a contract on the blockchain.
     *
     * Input tx format:
     * {
     *    from: <sender's address> (hexstring; optional, coinbase default)
     *    to: <contract address> (hexstring)
     *    method: <function name> (string)
     *    signature: <function signature, e.g. "iia"> (string)
     *    params: <parameters passed to the function> (optional)
     *    returns: <"number[]", "int", "BigNumber", or "string" (default)>
     *    send: <true to sendTransaction, false to call (default)>
     * }
     */
    augur.run = augur.execute = augur.invoke = function (itx, f) {
        var tx, data_abi, packaged, invocation, invoked;
        if (itx) {
            tx = copy(itx);
            if (tx.params) {
                if (tx.params.constructor === Array) {
                    for (var i = 0, len = tx.params.length; i < len; ++i) {
                        if (tx.params[i] && tx.params[i].constructor === BigNumber) {
                            tx.params[i] = tx.params[i].toFixed();
                        }
                    }
                } else if (tx.params.constructor === Object) {
                    for (var p in tx.params) {
                        if (!tx.params.hasOwnProperty(p)) continue;
                        if (tx.params[p].constructor === BigNumber) {
                            tx.params[p] = tx.params[p].toFixed();
                        }
                    }
                } else if (tx.params.constructor === BigNumber) {
                    tx.params = tx.params.toFixed();
                }
            }
            if (tx.to) tx.to = augur.prefix_hex(tx.to);
            if (tx.from) tx.from = augur.prefix_hex(tx.from);
            data_abi = this.encode_abi(tx);
            if (data_abi) {
                packaged = {
                    from: tx.from || augur.coinbase,
                    to: tx.to,
                    data: data_abi,
                    returns: tx.returns
                };
                invocation = (tx.send) ? this.sendTx : this.call;
                invoked = true;
                return invocation(packaged, f);
            }
        }
        if (!invoked) {
            return "Error invoking " + tx.method + "@" + tx.to + "\n"+
                "Expected transaction format:" + JSON.stringify({
                    from: "<sender's address> (hexstring; optional, coinbase default)",
                    to: "<contract address> (hexstring)",
                    method: "<function name> (string)",
                    signature: '<function signature, e.g. "iia"> (string)',
                    params: "<parameters passed to the function> (optional)",
                    returns: '<"number[]", "int", "BigNumber", or "string" (default)>',
                    send: '<true to sendTransaction, false to call (default)>'
                });
        }
    };

    // Read the code in a contract on the blockchain
    augur.getCode = augur.read = function (address, block, f) {
        if (address) {
            return json_rpc(postdata("getCode", [address, block || "latest"]), f);
        }
    };

    /************************
     * Batched RPC commands *
     ************************/

    augur.batch = function (txlist, f) {
        var num_commands, rpclist, callbacks, tx, data_abi, packaged, invocation;
        if (txlist.constructor === Array) {
            num_commands = txlist.length;
            rpclist = new Array(num_commands);
            callbacks = new Array(num_commands);
            for (var i = 0; i < num_commands; ++i) {
                tx = copy(txlist[i]);
                if (tx.params) {
                    if (tx.params.constructor === Array) {
                        for (var j = 0, len = tx.params.length; j < len; ++j) {
                            if (tx.params[j].constructor === BigNumber) {
                                tx.params[j] = tx.params[j].toFixed();
                            }
                        }
                    } else if (tx.params.constructor === BigNumber) {
                        tx.params = tx.params.toFixed();
                    }
                }
                if (tx.from) tx.from = augur.prefix_hex(tx.from);
                tx.to = augur.prefix_hex(tx.to);
                data_abi = augur.encode_abi(tx);
                if (data_abi) {
                    if (tx.callback && tx.callback.constructor === Function) {
                        callbacks[i] = tx.callback;
                        delete tx.callback;
                    }
                    packaged = {
                        from: tx.from || augur.coinbase,
                        to: tx.to,
                        data: data_abi,
                        returns: tx.returns
                    };
                    invocation = (tx.send) ? "sendTransaction" : "call";
                    rpclist[i] = postdata(invocation, packaged);
                } else {
                    log("unable to package commands for batch RPC");
                    return rpclist;
                }
            }
            if (f) {
                if (f.constructor === Function) { // callback on whole array
                    json_rpc(rpclist, f);
                } else if (f === true) {
                    json_rpc(rpclist, function (res) {
                        if (res) {
                            if (res.constructor === Array && res.length) {
                                for (j = 0; j < num_commands; ++j) {
                                    if (res[j] && callbacks[j]) {
                                        callbacks[j](res[j]);
                                    }
                                }
                            } else {
                                if (callbacks.length && callbacks[0]) {
                                    callbacks[0](res);
                                }
                            }
                        }
                    });
                }
            } else {
                return json_rpc(rpclist, f);
            }
        } else {
            log("expected array for batch RPC, invoking instead");
            return this.invoke(txlist, f);
        }
    };

    /**
     * User-friendly batch interface:
     *
     * var b = Augur.createBatch();
     * b.add("getCashBalance", [Augur.coinbase], callback);
     * b.add("getRepBalance", [Augur.branches.dev, Augur.coinbase], callback);
     * b.execute();
     */
    var Batch = function () {
        this.txlist = [];
    };
    Batch.prototype.add = function (method, params, callback) {
        if (method) {
            var tx = copy(augur.tx[method]);
            if (params && params.length !== 0) {
                tx.params = params;
            }
            if (callback) tx.callback = callback;
            this.txlist.push(tx);
        }
    };
    Batch.prototype.execute = function () {
        augur.batch(this.txlist, true);
    };
    augur.createBatch = function createBatch () {
        return new Batch();
    };

    /**********************************
     * Error handling and propagation *
     **********************************/

    function error_codes(tx, response) {
        if (response && response.constructor === Array) {
            for (var i = 0, len = response.length; i < len; ++i) {
                response[i] = error_codes(tx.method, response[i]);
            }
        } else {
            if (augur.ERRORS[response]) {
                response = {
                    error: response,
                    message: augur.ERRORS[response]
                };
            } else {
                if (tx.returns !== "string" || (response.constructor === String && response.slice(0,2) === "0x")) {
                    var response_number = augur.bignum(response);
                    if (response_number) {
                        response_number = augur.bignum(response).toFixed();
                        if (augur.ERRORS[tx.method] && augur.ERRORS[tx.method][response_number]) {
                            response = {
                                error: response_number,
                                message: augur.ERRORS[tx.method][response_number]
                            };
                        }
                    }
                }
            }
        }
        return response;
    }
    function strategy(target, callback) {
        if (callback) {
            callback(target);
        } else {
            return target;
        }
    }
    function fire(itx, onSent) {
        var num_params_expected, num_params_received, tx;
        if (itx.signature && itx.signature.length) {
            if (itx.params) {
                if (itx.params.constructor === Array) {
                    num_params_received = itx.params.length;
                } else if (itx.params.constructor === Object) {
                    return strategy({
                        error: -9,
                        message: "cannot send object parameter to contract"
                    }, onSent);
                } else if (itx.params) {
                    num_params_received = 1;
                } 
            } else {
                num_params_received = 0;
            }
            num_params_expected = itx.signature.length;
            if (num_params_received !== num_params_expected) {
                return strategy({
                    error: -10,
                    message: "expected " + num_params_expected.toString()+
                        " parameters, got " + num_params_received.toString()
                }, onSent);
            }
        }
        tx = copy(itx);
        if (onSent) {
            augur.invoke(tx, function (res) {
                res = error_codes(tx, res);
                if (res && augur.BigNumberOnly && itx.returns && itx.returns !== "string" && itx.returns !== "hash[]") {
                    res = augur.bignum(res);
                }
                onSent(res);
            });
        } else {
            return error_codes(tx, augur.invoke(tx, onSent));
        }        
    }

    /***************************************
     * Call-send-confirm callback sequence *
     ***************************************/

    augur.notifications = {};

    function clear_notifications(id) {
        for (var i = 0, len = augur.notifications.length; i < len; ++i) {
            clearTimeout(augur.notifications[id][i]);
            augur.notifications[id] = [];
        }
    }
    function check_blockhash(tx, callreturn, itx, txhash, returns, count, onSent, onSuccess, onFailed) {
        if (tx && tx.blockHash && augur.bignum(tx.blockHash).toNumber() !== 0) {
            clear_notifications(txhash);
            tx.callReturn = callreturn;
            tx.txHash = tx.hash;
            delete tx.hash;
            if (augur.BigNumberOnly && tx.returns && tx.returns !== "string" && tx.returns !== "hash[]") {
                tx.callReturn = augur.bignum(tx.callReturn);
            }
            if (onSuccess) onSuccess(tx);
        } else {
            if (count !== undefined && count < augur.TX_POLL_MAX) {
                if (count === 0) {
                    augur.notifications[txhash] = [setTimeout(function () {
                        tx_notify(count + 1, callreturn, itx, txhash, returns, onSent, onSuccess, onFailed);
                    }, augur.TX_POLL_INTERVAL)];
                } else {
                    augur.notifications[txhash].push(setTimeout(function () {
                        tx_notify(count + 1, callreturn, itx, txhash, returns, onSent, onSuccess, onFailed);
                    }, augur.TX_POLL_INTERVAL));
                }
            }
        }
    }
    function tx_notify(count, callreturn, itx, txhash, returns, onSent, onSuccess, onFailed) {
        augur.getTx(txhash, function (tx) {
            if (tx === null) {
                if (returns) itx.returns = returns;
                send_call_confirm(itx, onSent, onSuccess, onFailed);
            } else {
                check_blockhash(tx, callreturn, itx, txhash, returns, count, onSent, onSuccess, onFailed);
            }
        });
    }
    function call_confirm(tx, txhash, returns, onSent, onSuccess, onFailed) {
        if (tx && txhash) {
            augur.notifications[txhash] = [];
            if (augur.ERRORS[txhash]) {
                if (onFailed) onFailed({
                    error: txhash,
                    message: augur.ERRORS[txhash]
                });
            } else {
                augur.getTx(txhash, function (sent) {
                    augur.call({
                        from: sent.from || augur.coinbase,
                        to: sent.to || tx.to,
                        data: sent.input,
                        returns: returns
                    }, function (callreturn) {
                        if (callreturn) {
                            if (callreturn.constructor === Object && callreturn.error) {
                                if (onFailed) onFailed(callreturn);
                            } else if (augur.ERRORS[callreturn]) {
                                if (onFailed) onFailed({
                                    error: callreturn,
                                    message: augur.ERRORS[callreturn]
                                });
                            } else {
                                try {
                                    var numeric = augur.bignum(callreturn);
                                    if (numeric && numeric.constructor === BigNumber) {
                                        numeric = numeric.toFixed();
                                    }
                                    if (numeric && augur.ERRORS[tx.method] && augur.ERRORS[tx.method][numeric]) {
                                        if (onFailed) onFailed({
                                            error: numeric,
                                            message: augur.ERRORS[tx.method][numeric]
                                        });
                                    } else {
                                        onSent({
                                            txHash: txhash,
                                            callReturn: callreturn
                                        });
                                        if (onSuccess) {
                                            tx_notify(
                                                0,
                                                callreturn,
                                                tx,
                                                txhash,
                                                returns,
                                                onSent,
                                                onSuccess,
                                                onFailed
                                            );
                                        }
                                    }
                                } catch (e) {
                                    if (onFailed) onFailed(e);
                                }
                            }
                        }
                    });
                });
            }
        }
    }
    function send_call_confirm(tx, onSent, onSuccess, onFailed) {
        var returns = tx.returns;
        tx.send = true;
        delete tx.returns;
        augur.invoke(tx, function (txhash) {
            call_confirm(tx, txhash, returns, onSent, onSuccess, onFailed);
        });
    }

    /***********************
     * Augur API functions *
     ***********************/

    // Augur transaction objects
    augur.init_contracts = copy(augur.contracts);
    augur.tx = {};

    // cash.se
    augur.tx.getCashBalance = {
        from: augur.coinbase,
        to: augur.contracts.cash,
        method: "balance",
        signature: "i",
        params: augur.coinbase,
        returns: "unfix"
    };
    augur.tx.sendCash = {
        from: augur.coinbase,
        to: augur.contracts.cash,
        method: "send",
        send: true,
        signature: "ii"
    };
    augur.tx.cashFaucet = {
        from: augur.coinbase,
        to: augur.contracts.cash,
        method: "faucet",
        returns: "number",
        send: true
    };
    augur.getCashBalance = function (account, onSent) {
        // account: ethereum address (hexstring)
        var tx = copy(augur.tx.getCashBalance);
        if (account) tx.params = account;
        return fire(tx, onSent);
    };
    augur.sendCash = function (to, value, onSent, onSuccess, onFailed) {
        // to: sha256
        // value: number -> fixed-point
        if (json_rpc(postdata("coinbase")) !== augur.demo) {
            if (to && to.value) {
                value = to.value;
                if (to.onSent) onSent = to.onSent;
                if (to.onSuccess) onSuccess = to.onSuccess;
                if (to.onFailed) onFailed = to.onFailed;
                to = to.to;
            }
            var tx = copy(augur.tx.sendCash);
            tx.params = [to, augur.fix(value)];
            return send_call_confirm(tx, onSent, onSuccess, onFailed);
        }
    };
    augur.cashFaucet = function (onSent, onSuccess, onFailed) {
        return send_call_confirm(augur.tx.cashFaucet, onSent, onSuccess, onFailed);
    };

    // info.se
    augur.tx.getCreator = {
        to: augur.contracts.info,
        method: "getCreator",
        signature: "i"
    };
    augur.tx.getCreationFee = {
        to: augur.contracts.info,
        method: "getCreationFee",
        signature: "i",
        returns: "unfix"
    };
    augur.tx.getDescription = {
        to: augur.contracts.info,
        method: "getDescription",
        signature: "i",
        returns: "string"
    };
    augur.getCreator = function (id, onSent) {
        // id: sha256 hash id
        var tx = copy(augur.tx.getCreator);
        tx.params = id;
        return fire(tx, onSent);
    };
    augur.getCreationFee = function (id, onSent) {
        // id: sha256 hash id
        var tx = copy(augur.tx.getCreationFee);
        tx.params = id;
        return fire(tx, onSent);
    };
    augur.getDescription = function (item, onSent) {
        // item: sha256 hash id
        var tx = copy(augur.tx.getDescription);
        tx.params = item;
        return fire(tx, onSent);
    };

    augur.checkPeriod = function (branch) {
        var period = Number(augur.getVotePeriod(branch));
        var currentPeriod = Math.floor(Augur.blockNumber() / Number(Augur.getPeriodLength(branch)));
        var periodsBehind = (currentPeriod - 1) - period;
        return periodsBehind;
    };

    // redeem_interpolate.se
    augur.tx.redeem_interpolate = {
        to: augur.contracts.redeem_interpolate,
        method: "interpolate",
        signature: "iiiii"
    };
    augur.redeem_interpolate = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.redeem_interpolate);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.tx.read_ballots = {
        to: augur.contracts.redeem_interpolate,
        method: "read_ballots",
        signature: "iiiii"
    };
    augur.read_ballots = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.read_ballots);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // interpolate.se
    // augur.tx.interpolate = {
    //     to: augur.contracts.interpolate,
    //     method: "interpolate",
    //     signature: "aaaaa",
    //     returns: "number[]"
    // };
    // augur.interpolate = function (reports, reputation, scaled, scaled_max, scaled_min, onSent, onSuccess, onFailed) {
    //     var tx = copy(augur.tx.interpolate);
    //     tx.params = [
    //         Augur.fix(reports, "hex"),
    //         Augur.fix(reputation, "hex"),
    //         scaled,
    //         scaled_max,
    //         scaled_min
    //     ];
    //     return send_call_confirm(tx, onSent, onSuccess, onFailed);
    // };
    augur.tx.interpolate = {
        to: augur.contracts.interpolate,
        method: "interpolate",
        signature: "aa",
        returns: "number[]"
    };
    augur.interpolate = function (reports, reputation, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.interpolate);
        tx.params = [Augur.fix(reports, "hex"), Augur.fix(reputation, "hex")];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // center.se
    augur.tx.center = {
        to: augur.contracts.center,
        method: "center",
        signature: "aaaaaii"
    };
    augur.center = function (reports, reputation, scaled, scaled_max, scaled_min, max_iterations, max_components, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.center);
        tx.params = [
            Augur.fix(reports, "hex"),
            Augur.fix(reputation, "hex"),
            scaled,
            scaled_max,
            scaled_min,
            max_iterations,
            max_components
        ];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // redeem_center.se
    augur.tx.redeem_center = {
        to: augur.contracts.redeem_center,
        method: "center",
        signature: "iiiii",
        returns: "number"
    };
    augur.redeem_center = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.redeem_center);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.tx.redeem_covariance = {
        to: augur.contracts.redeem_center,
        method: "covariance",
        signature: "iiiii"
    };
    augur.redeem_covariance = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.redeem_covariance);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // redeem_score.se
    augur.tx.redeem_blank = {
        to: augur.contracts.redeem_score,
        method: "blank",
        signature: "iiiii"
    };
    augur.tx.redeem_loadings = {
        to: augur.contracts.redeem_score,
        method: "loadings",
        signature: "iiiii",
        returns: "number"
    };
    augur.redeem_blank = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.redeem_blank);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.redeem_loadings = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.redeem_loadings);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // score.se
    augur.tx.blank = {
        to: augur.contracts.score,
        method: "blank",
        signature: "iii",
        returns: "number[]"
    };
    augur.tx.loadings = {
        to: augur.contracts.score,
        method: "loadings",
        signature: "aaaii",
        returns: "number[]"
    };
    augur.blank = function (components_remaining, max_iterations, num_events, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.blank);
        tx.params = [components_remaining, max_iterations, num_events];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.loadings = function (iv, wcd, reputation, num_reports, num_events, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.loadings);
        tx.params = [
            Augur.fix(iv, "hex"),
            Augur.fix(wcd, "hex"),
            Augur.fix(reputation, "hex"),
            num_reports,
            num_events
        ];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // resolve.se
    augur.tx.resolve = {
        to: augur.contracts.resolve,
        method: "resolve",
        signature: "aaaaaii",
        returns: "number[]"
    };
    augur.resolve = function (smooth_rep, reports, scaled, scaled_max, scaled_min, num_reports, num_events, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.resolve);
        tx.params = [
            Augur.fix(smooth_rep, "hex"),
            Augur.fix(reports, "hex"),
            scaled,
            scaled_max,
            scaled_min,
            num_reports,
            num_events
        ];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // redeem_resolve.se
    augur.tx.redeem_resolve = {
        to: augur.contracts.redeem_resolve,
        method: "resolve",
        signature: "iiiii",
        returns: "number"
    };
    augur.redeem_resolve = function (branch, period, num_events, num_reports, flatsize, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.redeem_resolve);
        tx.params = [branch, period, num_events, num_reports, flatsize];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // branches.se
    augur.tx.getBranches = {
        to: augur.contracts.branches,
        method: "getBranches",
        returns: "hash[]"
    };
    augur.tx.getMarkets = {
        to: augur.contracts.branches,
        method: "getMarkets",
        signature: "i",
        returns: "hash[]"
    };
    augur.tx.getPeriodLength = {
        to: augur.contracts.branches,
        method: "getPeriodLength",
        signature: "i",
        returns: "number"
    };
    augur.tx.getVotePeriod = {
        to: augur.contracts.branches,
        method: "getVotePeriod",
        signature: "i",
        returns: "number"
    };
    augur.tx.getStep = {
        to: augur.contracts.branches,
        method: "getStep",
        signature: "i",
        returns: "number"
    };
    augur.tx.setStep = {
        to: augur.contracts.branches,
        method: "setStep",
        signature: "ii",
        send: true
    };
    augur.tx.getSubstep = {
        to: augur.contracts.branches,
        method: "getSubstep",
        signature: "i",
        returns: "number"
    };
    augur.tx.setSubstep = {
        to: augur.contracts.branches,
        method: "setSubstep",
        signature: "ii",
        send: true
    };
    augur.tx.incrementSubstep = {
        to: augur.contracts.branches,
        method: "incrementSubstep",
        signature: "i",
        send: true
    };
    augur.tx.getNumMarkets = {
        to: augur.contracts.branches,
        method: "getNumMarkets",
        signature: "i",
        returns: "number"
    };
    augur.tx.getMinTradingFee = {
        to: augur.contracts.branches,
        method: "getMinTradingFee",
        signature: "i",
        returns: "unfix"
    };
    augur.tx.getNumBranches = {
        to: augur.contracts.branches,
        method: "getNumBranches",
        returns: "number"
    };
    augur.tx.getBranch = {
        to: augur.contracts.branches,
        method: "getBranch",
        signature: "i"
    };
    augur.getBranches = function (onSent) {
        return fire(augur.tx.getBranches, onSent);
    };
    augur.getMarkets = function (branch, onSent) {
        // branch: sha256 hash id
        var tx = copy(augur.tx.getMarkets);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.getPeriodLength = function (branch, onSent) {
        // branch: sha256 hash id
        var tx = copy(augur.tx.getPeriodLength);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.getVotePeriod = function (branch, onSent) {
        // branch: sha256 hash id
        var tx = copy(augur.tx.getVotePeriod);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.getStep = function (branch, onSent) {
        // branch: sha256
        var tx = copy(augur.tx.getStep);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.setStep = function (branch, step, onSent) {
        var tx = copy(augur.tx.setStep);
        tx.params = [branch, step];
        return fire(tx, onSent);
    };
    augur.getSubstep = function (branch, onSent) {
        // branch: sha256
        var tx = copy(augur.tx.getSubstep);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.setSubstep = function (branch, substep, onSent) {
        var tx = copy(augur.tx.setSubstep);
        tx.params = [branch, substep];
        return fire(tx, onSent);
    };
    augur.incrementSubstep = function (branch, onSent) {
        var tx = copy(augur.tx.incrementSubstep);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.getNumMarkets = function (branch, onSent) {
        // branch: sha256
        var tx = copy(augur.tx.getNumMarkets);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.getMinTradingFee = function (branch, onSent) {
        // branch: sha256
        var tx = copy(augur.tx.getMinTradingFee);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.getNumBranches = function (onSent) {
        return fire(augur.tx.getNumBranches, onSent);
    };
    augur.getBranch = function (branchNumber, onSent) {
        // branchNumber: integer
        var tx = copy(augur.tx.getBranch);
        tx.params = branchNumber;
        return fire(tx, onSent);
    };

    augur.tx.incrementPeriod = {
        to: augur.contracts.branches,
        method: "incrementPeriod",
        signature: "i",
        send: true
    };
    augur.tx.moveEventsToCurrentPeriod = {
        to: augur.contracts.expiringEvents,
        method: "moveEventsToCurrentPeriod",
        signature: "iii",
        send: true
    };
    augur.incrementPeriod = function (branch, onSent) {
        var tx = copy(augur.tx.incrementPeriod);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.moveEventsToCurrentPeriod = function (branch, currentVotePeriod, currentPeriod, onSent) {
        var tx = copy(augur.tx.moveEventsToCurrentPeriod);
        tx.params = [branch, currentVotePeriod, currentPeriod];
        return fire(tx, onSent);
    };
    augur.getCurrentPeriod = function (branch) {
        return parseInt(augur.blockNumber()) / parseInt(augur.getPeriodLength(branch));
    };
    augur.updatePeriod = function (branch) {
        var currentPeriod = augur.getCurrentPeriod(branch);
        augur.incrementPeriod(branch);
        augur.setStep(branch, 0);
        augur.setSubstep(branch, 0);
        augur.moveEventsToCurrentPeriod(branch, augur.getVotePeriod(branch), currentPeriod);
    };
    augur.sprint = function (branch, length) {
        for (var i = 0, len = length || 25; i < len; ++i) {
            augur.updatePeriod(branch);
        }
    };

    augur.tx.addEvent = {
        to: augur.contracts.expiringEvents,
        method: "addEvent",
        signature: "iii",
        send: true
    };
    augur.addEvent = function (branch, futurePeriod, eventID, onSent) {
        var tx = copy(augur.tx.addEvent);
        tx.params = [branch, futurePeriod, eventID];
        return fire(tx, onSent);
    };
    augur.tx.setTotalRepReported = {
        to: augur.contracts.expiringEvents,
        method: "setTotalRepReported",
        signature: "iii",
        send: true
    };
    augur.setTotalRepReported = function (branch, expDateIndex, repReported, onSent) {
        var tx = copy(augur.tx.setTotalRepReported);
        tx.params = [branch, expDateIndex, repReported];
        return fire(tx, onSent);
    };
    augur.tx.setReporterBallot = {
        to: augur.contracts.expiringEvents,
        method: "setReporterBallot",
        signature: "iiiai",
        send: true
    };
    augur.setReporterBallot = function (branch, expDateIndex, reporterID, report, reputation, onSent, onSuccess, onFailed) {
        var tx = copy(augur.tx.setReporterBallot);
        tx.params = [branch, expDateIndex, reporterID, Augur.fix(report, "hex"), reputation];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.tx.setVSize = {
        to: augur.contracts.expiringEvents,
        method: "setVSize",
        signature: "iii",
        send: true
    };
    augur.setVSize = function (branch, expDateIndex, vSize, onSent) {
        var tx = copy(augur.tx.setVSize);
        tx.params = [branch, expDateIndex, vSize];
        return fire(tx, onSent);
    };
    augur.tx.setReportsFilled = {
        to: augur.contracts.expiringEvents,
        method: "setReportsFilled",
        signature: "iia",
        send: true
    };
    augur.setReportsFilled = function (branch, expDateIndex, reportsFilled, onSent) {
        var tx = copy(augur.tx.setVSize);
        tx.params = [branch, expDateIndex, reportsFilled];
        return fire(tx, onSent);
    };
    augur.tx.setReportsMask = {
        to: augur.contracts.expiringEvents,
        method: "setReportsMask",
        signature: "iia",
        send: true
    };
    augur.setReportsMask = function (branch, expDateIndex, reportsMask, onSent) {
        var tx = copy(augur.tx.setReportsMask);
        tx.params = [branch, expDateIndex, reportsMask];
        return fire(tx, onSent);
    };
    augur.tx.setWeightedCenteredData = {
        to: augur.contracts.expiringEvents,
        method: "setWeightedCenteredData",
        signature: "iia",
        send: true
    };
    augur.setWeightedCenteredData = function (branch, expDateIndex, weightedCenteredData, onSent) {
        var tx = copy(augur.tx.setWeightedCenteredData);
        tx.params = [branch, expDateIndex, weightedCenteredData];
        return fire(tx, onSent);
    };
    augur.tx.setCovarianceMatrixRow = {
        to: augur.contracts.expiringEvents,
        method: "setCovarianceMatrixRow",
        signature: "iia",
        send: true
    };
    augur.setCovarianceMatrixRow = function (branch, expDateIndex, covarianceMatrixRow, onSent) {
        var tx = copy(augur.tx.setCovarianceMatrixRow);
        tx.params = [branch, expDateIndex, covarianceMatrixRow];
        return fire(tx, onSent);
    };
    augur.tx.setDeflated = {
        to: augur.contracts.expiringEvents,
        method: "setDeflated",
        signature: "iia",
        send: true
    };
    augur.setDeflated = function (branch, expDateIndex, deflated, onSent) {
        var tx = copy(augur.tx.setDeflated);
        tx.params = [branch, expDateIndex, deflated];
        return fire(tx, onSent);
    };
    augur.tx.setLoadingVector = {
        to: augur.contracts.expiringEvents,
        method: "setLoadingVector",
        signature: "iia",
        send: true
    };
    augur.setLoadingVector = function (branch, expDateIndex, loadingVector, onSent) {
        var tx = copy(augur.tx.setLoadingVector);
        tx.params = [branch, expDateIndex, loadingVector];
        return fire(tx, onSent);
    };
    augur.tx.setScores = {
        to: augur.contracts.expiringEvents,
        method: "setScores",
        signature: "iia",
        send: true
    };
    augur.setScores = function (branch, expDateIndex, scores, onSent) {
        var tx = copy(augur.tx.setScores);
        tx.params = [branch, expDateIndex, scores];
        return fire(tx, onSent);
    };
    augur.tx.setSetOne = {
        to: augur.contracts.expiringEvents,
        method: "setSetOne",
        signature: "iia",
        send: true
    };
    augur.setSetOne = function (branch, expDateIndex, setOne, onSent) {
        var tx = copy(augur.tx.setOne);
        tx.params = [branch, expDateIndex, setOne];
        return fire(tx, onSent);
    };
    augur.tx.setSetTwo = {
        to: augur.contracts.expiringEvents,
        method: "setSetTwo",
        signature: "iia",
        send: true
    };
    augur.setSetTwo = function (branch, expDateIndex, setTwo, onSent) {
        var tx = copy(augur.tx.setSetTwo);
        tx.params = [branch, expDateIndex, setTwo];
        return fire(tx, onSent);
    };
    augur.tx.setOld = {
        to: augur.contracts.expiringEvents,
        method: "setOld",
        signature: "iia",
        send: true
    };
    augur.setOld = function (branch, expDateIndex, setOld, onSent) {
        var tx = copy(augur.tx.setOld);
        tx.params = [branch, expDateIndex, setOld];
        return fire(tx, onSent);
    };
    augur.tx.setNewOne = {
        to: augur.contracts.expiringEvents,
        method: "setNewOne",
        signature: "iia",
        send: true
    };
    augur.setNewOne = function (branch, expDateIndex, newOne, onSent) {
        var tx = copy(augur.tx.setNewOne);
        tx.params = [branch, expDateIndex, newOne];
        return fire(tx, onSent);
    };
    augur.tx.setNewTwo = {
        to: augur.contracts.expiringEvents,
        method: "setNewTwo",
        signature: "iia",
        send: true
    };
    augur.setNewTwo = function (branch, expDateIndex, newTwo, onSent) {
        var tx = copy(augur.tx.setNewTwo);
        tx.params = [branch, expDateIndex, newTwo];
        return fire(tx, onSent);
    };
    augur.tx.setAdjPrinComp = {
        to: augur.contracts.expiringEvents,
        method: "setAdjPrinComp",
        signature: "iia",
        send: true
    };
    augur.setAdjPrinComp = function (branch, expDateIndex, adjPrinComp, onSent) {
        var tx = copy(augur.tx.setAdjPrinComp);
        tx.params = [branch, expDateIndex, adjPrinComp];
        return fire(tx, onSent);
    };
    augur.tx.setSmoothRep = {
        to: augur.contracts.expiringEvents,
        method: "setSmoothRep",
        signature: "iia",
        send: true
    };
    augur.setSmoothRep = function (branch, expDateIndex, smoothRep, onSent) {
        var tx = copy(augur.tx.setSmoothRep);
        tx.params = [branch, expDateIndex, smoothRep];
        return fire(tx, onSent);
    };
    augur.tx.setOutcomesFinal = {
        to: augur.contracts.expiringEvents,
        method: "setOutcomesFinal",
        signature: "iia",
        send: true
    };
    augur.setOutcomesFinal = function (branch, expDateIndex, outcomesFinal, onSent) {
        var tx = copy(augur.tx.setOutcomesFinal);
        tx.params = [branch, expDateIndex, outcomesFinal];
        return fire(tx, onSent);
    };
    augur.tx.setReportHash = {
        to: augur.contracts.expiringEvents,
        method: "setReportHash",
        signature: "iii",
        send: true
    };
    augur.setReportHash = function (branch, expDateIndex, reportHash, onSent) {
        var tx = copy(augur.tx.setReportHash);
        tx.params = [branch, expDateIndex, reportHash];
        return fire(tx, onSent);
    };

    // events.se
    augur.tx.getEventInfo = {
        to: augur.contracts.events,
        method: "getEventInfo",
        signature: "i",
        returns: "mixed[]"
    };
    augur.getEventInfo = function (event, onSent) {
        // event: sha256 hash id
        augur.tx.getEventInfo.params = event;
        if (onSent) {
            augur.invoke(augur.tx.getEventInfo, function (eventInfo) {
                if (eventInfo && eventInfo.length) {
                    var info = {
                        branch: eventInfo[0],
                        expirationDate: augur.bignum(eventInfo[1]).toFixed(),
                        outcome: augur.unfix(eventInfo[2], "string"),
                        minValue: augur.bignum(eventInfo[3]).toFixed(),
                        maxValue: augur.bignum(eventInfo[4]).toFixed(),
                        numOutcomes: augur.bignum(eventInfo[5]).toFixed()
                    };
                    augur.getDescription(event, function (description) {
                        if (description) info.description = description;
                        if (onSent) onSent(info);
                    });
                }
            });
        } else {
            var eventInfo = augur.invoke(augur.tx.getEventInfo);
            if (eventInfo && eventInfo.length) {
                var info = {
                    branch: eventInfo[0],
                    expirationDate: augur.bignum(eventInfo[1]).toFixed(),
                    outcome: augur.unfix(eventInfo[2], "string"),
                    minValue: augur.bignum(eventInfo[3]).toFixed(),
                    maxValue: augur.bignum(eventInfo[4]).toFixed(),
                    numOutcomes: augur.bignum(eventInfo[5]).toFixed()
                };
                var description = augur.getDescription(event);
                if (description) info.description = description;
                return info;
            }
        }
    };

    augur.tx.getEventBranch = {
        to: augur.contracts.events,
        method: "getEventBranch",
        signature: "i"
    };
    augur.tx.getExpiration = {
        to: augur.contracts.events,
        method: "getExpiration",
        signature: "i",
        returns: "number"
    };
    augur.tx.getOutcome = {
        to: augur.contracts.events,
        method: "getOutcome",
        signature: "i",
        returns: "unfix"
    };
    augur.tx.getMinValue = {
        to: augur.contracts.events,
        method: "getMinValue",
        signature: "i",
        returns: "number"
    };
    augur.tx.getMaxValue = {
        to: augur.contracts.events,
        method: "getMaxValue",
        signature: "i",
        returns: "number"
    };
    augur.tx.getNumOutcomes = {
        to: augur.contracts.events,
        method: "getNumOutcomes",
        signature: "i",
        returns: "number"
    };
    augur.getEventBranch = function (branchNumber, onSent) {
        // branchNumber: integer
        var tx = copy(augur.tx.getEventBranch);
        tx.params = branchNumber;
        return fire(tx, onSent);
    };
    augur.getExpiration = function (event, onSent) {
        // event: sha256
        var tx = copy(augur.tx.getExpiration);
        tx.params = event;
        return fire(tx, onSent);
    };
    augur.getOutcome = function (event, onSent) {
        // event: sha256
        var tx = copy(augur.tx.getOutcome);
        tx.params = event;
        return fire(tx, onSent);
    };
    augur.getMinValue = function (event, onSent) {
        // event: sha256
        var tx = copy(augur.tx.getMinValue);
        tx.params = event;
        return fire(tx, onSent);
    };
    augur.getMaxValue = function (event, onSent) {
        // event: sha256
        var tx = copy(augur.tx.getMaxValue);
        tx.params = event;
        return fire(tx, onSent);
    };
    augur.getNumOutcomes = function (event, onSent) {
        // event: sha256
        var tx = copy(augur.tx.getNumOutcomes);
        tx.params = event;
        return fire(tx, onSent);
    };
    augur.getCurrentVotePeriod = function (branch, onSent) {
        // branch: sha256
        var periodLength, blockNum;
        augur.tx.getPeriodLength.params = branch;
        if (onSent) {
            augur.invoke(augur.tx.getPeriodLength, function (periodLength) {
                if (periodLength) {
                    periodLength = augur.bignum(periodLength);
                    augur.blockNumber(function (blockNum) {
                        blockNum = augur.bignum(blockNum);
                        onSent(blockNum.dividedBy(periodLength).floor().sub(1));
                    });
                }
            });
        } else {
            periodLength = augur.invoke(augur.tx.getPeriodLength);
            if (periodLength) {
                blockNum = augur.bignum(augur.blockNumber());
                return blockNum.dividedBy(augur.bignum(periodLength)).floor().sub(1);
            }
        }
    };

    // expiringEvents.se
    augur.tx.getEvents = {
        to: augur.contracts.expiringEvents,
        method: "getEvents",
        signature: "ii",
        returns: "hash[]"
    };
    augur.tx.getNumberEvents = {
        to: augur.contracts.expiringEvents,
        method: "getNumberEvents",
        signature: "ii",
        returns: "number"
    };
    augur.tx.getEvent = {
        to: augur.contracts.expiringEvents,
        method: "getEvent",
        signature: "iii"
    };
    augur.tx.getTotalRepReported = {
        to: augur.contracts.expiringEvents,
        method: "getTotalRepReported",
        signature: "ii",
        returns: "number"
    };
    augur.tx.getReporterBallot = {
        to: augur.contracts.expiringEvents,
        method: "getReporterBallot",
        signature: "iii",
        returns: "unfix[]"
    };
    augur.tx.getReport = {
        to: augur.contracts.expiringEvents,
        method: "getReport",
        signature: "iiii",
        returns: "unfix"
    };
    augur.tx.getReportHash = {
        to: augur.contracts.expiringEvents,
        method: "getReportHash",
        signature: "iii"
    };
    augur.tx.getVSize = {
        to: augur.contracts.expiringEvents,
        method: "getVSize",
        signature: "ii",
        returns: "number"
    };
    augur.tx.getReportsFilled = {
        to: augur.contracts.expiringEvents,
        method: "getReportsFilled",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getReportsMask = {
        to: augur.contracts.expiringEvents,
        method: "getReportsMask",
        signature: "ii",
        returns: "number[]"
    };
    augur.tx.getWeightedCenteredData = {
        to: augur.contracts.expiringEvents,
        method: "getWeightedCenteredData",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getCovarianceMatrixRow = {
        to: augur.contracts.expiringEvents,
        method: "getCovarianceMatrixRow",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getDeflated = {
        to: augur.contracts.expiringEvents,
        method: "getDeflated",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getLoadingVector = {
        to: augur.contracts.expiringEvents,
        method: "getLoadingVector",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getLatent = {
        to: augur.contracts.expiringEvents,
        method: "getLatent",
        signature: "ii",
        returns: "unfix"
    };
    augur.tx.getScores = {
        to: augur.contracts.expiringEvents,
        method: "getScores",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getSetOne = {
        to: augur.contracts.expiringEvents,
        method: "getSetOne",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getSetTwo = {
        to: augur.contracts.expiringEvents,
        method: "getSetTwo",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.returnOld = {
        to: augur.contracts.expiringEvents,
        method: "returnOld",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getNewOne = {
        to: augur.contracts.expiringEvents,
        method: "getNewOne",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getNewTwo = {
        to: augur.contracts.expiringEvents,
        method: "getNewTwo",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getAdjPrinComp = {
        to: augur.contracts.expiringEvents,
        method: "getAdjPrinComp",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getSmoothRep = {
        to: augur.contracts.expiringEvents,
        method: "getSmoothRep",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getOutcomesFinal = {
        to: augur.contracts.expiringEvents,
        method: "getOutcomesFinal",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.tx.getReporterPayouts = {
        to: augur.contracts.expiringEvents,
        method: "getReporterPayouts",
        signature: "ii",
        returns: "unfix[]"
    };
    augur.getEvents = function (branch, votePeriod, onSent) {
        // branch: sha256 hash id
        // votePeriod: integer
        var tx = copy(augur.tx.getEvents);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getEventsRange = function (branch, vpStart, vpEnd, onSent) {
        // branch: sha256
        // vpStart: integer
        // vpEnd: integer
        var vp_range, txlist;
        vp_range = vpEnd - vpStart + 1; // inclusive
        txlist = new Array(vp_range);
        for (var i = 0; i < vp_range; ++i) {
            txlist[i] = {
                from: augur.coinbase,
                to: augur.contracts.expiringEvents,
                method: "getEvents",
                signature: "ii",
                returns: "hash[]",
                params: [branch, i + vpStart]
            };
        }
        return augur.batch(txlist, onSent);
    };
    augur.getNumberEvents = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getNumberEvents);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getEvent = function (branch, votePeriod, eventIndex, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getEvent);
        tx.params = [branch, votePeriod, eventIndex];
        return fire(tx, onSent);
    };
    augur.getTotalRepReported = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getTotalRepReported);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getReporterBallot = function (branch, votePeriod, reporterID, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getReporterBallot);
        tx.params = [branch, votePeriod, reporterID];
        return fire(tx, onSent);
    };
    augur.getReport = function (branch, votePeriod, reporter, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getReports);
        tx.params = [branch, votePeriod, reporter];
        return fire(tx, onSent);
    };
    augur.getReportHash = function (branch, votePeriod, reporter, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getReportHash);
        tx.params = [branch, votePeriod, reporter];
        return fire(tx, onSent);
    };
    augur.getVSize = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getVSize);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getReportsFilled = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getReportsFilled);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getReportsMask = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getReportsMask);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getWeightedCenteredData = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getWeightedCenteredData);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getCovarianceMatrixRow = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getCovarianceMatrixRow);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getDeflated = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getDeflated);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getLoadingVector = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getLoadingVector);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getLatent = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getLatent);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getScores = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getScores);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getSetOne = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getSetOne);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getSetTwo = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getSetTwo);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.returnOld = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.returnOld);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getNewOne = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getNewOne);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getNewTwo = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getNewTwo);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getAdjPrinComp = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getAdjPrinComp);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getSmoothRep = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getSmoothRep);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getOutcomesFinal = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getOutcomesFinal);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.getReporterPayouts = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getReporterPayouts);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };

    augur.tx.getTotalReputation = {
        to: augur.contracts.expiringEvents,
        method: "getTotalReputation",
        signature: "ii",
        returns: "unfix"
    };
    augur.tx.setTotalReputation = {
        to: augur.contracts.expiringEvents,
        method: "setTotalReputation",
        signature: "iii",
        returns: "number"
    };
    augur.getTotalReputation = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.getTotalReputation);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };
    augur.setTotalReputation = function (branch, votePeriod, totalReputation, onSent, onSuccess, onFailed) {
        // branch: sha256
        // votePeriod: integer
        // totalReputation: number -> fixed
        var tx = copy(augur.tx.setTotalReputation);
        tx.params = [branch, votePeriod, Augur.fix(totalReputation, "hex")];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    augur.tx.makeBallot = {
        to: augur.contracts.expiringEvents,
        method: "makeBallot",
        signature: "ii",
        returns: "hash[]"
    };
    augur.makeBallot = function (branch, votePeriod, onSent) {
        // branch: sha256
        // votePeriod: integer
        var tx = copy(augur.tx.makeBallot);
        tx.params = [branch, votePeriod];
        return fire(tx, onSent);
    };

    // markets.se
    // TODO return regular number error codes if there is an error
    augur.tx.getSimulatedBuy = {
        to: augur.contracts.markets,
        method: "getSimulatedBuy",
        signature: "iii",
        returns: "unfix[]"
    };
    augur.tx.getSimulatedSell = {
        to: augur.contracts.markets,
        method: "getSimulatedSell",
        signature: "iii",
        returns: "unfix[]"
    };
    augur.getSimulatedBuy = function (market, outcome, amount, onSent) {
        // market: sha256 hash id
        // outcome: integer (1 or 2 for binary events)
        // amount: number -> fixed-point
        var tx = copy(augur.tx.getSimulatedBuy);
        tx.params = [market, outcome, augur.fix(amount)];
        return fire(tx, onSent);
    };
    augur.getSimulatedSell = function (market, outcome, amount, onSent) {
        // market: sha256 hash id
        // outcome: integer (1 or 2 for binary events)
        // amount: number -> fixed-point
        var tx = copy(augur.tx.getSimulatedSell);
        tx.params = [market, outcome, augur.fix(amount)];
        return fire(tx, onSent);
    };

    augur.tx.lsLmsr = {
        to: augur.contracts.markets,
        method: "lsLmsr",
        signature: "i",
        returns: "unfix"
    };
    augur.lsLmsr = function (market, onSent) {
        // market: sha256
        var tx = copy(augur.tx.lsLmsr);
        tx.params = market;
        return fire(tx, onSent);
    };

    augur.tx.getMarketInfo = {
        to: augur.contracts.markets,
        method: "getMarketInfo",
        signature: "i",
        returns: "mixed[]"
    };
    augur.getMarketInfo = function (market, onSent) {
        // market: sha256 hash id
        augur.tx.getMarketInfo.params = market;
        if (onSent) {
            augur.invoke(augur.tx.getMarketInfo, function (marketInfo) {
                if (marketInfo && marketInfo.length) {
                    var info = {
                        currentParticipant: augur.bignum(marketInfo[0]).toFixed(),
                        alpha: augur.unfix(marketInfo[1], "string"),
                        cumulativeScale: augur.bignum(marketInfo[2]).toFixed(),
                        numOutcomes: augur.bignum(marketInfo[3]).toFixed(),
                        tradingPeriod: augur.bignum(marketInfo[4]).toFixed(),
                        tradingFee: augur.unfix(marketInfo[5], "string")
                    };
                    onSent(info);
                    // augur.getDescription(market, function (description) {
                    //     if (description && description.constructor === String) {
                    //         info.description = description;
                    //     }
                    //     // info.filter = augur.initComments(market);
                    //     // info.eth_filter = augur.init_price_log(market);
                    //     // info.price_history = augur.eth_getFilterLogs(info.eth_filter);
                    //     onSent(info);
                    // });
                }
            });
        } else {
            var marketInfo = augur.invoke(augur.tx.getMarketInfo);
            if (marketInfo && marketInfo.length) {
                var info = {
                    currentParticipant: augur.bignum(marketInfo[0]).toFixed(),
                    alpha: augur.unfix(marketInfo[1], "string"),
                    cumulativeScale: augur.bignum(marketInfo[2]).toFixed(),
                    numOutcomes: augur.bignum(marketInfo[3]).toFixed(),
                    tradingPeriod: augur.bignum(marketInfo[4]).toFixed(),
                    tradingFee: augur.unfix(marketInfo[5], "string")
                };
                return info;
                // var description = augur.getDescription(market);
                // if (description && description.constructor === String) {
                //     info.description = description;
                // }
                // // info.filter = augur.initComments(market);
                // // info.eth_filter = augur.init_price_log(market);
                // // info.price_history = augur.eth_getFilterLogs(info.eth_filter);
                // return info;
            }
        }
    };

    augur.tx.getMarketEvents = {
        to: augur.contracts.markets,
        method: "getMarketEvents",
        signature: "i",
        returns: "hash[]"
    };
    augur.tx.getNumEvents = {
        to: augur.contracts.markets,
        method: "getNumEvents",
        signature: "i",
        returns: "number"
    };
    augur.getMarketEvents = function (market, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getMarketEvents);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.getNumEvents = function (market, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getNumEvents);
        tx.params = market;
        return fire(tx, onSent);
    };

    augur.tx.getBranchID = {
        to: augur.contracts.markets,
        method: "getBranchID",
        signature: "i"
    };
    augur.tx.getCurrentParticipantNumber = {
        to: augur.contracts.markets,
        method: "getCurrentParticipantNumber",
        signature: "i",
        returns: "number"
    };
    augur.tx.getMarketNumOutcomes = {
        to: augur.contracts.markets,
        method: "getMarketNumOutcomes",
        signature: "i",
        returns: "number"
    };
    augur.tx.getParticipantSharesPurchased = {
        to: augur.contracts.markets,
        method: "getParticipantSharesPurchased",
        signature: "iii",
        returns: "unfix"
    };
    augur.tx.getSharesPurchased = {
        to: augur.contracts.markets,
        method: "getSharesPurchased",
        signature: "ii",
        returns: "unfix"
    };
    augur.tx.getWinningOutcomes = {
        to: augur.contracts.markets,
        method: "getWinningOutcomes",
        signature: "i",
        returns: "number[]"
    };
    augur.tx.price = {
        to: augur.contracts.markets,
        method: "price",
        signature: "ii",
        returns: "unfix"
    };
    augur.getBranchID = function (branch, onSent) {
        // branch: sha256 hash id
        var tx = copy(augur.tx.getBranchID);
        tx.params = branch;
        return fire(tx, onSent);
    };
    // Get the current number of participants in this market
    augur.getCurrentParticipantNumber = function (market, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getCurrentParticipantNumber);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.getMarketNumOutcomes = function (market, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getMarketNumOutcomes);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.getParticipantSharesPurchased = function (market, participationNumber, outcome, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getParticipantSharesPurchased);
        tx.params = [market, participationNumber, outcome];
        return fire(tx, onSent);
    };
    augur.getSharesPurchased = function (market, outcome, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getSharesPurchased);
        tx.params = [market, outcome];
        return fire(tx, onSent);
    };
    augur.getWinningOutcomes = function (market, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.getWinningOutcomes);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.price = function (market, outcome, onSent) {
        // market: sha256 hash id
        var tx = copy(augur.tx.price);
        tx.params = [market, outcome];
        return fire(tx, onSent);
    };

    augur.tx.getParticipantNumber = {
        to: augur.contracts.markets,
        method: "getParticipantNumber",
        signature: "ii",
        returns: "number"
    };
    augur.tx.getParticipantID = {
        to: augur.contracts.markets,
        method: "getParticipantID",
        signature: "ii"
    };
    // Get the participant number (the array index) for specified address
    augur.getParticipantNumber = function (market, address, onSent) {
        // market: sha256
        // address: ethereum account
        var tx = copy(augur.tx.getParticipantNumber);
        tx.params = [market, address];
        return fire(tx, onSent);
    };
    // Get the address for the specified participant number (array index) 
    augur.getParticipantID = function (market, participantNumber, onSent) {
        // market: sha256
        var tx = copy(augur.tx.getParticipantID);
        tx.params = [market, participantNumber];
        return fire(tx, onSent);
    };

    augur.tx.getAlpha = {
        to: augur.contracts.markets,
        method: "getAlpha",
        signature: "i",
        returns: "unfix"
    };
    augur.tx.getCumScale = {
        to: augur.contracts.markets,
        method: "getCumScale",
        signature: "i",
        returns: "unfix"
    };
    augur.tx.getTradingPeriod = {
        to: augur.contracts.markets,
        method: "getTradingPeriod",
        signature: "i",
        returns: "number"
    };
    augur.tx.getTradingFee = {
        to: augur.contracts.markets,
        method: "getTradingFee",
        signature: "i",
        returns: "unfix"
    };
    augur.getAlpha = function (market, onSent) {
        // market: sha256
        var tx = copy(augur.tx.getAlpha);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.getCumScale = function (market, onSent) {
        // market: sha256
        var tx = copy(augur.tx.getCumScale);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.getTradingPeriod = function (market, onSent) {
        // market: sha256
        var tx = copy(augur.tx.getTradingPeriod);
        tx.params = market;
        return fire(tx, onSent);
    };
    augur.getTradingFee = function (market, onSent) {
        // market: sha256
        var tx = copy(augur.tx.getTradingFee);
        tx.params = market;
        return fire(tx, onSent);
    };

    // reporting.se
    augur.tx.getRepBalance = {
        to: augur.contracts.reporting,
        method: "getRepBalance",
        signature: "ii",
        returns: "unfix"
    };
    augur.tx.getRepByIndex = {
        to: augur.contracts.reporting,
        method: "getRepByIndex",
        signature: "ii",
        returns: "unfix"
    };
    augur.tx.getReporterID = {
        to: augur.contracts.reporting,
        method: "getReporterID",
        signature: "ii"
    };
    augur.tx.getReputation = {
        to: augur.contracts.reporting,
        method: "getReputation",
        signature: "i",
        returns: "number[]"
    };
    augur.tx.getNumberReporters = {
        to: augur.contracts.reporting,
        method: "getNumberReporters",
        signature: "i",
        returns: "number"
    };
    augur.tx.repIDToIndex = {
        to: augur.contracts.reporting,
        method: "repIDToIndex",
        signature: "ii",
        returns: "number"
    };
    augur.getRepBalance = function (branch, account, onSent) {
        // branch: sha256 hash id
        // account: ethereum address (hexstring)
        var tx = copy(augur.tx.getRepBalance);
        tx.params = [branch, account];
        return fire(tx, onSent);
    };
    augur.getRepByIndex = function (branch, repIndex, onSent) {
        // branch: sha256
        // repIndex: integer
        var tx = copy(augur.tx.getRepByIndex);
        tx.params = [branch, repIndex];
        return fire(tx, onSent);
    };
    augur.getReporterID = function (branch, index, onSent) {
        // branch: sha256
        // index: integer
        var tx = copy(augur.tx.getReporterID);
        tx.params = [branch, index];
        return fire(tx, onSent);
    };
    // reputation of a single address over all branches
    augur.getReputation = function (address, onSent) {
        // address: ethereum account
        var tx = copy(augur.tx.getReputation);
        tx.params = address;
        return fire(tx, onSent);
    };
    augur.getNumberReporters = function (branch, onSent) {
        // branch: sha256
        var tx = copy(augur.tx.getNumberReporters);
        tx.params = branch;
        return fire(tx, onSent);
    };
    augur.repIDToIndex = function (branch, repID, onSent) {
        // branch: sha256
        // repID: ethereum account
        var tx = copy(augur.tx.repIDToIndex);
        tx.params = [branch, repID];
        return fire(tx, onSent);
    };

    augur.tx.getTotalRep = {
        to: augur.contracts.reporting,
        method: "getTotalRep",
        signature: "i",
        returns: "unfix"
    };
    augur.getTotalRep = function (branch, onSent) {
        var tx = copy(augur.tx.getTotalRep);
        tx.params = branch;
        return fire(tx, onSent);
    };

    augur.tx.hashReport = {
        to: augur.contracts.reporting,
        method: "hashReport",
        signature: "ai"
    };
    augur.tx.reputationFaucet = {
        to: augur.contracts.reporting,
        method: "faucet",
        signature: "i",
        returns: "number",
        send: true
    };
    augur.hashReport = function (ballot, salt, onSent) {
        // ballot: number[]
        // salt: integer
        if (ballot.constructor === Array) {
            var tx = copy(augur.tx.hashReport);
            tx.params = [Augur.fix(ballot, "hex"), salt];
            return fire(tx, onSent);
        }
    };
    augur.reputationFaucet = function (branch, onSent, onSuccess, onFailed) {
        // branch: sha256
        var tx = copy(augur.tx.reputationFaucet);
        tx.params = branch;
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // checkQuorum.se
    augur.tx.checkQuorum = {
        to: augur.contracts.checkQuorum,
        method: "checkQuorum",
        signature: "i",
        returns: "number"
    };
    augur.checkQuorum = function (branch, onSent, onSuccess, onFailed) {
        // branch: sha256
        if (json_rpc(postdata("coinbase")) !== augur.demo) {
            var tx = copy(augur.tx.checkQuorum);
            tx.params = branch;
            return send_call_confirm(tx, onSent, onSuccess, onFailed);
        }
    };

    // buy&sellShares.se
    augur.tx.getNonce = {
        to: augur.contracts.buyAndSellShares,
        method: "getNonce",
        signature: "i",
        returns: "number"
    };
    augur.tx.buyShares = {
        to: augur.contracts.buyAndSellShares,
        method: "buyShares",
        signature: "iiiii",
        // returns: "unfix",
        send: true
    };
    augur.tx.sellShares = {
        to: augur.contracts.buyAndSellShares,
        method: "sellShares",
        signature: "iiiii",
        send: true
    };
    augur.getNonce = function (id, onSent) {
        // id: sha256 hash id
        var tx = copy(augur.tx.getNonce);
        tx.params = id;
        return fire(tx, onSent);
    };
    augur.buyShares = function (branch, market, outcome, amount, nonce, onSent, onSuccess, onFailed) {
        if (branch && branch.constructor === Object && branch.branchId) {
            market = branch.marketId; // sha256
            outcome = branch.outcome; // integer (1 or 2 for binary)
            amount = branch.amount;   // number -> fixed-point
            if (branch.nonce) {
                nonce = branch.nonce; // integer (optional)
            }
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId; // sha256
        }
        var tx = copy(augur.tx.buyShares);
        if (onSent) {
            augur.getNonce(market, function (nonce) {
                tx.params = [branch, market, outcome, augur.fix(amount), nonce];
                send_call_confirm(tx, onSent, onSuccess, onFailed);
            });
        } else {
            nonce = augur.getNonce(market);
            tx.params = [branch, market, outcome, augur.fix(amount), nonce];
            return send_call_confirm(tx);
        }
    };
    augur.sellShares = function (branch, market, outcome, amount, nonce, onSent, onSuccess, onFailed) {
        if (branch && branch.constructor === Object && branch.branchId) {
            market = branch.marketId; // sha256
            outcome = branch.outcome; // integer (1 or 2 for binary)
            amount = branch.amount;   // number -> fixed-point
            if (branch.nonce) {
                nonce = branch.nonce; // integer (optional)
            }
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId; // sha256
        }
        var tx = copy(augur.tx.sellShares);
        if (onSent) {
            augur.getNonce(market, function (nonce) {
                tx.params = [branch, market, outcome, augur.fix(amount), nonce];
                send_call_confirm(tx, onSent, onSuccess, onFailed);
            });
        } else {
            nonce = augur.getNonce(market);
            tx.params = [branch, market, outcome, augur.fix(amount), nonce];
            return send_call_confirm(tx);
        }
    };

    // createBranch.se
    augur.tx.createSubbranch = {
        to: augur.contracts.createBranch,
        method: "createSubbranch",
        signature: "siii",
        send: true
    };
    augur.createSubbranch = function (description, periodLength, parent, tradingFee, onSent, onSuccess, onFailed) {
        if (description && description.periodLength) {
            periodLength = description.periodLength;
            parent = description.parent;
            tradingFee = description.tradingFee;
            if (description.onSent) onSent = description.onSent;
            if (description.onSuccess) onSuccess = description.onSuccess;
            if (description.onFailed) onFailed = description.onFailed;
            description = description.description;
        }
        var tx = copy(augur.tx.sendReputation);
        tx.params = [description, periodLength, parent, tradingFee];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // p2pWagers.se

    // sendReputation.se
    augur.tx.sendReputation = {
        to: augur.contracts.sendReputation,
        method: "sendReputation",
        signature: "iii",
        send: true
    };
    augur.sendReputation = function (branch, to, value, onSent, onSuccess, onFailed) {
        // branch: sha256
        // to: sha256
        // value: number -> fixed-point
        if (json_rpc(postdata("coinbase")) !== augur.demo) {
            if (branch && branch.branchId && branch.to && branch.value) {
                to = branch.to;
                value = branch.value;
                if (branch.onSent) onSent = branch.onSent;
                if (branch.onSuccess) onSuccess = branch.onSuccess;
                if (branch.onFailed) onFailed = branch.onFailed;
                branch = branch.branchId;
            }
            var tx = copy(augur.tx.sendReputation);
            tx.params = [branch, to, augur.fix(value)];
            return send_call_confirm(tx, onSent, onSuccess, onFailed);
        }
    };

    // transferShares.se

    // makeReports.se
    augur.tx.report = {
        to: augur.contracts.makeReports,
        method: "report",
        signature: "iaii",
        returns: "number",
        send: true
    };
    augur.tx.submitReportHash = {
        to: augur.contracts.makeReports,
        method: "submitReportHash",
        signature: "iii",
        returns: "number",
        send: true
    };
    augur.tx.checkReportValidity = {
        to: augur.contracts.makeReports,
        method: "checkReportValidity",
        signature: "iai",
        returns: "number"
    };
    augur.tx.slashRep = {
        to: augur.contracts.makeReports,
        method: "slashRep",
        signature: "iiiai",
        returns: "number",
        send: true
    };
    augur.report = function (branch, report, votePeriod, salt, onSent, onSuccess, onFailed) {
        if (branch.constructor === Object && branch.branchId) {
            report = branch.report;
            votePeriod = branch.votePeriod;
            salt = branch.salt;
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId;
        }
        var tx = copy(augur.tx.report);
        tx.params = [branch, Augur.fix(report, "hex"), votePeriod, salt];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.submitReportHash = function (branch, reportHash, votePeriod, onSent, onSuccess, onFailed) {
        if (branch.constructor === Object && branch.branchId) {
            reportHash = branch.reportHash;
            votePeriod = branch.votePeriod;
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId;
        }
        var tx = copy(augur.tx.submitReportHash);
        tx.params = [branch, reportHash, votePeriod];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.checkReportValidity = function (branch, report, votePeriod, onSent, onSuccess, onFailed) {
        if (branch.constructor === Object && branch.branchId) {
            report = branch.report;
            votePeriod = branch.votePeriod;
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId;
        }
        var tx = copy(augur.tx.checkReportValidity);
        tx.params = [branch, Augur.fix(report, "hex"), votePeriod];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };
    augur.slashRep = function (branch, votePeriod, salt, report, reporter, onSent, onSuccess, onFailed) {
        if (branch.constructor === Object && branch.branchId) {
            votePeriod = branch.votePeriod;
            salt = branch.salt;
            report = branch.report;
            reporter = branch.reporter;
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId;
        }
        var tx = copy(augur.tx.slashRep);
        tx.params = [branch, votePeriod, salt, Augur.fix(report, "hex"), reporter];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // createEvent.se
    augur.tx.createEvent = {
        to: augur.contracts.createEvent,
        method: "createEvent",
        signature: "isiiiii",
        send: true
    };
    augur.createEvent = function (branch, description, expDate, minValue, maxValue, numOutcomes, onSent, onSuccess, onFailed) {
        // first parameter can optionally be a transaction object
        if (branch.constructor === Object && branch.branchId) {
            description = branch.description; // string
            minValue = branch.minValue;       // integer (1 for binary)
            maxValue = branch.maxValue;       // integer (2 for binary)
            numOutcomes = branch.numOutcomes; // integer (2 for binary)
            expDate = branch.expDate;         // integer
            if (branch.onSent) onSent = branch.onSent;           // function({id, txhash})
            if (branch.onSuccess) onSuccess = branch.onSuccess;  // function({id, txhash})
            if (branch.onFailed) onFailed = branch.onFailed;     // function({id, txhash})
            branch = branch.branchId;         // sha256 hash
        }
        var tx = augur.tx.createEvent;
        tx.params = [
            branch,
            description,
            expDate,
            minValue,
            maxValue,
            numOutcomes,
            augur.blockNumber()
        ];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // createMarket.se
    augur.tx.createMarket = {
        to: augur.contracts.createMarket,
        method: "createMarket",
        signature: "isiiiai",
        send: true
    };
    augur.createMarket = function (branch, description, alpha, liquidity, tradingFee, events, onSent, onSuccess, onFailed) {
        // first parameter can optionally be a transaction object
        if (branch.constructor === Object && branch.branchId) {
            alpha = branch.alpha;                // number -> fixed-point
            description = branch.description;    // string
            liquidity = branch.initialLiquidity; // number -> fixed-point
            tradingFee = branch.tradingFee;      // number -> fixed-point
            events = branch.events;              // array [sha256, ...]
            onSent = branch.onSent;              // function({id, txhash})
            onSuccess = branch.onSuccess;        // function({id, txhash})
            onFailed = branch.onFailed;          // function({id, txhash})
            branch = branch.branchId;            // sha256 hash
        }
        var tx = augur.tx.createMarket;
        tx.params = [
            branch,
            description,
            augur.fix(alpha, "hex"),
            augur.fix(liquidity, "hex"),
            augur.fix(tradingFee, "hex"),
            events,
            augur.blockNumber()
        ];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // closeMarket.se
    augur.tx.closeMarket = {
        to: augur.contracts.closeMarket,
        method: "closeMarket",
        signature: "ii",
        returns: "number",
        send: true
    };
    augur.closeMarket = function (branch, market, onSent, onSuccess, onFailed) {
        if (branch.constructor === Object && branch.branchId) {
            market = branch.marketId;
            if (branch.onSent) onSent = branch.onSent;
            if (branch.onSuccess) onSuccess = branch.onSuccess;
            if (branch.onFailed) onFailed = branch.onFailed;
            branch = branch.branchId;
        }
        var tx = copy(augur.tx.closeMarket);
        tx.params = [branch, market];
        return send_call_confirm(tx, onSent, onSuccess, onFailed);
    };

    // dispatch.se
    augur.tx.dispatch = {
        to: augur.contracts.dispatch,
        method: "dispatch",
        signature: "i",
        returns: "number"
    };
    augur.dispatch = function (branch, onSent, onSuccess, onFailed) {
        // branch: sha256 or transaction object
        // var tx, step, pings, txhash, pingTx, err;
        if (json_rpc(postdata("coinbase")) !== augur.demo) {
            if (branch.constructor === Object && branch.branchId) {
                if (branch.onSent) onSent = branch.onSent;
                if (branch.onSuccess) onSuccess = branch.onSuccess;
                if (branch.onFailed) onFailed = branch.onFailed;
                branch = branch.branchId;
            }
            var tx = copy(augur.tx.dispatch);
            tx.params = branch;
            return send_call_confirm(tx, onSent, onSuccess, onFailed);
        }
    };

    /***************************
     * Whisper comments system *
     ***************************/

    augur.getMessages = function (filter, f) {
        return json_rpc(postdata("getMessages", filter, "shh_"), f);
    };
    augur.getFilterChanges = function (filter, f) {
        return json_rpc(postdata("getFilterChanges", filter, "shh_"), f);
    };
    augur.putString = function (key, string, f) {
        return json_rpc(postdata("putString", ["augur", key, string], "db_"), f);
    };
    augur.getString = function (key, f) {
        return json_rpc(postdata("getString", ["augur", key], "db_"), f);
    };
    augur.newIdentity = function (f) {
        return json_rpc(postdata("newIdentity", null, "shh_"), f);
    };
    augur.post = function (params, f) {
        return json_rpc(postdata("post", params, "shh_"), f);
    };
    augur.whisperFilter = function (params, f) {
        return json_rpc(postdata("newFilter", params, "shh_"), f);
    };
    augur.commentFilter = function (market, f) {
        return augur.whisperFilter({ topics: [ market ]}, f);
    };
    augur.uninstallFilter = function (filter, f) {
        return json_rpc(postdata("uninstallFilter", filter, "shh_"), f);
    };
    /**
     * Incoming comment filter:
     *  - compare comment string length, write the longest to leveldb
     *  - 10 second ethereum network polling interval
     */
    augur.pollFilter = function (market_id, filter_id) {
        var incoming_comments, stored_comments, num_messages, incoming_parsed, stored_parsed;
        augur.getFilterChanges(filter_id, function (message) {
            if (message) {
                num_messages = message.length;
                if (num_messages) {
                    for (var i = 0; i < num_messages; ++i) {
                        log("\n\nPOLLFILTER: reading incoming message " + i.toString());
                        incoming_comments = augur.decode_hex(message[i].payload);
                        if (incoming_comments) {
                            incoming_parsed = JSON.parse(incoming_comments);
                            log(incoming_parsed);
                
                            // get existing comment(s) stored locally
                            stored_comments = augur.getString(market_id);

                            // check if incoming comments length > stored
                            if (stored_comments && stored_comments.length) {
                                stored_parsed = JSON.parse(stored_comments);
                                if (incoming_parsed.length > stored_parsed.length ) {
                                    log(incoming_parsed.length.toString() + " incoming comments");
                                    log("[" + filter_id + "] overwriting comments for market: " + market_id);
                                    if (augur.putString(market_id, incoming_comments)) {
                                        log("[" + filter_id + "] overwrote comments for market: " + market_id);
                                    }
                                } else {
                                    log(stored_parsed.length.toString() + " stored comments");
                                    log("[" + filter_id + "] retaining comments for market: " + market_id);
                                }
                            } else {
                                log(incoming_parsed.length.toString() + " incoming comments");
                                log("[" + filter_id + "] inserting first comments for market: " + market_id);
                                if (augur.putString(market_id, incoming_comments)) {
                                    log("[" + filter_id + "] overwrote comments for market: " + market_id);
                                }
                            }
                        }
                    }
                }
            }
            // wait a few seconds, then poll the filter for new messages
            setTimeout(function () {
                augur.pollFilter(market_id, filter_id);
            }, augur.COMMENT_POLL_INTERVAL);
        });
    };
    augur.initComments = function (market) {
        var filter, comments, whisper_id;

        // make sure there's only one shh filter per market
        if (augur.filters[market] && augur.filters[market].filterId) {
            // log("existing filter found");
            augur.pollFilter(market, augur.filters[market].filterId);

        // create a new shh filter for this market
        } else {
            filter = augur.commentFilter(market);
            if (filter && filter !== "0x") {
                // log("creating new filter");
                augur.filters[market] = {
                    filterId: filter,
                    polling: true
                };
    
                // broadcast all comments in local leveldb
                comments = augur.getString(market);
                if (comments) {
                    whisper_id = augur.newIdentity();
                    if (whisper_id) {
                        var transmission = {
                            from: whisper_id,
                            topics: [market],
                            payload: augur.prefix_hex(augur.encode_hex(comments)),
                            priority: "0x64",
                            ttl: "0x500" // time-to-live (until expiration) in seconds
                        };
                        if (augur.post(transmission)) {
                            log("comments sent successfully");
                        }
                    }
                }
                augur.pollFilter(market, filter);
                return filter;
            }
        }
    };
    augur.resetComments = function (market) {
        return augur.putString(market, "");
    };
    augur.getMarketComments = function (market) {
        var comments = augur.getString(market);
        if (comments) {
            return JSON.parse(comments);
        } else {
            log("no commments found");
        }
    };
    augur.addMarketComment = function (pkg) {
        var market, comment_text, author, updated, transmission, whisper_id, comments;
        market = pkg.marketId;
        comment_text = pkg.message;
        author = pkg.author || augur.coinbase;

        whisper_id = augur.newIdentity();
        if (whisper_id) {
            updated = JSON.stringify([{
                whisperId: whisper_id,
                from: author, // ethereum account
                comment: comment_text,
                time: Math.floor((new Date()).getTime() / 1000)
            }]);

            // get existing comment(s) stored locally
            // (note: build with DFATDB=1 if DBUNDLE=minimal)
            comments = augur.getString(market);
            if (comments) {
                updated = updated.slice(0,-1) + "," + comments.slice(1);
            }
            if (augur.putString(market, updated)) {
                log("comment added to leveldb");
            }
            transmission = {
                from: whisper_id,
                topics: [market],
                payload: augur.prefix_hex(augur.encode_hex(updated)),
                priority: "0x64",
                ttl: "0x600" // 10 minutes
            };
            if (augur.post(transmission)) {
                log("comment sent successfully");
            }
            return JSON.parse(augur.decode_hex(transmission.payload));
        }
    };

    return augur;

})(Augur || {});

if (MODULAR) module.exports = Augur;
