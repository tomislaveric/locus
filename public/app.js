const form = document.querySelector("#upload");
const status = document.querySelector("#status");
const passagesForm = document.querySelector("#passages");
const passageList = document.querySelector("#passage-list");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  passagesForm.hidden = true;
  passageList.replaceChildren();
  status.textContent = "Uploading and detecting Coin passages...";
  try {
    const response = await fetch("/api/jobs", { method: "POST", body: new FormData(form) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    poll(body.token, button);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
});

passagesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = passagesForm.querySelector("button");
  const coinIds = [...passageList.querySelectorAll("input:checked")].map((input) => input.value);
  if (coinIds.length === 0) {
    status.textContent = "Select at least one Coin passage.";
    return;
  }
  button.disabled = true;
  status.textContent = "Rendering selected clips...";
  try {
    const response = await fetch(`/api/jobs/${passagesForm.dataset.token}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coinIds })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    poll(body.token, form.querySelector("button"));
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
});

async function poll(token, button) {
  try {
    const response = await fetch(`/api/jobs/${token}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error);
    if (job.state === "processing") {
      status.textContent = "Processing telemetry...";
      setTimeout(() => poll(token, button), 1500);
    } else if (job.state === "awaiting_selection") {
      showPassages(token, job.passages);
      status.textContent = "Select the Coin passages to include.";
      button.disabled = false;
    } else if (job.state === "rendering") {
      status.textContent = "Rendering selected clips...";
      setTimeout(() => poll(token, button), 1500);
    } else if (job.state === "succeeded") {
      passagesForm.hidden = true;
      status.innerHTML = `<a href="${job.downloadUrl}">Download clip</a>`;
      button.disabled = false;
    } else {
      throw new Error(job.error);
    }
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
}

function showPassages(token, passages) {
  passagesForm.dataset.token = token;
  passageList.replaceChildren();
  for (const passage of passages) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "coinId";
    checkbox.value = passage.coinId;
    checkbox.checked = true;
    label.append(checkbox, `${passage.coinId} (+${passage.value} XP) at ${passage.videoSecond.toFixed(3)} s`);
    passageList.append(label);
  }
  passagesForm.hidden = false;
  passagesForm.querySelector("button").disabled = false;
}
