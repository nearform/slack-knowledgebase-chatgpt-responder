const { processEvent } = require('./bot.js')

function main(req, res) {
  processEvent(req, res)
}

module.exports.main = main
