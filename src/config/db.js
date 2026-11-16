import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// Windows/router DNS often returns EBADRESP for mongodb+srv SRV lookups; prefer public resolvers.
if (env.mongoUri?.startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers().filter((s) => s !== '8.8.8.8' && s !== '1.1.1.1')]);
}

export async function connectDb() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export const dbReady = () => mongoose.connection.readyState === 1;
