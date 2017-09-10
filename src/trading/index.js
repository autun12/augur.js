"use strict";

module.exports = {
  orderBook: require("./order-book"),
  payout: require("./payout"),
  simulation: require("./simulation"),
  getAdjustedPositions: require("./positions"),
  calculateProfitLoss: require("./profit-loss"),
  normalizePrice: require("./normalize-price"),
  denormalizePrice: require("./denormalize-price"),
  tradeUntilAmountIsZero: require("./trade-until-amount-is-zero")
};