const mongoose = require("mongoose");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test";

async function connectTestDB() {
  await mongoose.connect(TEST_DB_URI);
}

async function clearTestDB() {
  const collections = mongoose.connection.collections;

  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
}

async function closeTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

module.exports = {
  connectTestDB,
  clearTestDB,
  closeTestDB
};
