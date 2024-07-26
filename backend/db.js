const { MongoClient } = require('mongodb');
require('dotenv').config(); // Load environment variables from .env file

let dbConnection
let uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.ck4xggj.mongodb.net/${process.env.MONGODB_DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;

module.exports = {
    connectToDb: (cb) => {
        MongoClient.connect(uri)
            .then(client => {
                dbConnection = client.db();
                console.log('Connected to MongoDB');
                return cb();
            })
            .catch(err => {
                console.error('Error connecting to MongoDB', err);
                return cb(err);
            });
    },
    getDb: () => dbConnection
}