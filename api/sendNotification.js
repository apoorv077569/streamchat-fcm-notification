import { JWT } from "google-auth-library";

function parseServiceAccount() {
  const raw = process.env.SERVICE_ACCOUNT_JSON;
  return JSON.parse(raw);
}

async function getAccessToken() {
  const sa = parseServiceAccount();

  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const token = await client.authorize();
  return token.access_token;
}

export default async (req, res) => {
  try {
    if ((req.headers["x-api-key"] || "") !== process.env.API_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { receiverToken, title, body: msgBody, data } = req.body;

    if (!receiverToken || !title || !msgBody) {
      return res.status(400).json({
        error: "receiverToken, title and body are required",
      });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const accessToken = await getAccessToken();

    const payload = {
      message: {
        token: receiverToken,
        notification: {
          title,
          body: msgBody,
        },
        data: data || {},
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    return res.status(200).json({
      success: true,
      fcm: result,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
