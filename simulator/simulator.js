const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000/api/health';
const API_TOKEN = process.env.API_TOKEN || '';
const USER_ID = process.env.USER_ID || 'user-1';

const randomInRange = (min, max) => Math.random() * (max - min) + min;

const generateVitals = () => {
  const heartRate = Math.random() < 0.1 ? randomInRange(125, 145) : randomInRange(65, 105);
  const spo2 = Math.random() < 0.1 ? randomInRange(82, 89) : randomInRange(94, 100);
  const temperature = Math.random() < 0.1 ? randomInRange(38.2, 39.4) : randomInRange(36.3, 37.6);

  return {
    userId: USER_ID,
    heartRate: Number(heartRate.toFixed(1)),
    spo2: Number(spo2.toFixed(1)),
    temperature: Number(temperature.toFixed(1)),
    timestamp: new Date().toISOString()
  };
};

const send = async () => {
  const payload = generateVitals();
  const headers = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : undefined;
  await axios.post(API_URL, payload, headers ? { headers } : undefined);
  console.log('sent', payload);
};

console.log(`Simulator running -> ${API_URL}`);

send().catch((err) => console.error('send failed', err.message));

setInterval(() => {
  send().catch((err) => console.error('send failed', err.message));
}, 2000);
