// A fixed endpoint avoids credentials being sent to a user-supplied host.
// This checks model-list permission, not Responses quota or prompt-library access.
export async function checkOpenAI(apiKey, projectRef, fetcher = fetch) {
  try {
    const response = await fetcher("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Project": projectRef,
      },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const status = response.ok
      ? "ok"
      : response.status === 401
        ? "invalid"
        : response.status === 403
          ? "restricted"
          : response.status === 429
            ? "rate_limited"
            : "error";
    // Never read, log or relay provider error bodies: they can echo sensitive inputs.
    await response.body?.cancel();
    return status;
  } catch {
    return "error";
  }
}
