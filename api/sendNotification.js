import { JWT } from 'google-auth-library';
import dotenv from "dotenv";

dotenv.config();



const FCM_URL = (projectId) =>
  `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

function parseServiceAccount() {
  const raw = process.env.SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    // If you stored JSON as a string, parse it
    return JSON.parse(raw);
  } catch (err) {
    // maybe it's single-line escaped; still try JSON.parse
    throw new Error('Invalid SERVICE_ACCOUNT_JSON environment variable (not valid JSON)');
  }
}

async function getAccessToken() {
  const sa = parseServiceAccount();
  if (!sa) throw new Error('Service account JSON missing in env SERVICE_ACCOUNT_JSON');

  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const r = await client.authorize();
  return r.access_token;
}

export default async (req, res) => {
  try {
    // very small auth: check your custom API key to avoid abuse
    const clientApiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!clientApiKey || clientApiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method not allowed' });
    }

    const body = req.body;
    // expected body: { receiverToken, title, body, data? }
    const { receiverToken, title, body: messageBody, data } = body || {};

    if (!receiverToken || !title || !messageBody) {
      return res.status(400).json({ error: 'missing required fields: receiverToken, title, body' });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({ error: 'FIREBASE_PROJECT_ID not set' });
    }

    const accessToken = await getAccessToken();

    const payload = {
      message: {
        token: receiverToken,
        notification: {
          title,
          body: messageBody,
        },
        data: data || {}
      }
    };

    const fcmResponse = await fetch(FCM_URL(projectId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const json = await fcmResponse.json();
    if (!fcmResponse.ok) {
      return res.status(fcmResponse.status).json({ error: json });
    }

    return res.status(200).json({ success: true, fcmResult: json });
  } catch (err) {
    console.error('sendNotification error', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
};
