const data = require('../data/backlog.json');

function getBacklog() {
  return data;
}

module.exports = { getBacklog };
