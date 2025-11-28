/**
 * AI Controller for Server
 */

class AIController {
  constructor(model) {
    this.model = model;
    this.isPlayer = false;
  }

  getAction(observation) {
    const qValues = this.model.predict(observation);
    return this.model.getAction(qValues);
  }
}

module.exports = {
  AIController,
};
