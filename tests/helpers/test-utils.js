const mongoose = require("mongoose");

function createResponse() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    }
  };
}

// Replaces model statics for one test so services run without MongoDB.
function stubModel(t, model, methods) {
  for (const [name, implementation] of Object.entries(methods)) {
    const original = model[name];
    model[name] = implementation;
    t.after(() => {
      model[name] = original;
    });
  }
}

function lean(value) {
  return { lean: async () => value };
}

function id() {
  return new mongoose.Types.ObjectId();
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = {
  createResponse,
  stubModel,
  lean,
  id,
  minutesFromNow
};
