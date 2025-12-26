const { Client } = require('pg');
require('dotenv').config();

class ConnectionManager {
  constructor() {
    this.connectionString = process.env.DATABASE_URL;
    this.client = null;
    this.isConnected = false;
  }
  
  async connect() {
    if (this.isConnected && this.client) {
      return this.client;
    }
    
    console.log('Establishing new database connection...');
    this.client = new Client({
      connectionString: this.connectionString,
      ssl: { rejectUnauthorized: false, require: true }
    });
    
    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('✅ New connection established');
      return this.client;
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      this.client = null;
      this.isConnected = false;
      throw error;
    }
  }
  
  async query(sql, params = []) {
    const client = await this.connect();
    try {
      return await client.query(sql, params);
    } catch (error) {
      // If connection error, try to reconnect once
      if (error.code === '57P01' || error.code === '57P03' || error.message.includes('connection')) {
        console.log('Connection lost, attempting to reconnect...');
        this.isConnected = false;
        this.client = null;
        const newClient = await this.connect();
        return await newClient.query(sql, params);
      }
      throw error;
    }
  }
  
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.end();
      this.isConnected = false;
      this.client = null;
      console.log('Connection closed');
    }
  }
}

// Export singleton
const connectionManager = new ConnectionManager();
module.exports = connectionManager;
