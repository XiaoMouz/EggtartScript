function httpError(message, status = 502, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw httpError("Upstream returned invalid JSON", 502, { url, body: text.slice(0, 500) });
    }
    if (!response.ok) {
      throw httpError(`Upstream request failed: ${response.status}`, 502, { url, body: json });
    }
    return json;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError("Upstream request timed out", 504, { url });
    }
    if (error?.status) {
      throw error;
    }
    throw httpError("Failed to reach upstream API", 502, { url, reason: String(error) });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestText(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw httpError(`Upstream request failed: ${response.status}`, 502, { url, body: text.slice(0, 500) });
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError("Upstream request timed out", 504, { url });
    }
    if (error?.status) {
      throw error;
    }
    throw httpError("Failed to fetch subscription", 502, { url, reason: String(error) });
  } finally {
    clearTimeout(timeout);
  }
}

function pickLoginAuthData(response) {
  const candidates = [
    response?.data?.auth_data,
    response?.auth_data,
    response?.data?.token,
    response?.token,
  ];
  const authData = candidates.find((value) => typeof value === "string" && value.trim() !== "");
  if (!authData) {
    throw httpError("Login response missing auth_data", 502, { response });
  }
  return authData;
}

function pickSubscribeUrl(response) {
  const candidates = [
    response?.data?.subscribe_url,
    response?.data?.subscribeUrl,
    response?.subscribe_url,
  ];
  const subscribeUrl = candidates.find((value) => typeof value === "string" && value.trim() !== "");
  if (!subscribeUrl) {
    throw httpError("Subscribe response missing subscribe_url", 502, { response });
  }
  return subscribeUrl;
}

export async function fetchSubscriptionYaml({
  baseUrl,
  email,
  password,
  clashUserAgent,
  subscribeHeaders = {},
  timeoutMs,
}) {
  const loginUrl = `${baseUrl}/passport/auth/login`;
  const subscribeInfoUrl = `${baseUrl}/user/getSubscribe`;
  const loginPayload = { email, password };

  const loginResponse = await requestJson(
    loginUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(loginPayload),
    },
    timeoutMs,
  );
  const authData = pickLoginAuthData(loginResponse);

  const subscribeResponse = await requestJson(
    subscribeInfoUrl,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authData,
      },
    },
    timeoutMs,
  );
  const subscribeUrl = pickSubscribeUrl(subscribeResponse);

  const yamlText = await requestText(
    subscribeUrl,
    {
      method: "GET",
      headers: {
        ...subscribeHeaders,
        "User-Agent": clashUserAgent,
      },
    },
    timeoutMs,
  );

  return { yamlText, authData, subscribeUrl };
}
